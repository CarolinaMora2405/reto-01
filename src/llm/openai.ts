import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type { ChatMessage, LlmAdapter, ToolDefinition } from "./adapter.js";

export class OpenAIAdapter implements LlmAdapter {
  readonly provider = "openai";
  readonly model: string;
  private client: OpenAI;
  constructor(key: string, model = process.env.OPENAI_MODEL ?? "gpt-4o-mini") {
    this.client = new OpenAI({ apiKey: key });
    this.model = model;
  }

  async enviar(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    signal: AbortSignal
  ) {
    const formatted = messages.map((m) =>
      m.role === "tool"
        ? {
            role: "tool" as const,
            content: m.content,
            tool_call_id: m.toolCallId ?? "missing",
          }
        : { role: m.role, content: m.content }
    ) as ChatCompletionMessageParam[];
    
    const defs = tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    })) as ChatCompletionTool[];

    const result = await this.client.chat.completions.create(
      {
        model: this.model,
        messages: formatted,
        tools: defs,
        temperature: 0,
        max_tokens: 800,
      },
      { signal }
    );

    const message = result.choices[0]?.message;
    return {
      text: message?.content ?? "",
      toolCalls: (message?.tool_calls ?? [])
        .filter((x) => x.type === "function")
        .map((x) => ({
          id: x.id,
          name: x.function.name,
          arguments: JSON.parse(x.function.arguments) as Record<
            string,
            unknown
          >,
        })),
      usageTokens: result.usage?.total_tokens,
    };
  }
}
