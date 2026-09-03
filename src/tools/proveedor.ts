import { z } from "zod";
import path from "node:path";
import { copyFile, mkdir } from "node:fs/promises";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { exists, json, paths, safeError, writeText } from "../utils/files.js";
import { logTool } from "../utils/logger.js";
import type { Lleno, Mapeo, ToolContext } from "./types.js";

type Solicitud = {
  pais: string;
  cliente: string;
  formato: "xlsx" | "pdf" | "portal";
};
type Celda = {
  hoja: string;
  celda_etiqueta: string;
  etiqueta: string;
  celda_valor: string;
};
type Campo = { etiqueta: string; obligatorio: boolean };
type Soporte = {
  tipo: string;
  archivo: string;
  vigencia_hasta: string;
  pais_emisor: string;
};
const ok = (data: unknown) => JSON.stringify({ ok: true, data });
const fail = (error: string) => JSON.stringify({ ok: false, error });
const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
const getCase = (ctx: ToolContext, caso: string) => paths(ctx.directory, caso);
async function audited(
  ctx: ToolContext,
  caso: string,
  name: string,
  work: () => Promise<unknown>
) {
  try {
    const data = await work();
    await logTool(ctx.directory, caso, name, true, "operación completada");
    return ok(data);
  } catch (e) {
    const error = safeError(e);
    await logTool(ctx.directory, caso, name, false, error);
    return fail(error);
  }
}
async function requestedFields(
  p: ReturnType<typeof paths>,
  format: Solicitud["formato"]
): Promise<string[]> {
  if (format === "xlsx")
    return (
      await json<Celda[]>(path.join(p.caso, "plantilla-celdas.json"))
    ).map((x) => x.etiqueta);
  return (await json<Campo[]>(path.join(p.caso, "plantilla-campos.json"))).map(
    (x) => x.etiqueta
  );
}

export const leer_solicitud = {
  description:
    "Lee la solicitud, la plantilla y los soportes exigidos de un caso.",
  args: {
    caso: z
      .string()
      .min(1)
      .describe("Nombre de la carpeta del caso en fixtures/reto-01/casos/"),
  },
  async execute({ caso }: { caso: string }, ctx: ToolContext) {
    return audited(ctx, caso, "proveedor_leer_solicitud", async () => {
      const p = getCase(ctx, caso);
      const solicitud = await json<Solicitud>(
        path.join(p.caso, "solicitud.json")
      );
      const campos = await requestedFields(p, solicitud.formato);
      const soportes = await json<string[]>(
        path.join(p.caso, "soportes-exigidos.json")
      );
      return {
        pais: solicitud.pais,
        cliente: solicitud.cliente,
        formato: solicitud.formato,
        campos,
        soportes,
      };
    });
  },
};

export const mapear_campos = {
  description:
    "Cruza campos solicitados con el maestro y reporta valores trazables, faltantes y ambigüedades.",
  args: {
    caso: z.string().min(1).describe("Caso a mapear"),
    campos: z
      .array(z.string())
      .describe("Etiquetas solicitadas por el cliente"),
  },
  async execute(
    { caso, campos }: { caso: string; campos: string[] },
    ctx: ToolContext
  ) {
    return audited(ctx, caso, "proveedor_mapear_campos", async () => {
      const p = getCase(ctx, caso);
      const solicitud = await json<Solicitud>(
        path.join(p.caso, "solicitud.json")
      );
      const maestro = await json<Record<string, unknown>>(
        path.join(p.repo, "maestro.json")
      );
      const glosario = await json<Record<string, string>>(p.glosario);
      const result: Mapeo = {
        llenos: [],
        faltantes: [],
        requiere_confirmacion: [],
      };
      for (const campo of campos) {
        const keyName = normalizar(campo);
        let key = glosario[keyName];
        if (keyName === "identificacion tributaria") {
          const local =
            (
              {
                CO: "NIT",
                EC: "RUC",
                PE: "RUC",
                PA: "RUC",
                HN: "RTN",
              } as Record<string, string>
            )[solicitud.pais] ?? "identificador tributario";
          result.requiere_confirmacion.push({
            campo,
            motivo: "identificador extranjero",
            propuesta: `${local}: usar NIT colombiano`,
          });
          key = "nit";
        }
        const value = key ? maestro[key] : undefined;
        if (typeof value === "string" || typeof value === "number")
          result.llenos.push({
            campo,
            valor: String(value),
            fuente: `maestro.${key}`,
            confianza: keyName === "identificacion tributaria" ? 0.7 : 1,
          });
        else
          result.faltantes.push({
            campo,
            motivo: "No existe una fuente en el maestro",
          });
      }
      await mkdir(p.out, { recursive: true });
      await writeText(
        path.join(p.out, "mapeo.json"),
        JSON.stringify(result, null, 2)
      );
      return result;
    });
  },
};

export const generar_formulario = {
  description:
    "Genera el formulario XLSX/PDF o los valores copiables para un portal usando exclusivamente el mapeo.",
  args: {
    caso: z.string().min(1).describe("Caso a generar"),
    mapeo: z
      .object({
        llenos: z.array(
          z.object({
            campo: z.string(),
            valor: z.string(),
            fuente: z.string(),
            confianza: z.number(),
          })
        ),
        faltantes: z.array(
          z.object({
            campo: z.string(),
            motivo: z.string(),
            propuesta: z.string().optional(),
          })
        ),
        requiere_confirmacion: z.array(
          z.object({
            campo: z.string(),
            motivo: z.string(),
            propuesta: z.string().optional(),
          })
        ),
      })
      .describe("Resultado de proveedor_mapear_campos"),
  },
  async execute(
    { caso, mapeo }: { caso: string; mapeo: Mapeo },
    ctx: ToolContext
  ) {
    return audited(ctx, caso, "proveedor_generar_formulario", async () => {
      const p = getCase(ctx, caso);
      const solicitud = await json<Solicitud>(
        path.join(p.caso, "solicitud.json")
      );
      await mkdir(p.out, { recursive: true });
      const values = new Map(mapeo.llenos.map((x) => [x.campo, x.valor]));
      if (solicitud.formato === "xlsx") {
        const cells = await json<Celda[]>(
          path.join(p.caso, "plantilla-celdas.json")
        );
        const wb = new ExcelJS.Workbook();
        for (const item of cells) {
          const ws = wb.getWorksheet(item.hoja) ?? wb.addWorksheet(item.hoja);
          ws.getCell(item.celda_etiqueta).value = item.etiqueta;
          ws.getCell(item.celda_valor).value =
            values.get(item.etiqueta) ?? "FALTANTE";
        }
        const target = path.join(p.out, "formulario.xlsx");
        await wb.xlsx.writeFile(target);
        return { ruta: path.relative(ctx.directory, target), formato: "xlsx" };
      }
      if (solicitud.formato === "pdf") {
        const fields = await json<Campo[]>(
          path.join(p.caso, "plantilla-campos.json")
        );
        const doc = await PDFDocument.create();
        const page = doc.addPage([612, 792]);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        let y = 740;
        page.drawText(`Registro de proveedor - ${solicitud.cliente}`, {
          x: 48,
          y,
          size: 16,
          font,
          color: rgb(0.05, 0.18, 0.3),
        });
        y -= 35;
        for (const f of fields) {
          page.drawText(
            `${f.etiqueta}: ${values.get(f.etiqueta) ?? "FALTANTE"}`,
            { x: 48, y, size: 11, font }
          );
          y -= 24;
        }
        const target = path.join(p.out, "formulario.pdf");
        const bytes = await doc.save();
        await import("node:fs/promises").then((fs) =>
          fs.writeFile(target, bytes)
        );
        return { ruta: path.relative(ctx.directory, target), formato: "pdf" };
      }
      const target = path.join(p.out, "valores-portal.md");
      await writeText(
        target,
        [
          "# Valores para portal",
          "",
          ...mapeo.llenos.map((x) => `- **${x.campo}:** ${x.valor}`),
          "",
          ...mapeo.faltantes.map((x) => `- **${x.campo}:** FALTANTE`),
        ].join("\n")
      );
      return {
        ruta: path.relative(ctx.directory, target),
        formato: "portal",
        advertencia: "formato no soportado: valores listos para copiar",
      };
    });
  },
};

export const armar_paquete = {
  description:
    "Crea el paquete para firma, verifica soportes y redacta un correo sin datos bancarios.",
  args: { caso: z.string().min(1).describe("Caso cuyo paquete se prepara") },
  async execute({ caso }: { caso: string }, ctx: ToolContext) {
    return audited(ctx, caso, "proveedor_armar_paquete", async () => {
      const p = getCase(ctx, caso);
      const solicitud = await json<Solicitud>(
        path.join(p.caso, "solicitud.json")
      );
      const required = await json<string[]>(
        path.join(p.caso, "soportes-exigidos.json")
      );
      const index = await json<Soporte[]>(
        path.join(p.repo, "soportes", "index.json")
      );
      const packageDir = path.join(p.out, "paquete");
      await mkdir(packageDir, { recursive: true });
      const checklist: { tipo: string; estado: string }[] = [];
      for (const tipo of required) {
        const support = index.find((x) => x.tipo === tipo);
        if (
          !support ||
          !(await exists(path.join(p.repo, "soportes", support.archivo)))
        )
          checklist.push({ tipo, estado: "ausente" });
        else {
          const expired =
            support.vigencia_hasta < new Date().toISOString().slice(0, 10);
          checklist.push({ tipo, estado: expired ? "vencido" : "presente" });
          await copyFile(
            path.join(p.repo, "soportes", support.archivo),
            path.join(packageDir, support.archivo)
          );
        }
      }
      const form = [
        "formulario.xlsx",
        "formulario.pdf",
        "valores-portal.md",
      ].find(async (x) => exists(path.join(p.out, x)));
      for (const candidate of [
        "formulario.xlsx",
        "formulario.pdf",
        "valores-portal.md",
      ])
        if (await exists(path.join(p.out, candidate))) {
          await copyFile(
            path.join(p.out, candidate),
            path.join(packageDir, candidate)
          );
          break;
        }
      let faltantes: string[] = [];
      if (await exists(path.join(p.out, "mapeo.json")))
        faltantes = (
          await json<Mapeo>(path.join(p.out, "mapeo.json"))
        ).faltantes.map((x) => x.campo);
      const listo_para_firma = checklist.every((x) => x.estado === "presente");
      await writeText(
        path.join(packageDir, "checklist.md"),
        [
          "# Checklist",
          ...checklist.map(
            (x) =>
              `- [${x.estado === "presente" ? "x" : " "}] ${x.tipo}: **${
                x.estado
              }**`
          ),
          ...faltantes.map(
            (x) => `- [ ] Campo faltante: **${x}** (no bloquea firma)`
          ),
        ].join("\n")
      );
      await writeText(
        path.join(packageDir, "borrador-correo.md"),
        `# Borrador de correo\n\nAsunto: Registro de proveedor — ${solicitud.cliente}\n\nAdjuntamos el formulario y los soportes solicitados para revisión y firma.\n`
      );
      return {
        ruta: path.relative(ctx.directory, packageDir),
        listo_para_firma,
        checklist,
        formulario: form,
      };
    });
  },
};

export const simular_envio = {
  description:
    "Simula el envío únicamente después de una confirmación humana explícita.",
  args: {
    caso: z.string().min(1).describe("Caso a enviar"),
    confirmado: z
      .boolean()
      .describe(
        "Confirmación explícita del usuario en el turno inmediatamente anterior"
      ),
  },
  async execute(
    { caso, confirmado }: { caso: string; confirmado: boolean },
    ctx: ToolContext
  ) {
    if (!confirmado) {
      await logTool(
        ctx.directory,
        caso,
        "proveedor_simular_envio",
        false,
        "requiere confirmación explícita"
      );
      return fail("requiere confirmación explícita");
    }
    
    return audited(ctx, caso, "proveedor_simular_envio", async () => {
      const target = path.join(getCase(ctx, caso).out, "ENVIO-SIMULADO.md");
      await writeText(
        target,
        `# Envío simulado\n\nCaso: ${caso}\nFecha: ${new Date().toISOString()}\n`
      );
      return { ruta: path.relative(ctx.directory, target) };
    });
  },
};

export const proveedorTools = {
  proveedor_leer_solicitud: leer_solicitud,
  proveedor_mapear_campos: mapear_campos,
  proveedor_generar_formulario: generar_formulario,
  proveedor_armar_paquete: armar_paquete,
  proveedor_simular_envio: simular_envio,
};
