import "server-only";

export interface ExecuteResult {
  result: unknown;
  error?: string;
  logs?: string[];
}

export interface Executor {
  execute(
    code: string,
    fns: Record<string, (...args: unknown[]) => Promise<unknown>>,
  ): Promise<ExecuteResult>;
}

// `new Function` executes in the MAIN Node process with full access to
// process.env, fetch, and the module system (constructor escape). It is
// NOT a sandbox. Execution is therefore disabled unless explicitly
// enabled, and capped by a hard timeout so runaway loops cannot pin the
// event loop indefinitely.
const DEFAULT_TIMEOUT_MS = 10_000;

const isCodemodeEnabled = (): boolean => process.env.CODEMODE_ENABLED === "1";

export class NodeVMExecutor implements Executor {
  async execute(
    code: string,
    fns: Record<string, (...args: unknown[]) => Promise<unknown>>,
  ): Promise<ExecuteResult> {
    if (!isCodemodeEnabled()) {
      return {
        result: undefined,
        error:
          "Codemode execution is disabled on this deployment (set CODEMODE_ENABLED=1 and use an isolated runtime).",
        logs: [],
      };
    }

    const logs: string[] = [];
    try {
      const fn = new Function("codemode", "console", `return (${code})()`) as (
        codemode: typeof fns,
        console: typeof capturedConsole,
      ) => Promise<unknown>;

      const capturedConsole = {
        log: (...args: unknown[]) =>
          logs.push(args.map((a) => String(a)).join(" ")),
        warn: (...args: unknown[]) =>
          logs.push("[warn] " + args.map((a) => String(a)).join(" ")),
        error: (...args: unknown[]) =>
          logs.push("[error] " + args.map((a) => String(a)).join(" ")),
        info: (...args: unknown[]) =>
          logs.push("[info] " + args.map((a) => String(a)).join(" ")),
      };

      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`Execution timed out`)),
          DEFAULT_TIMEOUT_MS,
        );
      });

      try {
        const result = await Promise.race([
          fn(fns, capturedConsole),
          timeoutPromise,
        ]);
        return { result, logs };
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { result: undefined, error: message, logs };
    }
  }
}

export function getCodemodeExecutor(): Executor {
  const executorType = process.env.CODEMODE_EXECUTOR ?? "node";

  if (executorType === "cloudflare") {
    throw new Error(
      "Cloudflare DynamicWorkerExecutor requires a Cloudflare Workers runtime. " +
        "Set CODEMODE_EXECUTOR=node for Next.js deployments.",
    );
  }

  return new NodeVMExecutor();
}
