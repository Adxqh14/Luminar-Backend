import type { FastifyInstance } from "fastify";
import { db } from "../../lib/db.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { getValidAccessToken } from "../../lib/spotify.js";

const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
].join(" ");
const FRONTEND_URL = "http://localhost:3000";

type SpotifyTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

type SpotifyNowPlayingResponse = {
  is_playing: boolean;
  item?: {
    name: string;
    artists?: { name: string }[];
    album?: { images?: { url: string }[] };
    duration_ms: number;
  };
  progress_ms: number;
};

function basicAuthHeader() {
  const creds = `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`;
  return "Basic " + Buffer.from(creds).toString("base64");
}

export async function spotifyRoutes(app: FastifyInstance) {
  // El frontend navega aquí (no un fetch) con el JWT normal como query param,
  // porque una navegación de página completa no puede llevar el header Authorization.
  app.get("/connect", async (req, reply) => {
    const { token } = req.query as { token?: string };
    if (!token) return reply.status(400).send({ error: "Falta token" });

    let userId: string;
    try {
      const payload = app.jwt.verify<{ userId: string }>(token);
      userId = payload.userId;
    } catch {
      return reply.status(401).send({ error: "Token inválido" });
    }

    // "state" viaja y vuelve a través de Spotify, así que lo usamos
    // para recordar qué usuario de Luminar inició la conexión.
    const state = app.jwt.sign({ userId }, { expiresIn: "10m" });

    const authorizeUrl = new URL(SPOTIFY_AUTH_URL);
    authorizeUrl.searchParams.set("client_id", process.env.SPOTIFY_CLIENT_ID!);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("redirect_uri", process.env.SPOTIFY_REDIRECT_URI!);
    authorizeUrl.searchParams.set("scope", SCOPES);
    authorizeUrl.searchParams.set("state", state);

    return reply.redirect(authorizeUrl.toString());
  });

  app.get("/callback", async (req, reply) => {
    const { code, state, error } = req.query as {
      code?: string;
      state?: string;
      error?: string;
    };

    if (error || !code || !state) {
      return reply.redirect(`${FRONTEND_URL}/spotify?error=1`);
    }

    let userId: string;
    try {
      const payload = app.jwt.verify<{ userId: string }>(state);
      userId = payload.userId;
    } catch {
      return reply.redirect(`${FRONTEND_URL}/spotify?error=1`);
    }

    const tokenRes = await fetch(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: basicAuthHeader(),
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
      }),
    });

    if (!tokenRes.ok) {
      const bodyText = await tokenRes.text();
      console.log("Spotify token exchange failed:", tokenRes.status, bodyText);
      return reply.redirect(`${FRONTEND_URL}/spotify?error=1`);
    }

    const data = (await tokenRes.json()) as SpotifyTokenResponse;

    await db.spotifyAccount.upsert({
      where: { userId },
      create: {
        userId,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
      },
      update: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
      },
    });

    return reply.redirect(`${FRONTEND_URL}/spotify?connected=1`);
  });

  // Rutas protegidas: encapsuladas en su propio register() para que el
  // preHandler de auth no afecte a /connect ni /callback de arriba.
  app.register(async (protectedApp) => {
    protectedApp.addHook("preHandler", requireAuth);

    protectedApp.get("/status", async (req) => {
      const account = await db.spotifyAccount.findUnique({
        where: { userId: req.user.userId },
      });
      return { connected: !!account };
    });

    protectedApp.delete("/disconnect", async (req, reply) => {
      await db.spotifyAccount.deleteMany({ where: { userId: req.user.userId } });
      return reply.status(204).send();
    });

    protectedApp.get("/now-playing", async (req, reply) => {
      const accessToken = await getValidAccessToken(req.user.userId);
      if (!accessToken) return reply.status(409).send({ error: "Spotify no conectado" });

      const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.status === 204) return reply.send(null);
      if (!res.ok) {
        const bodyText = await res.text();
        console.log("Spotify now-playing status:", res.status, bodyText);
        return reply.status(502).send({ error: "Error consultando Spotify" });
      }
      const data = (await res.json()) as SpotifyNowPlayingResponse;
      return {
        isPlaying: data.is_playing,
        track: {
          name: data.item?.name,
          artists: data.item?.artists?.map((a) => a.name).join(", "),
          albumImage: data.item?.album?.images?.[0]?.url,
          durationMs: data.item?.duration_ms,
          progressMs: data.progress_ms,
        },
      };
    });

    protectedApp.put("/play", async (req, reply) => {
      const accessToken = await getValidAccessToken(req.user.userId);
      if (!accessToken) return reply.status(409).send({ error: "Spotify no conectado" });
      await fetch("https://api.spotify.com/v1/me/player/play", {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return reply.status(204).send();
    });

    protectedApp.put("/pause", async (req, reply) => {
      const accessToken = await getValidAccessToken(req.user.userId);
      if (!accessToken) return reply.status(409).send({ error: "Spotify no conectado" });
      await fetch("https://api.spotify.com/v1/me/player/pause", {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return reply.status(204).send();
    });

    protectedApp.post("/next", async (req, reply) => {
      const accessToken = await getValidAccessToken(req.user.userId);
      if (!accessToken) return reply.status(409).send({ error: "Spotify no conectado" });
      await fetch("https://api.spotify.com/v1/me/player/next", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return reply.status(204).send();
    });

    protectedApp.post("/previous", async (req, reply) => {
      const accessToken = await getValidAccessToken(req.user.userId);
      if (!accessToken) return reply.status(409).send({ error: "Spotify no conectado" });
      await fetch("https://api.spotify.com/v1/me/player/previous", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return reply.status(204).send();
    });
  });
}