"use client";

import { fetcher } from "lib/utils";
import useSWR, { type SWRConfiguration } from "swr";

// Data hook for the sandbox manager. Shaped like use-builds.ts / use-collections.ts
// so the app behaves consistently.

export type SandboxState = "running" | "paused";

export interface SandboxSummary {
  sandboxId: string;
  state: SandboxState;
  feature: string | null;
  env: string | null;
  envLabel: string | null;
  threadId: string | null;
  buildId: string | null;
  startedAt: string | null;
  expiresAt: string | null;
}

export function useSandboxes(options?: SWRConfiguration) {
  return useSWR<{ sandboxes: SandboxSummary[]; configured: boolean }>(
    "/api/sandbox",
    fetcher,
    {
      revalidateOnFocus: false,
      errorRetryCount: 2,
      // A sandbox can be paused by E2B itself once its lease runs out, so the
      // list goes stale on its own without anyone touching this page.
      refreshInterval: 30_000,
      ...options,
    },
  );
}
