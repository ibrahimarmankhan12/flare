import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = new Set([
  "/manifest.json",
  "/manifest.webmanifest",
  "/sw.js",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/flare-logo-192.webp",
  "/flare-logo-512.webp",
  "/terms-of-service",
  "/privacy-policy",
  "/refund-policy",
  "/cookies-policy",
  "/about",
  "/plans",
  "/google7e833572be90f86b.html",
  // P4.D — public agent gallery landing page. Anonymous visitors
  // are allowed to browse the catalogue; the per-card "Install"
  // button handles the sign-in redirect itself.
  "/gallery/agents",
  // P4.C — MCP marketplace. Anonymous visitors can browse;
  // the "Install" button redirects to sign-in.
  "/marketplace/mcp",
]);

const PUBLIC_FILE_EXTENSIONS = [
  ".png",
  ".svg",
  ".jpg",
  ".jpeg",
  ".ico",
  ".webp",
  ".txt",
  ".html", // For Google/domain verification files
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
];

const isPublicAsset = (pathname: string) => {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_FILE_EXTENSIONS.some((ext) => pathname.endsWith(ext));
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /*
   * Playwright starts the dev server and requires a 200 status to
   * begin the tests, so this ensures that the tests can start
   */
  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  if (pathname === "/admin") {
    return NextResponse.redirect(new URL("/admin/users", request.url));
  }

  // 301 redirect /landing to / for canonical consolidation
  if (pathname === "/landing" || pathname === "/landing/") {
    return NextResponse.redirect(new URL("/", request.url), 301);
  }

  // Redirect /Dashboard to /dashboard
  if (pathname === "/Dashboard" || pathname === "/Dashboard/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/export") ||
    pathname.startsWith("/embed") ||
    pathname.startsWith("/fonts/") ||
    pathname.startsWith("/sounds/") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/terms-of-service") ||
    pathname.startsWith("/privacy-policy") ||
    pathname.startsWith("/refund-policy") ||
    pathname.startsWith("/cookies-policy") ||
    pathname.startsWith("/about") ||
    pathname.startsWith("/gallery/agents") ||
    pathname.startsWith("/google") ||
    isPublicAsset(pathname)
  ) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);

  // For root path: app/page.tsx (server component) handles the
  // logged-in → /dashboard redirect. Middleware just lets it
  // through — rewriting to /landing was unnecessary indirection.
  if (pathname === "/") {
    return NextResponse.next();
  }

  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/image|_next/static).*)"],
};
