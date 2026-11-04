import { tool } from "ai";
import {
  getPreviewUrl,
  isE2BConfigured,
  startDevServer,
} from "lib/sandbox/client";
import { getThreadSandbox, resetThreadSandbox } from "lib/sandbox/session";
import {
  WORK_DIR,
  describeEnvironmentContents,
  describeEnvironments,
} from "lib/sandbox/templates";
import z from "zod";

/**
 * General-purpose secure sandbox, available to the assistant anywhere.
 *
 * Distinct from the existing code tools: those run JavaScript/Python in the
 * user's browser behind a keyword blocklist. This is a real Linux VM with a
 * filesystem, network access, package managers and any language — and it
 * persists for the whole conversation, so work accumulates across turns.
 *
 * Three things here exist specifically to stop the agent burning its budget,
 * each traced to a measured failure (246 tool calls, 37 failures, no artifact,
 * on a task that should have taken ~30):
 *
 *   * `env` picks a prebuilt image with the toolchain already installed —
 *     fast. The sandbox has PASSWORDLESS SUDO (verified live: `sudo -n apt-get
 *     install` works), so the agent is effectively root and CAN install
 *     anything; prebuilt envs just make it unnecessary.
 *   * `write_many` writes a whole project in one call instead of one file per
 *     round trip.
 *   * `edit` patches a file in place. Without it the only way to change one
 *     line is to rewrite the entire file, which is exactly how a single
 *     `gradle.properties` came to be written 22 times.
 *
 * Output is truncated per call; a runaway command must not blow up the chat
 * context.
 */
const MAX_OUTPUT = 6000;

/** Batch writes are capped so one call cannot ship an entire node_modules. */
const MAX_BATCH_FILES = 60;

const clip = (s: string): string =>
  s.length > MAX_OUTPUT
    ? `${s.slice(0, MAX_OUTPUT)}\n… [truncated ${s.length - MAX_OUTPUT} chars]`
    : s;

export const sandboxTool = (ctx: { userId: string; threadId: string }) =>
  tool({
    description: [
      "Run commands and code in a secure Linux sandbox with a real filesystem, internet access and a full toolchain. Use this whenever you need to ACTUALLY execute something rather than reason about it: building and running projects, testing code, processing data, precise computation, or fetching from the network. The sandbox persists for the whole conversation, so files and installed packages stay available in later turns.",
      "",
      "You are effectively ROOT (passwordless sudo) — `sudo -n apt-get install <pkg>` succeeds, so install anything missing rather than giving up. Prebuilt envs just make that unnecessary — install any toolchain you need: pip, npm, cargo, compilers, services.",
      "",
      "Write a whole project with a single write_many call, and change existing files with edit rather than rewriting them with write.",
    ].join("\n"),
    inputSchema: z.object({
      action: z
        .enum([
          "run",
          "python",
          "node",
          "write",
          "write_many",
          "edit",
          "read",
          "list",
          "serve",
          "reset",
        ])
        .describe(
          "run = shell command; python/node = execute a code snippet; write = create one file; write_many = create several files in one call (preferred when scaffolding a project); edit = replace a string inside an existing file (preferred over rewriting it); read = read a file; list = list a directory; serve = start a web server and get a public URL; reset = destroy the sandbox and start fresh.",
        ),
      env: z.string().optional().describe(describeEnvironments()),
      command: z
        .string()
        .optional()
        .describe(
          "Shell command, for action='run'. Runs in the work directory.",
        ),
      code: z
        .string()
        .optional()
        .describe("Source to execute, for action='python' or 'node'."),
      path: z
        .string()
        .optional()
        .describe(
          "File or directory path for write/edit/read/list. Relative paths resolve inside the work directory.",
        ),
      content: z
        .string()
        .optional()
        .describe("File contents, for action='write'."),
      files: z
        .array(
          z.object({
            path: z.string().describe("Relative or absolute path."),
            content: z.string().describe("Full file contents."),
          }),
        )
        .optional()
        .describe(
          `Files to create, for action='write_many'. Parent directories are created automatically. Up to ${MAX_BATCH_FILES} per call.`,
        ),
      find: z
        .string()
        .optional()
        .describe(
          "Exact text to replace, for action='edit'. Must appear exactly once in the file unless replace_all is set — include surrounding lines to make it unique.",
        ),
      replace: z
        .string()
        .optional()
        .describe("Replacement text, for action='edit'. Empty string deletes."),
      replace_all: z
        .boolean()
        .optional()
        .describe("Replace every occurrence instead of requiring exactly one."),
      port: z
        .number()
        .optional()
        .describe(
          "Port your server listens on, for action='serve'. Defaults to 3000.",
        ),
    }),
    execute: async ({
      action,
      env,
      command,
      code,
      path,
      content,
      files,
      find,
      replace,
      replace_all,
      port,
    }) => {
      if (!isE2BConfigured()) {
        return {
          error: "unavailable",
          message:
            "The sandbox isn't configured on this deployment (E2B_API_KEY missing).",
        };
      }

      try {
        if (action === "reset") {
          const killed = await resetThreadSandbox(ctx.threadId, env);
          return {
            ok: true,
            message: killed
              ? `Destroyed ${killed} sandbox(es). The next call starts a fresh one.`
              : "No sandbox was running.",
          };
        }

        const {
          sandbox: sbx,
          resolved,
          created,
        } = await getThreadSandbox({
          threadId: ctx.threadId,
          userId: ctx.userId,
          env,
        });

        // Brief the model on what's in the box the first time it opens one,
        // and whenever it asked for something this deployment can't spawn.
        // Repeating it on every call would just burn context.
        const notice: Record<string, string> = {};
        if (resolved.degradedFrom) {
          notice.warning = `Environment "${resolved.degradedFrom}" is not available on this deployment; using "${resolved.id}" instead. You can install what you need — you have passwordless sudo.`;
        }
        if (created) {
          const brief = describeEnvironmentContents(resolved.environment);
          if (brief) notice.environment = brief;
        }

        // Relative paths are resolved inside the work dir so the model cannot
        // accidentally scribble over the sandbox's home or system files.
        const resolve = (p: string) =>
          p.startsWith("/") ? p : `${WORK_DIR}/${p.replace(/^\.\//, "")}`;

        switch (action) {
          case "run": {
            if (!command)
              return { error: "command is required for action='run'" };
            const r = await sbx.commands
              .run(command, { cwd: WORK_DIR, timeoutMs: 600_000 })
              .catch(
                (e: any) =>
                  e?.result ?? {
                    stdout: "",
                    stderr: e?.message ?? String(e),
                    exitCode: 1,
                  },
              );
            return {
              ...notice,
              exitCode: r.exitCode ?? 0,
              stdout: clip(r.stdout ?? ""),
              stderr: clip(r.stderr ?? ""),
            };
          }

          case "python":
          case "node": {
            if (!code)
              return { error: `code is required for action='${action}'` };
            // Node module style matters: a .mjs file rejects require(), a .cjs
            // file rejects import. Models write both, so pick the extension
            // from the code rather than forcing one and failing half the time.
            const isEsm =
              /^\s*(import\s|export\s)/m.test(code) ||
              /\bawait\s+import\(/.test(code);
            const file =
              action === "python"
                ? "_snippet.py"
                : isEsm
                  ? "_snippet.mjs"
                  : "_snippet.cjs";
            await sbx.files.write(`${WORK_DIR}/${file}`, code);
            const bin = action === "python" ? "python3" : "node";
            const r = await sbx.commands
              .run(`${bin} ${file}`, { cwd: WORK_DIR, timeoutMs: 600_000 })
              .catch(
                (e: any) =>
                  e?.result ?? {
                    stdout: "",
                    stderr: e?.message ?? String(e),
                    exitCode: 1,
                  },
              );
            return {
              ...notice,
              exitCode: r.exitCode ?? 0,
              stdout: clip(r.stdout ?? ""),
              stderr: clip(r.stderr ?? ""),
            };
          }

          case "write": {
            if (!path || content === undefined) {
              return {
                error: "path and content are required for action='write'",
              };
            }
            await sbx.files.write(resolve(path), content);
            return {
              ...notice,
              ok: true,
              path: resolve(path),
              bytes: content.length,
            };
          }

          case "write_many": {
            if (!files?.length) {
              return { error: "files is required for action='write_many'" };
            }
            if (files.length > MAX_BATCH_FILES) {
              return {
                error: `too many files (${files.length}); the limit is ${MAX_BATCH_FILES} per call`,
              };
            }
            // One round trip for the whole set — this is the entire reason
            // the action exists.
            await sbx.files.write(
              files.map((f) => ({ path: resolve(f.path), data: f.content })),
            );
            return {
              ...notice,
              ok: true,
              written: files.length,
              bytes: files.reduce((n, f) => n + f.content.length, 0),
              paths: files.map((f) => resolve(f.path)),
            };
          }

          case "edit": {
            if (!path || find === undefined || replace === undefined) {
              return {
                error: "path, find and replace are required for action='edit'",
              };
            }
            const target = resolve(path);
            const before = String(await sbx.files.read(target));
            const occurrences = before.split(find).length - 1;
            if (occurrences === 0) {
              return {
                error: "not-found",
                message: `The 'find' text does not appear in ${target}. Read the file first — do not rewrite the whole file to work around this.`,
              };
            }
            // Ambiguity is reported rather than guessed at: silently patching
            // the first of several matches is how an edit tool corrupts a
            // file in a way nobody notices until the build breaks.
            if (occurrences > 1 && !replace_all) {
              return {
                error: "ambiguous",
                message: `The 'find' text appears ${occurrences} times in ${target}. Include more surrounding context to make it unique, or set replace_all.`,
              };
            }
            const after = replace_all
              ? before.split(find).join(replace)
              : before.replace(find, replace);
            await sbx.files.write(target, after);
            return {
              ...notice,
              ok: true,
              path: target,
              replaced: replace_all ? occurrences : 1,
            };
          }

          case "read": {
            if (!path) return { error: "path is required for action='read'" };
            const data = await sbx.files.read(resolve(path));
            return {
              ...notice,
              path: resolve(path),
              content: clip(String(data)),
            };
          }

          case "list": {
            const target = path ? resolve(path) : WORK_DIR;
            const entries = await sbx.files.list(target);
            return {
              ...notice,
              path: target,
              entries: (entries as { name?: string; type?: string }[])
                .slice(0, 200)
                .map((e) => ({ name: e.name, type: e.type })),
            };
          }

          case "serve": {
            if (!command) {
              return {
                error:
                  "command is required for action='serve' — the command that starts your server, e.g. 'python3 -m http.server 3000 --bind 0.0.0.0'.",
              };
            }
            const p = port ?? 3000;
            await startDevServer(sbx, { cmd: command, cwd: WORK_DIR, port: p });
            return {
              ...notice,
              previewUrl: getPreviewUrl(sbx, p),
              message:
                "Server started. It must bind 0.0.0.0 to be reachable at this URL.",
            };
          }

          default:
            return { error: `unknown action: ${action}` };
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: "sandbox-failed", message: clip(message) };
      }
    },
  });
