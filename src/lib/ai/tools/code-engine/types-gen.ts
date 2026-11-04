import type { Tool } from "ai";

interface ToolInfo {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

function jsonSchemaToTypeScript(
  inputSchema: Record<string, unknown>,
  typeName: string,
): string {
  if (!inputSchema || inputSchema.type !== "object") {
    return `type ${typeName} = Record<string, unknown>;`;
  }

  const props = (inputSchema as Record<string, unknown>).properties as
    | Record<string, unknown>
    | undefined;
  // `|| []` is not enough on its own: a Zod schema's `required` is a METHOD,
  // and a function is truthy, so it slipped through and `new Set(fn)` threw
  // "function is not iterable". `extractToolInfo` now converts schemas up
  // front, but this stays as a hard guarantee for any other caller.
  const rawRequired = (inputSchema as Record<string, unknown>).required;
  const required = new Set<string>(
    Array.isArray(rawRequired) ? (rawRequired as string[]) : [],
  );

  if (!props || Object.keys(props).length === 0) {
    return `type ${typeName} = {};`;
  }

  const lines: string[] = [];
  lines.push(`type ${typeName} = {`);

  for (const [key, prop] of Object.entries(props)) {
    const p = prop as Record<string, unknown>;
    let tsType = "unknown";

    switch (p.type) {
      case "string":
        tsType = "string";
        break;
      case "number":
      case "integer":
        tsType = "number";
        break;
      case "boolean":
        tsType = "boolean";
        break;
      case "array": {
        const items = p.items as Record<string, unknown> | undefined;
        if (items?.type === "string") tsType = "string[]";
        else if (items?.type === "number") tsType = "number[]";
        else tsType = "unknown[]";
        break;
      }
      case "object":
        tsType = "Record<string, unknown>";
        break;
      default:
        tsType = "unknown";
    }

    if (p.enum && Array.isArray(p.enum)) {
      tsType = p.enum.map((v) => JSON.stringify(v)).join(" | ");
    }

    const optional = !required.has(key) ? "?" : "";
    const desc = p.description ? ` // ${p.description}` : "";
    lines.push(`  ${key}${optional}: ${tsType};${desc}`);
  }

  lines.push("};");
  return lines.join("\n");
}

export function generateTypesFromTools(
  tools: ToolInfo[],
  namespace = "flare",
): string {
  const blocks: string[] = [];
  const methodLines: string[] = [];
  const sanitizedNames = new Map<string, number>();

  for (const tool of tools) {
    const safeName = tool.name.replace(/[^a-zA-Z0-9_]/g, "_");
    const count = sanitizedNames.get(safeName) || 0;
    sanitizedNames.set(safeName, count + 1);
    const uniqueName = count > 0 ? `${safeName}_${count}` : safeName;

    const inputTypeName = `${uniqueName.charAt(0).toUpperCase() + uniqueName.slice(1)}Input`;

    if (tool.inputSchema) {
      blocks.push(jsonSchemaToTypeScript(tool.inputSchema, inputTypeName));
    } else {
      blocks.push(`type ${inputTypeName} = {};`);
    }

    methodLines.push(
      `  ${uniqueName}(input: ${inputTypeName}): Promise<unknown>;`,
    );
  }

  const methods = methodLines.join("\n");

  blocks.push(`declare const ${namespace}: {\n${methods}\n};`);

  return blocks.join("\n\n");
}

/**
 * Coerce a tool's `inputSchema` into real JSON Schema.
 *
 * `tool()` from the AI SDK keeps the Zod schema it was given, so
 * `inputSchema` here is usually a Zod object — not the `{ type, properties,
 * required }` shape this generator was written against. Both have
 * `type === "object"`, so the guard in `jsonSchemaToTypeScript` let Zod
 * schemas through, and `required` resolved to Zod's `.required()` METHOD.
 *
 * On this deployment that was 63 of 67 tools. It never surfaced because the
 * Code Engine toolkit was disabled in the site config, so this file never
 * ran; enabling the toolkit turned a latent bug into a 500 on every chat
 * request.
 *
 * Returns undefined when conversion fails, which the caller renders as an
 * empty type — a worse type declaration is much better than a broken chat.
 */
const toJsonSchema = (schema: unknown): Record<string, unknown> | undefined => {
  if (!schema || typeof schema !== "object") return undefined;
  const candidate = schema as Record<string, unknown>;

  // Already plain JSON Schema.
  if (Array.isArray(candidate.required) || !candidate.def) {
    return candidate;
  }

  if (typeof candidate.toJSONSchema === "function") {
    try {
      return (candidate.toJSONSchema as () => Record<string, unknown>)();
    } catch {
      return undefined;
    }
  }
  return undefined;
};

export function extractToolInfo(toolRecord: Record<string, Tool>): ToolInfo[] {
  return Object.entries(toolRecord).map(([name, tool]) => {
    const toolDef = tool as Record<string, unknown>;
    return {
      name,
      description: (toolDef.description as string) || "",
      inputSchema: toJsonSchema(toolDef.inputSchema),
    };
  });
}
