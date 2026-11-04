import "server-only";
import { tool as createTool, generateObject } from "ai";
import { JSONSchema7 } from "json-schema";
import { z } from "zod";
import { serverCache } from "lib/cache";
import { jsonSchemaToZod } from "lib/json-schema-to-zod";
import { customModelProvider } from "lib/ai/models";
import { safe } from "ts-safe";
import {
  allocateContainer,
  createSteelSession,
  releaseContainerAlloc,
  releaseSteelSession,
  steelBaseUrl,
  type SteelSession,
} from "./steel-fleet";
import { isCrawlGatewayEnabled, runViaCrawlGateway } from "./crawl-gateway";

// The browser Agent drives the self-hosted Steel browser fleet: it allocates a
// container, opens a live Steel session, connects Playwright over CDP, and runs
// a bounded LLM action loop (navigate / click / type / scroll) to accomplish a
// natural-language task. The session's live-view URL is returned so the UI can
// embed the running browser.

const BROWSER_SESSION_CACHE_PREFIX = "browser-agent:steel-session";
const MAX_STEPS_DEFAULT = 8;
const MAX_ELEMENTS = 45;

type CachedBrowserSession = {
  containerIndex: number;
  steelSessionId: string;
  websocketUrl: string;
  liveViewUrl: string;
  threadId: string;
  currentUrl?: string;
  pageTitle?: string;
  lastObservedAt?: number;
};

export const browserAgentSchema: JSONSchema7 = {
  type: "object",
  properties: {
    task: {
      type: "string",
      description:
        "Natural-language browser task for the agent. Example: 'Open amazon.in and search for men's t-shirts under 499 INR'.",
    },
    startUrl: {
      type: "string",
      description:
        "Optional starting URL. If set, the browser agent starts from this site before doing the task.",
    },
    ttlSeconds: {
      type: "number",
      description: "How long the browser session should live (seconds).",
      minimum: 60,
      maximum: 3600,
    },
    maxSteps: {
      type: "number",
      description: "Max number of browser actions to take. Defaults to 8.",
      minimum: 1,
      maximum: 20,
    },
    closeAfterExecution: {
      type: "boolean",
      description:
        "Release the browser session after finishing. Defaults to false so the live view stays available.",
    },
  },
  required: ["task"],
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const normalizeCacheToken = (value: string) =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 96);

const getThreadKey = (userId: string, threadId?: string) =>
  `${normalizeCacheToken(userId)}:${normalizeCacheToken(threadId || "global")}`;

const getSessionCacheKey = (userId: string, threadId?: string) =>
  `${BROWSER_SESSION_CACHE_PREFIX}:${getThreadKey(userId, threadId)}`;

const normalizeUrl = (value?: string) => {
  const raw = value?.trim();
  if (!raw) return "";
  try {
    return new URL(raw).toString();
  } catch {
    return "";
  }
};

const inferStartUrl = ({
  task,
  startUrl,
}: { task: string; startUrl?: string }) => {
  const normalized = normalizeUrl(startUrl);
  if (normalized) return normalized;
  const inTask = normalizeUrl(task.match(/https?:\/\/[^\s"'<>]+/i)?.[0]);
  if (inTask) return inTask;
  const lower = task.toLowerCase();
  if (lower.includes("youtube")) return "https://www.youtube.com/";
  if (lower.includes("github")) return "https://github.com/";
  if (lower.includes("amazon")) return "https://www.amazon.com/";
  return "https://www.google.com/";
};

// ---------------------------------------------------------------------------
// Playwright over Steel CDP
// ---------------------------------------------------------------------------

type PageHandle = {
  browser: any;
  page: any;
};

const connectPage = async (session: SteelSession): Promise<PageHandle> => {
  const { chromium } = await import("playwright");
  const browser = await chromium.connectOverCDP(session.websocketUrl, {
    timeout: 20000,
  });
  const context = browser.contexts()[0] || (await browser.newContext());
  const page = context.pages()[0] || (await context.newPage());
  return { browser, page };
};

type Observation = {
  url: string;
  title: string;
  elements: { i: number; tag: string; type: string; name: string }[];
};

const observe = async (page: any): Promise<Observation> => {
  const url = safe(() => page.url()).orElse("");
  const title = await safe(() => page.title()).orElse("");
  const elements = await safe(() =>
    page.evaluate((max: number) => {
      const sel =
        "a[href],button,input,textarea,select,[role=button],[role=link],[onclick]";
      const nodes = Array.from(document.querySelectorAll(sel))
        .filter((el) => {
          const r = (el as HTMLElement).getBoundingClientRect();
          const s = getComputedStyle(el as HTMLElement);
          return (
            r.width > 0 &&
            r.height > 0 &&
            s.visibility !== "hidden" &&
            s.display !== "none"
          );
        })
        .slice(0, max);
      return nodes.map((el, i) => {
        el.setAttribute("data-flare-idx", String(i));
        const he = el as HTMLElement;
        const tag = el.tagName.toLowerCase();
        const type = el.getAttribute("type") || "";
        const name = (
          el.getAttribute("aria-label") ||
          el.getAttribute("placeholder") ||
          he.innerText ||
          (el as HTMLInputElement).value ||
          el.getAttribute("name") ||
          el.getAttribute("title") ||
          ""
        )
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 80);
        return { i, tag, type, name };
      });
    }, MAX_ELEMENTS),
  ).orElse([] as Observation["elements"]);
  return { url, title, elements };
};

const nextActionSchema = z.object({
  thought: z.string().describe("Very brief reasoning for the chosen action."),
  action: z.enum([
    "navigate",
    "click",
    "type",
    "press",
    "scroll",
    "wait",
    "done",
  ]),
  index: z
    .number()
    .int()
    .optional()
    .describe("Element index (from the list) for click/type."),
  url: z.string().optional().describe("URL for the navigate action."),
  text: z
    .string()
    .optional()
    .describe("Text to type, or key name for press (e.g. Enter)."),
  summary: z
    .string()
    .optional()
    .describe("Final answer/summary for the user when action is 'done'."),
});

type NextAction = z.infer<typeof nextActionSchema>;

const runActionLoop = async ({
  page,
  task,
  startUrl,
  maxSteps,
}: {
  page: any;
  task: string;
  startUrl: string;
  maxSteps: number;
}): Promise<{ summary: string; steps: string[] }> => {
  const model = customModelProvider.getModelWithFailureFallback(
    process.env.STEEL_AGENT_MODEL
      ? ({ provider: "flare", model: process.env.STEEL_AGENT_MODEL } as any)
      : undefined,
  );

  const history: string[] = [];

  // Ensure we start somewhere sensible.
  if (startUrl) {
    await safe(() =>
      page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 45000 }),
    ).orElse(undefined);
  }

  for (let step = 0; step < maxSteps; step++) {
    const obs = await observe(page);
    const elementList = obs.elements
      .map(
        (e) =>
          `[${e.i}] <${e.tag}${e.type ? ` type=${e.type}` : ""}> ${e.name}`,
      )
      .join("\n");

    const prompt = [
      "You are an autonomous web-browsing agent controlling a real browser.",
      `TASK: ${task}`,
      "",
      `CURRENT PAGE: ${obs.title || "(untitled)"} — ${obs.url || "(blank)"}`,
      "INTERACTIVE ELEMENTS (use the [index]):",
      elementList || "(none detected)",
      "",
      history.length
        ? `ACTIONS SO FAR:\n${history.slice(-8).join("\n")}`
        : "No actions taken yet.",
      "",
      "Choose the SINGLE next action to progress the task.",
      "- navigate: set url. click/type: set index (and text for type).",
      "- press: set text to a key like Enter (after typing into a search box).",
      "- When the task is complete OR you have gathered the requested info, use action 'done' and put the answer in 'summary'.",
    ].join("\n");

    const decision = await safe(() =>
      generateObject({
        model,
        schema: nextActionSchema,
        prompt,
        temperature: 0,
      }),
    ).orElse(undefined);

    const act: NextAction = decision?.object ?? {
      thought: "fallback",
      action: "done",
      summary: `Stopped: could not decide next action on ${obs.url}.`,
    };

    if (act.action === "done") {
      return {
        summary:
          act.summary?.trim() ||
          `Finished on ${obs.title || obs.url}. ${history.length} actions taken.`,
        steps: history,
      };
    }

    // Execute the action.
    const label = await safe(async () => {
      switch (act.action) {
        case "navigate": {
          const target = normalizeUrl(act.url) || act.url || "";
          if (!target) return "navigate: no url";
          await page.goto(target, {
            waitUntil: "domcontentloaded",
            timeout: 45000,
          });
          return `navigate -> ${target}`;
        }
        case "click": {
          if (act.index == null) return "click: no index";
          await page.click(`[data-flare-idx="${act.index}"]`, {
            timeout: 8000,
          });
          await safe(() =>
            page.waitForLoadState("domcontentloaded", { timeout: 8000 }),
          ).orElse(undefined);
          return `click [${act.index}]`;
        }
        case "type": {
          if (act.index == null) return "type: no index";
          await page.fill(`[data-flare-idx="${act.index}"]`, act.text || "", {
            timeout: 8000,
          });
          return `type [${act.index}] "${(act.text || "").slice(0, 40)}"`;
        }
        case "press": {
          await page.keyboard.press(act.text || "Enter");
          await safe(() =>
            page.waitForLoadState("domcontentloaded", { timeout: 8000 }),
          ).orElse(undefined);
          return `press ${act.text || "Enter"}`;
        }
        case "scroll": {
          await page.mouse.wheel(0, 1200);
          return "scroll";
        }
        case "wait": {
          await page.waitForTimeout(1500);
          return "wait";
        }
        default:
          return `unknown:${act.action}`;
      }
    }).orElse(`error during ${act.action}`);

    history.push(`${step + 1}. ${label}`);
  }

  const finalObs = await observe(page);
  return {
    summary: `Reached step limit (${maxSteps}). Last page: ${finalObs.title || finalObs.url}.`,
    steps: history,
  };
};

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export const createBrowserAgentToolForUser = (
  userId: string,
  threadId?: string,
) =>
  createTool({
    description:
      "browser Agent: perform real interactive website tasks (search, click, type, navigate) from a natural-language instruction using a live, self-hosted browser. Reuses one persistent browser per chat thread and returns a live-view URL of the running browser.",
    inputSchema: jsonSchemaToZod(browserAgentSchema),
    execute: async (params) => {
      const cacheKey = getSessionCacheKey(userId, threadId);
      const threadKey = getThreadKey(userId, threadId);
      const maxSteps = clamp(params.maxSteps ?? MAX_STEPS_DEFAULT, 1, 20);
      const ttlSeconds = clamp(params.ttlSeconds ?? 900, 60, 3600);
      const closeAfter = Boolean(params.closeAfterExecution);
      const startUrl = inferStartUrl({
        task: params.task,
        startUrl: params.startUrl,
      });

      // Prefer the FlareCrawl gateway when configured — it runs on the remote
      // fleet and returns a PUBLIC live-view URL (works for remote users).
      if (isCrawlGatewayEnabled()) {
        return safe(() =>
          runViaCrawlGateway({
            userId,
            threadId,
            task: params.task,
            startUrl: params.startUrl || startUrl,
            maxSteps,
          }),
        )
          .ifFail((e) => ({
            isError: true,
            error: e.message,
            solution:
              "FlareCrawl gateway failed. Check CRAWL_BASE_URL/CRAWL_API_KEY and that the gateway is running.",
          }))
          .unwrap();
      }

      return safe(async () => {
        const cached = await serverCache.get<CachedBrowserSession>(cacheKey);

        let containerIndex: number;
        let session: SteelSession;
        let reused = false;

        // Try to reuse the thread's existing session.
        if (cached) {
          const ok = await safe(async () => {
            const res = await fetch(
              `${steelBaseUrl(cached.containerIndex)}/v1/sessions`,
              { signal: AbortSignal.timeout(3000) },
            );
            return res.ok;
          }).orElse(false);
          if (ok) {
            containerIndex = cached.containerIndex;
            session = {
              id: cached.steelSessionId,
              websocketUrl: cached.websocketUrl,
              sessionViewerUrl: cached.liveViewUrl,
            };
            reused = true;
          }
        }

        if (!reused) {
          containerIndex = await allocateContainer(threadKey);
          session = await createSteelSession(containerIndex);
        }

        const { browser, page } = await connectPage(session!);

        try {
          const { summary, steps } = await runActionLoop({
            page,
            task: params.task,
            // Only force-navigate on a fresh session; reused sessions continue
            // from wherever the user/agent left the page.
            startUrl: reused ? "" : startUrl,
            maxSteps,
          });

          const finalObs = await observe(page);

          const record: CachedBrowserSession = {
            containerIndex: containerIndex!,
            steelSessionId: session!.id,
            websocketUrl: session!.websocketUrl,
            liveViewUrl: session!.sessionViewerUrl,
            threadId: threadId || "global",
            currentUrl: finalObs.url,
            pageTitle: finalObs.title,
            lastObservedAt: Date.now(),
          };

          if (closeAfter) {
            await releaseSteelSession(containerIndex!, session!.id);
            await serverCache.delete(cacheKey);
            await releaseContainerAlloc(threadKey);
          } else {
            await serverCache.set(cacheKey, record, ttlSeconds * 1000);
          }

          return {
            isError: false,
            task: params.task,
            startUrl: params.startUrl || "",
            threadId: threadId || "global",
            sessionId: session!.id,
            containerIndex: containerIndex!,
            reusedSession: reused,
            liveViewUrl: session!.sessionViewerUrl,
            interactiveLiveViewUrl: session!.sessionViewerUrl,
            currentUrl: finalObs.url,
            pageTitle: finalObs.title,
            success: true,
            output: summary,
            stdout: summary,
            stderr: "",
            steps,
            closedAfterExecution: closeAfter,
          };
        } finally {
          await safe(() => browser.close()).orElse(undefined);
        }
      })
        .ifFail((e) => ({
          isError: true,
          error: e.message,
          solution:
            "browser Agent failed. Ensure the Steel fleet is running (systemctl --user status steel) and retry with a simpler task.",
        }))
        .unwrap();
    },
  });

export const browserAgentTool = createBrowserAgentToolForUser("anonymous");

export default browserAgentTool;
