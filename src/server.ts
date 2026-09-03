import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import path from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { OpenAIAdapter } from "./llm/openai.js";
import { runAgent } from "./agent/cycle.js";
import { getSession } from "./agent/session.js";
const root = process.cwd();
const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
const webDist = path.join(root, "web", "dist");
const key = process.env.OPENAI_API_KEY;
const llm = key ? new OpenAIAdapter(key) : undefined;
app.get("/", async (_req, reply) => {
  const index = path.join(webDist, "index.html");
  if (!existsSync(index)) return reply.redirect("http://localhost:5173");
  return reply.type("text/html; charset=utf-8").send(await readFile(index));
});
app.get<{ Params: { file: string } }>("/assets/:file", async (req, reply) => {
  const safeName = path.basename(req.params.file);
  const asset = path.join(webDist, "assets", safeName);
  if (!existsSync(asset)) return reply.code(404).send({ error: "Archivo no encontrado" });
  const contentType = safeName.endsWith(".css") ? "text/css" : "text/javascript";
  return reply.type(contentType).send(await readFile(asset));
});
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
