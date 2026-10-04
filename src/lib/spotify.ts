import { db } from "./db.js";

const TOKEN_URL = "https://accounts.spotify.com/api/token";

type SpotifyRefreshResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

function basicAuthHeader() {
  const creds = `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`;
  return "Basic " + Buffer.from(creds).toString("base64");
}

export async function getValidAccessToken(userId: string) {
  const account = await db.spotifyAccount.findUnique({ where: { userId } });
  if (!account) return null;

  // Si todavía le quedan más de 10 segundos de vida, se reutiliza tal cual
  if (account.expiresAt.getTime() > Date.now() + 10_000) {
    return account.accessToken;
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: account.refreshToken,
    }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as SpotifyRefreshResponse;

  const updated = await db.spotifyAccount.update({
    where: { userId },
    data: {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
    },
  });

  return updated.accessToken;
}