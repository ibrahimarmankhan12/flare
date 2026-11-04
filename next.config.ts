import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const BUILD_OUTPUT = process.env.NEXT_STANDALONE_OUTPUT
  ? "standalone"
  : undefined;
const SHOULD_UPLOAD_SENTRY_SOURCEMAPS =
  process.env.SENTRY_UPLOAD_SOURCE_MAPS === "1";

const getConfig = () => {
  const securityHeaders = [
    {
      key: "X-Frame-Options",
      value: "SAMEORIGIN",
    },
    {
      key: "Content-Security-Policy",
      // frame-ancestors only would be cosmetic. These directives add real
      // defense-in-depth against XSS without breaking Next.js hydration
      // (script-src is intentionally not locked down here — that needs a
      // nonce-based middleware rollout).
      value:
        "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'",
    },
    {
      key: "X-Content-Type-Options",
      value: "nosniff",
    },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    },
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(self), geolocation=()",
    },
  ];

  const embedSecurityHeaders = securityHeaders
    .filter(
      (header) =>
        header.key !== "X-Frame-Options" &&
        header.key !== "Content-Security-Policy" &&
        header.key !== "Permissions-Policy",
    )
    .concat([
      {
        key: "Content-Security-Policy",
        // Embeddable widgets must allow third-party framing, but the rest of
        // the hardening still applies.
        value:
          "frame-ancestors *; object-src 'none'; base-uri 'self'; form-action 'self'",
      },
      {
        key: "Permissions-Policy",
        value:
          "camera=(), microphone=(), clipboard-read=(), clipboard-write=(self)",
      },
    ]);

  const nextConfig: NextConfig = {
    poweredByHeader: false,
    output: BUILD_OUTPUT,
    cleanDistDir: true,
    // Keep Playwright out of the server bundle — the browser Agent tool
    // connects to the self-hosted Steel fleet over CDP via playwright at runtime.
    serverExternalPackages: [
      "playwright",
      "playwright-core",
      // Native (napi) binding — bundling it breaks the .node resolution.
      "@llamaindex/liteparse",
    ],
    devIndicators: {
      position: "bottom-right",
    },
    env: {
      NO_HTTPS: process.env.NO_HTTPS,
    },
    experimental: {
      taint: true,
      authInterrupts: true,
    },
    headers: async () => [
      {
        source: "/((?!embed(?:/|$)|embed\\.js$).*)",
        headers: securityHeaders,
      },
      {
        source: "/embed/:path*",
        headers: embedSecurityHeaders,
      },
      {
        source: "/embed.js",
        headers: embedSecurityHeaders,
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          {
            key: "Content-Type",
            value: "application/manifest+json",
          },
        ],
      },
    ],
  };
  const withNextIntl = createNextIntlPlugin();
  return withNextIntl(nextConfig);
};

export default withSentryConfig(getConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "chut-ai-cb",
  project: "javascript-nextjs",

  // Source map uploads are opt-in because they can add several minutes to
  // Vercel builds for large Next.js bundles.
  silent: true,
  telemetry: false,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  widenClientFileUpload: false,
  sourcemaps: {
    disable: !SHOULD_UPLOAD_SENTRY_SOURCEMAPS,
  },

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
