"use client";

import { useEffect } from "react";

// Recovers from webpack ChunkLoadErrors. These happen when the browser holds a
// stale or corrupt cache entry for a hashed chunk (commonly surfaced as
// `net::ERR_CACHE_READ_FAILURE`) or when a tab outlives a new deployment. The
// asset is fine on the server; the client just needs a fresh load. We reload
// the page once, guarded by a short cooldown so a persistently failing chunk
// can never trap the user in an infinite reload loop.
const RELOAD_KEY = "flare:chunk-reload-at";
const COOLDOWN_MS = 15_000;

function isChunkLoadError(input: unknown): boolean {
  if (!input) return false;
  const err = input as { name?: string; message?: string };
  const name = typeof err.name === "string" ? err.name : "";
  const message = typeof err.message === "string" ? err.message : String(input);
  return (
    name === "ChunkLoadError" ||
    /ChunkLoadError/i.test(message) ||
    /Loading chunk [\w-]+ failed/i.test(message) ||
    /Loading CSS chunk [\w-]+ failed/i.test(message)
  );
}

export function ChunkErrorRecovery() {
  useEffect(() => {
    const recover = () => {
      let last = 0;
      try {
        last = Number(sessionStorage.getItem(RELOAD_KEY) ?? "0");
      } catch {
        // sessionStorage may be unavailable (private mode / blocked); fall
        // through and attempt a single reload anyway.
      }
      const now = Date.now();
      if (now - last < COOLDOWN_MS) return; // already recovered recently
      try {
        sessionStorage.setItem(RELOAD_KEY, String(now));
      } catch {
        // ignore — worst case we may reload more than once
      }

      const reload = () => window.location.reload();
      // Defensively drop any Cache Storage entries in case a future service
      // worker caches assets; today's SW is a no-op so this is usually empty.
      if (typeof caches !== "undefined") {
        caches
          .keys()
          .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
          .then(reload, reload);
      } else {
        reload();
      }
    };

    const onError = (event: ErrorEvent) => {
      if (isChunkLoadError(event.error) || isChunkLoadError(event.message)) {
        recover();
      }
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadError(event.reason)) {
        recover();
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
