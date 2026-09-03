import { FormEvent, useState } from "react";
type ToolCall = {
  name: string;
  arguments: Record<string, unknown>;
  ok: boolean;
  summary: string;
};
type Message = {
  role: "user" | "assistant";
  content: string;
  tools?: ToolCall[];
  confirm?: boolean;
};
const sessionId = crypto.randomUUID();
export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: 'Hola. Pídeme, por ejemplo: Procesa el caso "ec-corp-andina".',
    },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  async function send(e?: FormEvent, text = input) {
    e?.preventDefault();
    if (!text.trim() || thinking) return;
    setMessages((x) => [...x, { role: "user", content: text }]);
    setInput("");
    setThinking(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
      });
      const data = await res.json();
      setMessages((x) => [
        ...x,
        {
          role: "assistant",
          content: data.reply ?? data.error ?? "Error",
          tools: data.toolCalls,
          confirm: data.needsConfirmation,
        },
      ]);
    } catch {
      setMessages((x) => [
        ...x,
        { role: "assistant", content: "No pude conectar con el backend." },
      ]);
    } finally {
      setThinking(false);
    }
  }
  return (
    <main>
      <header>
        <span className="mark">P</span>
        <div>
          <h1>Registro de proveedores</h1>
          <p>Asistente administrativo · entorno de demostración</p>
        </div>
        <span className="status">● Disponible</span>
      </header>
      <section className="chat">
        {messages.map((m, i) => (
          <article key={i} className={m.role}>
            <div className="bubble">
              {m.content.split("\n").map((x, j) => (
                <span key={j}>
                  {x}
                  <br />
                </span>
              ))}
            </div>
            {m.tools?.map((t, j) => (
              <details className="tool" key={j}>
                <summary>
                  {t.ok ? "✓" : "!"} {t.name}
                </summary>
                <pre>{JSON.stringify(t.arguments, null, 2)}</pre>
                <p>{t.summary}</p>
              </details>
            ))}
            {m.confirm && (
              <div className="confirmation">
                <strong>Confirmación humana requerida</strong>
                <p>Ninguna acción externa ocurrirá sin tu aprobación.</p>
                <button onClick={() => send(undefined, "Confirmo el envío")}>
                  Confirmar envío simulado
                </button>
              </div>
            )}
          </article>
        ))}
        {thinking && (
          <div className="thinking">Analizando y ejecutando herramientas…</div>
        )}
      </section>
      <form onSubmit={send}>
        <input
          aria-label="Mensaje"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe tu solicitud…"
        />
        <button disabled={thinking}>Enviar</button>
      </form>
    </main>
  );
}
