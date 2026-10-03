import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { authRoutes } from "./routes/auth/auth.routes.js";
import { ZodError } from "zod";
import { taskRoutes } from "./routes/tasks/tasks.routes.js";
import { eventRoutes } from "./routes/events/events.routes.js";
import { dictionaryRoutes } from "./routes/dictionary/dictionary.routes.js";

const app = Fastify({ logger: true });

app.register(cors, {
  origin: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "PUT", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});app.register(jwt, { secret: process.env.JWT_SECRET! });
app.register(authRoutes, { prefix: "/auth" });

app.setErrorHandler((error, _req, reply) => {
  if (error instanceof ZodError) {
    return reply.status(400).send({ error: "Datos inválidos", details: error.issues });
  }
  return reply.send(error);
});
app.register(taskRoutes, { prefix: "/tasks" });
app.register(eventRoutes, { prefix: "/events" });
app.register(dictionaryRoutes, { prefix: "/dictionary" });

app.get("/health", async () => ({ status: "ok" }));

app.listen({ port: Number(process.env.PORT) || 4000 }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  console.log(`Servidor corriendo en ${address}`);
});