import { z } from "zod";

export function zodObjectToJson(args: Record<string, z.ZodTypeAny>) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, schema] of Object.entries(args)) {
    required.push(key);
    const d = schema.description;
    let type = "string";
    if (schema instanceof z.ZodBoolean) type = "boolean";
    else if (schema instanceof z.ZodArray) type = "array";
    else if (schema instanceof z.ZodObject) type = "object";
    properties[key] = { type, description: d };
  }
  
  return { type: "object", properties, required, additionalProperties: false };
}
