import { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://flare-sh.tech";

export const metadata: Metadata = {
  title:
    "About Flare AI - Free Multi-Model AI Chat Platform | GPT-4, Claude, Gemini",
  description:
    "Flare AI is a multi-model AI chat assistant founded by Flare Labs. Chat with GPT-4o, Claude 3.5 Sonnet, and Gemini Pro for free. No credit card required. Free alternative to ChatGPT Plus with 50+ AI models, image generation, code execution, and visual workflows.",
  keywords: [
    "Flare AI",
    "free AI chat",
    "multi-model AI platform",
    "GPT-4 free",
    "Claude 3.5 free",
    "Gemini Pro free",
    "ChatGPT alternative",
    "ChatGPT Plus alternative",
    "free ChatGPT alternative",
    "Flare AI vs ChatGPT",
    "Flare AI vs Poe",
    "Flare AI vs Claude",
    "free GPT-4 access",
    "multi-model AI wrapper",
    "AI model aggregator",
    "free AI image generation",
    "MCP protocol",
  ],
  openGraph: {
    title:
      "About Flare AI - Free Access to GPT-4, Claude, Gemini & 50+ AI Models",
    description:
      "Flare AI is a multi-model chat assistant founded by Flare Labs. Chat with GPT-4o, Claude 3.5 Sonnet, Gemini Pro for free. No credit card. Best free alternative to ChatGPT Plus.",
    url: `${siteUrl}/about`,
    type: "website",
    images: [
      {
        url: `${siteUrl}/flare-logo-512.webp`,
        width: 512,
        height: 512,
        alt: "Flare AI Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "About Flare AI - Free ChatGPT Alternative with 50+ AI Models",
    description:
      "Chat with GPT-4o, Claude 3.5 Sonnet, Gemini Pro for free. No credit card required.",
  },
  alternates: {
    canonical: "/about",
  },
};

// FAQ structured data — only on pages where FAQ is visible
const faqStructuredData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is Flare AI?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Flare AI is a multi-model AI chat assistant that gives you access to GPT-4o, Claude 3.5 Sonnet, Gemini Pro, Grok, and 50+ other AI models in one unified interface. Founded by Flare Labs, it's designed to be the best free alternative to ChatGPT Plus, offering features like image generation, code execution, visual workflows, and custom AI agents.",
      },
    },
    {
      "@type": "Question",
      name: "Is Flare AI free to use?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes, Flare AI offers a generous free tier. You can start chatting with AI models including GPT-4o, Claude 3.5, and Gemini Pro immediately without a credit card. The free tier includes access to most features including image generation, code execution, and document analysis.",
      },
    },
    {
      "@type": "Question",
      name: "Which AI models does Flare AI support?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Flare AI supports 50+ AI models from 7+ providers: OpenAI (GPT-4o, GPT-4 Turbo, o1-preview), Anthropic (Claude 3.5 Sonnet, Claude 3.5 Haiku, Claude 3 Opus), Google (Gemini 2.0 Flash, Gemini 1.5 Pro), xAI (Grok-2), Qwen (2.5 Max, 72B), Groq (Llama 3.3, Mixtral), and Ollama for local models.",
      },
    },
    {
      "@type": "Question",
      name: "How is Flare AI different from ChatGPT?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "ChatGPT locks you into OpenAI models only and costs $20/month for ChatGPT Plus. Flare AI gives you access to OpenAI models PLUS Claude, Gemini, Grok, and 50+ other models in one place. It also includes a visual workflow builder, MCP protocol for connecting external tools, custom AI agents, and the ability to switch models mid-conversation.",
      },
    },
    {
      "@type": "Question",
      name: "Can Flare AI generate images?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes! Flare AI includes AI image generation and editing capabilities. You can create images from text descriptions, edit existing images with natural language commands, and combine multiple images.",
      },
    },
  ],
};

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqStructuredData),
        }}
      />
      {children}
    </>
  );
}
