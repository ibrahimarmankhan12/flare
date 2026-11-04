import "server-only";
import { serverCache } from "lib/cache";

// Optional delegation to the FlareCrawl gateway (crawl.flare-labs.tech). When
// CRAWL_BASE_URL + CRAWL_API_KEY are set, the browser Agent runs on the remote
// fleet and returns a PUBLIC live-view URL (reachable from the user's browser),
// instead of driving a localhost Steel container directly.

const CRAWL_BASE_URL = (process.env.CRAWL_BASE_URL || "").replace(/\/+$/, "");
const CRAWL_API_KEY = process.env.CRAWL_API_KEY || "";

export const isCrawlGatewayEnabled = () =>
  Boolean(CRAWL_BASE_URL && CRAWL_API_KEY);

const sessionKey = (userId: string, threadId?: string) =>
  `crawl-gateway:session:${userId}:${threadId || "global"}`;

type CrawlAgentResult = {
  sessionId: string;
  liveViewUrl: string;
  summary: string;
  steps: { n: number; label: string; mode: string }[];
  currentUrl: string;
  pageTitle: string;
};

export const runViaCrawlGateway = async ({
  userId,
  threadId,
  task,
  startUrl,
  maxSteps,
}: {
  userId: string;
  threadId?: string;
  task: string;
  startUrl?: string;
  maxSteps?: number;
}) => {
  const cacheKey = sessionKey(userId, threadId);
  const reuseId = await serverCache.get<string>(cacheKey);

  const res = await fetch(`${CRAWL_BASE_URL}/v1/agent`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CRAWL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      task,
      startUrl,
      maxSteps,
      sessionId: reuseId || undefined,
    }),
    signal: AbortSignal.timeout(240000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Crawl gateway error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as CrawlAgentResult;
  if (data.sessionId) {
    await serverCache.set(cacheKey, data.sessionId, 30 * 60 * 1000);
  }

  return {
    isError: false,
    task,
    startUrl: startUrl || "",
    threadId: threadId || "global",
    sessionId: data.sessionId,
    reusedSession: Boolean(reuseId),
    liveViewUrl: data.liveViewUrl,
    interactiveLiveViewUrl: data.liveViewUrl,
    currentUrl: data.currentUrl,
    pageTitle: data.pageTitle,
    success: true,
    output: data.summary,
    stdout: data.summary,
    stderr: "",
    steps: data.steps,
    closedAfterExecution: false,
  };
};
