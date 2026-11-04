"use client";

import { fetcher } from "lib/utils";
import useSWR, { SWRConfiguration } from "swr";
import { handleErrorWithToast } from "ui/shared-toast";

// Data hooks for the E2B Build feature. Shaped like use-collections.ts /
// use-mcp-list.ts so the app behaves consistently (no refetch-on-focus
// storms, errors surfaced as toasts).

export type BuildStatus =
  | "queued"
  | "planning"
  | "generating"
  | "installing"
  | "running"
  | "ready"
  | "failed";

export interface BuildFile {
  path: string;
  content: string;
}

export interface BuildJob {
  id: string;
  userId: string;
  threadId: string;
  status: BuildStatus;
  prompt: string;
  framework: string | null;
  title: string | null;
  summary: string | null;
  files?: BuildFile[];
  previewUrl: string | null;
  sandboxId: string | null;
  sandboxExpiresAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A build is still moving until it reaches one of these. */
export const isSettled = (status?: BuildStatus) =>
  status === "ready" || status === "failed";

export function useBuilds(options?: SWRConfiguration) {
  return useSWR<{ builds: BuildJob[] }>("/api/build", fetcher, {
    revalidateOnFocus: false,
    errorRetryCount: 0,
    fallbackData: { builds: [] },
    onError: handleErrorWithToast,
    ...options,
  });
}

export function useBuild(id?: string, options?: SWRConfiguration) {
  return useSWR<{ build: BuildJob }>(id ? `/api/build/${id}` : null, fetcher, {
    revalidateOnFocus: false,
    errorRetryCount: 0,
    onError: handleErrorWithToast,
    // Poll while the build is still working; stop once it settles so a ready
    // build isn't re-fetched forever.
    refreshInterval: (data) => (isSettled(data?.build?.status) ? 0 : 3000),
    ...options,
  });
}
