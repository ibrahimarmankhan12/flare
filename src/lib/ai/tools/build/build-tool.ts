import { tool } from "ai";
import z from "zod";
import { buildJobRepository } from "lib/db/repository";
import { isE2BConfigured } from "lib/sandbox/client";
import {
  clarifyPrompt,
  resumeBuild,
  runAgentBuild,
  runBuild,
  runVibeSdkBuild,
} from "lib/sandbox/runner";

/**
 * AI app builder backed by an E2B sandbox.
 *
 * Distinct from the Canvas tools: Canvas produces a single HTML artifact for
 * visual iteration, this provisions a real running sandbox with a public
 * preview URL and a persisted, resumable filesystem.
 */
export const buildAppTool = (ctx: { userId: string; threadId: string }) =>
  tool({
    description:
      "Generate a runnable web app and host it on a live preview URL inside a secure cloud sandbox. Use this when the user asks to build, make, or prototype an app, tool, game, or site that they want to actually USE and interact with — not just look at. Returns a public URL that renders the working app. If the user wants to revisit an app you built earlier in this conversation, pass its buildId to bring it back instead of rebuilding.",
    inputSchema: z.object({
      prompt: z
        .string()
        .min(1)
        .describe(
          "Full description of the app to build: what it does, how it should look, and any specific behaviour required.",
        ),
      mode: z
        .enum(["static", "agent", "vibesdk"])
        .optional()
        .describe(
          "How to build. 'static' (default) is one fast LLM pass that writes the files. 'agent' runs a real coding agent inside the sandbox with a terminal and filesystem — slower, but better for anything that needs iteration, multiple files, or debugging. Prefer 'agent' when the user asks for something substantial or says the previous attempt was wrong.",
        ),
      skipQuestions: z
        .boolean()
        .optional()
        .describe(
          "Set true to build immediately without asking the user anything. Use this when the user has already answered your questions, said 'just build it', or the request is clearly specified. Leave unset the first time you build something substantial — the tool will come back with questions worth asking.",
        ),
      buildId: z
        .string()
        .optional()
        .describe(
          "Existing build id to resume. Only set this to bring back an app built earlier; omit it for a new app.",
        ),
    }),
    execute: async ({ prompt, buildId, mode, skipQuestions }) => {
      if (!isE2BConfigured()) {
        return {
          error: "unavailable",
          message:
            "The Build feature isn't configured on this deployment (E2B_API_KEY missing).",
        };
      }

      try {
        if (buildId) {
          const existing = await buildJobRepository.getById(
            buildId,
            ctx.userId,
          );
          if (existing) {
            const resumed = await resumeBuild(existing);
            return {
              buildId: existing.id,
              previewUrl: resumed.previewUrl,
              title: existing.title,
              reused: resumed.reused,
              message: `[${existing.title ?? "Your app"}](${resumed.previewUrl}) is live again${
                resumed.reused ? "" : " (rebuilt from saved files)"
              }.`,
            };
          }
          // Fall through and build fresh if the id is unknown to this user.
        }

        // Ask before spending a sandbox on a guess. Text-only call, so this
        // is cheap; it only interrupts when the answer would change the app.
        if (!skipQuestions && !buildId) {
          const check = await clarifyPrompt(prompt);
          if (!check.readyToBuild && check.questions.length) {
            return {
              needsAnswers: true,
              questions: check.questions,
              message:
                "Before building, I need to know:\n" +
                check.questions.map((q, i) => `${i + 1}. ${q}`).join("\n") +
                "\n\nAnswer these and I'll build it — or say \"just build it\" and I'll pick sensible defaults.",
            };
          }
        }

        const run =
          mode === "vibesdk"
            ? runVibeSdkBuild
            : mode === "agent"
              ? runAgentBuild
              : runBuild;
        const result = await run({
          userId: ctx.userId,
          threadId: ctx.threadId,
          prompt,
        });

        return {
          buildId: result.buildId,
          previewUrl: result.previewUrl,
          title: result.title,
          summary: result.summary,
          fileCount: result.files.length,
          mode: mode ?? "static",
          expiresAt: result.expiresAt.toISOString(),
          message: `**${result.title}** is live at ${result.previewUrl} — ${result.summary}`,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          error: "build-failed",
          message: `The build failed: ${message}`,
        };
      }
    },
  });
