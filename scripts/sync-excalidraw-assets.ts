#!/usr/bin/env tsx
/**
 * Copy Excalidraw's font assets out of node_modules into `public/`.
 *
 * Without this, Excalidraw resolves its fonts against its default asset
 * path — a third-party CDN (esm.sh). Verified in the browser: the canvas
 * was fetching
 *   https://esm.sh/@excalidraw/excalidraw@0.18.1/dist/prod/fonts/Excalifont/...
 * at runtime. That makes core canvas text rendering depend on an external
 * host being reachable, leaks referrer traffic, and breaks entirely on an
 * air-gapped/offline deployment.
 *
 * Pairs with `window.EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/"` set in
 * `src/components/canvas/vcanvas/components/Canvas.tsx`. Excalidraw appends
 * `fonts/…` to that path, hence the nesting below.
 *
 * Runs from postinstall so a fresh `pnpm install` cannot silently revert
 * the app to the CDN.
 */
import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const SRC = path.resolve(
  process.cwd(),
  "node_modules/@excalidraw/excalidraw/dist/prod/fonts",
);
const DEST = path.resolve(process.cwd(), "public/excalidraw-assets/fonts");

async function exists(p: string) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(SRC))) {
    // Not fatal: the package may not be installed in every environment.
    console.log("[excalidraw-assets] source not found, skipping:", SRC);
    return;
  }
  await rm(DEST, { recursive: true, force: true });
  await mkdir(path.dirname(DEST), { recursive: true });
  await cp(SRC, DEST, { recursive: true });
  console.log("[excalidraw-assets] synced fonts ->", DEST);
}

main().catch((err) => {
  // Never fail the install over this; the CDN fallback still renders.
  console.error("[excalidraw-assets] sync failed (non-fatal):", err);
});
