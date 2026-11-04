"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { cn } from "lib/utils";

/**
 * Cloudflare Turnstile widget.
 *
 * Two modes:
 *   - "explicit": renders the visible checkbox (used on sign-up). User
 *     interacts manually, `onVerify` fires with the token.
 *   - "invisible": runs passively. As soon as the script loads, CF
 *     kicks off a challenge in the background; on success `onVerify`
 *     fires with the token. No UI is shown to the user (apart from a
 *     small Cloudflare badge in the page corner).
 *
 * The site key is read from `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. If the
 * env var is empty, the component renders nothing — `onVerify` will
 * never fire, and the surrounding flow falls back to a no-op (the
 * server-side verifier is also a no-op without the secret). This lets
 * the app boot in environments where Turnstile hasn't been set up.
 *
 * Tokens issued by the widget are one-shot and short-lived (~300s);
 * we send them to the server immediately, where they're verified
 * against the secret.
 *
 * The CF Turnstile script is loaded with `?render=explicit` so it
 * supports both modes from a single script tag.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (host: HTMLElement, options: TurnstileRenderOptions) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
      execute: (widgetId?: string) => void;
      getResponse: (widgetId?: string) => string | undefined;
    };
  }
}

type TurnstileRenderOptions = {
  sitekey: string;
  callback?: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
  "timeout-callback"?: () => void;
  action?: string;
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "flexible" | "compact";
  appearance?: "always" | "execute" | "interaction-only";
  execution?: "render" | "execute";
  "refresh-expired"?: "auto" | "manual" | "never";
  language?: string;
};

export type TurnstileMode = "explicit" | "invisible";

export interface TurnstileWidgetHandle {
  /** Reset the widget (clears the current token so a fresh one is fetched). */
  reset: () => void;
  /** Manually kick off an invisible challenge (invisible mode only). */
  execute: () => void;
}

interface TurnstileWidgetProps {
  mode: TurnstileMode;
  onVerify: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  action?: string;
  className?: string;
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptLoadingPromise: Promise<void> | null = null;

const loadTurnstileScript = (): Promise<void> => {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptLoadingPromise) return scriptLoadingPromise;

  scriptLoadingPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src^="https://challenges.cloudflare.com/turnstile"]`,
    );
    const onLoad = () => resolve();
    const onError = () => reject(new Error("turnstile-script-failed"));

    if (existing) {
      if (window.turnstile) return resolve();
      existing.addEventListener("load", onLoad, { once: true });
      existing.addEventListener("error", onError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    document.head.appendChild(script);
  });

  return scriptLoadingPromise;
};

export const TurnstileWidget = forwardRef<
  TurnstileWidgetHandle,
  TurnstileWidgetProps
>(function TurnstileWidget(
  { mode, onVerify, onError, onExpire, action, className },
  ref,
) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  // Hold the latest callbacks in refs so we can re-wire them without
  // forcing the script to re-mount the widget.
  const onVerifyRef = useRef(onVerify);
  const onErrorRef = useRef(onError);
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onVerifyRef.current = onVerify;
  }, [onVerify]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);
  const [ready, setReady] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      reset: () => {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
        }
      },
      execute: () => {
        if (widgetIdRef.current && window.turnstile && mode === "invisible") {
          window.turnstile.execute(widgetIdRef.current);
        }
      },
    }),
    [mode],
  );

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled) return;
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        onErrorRef.current?.();
      });

    return () => {
      cancelled = true;
    };
  }, [siteKey]);

  useEffect(() => {
    if (!ready || !siteKey || !containerRef.current) return;
    if (!window.turnstile) return;

    // Clean up any previous widget on this node (StrictMode dev double-mount).
    if (widgetIdRef.current) {
      try {
        window.turnstile.remove(widgetIdRef.current);
      } catch {
        /* ignore */
      }
      widgetIdRef.current = null;
    }

    const id = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      action,
      callback: (token: string) => onVerifyRef.current?.(token),
      "error-callback": () => onErrorRef.current?.(),
      "expired-callback": () => {
        onExpireRef.current?.();
      },
      "timeout-callback": () => onErrorRef.current?.(),
      theme: "auto",
      size: mode === "invisible" ? "flexible" : "normal",
      appearance: mode === "invisible" ? "interaction-only" : "always",
      execution: mode === "invisible" ? "execute" : "render",
    });
    widgetIdRef.current = id;

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore */
        }
        widgetIdRef.current = null;
      }
    };
  }, [ready, siteKey, mode, action]);

  if (!siteKey) return null;

  return (
    <div
      ref={containerRef}
      data-turnstile-mode={mode}
      className={cn(
        mode === "invisible" ? "h-0 overflow-hidden" : "cf-turnstile-host",
        className,
      )}
    />
  );
});

export default TurnstileWidget;
