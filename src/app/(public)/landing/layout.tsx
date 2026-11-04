import { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://flare-sh.tech";

export const metadata: Metadata = {
  title: "Flare AI — The Intelligence Layer for Modern AI Conversations",
  description:
    "The Intelligence Layer for Modern AI Conversations. Driving the future of small, efficient multi-modal models with GPT-4o, Claude, Gemini, and 50+ AI models.",
  keywords: [
    "Flare AI",
    "free AI chat",
    "GPT-4 chat",
    "Claude AI",
    "Gemini chat",
    "AI chatbot free",
    "ChatGPT alternative",
    "AI assistant",
    "image generation AI",
    "code assistant AI",
    "AI reasoning",
    "thinking AI models",
  ],
  openGraph: {
    title: "Flare AI — The Intelligence Layer for Modern AI Conversations",
    description:
      "Driving the future of small, efficient multi-modal models. Chat with GPT-4, Claude, Gemini & more.",
    url: siteUrl,
    type: "website",
    images: [
      {
        url: `${siteUrl}/og-image.webp`,
        width: 1200,
        height: 630,
        alt: "Flare AI - The Intelligence Layer for Modern AI Conversations",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Flare AI — The Intelligence Layer for Modern AI Conversations",
    description: "Driving the future of small, efficient multi-modal models.",
    images: [`${siteUrl}/og-image.webp`],
  },
  alternates: {
    canonical: "/",
  },
};

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
