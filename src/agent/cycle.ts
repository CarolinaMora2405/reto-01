import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type {
  LlmAdapter,
  ChatMessage,
  ToolDefinition,
  AgentReply,
} from "../llm/adapter.js";
import { proveedorTools } from "../tools/proveedor.js";
import { zodObjectToJson } from "./schema.js";
import type { Session, ToolCallView } from "./types.js";

const confirm = /^(s[ií]|confirmo|env[ií]a|enviar|adelante)(\b|$)/i;

export async function runAgent(
  root: string,
  session: Session,
  userMessage: string,
  llm: LlmAdapter,
  maxIterations = 25,
  maxTokens = 12000
): Promise<AgentReply> {
  session.messages.push({ role: "user", content: userMessage });
  const visible: ToolCallView[] = [];
  if (session.awaitingConfirmation) {
    const { caso } = session.awaitingConfirmation;
    if (confirm.test(userMessage.trim())) {
      const raw = await proveedorTools.proveedor_simular_envio.execute(
        { caso, confirmado: true } as never,
        { directory: root, sessionId: session.id }
      );
      const parsed = JSON.parse(raw) as {
        ok: boolean;
        data?: { ruta: string };
        error?: string;
      };
      visible.push({
        name: "proveedor_simular_envio",
        arguments: { caso, confirmado: true },
        ok: parsed.ok,
        summary: parsed.ok
          ? `Creado ${parsed.data?.ruta}`
          : parsed.error ?? "Error",
      });
      session.awaitingConfirmation = undefined;
      const reply = parsed.ok
        ? `Envío simulado. Se creó ${parsed.data?.ruta}.`
        : parsed.error ?? "No fue posible simular el envío.";
      session.messages.push({
        role: "assistant",
        content: reply,
        toolCalls: visible,
      });
      return { reply, toolCalls: visible, needsConfirmation: false };
    }
    session.awaitingConfirmation = undefined;
  }
  const prompt = await readFile(path.join(root, "agent", "prompt.md"), "utf8");
  const messages: ChatMessage[] = [
    { role: "system", content: prompt },
    ...session.messages.map(
      (x) => ({ role: x.role, content: x.content } as ChatMessage)
    ),
  ];
  const definitions: ToolDefinition[] = Object.entries(proveedorTools).map(
    ([name, t]) => ({
      name,
      description: t.description,
      parameters: zodObjectToJson(t.args),
    })
  );
  for (let i = 0; i < maxIterations; i++) {
    if (session.tokens >= maxTokens)
      return finish(
        "Se alcanzó el límite de tokens de la sesión. Conservé el progreso disponible.",
        false
      );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    let response;
    try {
      response = await llm.enviar(messages, definitions, controller.signal);
    } catch {
      return finish(
        "El proveedor de IA no respondió. La sesión sigue disponible para reintentar.",
        false
      );
    } finally {
      clearTimeout(timer);
    }
    session.tokens += response.usageTokens ?? 0;
    if (!response.toolCalls.length)
      return finish(response.text || "No pude completar la solicitud.", false);
    messages.push({ role: "assistant", content: response.text });
    for (const call of response.toolCalls) {
      const tool = proveedorTools[call.name as keyof typeof proveedorTools];
      if (!tool) {
        messages.push({
          role: "tool",
          toolCallId: call.id,
          content: JSON.stringify({
            ok: false,
            error: "Herramienta desconocida",
          }),
        });
        continue;
      }
      const schema = z.object(tool.args);
      const valid = schema.safeParse(call.arguments);
      const raw = valid.success
        ? await tool.execute(valid.data as never, {
            directory: root,
            sessionId: session.id,
          })
        : JSON.stringify({
            ok: false,
            error: "Argumentos inválidos",
            detalle: valid.error.flatten(),
          });
      const parsed = JSON.parse(raw) as {
        ok: boolean;
        data?: unknown;
        error?: string;
      };
      visible.push({
        name: call.name,
        arguments: call.arguments,
        ok: parsed.ok,
        summary: parsed.ok
          ? JSON.stringify(parsed.data).slice(0, 240)
          : parsed.error ?? "Error",
      });
      messages.push({ role: "tool", toolCallId: call.id, content: raw });
    }
  }
  return finish(
    "Alcancé el tope de iteraciones. Revisa las operaciones realizadas y los pendientes.",
    false
  );
  function finish(reply: string, needsConfirmation: boolean) {
    const match = [...visible]
      .reverse()
      .find((x) => x.name === "proveedor_armar_paquete" && x.ok);
    if (match) {
      needsConfirmation = true;
      reply = `${reply}\n\n¿Confirmas que deseas simular el envío?`;
      const caseMatch = userMessage.match(/[\"']?([a-z]{2}-[a-z0-9-]+)[\"']?/i);
      if (caseMatch) session.awaitingConfirmation = { caso: caseMatch[1] };
    }
    session.messages.push({
      role: "assistant",
      content: reply,
      toolCalls: visible,
      needsConfirmation,
    });
    return { reply, toolCalls: visible, needsConfirmation };
  }
}
