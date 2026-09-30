import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../lib/db.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  allDay: z.boolean().optional(),
  color: z.string().optional(),
});

const updateSchema = createSchema.partial();

const idSchema = z.object({ id: z.string() });

const rangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export async function eventRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/", async (req) => {
    const { from, to } = rangeSchema.parse(req.query);

    return db.event.findMany({
      where: {
        userId: req.user.userId,
        ...(from || to
          ? {
              startAt: { gte: from, lte: to },
            }
          : {}),
      },
      orderBy: { startAt: "asc" },
    });
  });

  app.post("/", async (req, reply) => {
    const data = createSchema.parse(req.body);

    if (data.endAt < data.startAt) {
      return reply.status(400).send({ error: "endAt no puede ser antes que startAt" });
    }

    const event = await db.event.create({
      data: { ...data, userId: req.user.userId },
    });
    return reply.status(201).send(event);
  });

  app.patch("/:id", async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const data = updateSchema.parse(req.body);

    if (data.startAt && data.endAt && data.endAt < data.startAt) {
      return reply.status(400).send({ error: "endAt no puede ser antes que startAt" });
    }

    const result = await db.event.updateMany({
      where: { id, userId: req.user.userId },
      data,
    });
    if (result.count === 0) {
      return reply.status(404).send({ error: "Evento no encontrado" });
    }
    return db.event.findUnique({ where: { id } });
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = idSchema.parse(req.params);

    const result = await db.event.deleteMany({
      where: { id, userId: req.user.userId },
    });
    if (result.count === 0) {
      return reply.status(404).send({ error: "Evento no encontrado" });
    }
    return reply.status(204).send();
  });
}