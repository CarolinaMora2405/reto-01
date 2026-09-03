export type ToolCallView = {
  name: string;
  arguments: Record<string, unknown>;
  ok: boolean;
  summary: string;
};

export type SessionMessage = {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallView[];
  needsConfirmation?: boolean;
};

export type Session = {
  id: string;
  messages: SessionMessage[];
  awaitingConfirmation?: { caso: string };
  tokens: number;
};
