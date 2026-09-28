import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "../../lib/db.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", async (req, reply) => {
    const { email, password, name } = registerSchema.parse(req.body);

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return reply.status(409).send({ error: "El email ya está registrado" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await db.user.create({
      data: { email, password: hashedPassword, name },
    });

    const token = app.jwt.sign({ userId: user.id });
    return reply.send({ token, user: { id: user.id, email: user.email, name: user.name } });
  });

  app.post("/login", async (req, reply) => {
    const { email, password } = loginSchema.parse(req.body);

    const user = await db.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return reply.status(401).send({ error: "Credenciales inválidas" });
    }

    const token = app.jwt.sign({ userId: user.id });
    return reply.send({ token, user: { id: user.id, email: user.email, name: user.name } });
  });
}