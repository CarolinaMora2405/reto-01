import type { ToolCallView } from "../agent/types.js";
export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
};
export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};
export type LlmResponse = {
  text: string;
  toolCalls: { id: string; name: string; arguments: Record<string, unknown> }[];
  usageTokens?: number;
};
export interface LlmAdapter {
  readonly provider: string;
  readonly model: string;
  enviar(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    signal: AbortSignal
  ): Promise<LlmResponse>;
}
export type AgentReply = {
  reply: string;
  toolCalls: ToolCallView[];
  needsConfirmation: boolean;
};
