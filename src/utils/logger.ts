import path from "node:path";
import { appendFile, mkdir } from "node:fs/promises";

export async function logTool(
  root: string,
  caso: string,
  herramienta: string,
  ok: boolean,
  resumen: string
) {
  const dir = path.join(root, "out", caso);
  await mkdir(dir, { recursive: true });
  await appendFile(
    path.join(dir, "log.jsonl"),
    JSON.stringify({ ts: new Date().toISOString(), herramienta, ok, resumen }) +
      "\n",
    "utf8"
  );
}
