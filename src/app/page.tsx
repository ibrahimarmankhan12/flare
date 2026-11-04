import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "lib/auth/auth-instance";
import LandingPageBody from "@/components/landing/landing-page-body";

/**
 * Root `/` route.
 *
 * - Logged-in users are sent straight to `/dashboard` (no flicker,
 *   no JS hydration cost). This is what makes the marketing site
 *   feel "it just put me where I was going" when a signed-in user
 *   opens the root URL in a new tab, clicks the home logo, or
 *   deep-links to `https://flare-sh.tech/`.
 * - Logged-out users see the marketing landing page.
 *
 * Implemented as a server component so the auth check happens during
 * SSR and the redirect is server-emitted (a 307). Middleware
 * short-circuits `/` for authenticated users too — both layers are
 * intentional (middleware is best-effort, this is the source of
 * truth).
 */
export default async function RootPage() {
  const headerList = await headers();
  let session: Awaited<ReturnType<typeof auth.api.getSession>> = null;
  try {
    session = await auth.api.getSession({ headers: headerList });
  } catch {
    // If the auth layer is unavailable for any reason, fall through
    // to the public landing page rather than 500-ing anonymous
    // visitors. NOTE: do NOT swallow Next's redirect throw here —
    // `redirect()` works by throwing, and catching it would silently
    // turn the redirect into a 200 (showing the landing page to
    // logged-in users). The redirect call lives outside the
    // try/catch for that reason.
  }

  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return <LandingPageBody />;
}
