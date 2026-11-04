"use client";

import { toast } from "sonner";

export function showSaveSuccess(message = "Changes saved successfully") {
  toast.success(message, { duration: 3000 });
}

export function showSaveError(message = "Failed to save changes") {
  toast.error(message, { duration: 4000 });
}

export function showConnectionSuccess(provider: string) {
  toast.success(`${provider} connected successfully`);
}

export function showConnectionError(provider: string, detail?: string) {
  toast.error(
    `${provider} connection failed${detail ? `: ${detail}` : ""}`,
    { duration: 5000 },
  );
}

export function showImportSuccess(count: number) {
  toast.success(`Imported ${count} configuration changes`);
}

export function showImportError(message: string) {
  toast.error(`Import failed: ${message}`, { duration: 5000 });
}

export function showConfigReset() {
  toast.info("Configuration reset to defaults");
}