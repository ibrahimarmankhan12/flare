import { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://flare-sh.tech";

export const metadata: Metadata = {
  title: "Terms of Service - Flare AI",
  description:
    "Read the Terms of Service for Flare AI. Understand your rights and responsibilities when using our AI chat platform.",
  alternates: {
    canonical: "/terms-of-service",
  },
  openGraph: {
    title: "Terms of Service - Flare AI",
    description: "Read the Terms of Service for Flare AI.",
    url: `${siteUrl}/terms-of-service`,
    type: "website",
  },
};

export default function TermsOfServiceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
