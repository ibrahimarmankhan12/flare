import { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://flare-sh.tech";

export const metadata: Metadata = {
  title: "Refund Policy - Flare AI",
  description:
    "Read the Refund Policy for Flare AI. Understand our refund process and eligibility criteria for subscription plans.",
  alternates: {
    canonical: "/refund-policy",
  },
  openGraph: {
    title: "Refund Policy - Flare AI",
    description: "Read the Refund Policy for Flare AI.",
    url: `${siteUrl}/refund-policy`,
    type: "website",
  },
};

export default function RefundPolicyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
