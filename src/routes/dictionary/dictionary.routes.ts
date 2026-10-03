import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../middlewares/auth.middleware.js";

const paramsSchema = z.object({ word: z.string().min(1) });

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, "").trim();
}

type WiktionaryDefinition = {
  definition: string;
  examples?: string[];
};

type WiktionaryMeaning = {
  partOfSpeech: string;
  definitions: WiktionaryDefinition[];
};

export async function dictionaryRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/:word", async (req, reply) => {
    const { word } = paramsSchema.parse(req.params);

    const res = await fetch(
      `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`,
      {
        headers: {
          "User-Agent": "LuminarApp/1.0 (adrielprch17@gmail.com)",
        },
      }
    );

    if (res.status === 404) {
      return reply.status(404).send({ error: "No se encontró esa palabra" });
    }
    if (!res.ok) {
      const bodyText = await res.text();
      console.log("Wiktionary status:", res.status, bodyText);
      return reply.status(502).send({ error: "Error consultando el diccionario" });
    }

    const data = (await res.json()) as Record<string, WiktionaryMeaning[]>;

    const entries = Object.entries(data)
      .filter(([, meanings]) => Array.isArray(meanings))
      .map(([language, meanings]) => ({
        language,
        meanings: meanings.map((m) => ({
          partOfSpeech: m.partOfSpeech,
          definitions: (m.definitions ?? []).map((d) => ({
            definition: stripHtml(d.definition ?? ""),
            examples: (d.examples ?? []).map(stripHtml),
          })),
        })),
      }))
      // Spanish first, since that's what the app cares about most
.sort((a, b) => (a.language === "es" ? -1 : b.language === "es" ? 1 : 0));
    return { word, entries };
  });
}