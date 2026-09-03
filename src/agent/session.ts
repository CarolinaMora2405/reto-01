import type { Session } from "./types.js";

const sessions = new Map<string, Session>();

export function getSession(id: string) {
  let session = sessions.get(id);
  if (!session) {
    session = { id, messages: [], tokens: 0 };
    sessions.set(id, session);
  }
  return session;
}
