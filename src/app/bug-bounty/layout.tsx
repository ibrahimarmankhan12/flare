import type { Metadata } from "next";
import Link from "next/link";
import { Bug } from "lucide-react";

import { Button } from "ui/button";
import { getSession } from "lib/auth/server";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || "https://flareai.co";

export const metadata: Metadata = {
  title: "Bug Bounty Program — Flare AI",
  description:
    "Earn bounties by reporting valid security and product bugs in Flare AI. See reward tiers, scope, and submit a report.",
  keywords: [
    "Flare AI bug bounty",
    "security disclosure",
    "responsible disclosure",
    "Flare AI rewards",
  ],
  openGraph: {
    title: "Bug Bounty Program — Flare AI",
    description:
      "Earn bounties by reporting valid bugs in Flare AI. See the live reward tiers and top reporters.",
    url: `${siteUrl}/bug-bounty`,
    type: "website",
  },
  alternates: {
    canonical: "/bug-bounty",
  },
};

export default async function BugBountyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 px-4 sm:px-6 py-3">
          <Link
            href="/bug-bounty"
            className="flex items-center gap-2 text-base font-semibold"
          >
            <Bug className="size-5 text-primary" />
            <span>Flare Bug Bounty</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/bug-bounty">Program</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/bug-bounty/reports">My reports</Link>
            </Button>
            {session?.user?.id ? (
              <Button size="sm" asChild>
                <Link href="/bug-bounty/submit">Submit a report</Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/sign-in">Sign in</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/sign-up">Get started</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border/60 mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 text-sm text-muted-foreground flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p>
            © {new Date().getFullYear()} Flare Labs. Reports are governed by
            our responsible disclosure policy.
          </p>
          <div className="flex items-center gap-4">
            <Link
              className="hover:text-foreground transition-colors"
              href="/privacy-policy"
            >
              Privacy
            </Link>
            <Link
              className="hover:text-foreground transition-colors"
              href="/terms-of-service"
            >
              Terms
            </Link>
            <Link
              className="hover:text-foreground transition-colors"
              href="/bug-bounty"
            >
              Bug bounty
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
