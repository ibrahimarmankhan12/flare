import { tool as createTool } from "ai";
import { z } from "zod";
import type { Tool } from "ai";
import { NodeVMExecutor } from "./executor";
import { generateTypesFromTools, extractToolInfo } from "./types-gen";

const FLARE_CODE_ENGINE_DESCRIPTION = `You have a single "flare" tool — the Flare Code Engine. Instead of calling tools one at a time, write a single TypeScript async arrow function that orchestrates all the operations you need.

The \`flare\` object exposes every available tool as a method. Call them in any order, compose results, handle errors — all in one shot.

Example:
\`\`\`ts
async () => {
  const search = await flare.webSearch({ query: "latest AI news 2026" });
  const content = await flare.webContent({ url: search.results[0].url });
  return { summary: content.text.slice(0, 500) };
};
\`\`\`

Available tools with their type signatures:

{{types}}

Rules:
1. Always return a value from your function.
2. Use console.log() for debugging — output is captured.
3. Handle errors with try/catch.
4. Output ONLY the raw async arrow function inside a single \`\`\`ts code fence.
`;

const codeSchema = z.object({
  code: z
    .string()
    .describe(
      "TypeScript async arrow function. The 'flare' object is available with all tools as methods. Always return a value.",
    ),
});

export function createCodeEngineTool(
  allTools: Record<string, Tool>,
  executor: NodeVMExecutor,
  description?: string,
): Tool {
  const toolInfo = extractToolInfo(allTools);
  const typeBlock = generateTypesFromTools(toolInfo, "flare");
  const finalDescription = (
    description || FLARE_CODE_ENGINE_DESCRIPTION
  ).replace("{{types}}", typeBlock);

  const fns: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  for (const [name, t] of Object.entries(allTools)) {
    const toolDef = t as Record<string, unknown>;
    const execute = toolDef.execute as
      | ((args: unknown) => Promise<unknown>)
      | undefined;

    if (execute) {
      fns[name] = async (args: unknown) => {
        try {
          return await execute(args);
        } catch (err) {
          throw err;
        }
      };
    }
  }

  return createTool({
    description: finalDescription,
    inputSchema: codeSchema,
    execute: async ({ code }) => {
      const result = await executor.execute(code, [{ name: "flare", fns }]);
      if (result.error) {
        return {
          output: null,
          error: result.error,
          logs: result.logs || [],
        };
      }
      return {
        output: result.result,
        error: null,
        logs: result.logs || [],
      };
    },
  });
}
