import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../lib/db.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";

const bodySchema = z.object({
  text: z.string().min(1),
  now: z.string(),
});

type GeminiExtraction = {
  kind: "task" | "event";
  title: string;
  priority?: "LOW" | "MEDIUM" | "HIGH";
  dueDate?: string;
  startAt?: string;
  endAt?: string;
  allDay?: boolean;
};

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
};

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

async function callGemini(text: string, systemInstruction: string): Promise<Response> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const res = await fetch(`${GEMINI_URL}?key=${process.env.GOOGLE_AI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                kind: { type: "STRING", enum: ["task", "event"] },
                title: { type: "STRING" },
                priority: { type: "STRING", enum: ["LOW", "MEDIUM", "HIGH"] },
                dueDate: { type: "STRING" },
                startAt: { type: "STRING" },
                endAt: { type: "STRING" },
                allDay: { type: "BOOLEAN" },
              },
              required: ["kind", "title"],
            },
          },
        }),
      });
      clearTimeout(timeout);

      if (res.ok) return res;

      // 503 = sobrecarga temporal de Gemini; reintentamos. Otros errores, no.
      if (res.status !== 503 || attempt === 3) return res;
      console.log(`Gemini 503, reintentando (intento ${attempt})...`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    } catch (err) {
      clearTimeout(timeout);
      if (attempt === 3) throw err;
      console.log(`Gemini timeout/error, reintentando (intento ${attempt})...`, err);
    }
  }
  throw new Error("Gemini no respondió después de 3 intentos");
}

export async function aiRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.post("/parse", async (req, reply) => {
    const { text, now } = bodySchema.parse(req.body);

    const systemInstruction = `Eres un asistente que convierte peticiones en español en una tarea o un evento de calendario.
Fecha y hora actual: ${now}

Reglas:
- Si la petición es una tarea simple sin horario específico de inicio/fin (ej. "recuérdame comprar leche", "llamar al dentista"), usa kind="task". Si menciona una fecha límite, pon dueDate.
- Si la petición tiene un horario específico (ej. "reunión el viernes a las 3pm", "cena mañana a las 8"), usa kind="event". Calcula startAt y endAt; si no se especifica duración, usa 1 hora.
- Todas las fechas en formato YYYY-MM-DDTHH:mm:ss, hora LOCAL, sin zona horaria ni "Z".
- Resuelve fechas relativas (mañana, hoy, el viernes, en 3 días) usando la fecha actual de arriba.
- "title" debe ser conciso, sin la fecha/hora dentro del texto.`;

    let res: Response;
    try {
      res = await callGemini(text, systemInstruction);
    } catch {
      return reply.status(504).send({ error: "La IA no respondió a tiempo. Intenta de nuevo." });
    }

    if (!res.ok) {
      const bodyText = await res.text();
      console.log("Gemini error:", res.status, bodyText);
      return reply.status(502).send({ error: "Error consultando la IA" });
    }

    const data = (await res.json()) as GeminiResponse;
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return reply.status(502).send({ error: "La IA no devolvió nada" });

    const parsed = JSON.parse(raw) as GeminiExtraction;

    if (parsed.kind === "task") {
      const task = await db.task.create({
        data: {
          title: parsed.title,
          priority: parsed.priority ?? "MEDIUM",
          userId: req.user.userId,
          ...(parsed.dueDate ? { dueDate: new Date(parsed.dueDate) } : {}),
        },
      });
      return { kind: "task", item: task };
    }

    if (!parsed.startAt || !parsed.endAt) {
      return reply.status(502).send({ error: "La IA no devolvió fechas válidas para el evento" });
    }

    const event = await db.event.create({
      data: {
        title: parsed.title,
        allDay: parsed.allDay ?? false,
        startAt: new Date(parsed.startAt),
        endAt: new Date(parsed.endAt),
        userId: req.user.userId,
      },
    });
    return { kind: "event", item: event };
  });
}