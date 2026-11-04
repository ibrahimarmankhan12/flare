import "server-only";
import { tool as createTool } from "ai";
import { JSONSchema7 } from "json-schema";
import { jsonSchemaToZod } from "lib/json-schema-to-zod";
import { serverCache } from "lib/cache";

// CloakBrowser bridge tool. Drives the local CloakBrowser stealth-Chromium
// bridge (port 3322) which passes every bot-detection test. Sessions are
// cached per user+thread, and a named profile can be used to persist
// authenticated storage state (cookies/localStorage) between runs — giving
// the agent full access to sites the user is logged into.

const BRIDGE_URL = (process.env.CLOAK_BRIDGE_URL || "http://127.0.0.1:3322").replace(/\/+$/, "");
const BRIDGE_TOKEN = process.env.CLOAK_BRIDGE_TOKEN || "cloak-local-secret-9f2k";
const SESSION_CACHE_PREFIX = "cloak-browser:session";

type CloakResult = {
  url: string;
  title: string;
  content?: string;
  result?: unknown;
  image?: string;
};

const headers = {
  Authorization: `Bearer ${BRIDGE_TOKEN}`,
  "Content-Type": "application/json",
};

const sessionCacheKey = (userId: string, threadId: string) =>
  `${SESSION_CACHE_PREFIX}:${userId}:${threadId || "global"}`;

const getOrCreateSession = async (userId: string, threadId: string, profile?: string) => {
  const cacheKey = sessionCacheKey(userId, threadId);
  const existing = await serverCache.get<string>(cacheKey);
  if (existing) {
    const status = await fetch(`${BRIDGE_URL}/session/${existing}/status`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (status) return existing;
    // Stale session: release it on the bridge so it doesn't leak a slot.
    await fetch(`${BRIDGE_URL}/session/${existing}`, { method: "DELETE", headers }).catch(() => {});
    await serverCache.delete(cacheKey);
  }
  const res = await fetch(`${BRIDGE_URL}/session`, {
    method: "POST",
    headers,
    body: JSON.stringify({ profile: profile || "default" }),
  });
  if (!res.ok) throw new Error(`CloakBrowser session error: ${res.status} ${await res.text().catch(() => "")}`);
  const { sessionId } = await res.json();
  await serverCache.set(cacheKey, sessionId, 1800);
  return sessionId as string;
};

const bridgePost = async (path: string, body: Record<string, unknown>) => {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CloakBrowser ${path} error ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<CloakResult>;
};

const bridgeGet = (path: string) =>
  fetch(`${BRIDGE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${BRIDGE_TOKEN}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(90000),
  }).then(async (res) => {
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`CloakBrowser ${path} error ${res.status}: ${text.slice(0, 300)}`);
    }
    return res.json() as Promise<CloakResult>;
  });

export const cloakBrowserSchema: JSONSchema7 = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: ["navigate", "evaluate", "click", "content", "screenshot", "traffic"],
      description:
        "What to do in the stealth browser. navigate: open a URL and extract page text. evaluate: run arbitrary JavaScript on the current page (full access). click: click/fill an element by CSS selector. content: re-extract the current page text. screenshot: capture the current viewport as an image. traffic: return the recorded network traffic of this session (every request with method, URL, headers, post body, response status).",
    },
    url: {
      type: "string",
      description: "URL to navigate to (required for action=navigate).",
    },
    expression: {
      type: "string",
      description:
        "JavaScript expression to evaluate on the page (required for action=evaluate). Return a JSON-serializable value.",
    },
    selector: {
      type: "string",
      description: "CSS selector to click or fill (required for action=click).",
    },
    text: {
      type: "string",
      description: "Text to type into the selected element (optional for action=click — fills the field).",
    },
    profile: {
      type: "string",
      description:
        "Named session profile (e.g. 'cf', 'default'). Persists cookies/localStorage across calls so the agent stays logged in to sites. Defaults to 'default'.",
    },
  },
  required: ["action"],
};

export const createCloakBrowserToolForUser = (userId: string, threadId?: string) =>
  createTool({
    description:
      "Drive a stealth Chromium browser (CloakBrowser) that passes every bot-detection check. Can open any site, click and fill elements, run arbitrary JavaScript (full page access), read page content, and take screenshots. Logged-in sessions persist via named profiles. Use this for sites that block normal fetch/HTTP tools, or when you need to interact with a page like a real user.",
    inputSchema: jsonSchemaToZod(cloakBrowserSchema),
    execute: async ({ action, url, expression, selector, text, profile }) => {
      const sessionId = await getOrCreateSession(userId, threadId ?? "", profile);
      switch (action) {
        case "navigate":
          return bridgePost(`/session/${sessionId}/navigate`, { url, wait_ms: 1800, scroll: true });
        case "evaluate":
          return bridgePost(`/session/${sessionId}/evaluate`, { expression });
        case "click":
          return bridgePost(`/session/${sessionId}/action`, { selector, text: text ?? null });
        case "content":
          return bridgePost(`/session/${sessionId}/content`, {});
        case "screenshot":
          return bridgePost(`/session/${sessionId}/screenshot`, {});
        case "traffic":
          return bridgeGet(`/session/${sessionId}/har`);
        default:
          return { error: `Unknown action: ${action}` };
      }
    },
  });

export const cloakBrowserTool = createCloakBrowserToolForUser("anonymous");
export default cloakBrowserTool;
