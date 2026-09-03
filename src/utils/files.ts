import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const paths = (root: string, caso: string) => ({
  caso: path.join(root, "fixtures", "reto-01", "casos", caso),
  repo: path.join(root, "fixtures", "reto-01", "repositorio"),
  glosario: path.join(root, "fixtures", "reto-01", "glosario-campos.json"),
  out: path.join(root, "out", caso),
});
export async function json<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}
export async function exists(file: string) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
export async function writeText(file: string, value: string) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, value, "utf8");
}
export const safeError = (error: unknown) =>
  error instanceof SyntaxError
    ? "El archivo JSON está corrupto."
    : error instanceof Error && error.message.includes("ENOENT")
    ? "No se encontró el caso o uno de sus archivos."
    : "No fue posible completar la operación.";
