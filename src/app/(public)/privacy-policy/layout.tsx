import { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://flare-sh.tech";

export const metadata: Metadata = {
  title: "Privacy Policy - Flare AI",
  description:
    "Learn how Flare AI protects your privacy and handles your data. Our privacy policy explains what information we collect and how we use it.",
  alternates: {
    canonical: "/privacy-policy",
  },
  openGraph: {
    title: "Privacy Policy - Flare AI",
    description:
      "Learn how Flare AI protects your privacy and handles your data.",
    url: `${siteUrl}/privacy-policy`,
    type: "website",
  },
};

export default function PrivacyPolicyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
