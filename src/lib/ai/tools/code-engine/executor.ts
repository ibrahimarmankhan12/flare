import { normalizeCode, sanitizeToolName } from "./normalize";

export interface ExecuteResult {
  result: unknown;
  error?: string;
  logs?: string[];
}

export interface ResolvedProvider {
  name: string;
  fns: Record<string, (...args: unknown[]) => Promise<unknown>>;
}

export class NodeVMExecutor {
  private timeout: number;

  constructor(options?: { timeout?: number }) {
    this.timeout = options?.timeout ?? 30000;
  }

  async execute(
    code: string,
    providers: ResolvedProvider[],
  ): Promise<ExecuteResult> {
    const normalized = normalizeCode(code);
    const logs: string[] = [];

    const fakeConsole = {
      log: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
      warn: (...args: unknown[]) =>
        logs.push("[warn] " + args.map(String).join(" ")),
      error: (...args: unknown[]) =>
        logs.push("[error] " + args.map(String).join(" ")),
    };

    try {
      const sandbox: Record<string, unknown> = { console: fakeConsole };

      for (const provider of providers) {
        const fns: Record<string, (...args: unknown[]) => Promise<unknown>> =
          {};
        for (const [name, fn] of Object.entries(provider.fns)) {
          const safeName = sanitizeToolName(name);
          fns[safeName] = fn;
        }
        sandbox[provider.name] = fns;
      }

      const paramNames = Object.keys(sandbox);
      const paramValues = Object.values(sandbox);

      const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

      const fn = new AsyncFunction(
        ...paramNames,
        `"use strict";\nreturn await (${normalized})();`,
      );

      const result = await Promise.race([
        fn(...paramValues),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Execution timed out")),
            this.timeout,
          ),
        ),
      ]);

      return { result, logs };
    } catch (err) {
      return {
        result: undefined,
        error: err instanceof Error ? err.message : String(err),
        logs,
      };
    }
  }
}
