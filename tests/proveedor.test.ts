import { beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, cp, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  leer_solicitud,
  mapear_campos,
  generar_formulario,
  armar_paquete,
  simular_envio,
} from "../src/tools/proveedor.js";
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let root: string;
const parse = (s: string) => JSON.parse(s);
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "proveedor-"));
  await cp(path.join(source, "fixtures"), path.join(root, "fixtures"), {
    recursive: true,
  });
  await mkdir(path.join(root, "out"));
});
describe("herramientas", () => {
  it("procesa XLSX con valores trazables", async () => {
    const ctx = { directory: root, sessionId: "test" };
    const r = parse(
      await leer_solicitud.execute({ caso: "co-industrias-delta" }, ctx)
    );
    const m = parse(
      await mapear_campos.execute(
        { caso: "co-industrias-delta", campos: r.data.campos },
        ctx
      )
    );
    expect(m.data.faltantes).toHaveLength(0);
    const g = parse(
      await generar_formulario.execute(
        { caso: "co-industrias-delta", mapeo: m.data },
        ctx
      )
    );
    expect(g.ok).toBe(true);
    expect(await readFile(path.join(root, g.data.ruta))).toBeTruthy();
  });
  it("marca identificador extranjero y soporte vencido", async () => {
    const ctx = { directory: root, sessionId: "test" };
    const r = parse(
      await leer_solicitud.execute({ caso: "ec-corp-andina" }, ctx)
    );
    const m = parse(
      await mapear_campos.execute(
        { caso: "ec-corp-andina", campos: r.data.campos },
        ctx
      )
    );
    expect(m.data.requiere_confirmacion[0].motivo).toBe(
      "identificador extranjero"
    );
    await generar_formulario.execute(
      { caso: "ec-corp-andina", mapeo: m.data },
      ctx
    );
    const p = parse(
      await armar_paquete.execute({ caso: "ec-corp-andina" }, ctx)
    );
    expect(p.data.listo_para_firma).toBe(false);
    expect(p.data.checklist).toContainEqual({
      tipo: "certificacion_bancaria",
      estado: "vencido",
    });
  });
  it("bloquea envío sin confirmación", async () => {
    const x = parse(
      await simular_envio.execute(
        { caso: "co-industrias-delta", confirmado: false },
        { directory: root, sessionId: "test" }
      )
    );
    expect(x).toEqual({ ok: false, error: "requiere confirmación explícita" });
  });
  it("devuelve error controlado para caso inexistente", async () => {
    const x = parse(
      await leer_solicitud.execute(
        { caso: "no-existe" },
        { directory: root, sessionId: "test" }
      )
    );
    expect(x.ok).toBe(false);
    expect(x.error).not.toContain("ENOENT");
  });
});
