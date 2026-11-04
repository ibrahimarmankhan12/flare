"use client";

import { fetcher } from "lib/utils";
import useSWR, { SWRConfiguration } from "swr";
import { handleErrorWithToast } from "ui/shared-toast";

// P2.1 follow-up — knowledge base data hooks. Mirrors the shape of
// use-mcp-list.ts so the KB pages behave like the rest of the app
// (no refetch-on-focus storms, errors surfaced as toasts).

export interface Collection {
  id: string;
  userId: string;
  orgId: string | null;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionItem {
  id: string;
  collectionId: string;
  sourceType: "file" | "source-url";
  sourceUrl: string | null;
  filename: string | null;
  mediaType: string | null;
  status: "pending" | "chunking" | "ready" | "failed";
  error: string | null;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}

export function useCollections(options?: SWRConfiguration) {
  return useSWR<{ collections: Collection[] }>("/api/collections", fetcher, {
    revalidateOnFocus: false,
    errorRetryCount: 0,
    fallbackData: { collections: [] },
    onError: handleErrorWithToast,
    ...options,
  });
}

export function useCollection(id?: string, options?: SWRConfiguration) {
  return useSWR<{ collection: Collection; items: CollectionItem[] }>(
    id ? `/api/collections/${id}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      errorRetryCount: 0,
      onError: handleErrorWithToast,
      ...options,
    },
  );
}
