import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../lib/db.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  dueDate: z.coerce.date().optional(),
});

const updateSchema = createSchema.partial().extend({
  completed: z.boolean().optional(),
});

const idSchema = z.object({ id: z.string() });

export async function taskRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/", async (req) => {
    return db.task.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: "desc" },
    });
  });

  app.post("/", async (req, reply) => {
    const data = createSchema.parse(req.body);
    const task = await db.task.create({
      data: { ...data, userId: req.user.userId },
    });
    return reply.status(201).send(task);
  });

  app.patch("/:id", async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const data = updateSchema.parse(req.body);

    const result = await db.task.updateMany({
      where: { id, userId: req.user.userId },
      data,
    });
    if (result.count === 0) {
      return reply.status(404).send({ error: "Tarea no encontrada" });
    }
    return db.task.findUnique({ where: { id } });
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = idSchema.parse(req.params);

    const result = await db.task.deleteMany({
      where: { id, userId: req.user.userId },
    });
    if (result.count === 0) {
      return reply.status(404).send({ error: "Tarea no encontrada" });
    }
    return reply.status(204).send();
  });
}