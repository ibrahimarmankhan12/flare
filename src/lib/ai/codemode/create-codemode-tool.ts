import "server-only";
import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { getCodemodeExecutor } from "./executor";

const JS_RESERVED = new Set([
  "abstract",
  "arguments",
  "await",
  "boolean",
  "break",
  "byte",
  "case",
  "catch",
  "char",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "double",
  "else",
  "enum",
  "eval",
  "export",
  "extends",
  "false",
  "final",
  "finally",
  "float",
  "for",
  "function",
  "goto",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "int",
  "interface",
  "let",
  "long",
  "native",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "short",
  "static",
  "super",
  "switch",
  "synchronized",
  "this",
  "throw",
  "throws",
  "transient",
  "true",
  "try",
  "typeof",
  "undefined",
  "var",
  "volatile",
  "void",
  "while",
  "with",
  "yield",
]);

function sanitizeName(name: string): string {
  if (!name) return "_";
  let s = name.replace(/[-. ]/g, "_").replace(/[^a-zA-Z0-9_$]/g, "");
  if (!s) return "_";
  if (/^\d/.test(s)) s = "_" + s;
  if (JS_RESERVED.has(s)) s += "_";
  return s;
}

function schemaToTs(schema: Record<string, any>): string {
  if (!schema || typeof schema !== "object") return "unknown";
  if (schema.type === "string") return "string";
  if (schema.type === "number" || schema.type === "integer") return "number";
  if (schema.type === "boolean") return "boolean";
  if (schema.type === "null") return "null";
  if (schema.type === "array") {
    const items = schema.items ? schemaToTs(schema.items) : "unknown";
    return `${items}[]`;
  }
  if (schema.type === "object" || schema.properties) {
    const props = schema.properties ?? {};
    const reqRaw = schema.required;
    const required = new Set<string>(Array.isArray(reqRaw) ? reqRaw : []);
    const fields = Object.entries(props)
      .map(([k, v]) => {
        const opt = required.has(k) ? "" : "?";
        return `${k}${opt}: ${schemaToTs(v as Record<string, any>)}`;
      })
      .join("; ");
    return `{ ${fields} }`;
  }
  if (schema.anyOf || schema.oneOf) {
    const variants = (schema.anyOf ?? schema.oneOf) as Record<string, any>[];
    return variants.map((v) => schemaToTs(v)).join(" | ");
  }
  if (schema.enum) {
    return (schema.enum as string[]).map((v) => JSON.stringify(v)).join(" | ");
  }
  return "unknown";
}

interface ToolTypeEntry {
  name: string;
  originalName: string;
  description: string;
  typeDef: string;
}

function normalizeCode(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return "async () => {}";
  if (/^(async\s+)?\(.*?\)\s*=>/.test(trimmed)) {
    return trimmed;
  }
  return `async () => {\n${trimmed}\n}`;
}

function buildToolIndex(tools: Record<string, Tool>): ToolTypeEntry[] {
  const entries: ToolTypeEntry[] = [];
  for (const [originalName, t] of Object.entries(tools)) {
    const safeName = sanitizeName(originalName);
    const desc = t.description ?? originalName;
    const raw = (t as any).inputSchema ?? (t as any).parameters;
    let inputTs = "unknown";
    if (raw) {
      const jsonSchema =
        typeof raw.toJSON === "function"
          ? raw.toJSON()
          : typeof raw.jsonSchema === "object"
            ? raw.jsonSchema
            : raw;
      inputTs = schemaToTs(jsonSchema);
    }
    const typeDef = `/** ${desc} */\n${safeName}: (input: ${inputTs}) => Promise<unknown>;`;
    entries.push({ name: safeName, originalName, description: desc, typeDef });
  }
  return entries;
}

const EXPLORE_DESCRIPTION = `List available tool APIs and their TypeScript type signatures.

When to call:
- BEFORE writing code, to discover exact tool names and their input parameters.
- When unsure what tools exist or what arguments they accept.

Pass a keyword to filter (e.g. "search", "email") or "*" to list all tools.
Returns tool names, descriptions, and full TypeScript type signatures.`;

function buildExecuteDescription(index: ToolTypeEntry[]): string {
  const toolList = index
    .map((t) => `  - codemode.${t.name}() \u2014 ${t.description.slice(0, 80)}`)
    .join("\n");

  return `Execute a JavaScript async arrow function. Your code runs in a sandbox.

AVAILABLE TOOLS (call via codemode.toolName(args)):
${toolList}

If you need the exact input schema for a tool, call codemode_explore first.
For simple tasks (math, string ops), just compute directly \u2014 no tool call needed.

RULES:
- Access tools ONLY as \`codemode.toolName(args)\`. No other variable name.
- \`codemode\` is a proxy object \u2014 it ONLY has the tools listed above.
- Write a single async arrow function. Do NOT define named functions.
- Return the final result.

EXAMPLES:
  Simple math: async () => { return 1 + 1; }
  Tool call:   async () => { const r = await codemode.webSearch({ query: "test" }); return r; }
  Multi-step:  async () => { const a = await codemode.webSearch({ query: "weather" }); const b = await codemode.sendEmail({ to: "me@x.com", subject: "Weather", body: a }); return { a, b }; }`;
}

export function buildCodemodeTools(
  tools: Record<string, Tool>,
): Record<string, Tool> {
  const index = buildToolIndex(tools);
  const executor = getCodemodeExecutor();

  const exploreTool = createTool({
    description: EXPLORE_DESCRIPTION,
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          'Search keyword to filter tools (e.g. "search", "email", "code"). Use "*" to list all.',
        ),
    }),
    execute: async ({ query }) => {
      const q = query.trim().toLowerCase();
      const matches =
        q === "*"
          ? index
          : index.filter(
              (entry) =>
                entry.name.toLowerCase().includes(q) ||
                entry.originalName.toLowerCase().includes(q) ||
                entry.description.toLowerCase().includes(q),
            );

      if (matches.length === 0) {
        return {
          matches: 0,
          tools: [],
          hint: 'No tools matched. Try a broader keyword or use "*" to list all.',
        };
      }

      return {
        matches: matches.length,
        tools: matches.map((m) => ({
          name: m.name,
          description: m.description,
          typeDef: m.typeDef,
        })),
      };
    },
  });

  const executeTool = createTool({
    description: buildExecuteDescription(index),
    inputSchema: z.object({
      code: z.string().describe("JavaScript async arrow function to execute"),
    }),
    execute: async ({ code }) => {
      const fns: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
      for (const [name, t] of Object.entries(tools)) {
        const exec = "execute" in t ? (t as any).execute : undefined;
        if (exec) fns[sanitizeName(name)] = exec;
      }

      const normalizedCode = normalizeCode(code);
      const executeResult = await executor.execute(normalizedCode, fns);

      if (executeResult.error) {
        const logCtx = executeResult.logs?.length
          ? `\n\nConsole output:\n${executeResult.logs.join("\n")}`
          : "";
        throw new Error(
          `Code execution failed: ${executeResult.error}${logCtx}`,
        );
      }

      const output: Record<string, unknown> = {
        code,
        result: executeResult.result,
      };
      if (executeResult.logs) output.logs = executeResult.logs;
      return output;
    },
  });

  return {
    codemode_explore: exploreTool,
    codemode: executeTool,
  };
}
