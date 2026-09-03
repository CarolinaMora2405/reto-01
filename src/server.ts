import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { OpenAIAdapter } from "./llm/openai.js";
import { runAgent } from "./agent/cycle.js";
import { getSession } from "./agent/session.js";
const root = process.cwd();
const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
const key = process.env.OPENAI_API_KEY;
const llm = key ? new OpenAIAdapter(key) : undefined;
app.get("/", async (_req, reply) => reply.redirect("http://localhost:5173"));
app.get("/favicon.ico", async (_req, reply) => reply.code(204).send());
app.get("/api/health", async () => ({
  ok: true,
  provider: llm?.provider ?? "not-configured",
  model: llm?.model ?? "not-configured",
}));
app.get<{ Params: { id: string } }>("/api/sessions/:id", async (req) =>
  getSession(req.params.id)
);
app.post<{ Body: { sessionId?: string; message?: string } }>(
  "/api/chat",
  async (req, reply) => {
    if (!req.body?.sessionId || !req.body?.message)
      return reply
        .code(400)
        .send({ error: "sessionId y message son obligatorios" });
    if (!llm)
      return reply
        .code(503)
        .send({
          error:
            "Configura OPENAI_API_KEY en el backend. La demo funciona sin ella.",
        });
    return runAgent(
      root,
      getSession(req.body.sessionId),
      req.body.message,
      llm
    );
  }
);
await app.listen({ port: Number(process.env.PORT ?? 3001), host: "0.0.0.0" });
