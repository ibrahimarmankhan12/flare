import type { Metadata, Viewport } from "next";
import "./globals.css";
import "katex/dist/katex.min.css";
import {
  ThemeProvider,
  ThemeStyleProvider,
} from "@/components/layouts/theme-provider";
import { Toaster } from "ui/sonner";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

// Vercel-only: the <Analytics /> / <SpeedInsights /> components inject
// /_vercel/insights/script.js and /_vercel/speed-insights/script.js. Those
// endpoints only resolve on Vercel; on other hosts they 404 or get redirected
// to /sign-in by the auth middleware, polluting the console with
// "Refused to execute script ... MIME type ('text/html')" errors.
const isVercel = process.env.VERCEL === "1";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://flare-sh.tech";

export const metadata: Metadata = {
  // Primary Meta Tags
  title: {
    default: "Flare AI — Free Multi-Model AI Chat Assistant",
    template: "%s | Flare AI",
  },
  description:
    "Flare AI is a multi-model AI chat assistant founded by Flare Labs. Chat with GPT-4o, Claude 3.5 Sonnet, Gemini Pro for free. No credit card required. Best free alternative to ChatGPT Plus with 50+ AI models, image generation, code execution, and visual workflows.",
  keywords: [
    "Flare AI",
    "AI chatbot",
    "AI assistant",
    "GPT-4",
    "GPT-4o",
    "Claude AI",
    "Claude 3.5 Sonnet",
    "Gemini AI",
    "Gemini Pro",
    "AI chat",
    "free AI chat",
    "ChatGPT alternative",
    "ChatGPT Plus alternative",
    "free ChatGPT alternative",
    "Flare AI vs ChatGPT",
    "Flare AI vs Poe",
    "multi-model AI",
    "AI model aggregator",
    "image generation",
    "code assistant",
    "AI tools",
    "free GPT-4 access",
  ],
  authors: [{ name: "Flare Labs", url: "https://github.com/Flare-Labs" }],
  creator: "Flare Labs",
  publisher: "Flare AI",

  // Canonical URL
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: "/",
  },

  // OpenGraph - for social sharing (Facebook, LinkedIn, etc.)
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "Flare AI",
    title: "Flare AI",
    description:
      "Experience the future of AI conversations. Access GPT-4, Claude, Gemini & more. Image generation, code assistance, and advanced reasoning. Free to start.",
    images: [
      {
        url: `${siteUrl}/flare-logo-512.webp`,
        width: 512,
        height: 512,
        alt: "Flare AI Logo",
        type: "image/webp",
      },
    ],
  },

  // Twitter Card
  twitter: {
    card: "summary_large_image",
    title: "Flare AI",
    description:
      "Your intelligent AI assistant powered by GPT-4, Claude, Gemini. Image generation, code help & more. Free to start!",
    images: [`${siteUrl}/flare-logo-512.webp`],
    creator: "@FlareAI",
    site: "@FlareAI",
  },

  // Robots
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  // Icons
  icons: {
    icon: [
      { url: "/flare-logo-192.webp", sizes: "192x192", type: "image/webp" },
      { url: "/flare-logo-512.webp", sizes: "512x512", type: "image/webp" },
    ],
    apple: [
      { url: "/flare-logo-192.webp", sizes: "192x192", type: "image/webp" },
    ],
  },

  // Apple Web App
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Flare AI",
  },

  // Format detection
  formatDetection: {
    telephone: false,
  },

  // App Category
  category: "technology",

  // Verification - add your verification codes here
  verification: {
    google: "google7e833572be90f86b", // Your existing Google verification
    // yandex: "yandex-verification-code",
    // bing: "bing-verification-code",
  },

  // Other
  other: {
    "msapplication-TileColor": "#000000",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/flare-logo-192.webp" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Flare AI" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-TileColor" content="#000000" />
        <meta name="msapplication-tap-highlight" content="no" />

        {/* JSON-LD Structured Data for SEO */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "Flare AI",
              alternateName: ["Flare", "Flare AI Assistant"],
              url: siteUrl,
              description:
                "Flare AI is your intelligent AI assistant powered by GPT-4, Claude, Gemini, and Grok. Experience advanced reasoning, image generation, code assistance, and natural conversations.",
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "Flare AI",
              alternateName: "Flare",
              applicationCategory: "BusinessApplication",
              applicationSubCategory: "AI Chat Platform",
              operatingSystem: "Web, Windows, macOS, Linux",
              url: siteUrl,
              downloadUrl: "https://github.com/Flare-Labs/flare",
              softwareVersion: "1.25.0",
              releaseNotes:
                "Multi-model AI chat with 50+ models, image generation, code execution, and visual workflows",
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "USD",
                description:
                  "Free tier with access to GPT-4, Claude, Gemini and 50+ AI models",
                availability: "https://schema.org/InStock",
              },
              featureList: [
                "Multi-model AI access: GPT-4, GPT-4o, Claude 3.5 Sonnet, Claude 3.5 Haiku, Gemini Pro, Qwen 2.5, Grok",
                "50+ AI models from 7+ providers (OpenAI, Anthropic, Google, xAI, Groq, Qwen, Ollama)",
                "Built-in image generation with DALL-E and Google Imagen",
                "JavaScript and Python code execution",
                "Visual workflow builder for AI automation",
                "Custom AI agents with personalized instructions",
                "MCP (Model Context Protocol) tool integration",
                "Realtime voice assistant with ElevenLabs",
                "Document analysis (PDF, images, spreadsheets)",
                "Web search with Exa AI",
                "Free tier available - no credit card required",
                "Best free alternative to ChatGPT Plus",
              ],
              screenshot: `${siteUrl}/flare-logo-512.webp`,
              author: {
                "@type": "Person",
                name: "Flare Labs",
                url: "https://github.com/Flare-Labs",
              },
              isAccessibleForFree: true,
              keywords:
                "AI chat, GPT-4, Claude, Gemini, multi-model AI, ChatGPT alternative, free AI, ChatGPT Plus alternative, Flare AI vs ChatGPT, Flare AI vs Poe",
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Flare AI",
              alternateName: "Flare",
              url: siteUrl,
              logo: `${siteUrl}/flare-logo-512.webp`,
              foundingDate: "2024",
              founder: {
                "@type": "Person",
                name: "Flare Labs",
                url: "https://github.com/Flare-Labs",
              },
              description:
                "Flare AI is an advanced AI chat assistant platform that I built after spending months testing every major AI model. We provide unified access to GPT-4, Claude, Gemini, and Grok with image generation and code assistance.",
              sameAs: [
                "https://x.com/flare_ai",
                "https://t.me/VoidzeroX",
                "https://github.com/Flare-Labs/flare",
              ],
              contactPoint: {
                "@type": "ContactPoint",
                contactType: "customer support",
                availableLanguage: ["English"],
                email: "support@flare-sh.tech",
              },
              knowsAbout: [
                "Artificial Intelligence",
                "Large Language Models",
                "GPT-4",
                "Claude AI",
                "Gemini",
                "Machine Learning",
                "Natural Language Processing",
              ],
            }),
          }}
        />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          themes={["light", "dark", "system"]}
          storageKey="app-theme-v2"
          disableTransitionOnChange
        >
          <ThemeStyleProvider>
            <NextIntlClientProvider>
              <ServiceWorkerRegistration />
              <div id="root">
                {children}
                <Toaster richColors />
              </div>
            </NextIntlClientProvider>
          </ThemeStyleProvider>
        </ThemeProvider>
        {isVercel ? <Analytics /> : null}
        {isVercel ? <SpeedInsights /> : null}
      </body>
    </html>
  );
}
