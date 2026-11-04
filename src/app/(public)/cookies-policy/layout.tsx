import { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://flare-sh.tech";

export const metadata: Metadata = {
  title: "Cookies Policy - Flare AI",
  description:
    "Learn about cookies used by Flare AI. Our cookies policy explains what cookies we use and how they improve your experience.",
  alternates: {
    canonical: "/cookies-policy",
  },
  openGraph: {
    title: "Cookies Policy - Flare AI",
    description: "Learn about cookies used by Flare AI.",
    url: `${siteUrl}/cookies-policy`,
    type: "website",
  },
};

export default function CookiesPolicyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
