import type { z } from "zod";

export type ToolContext = { directory: string; sessionId: string };
export type Tool = {
  description: string;
  args: Record<string, z.ZodTypeAny>;
  execute(args: never, ctx: ToolContext): Promise<string>;
};

export type Lleno = {
  campo: string;
  valor: string;
  fuente: string;
  confianza: number;
};

export type Pendiente = { campo: string; motivo: string; propuesta?: string };

export type Mapeo = {
  llenos: Lleno[];
  faltantes: Pendiente[];
  requiere_confirmacion: Pendiente[];
};
