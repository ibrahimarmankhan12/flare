"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import Image from "next/image";
import {
  ArrowRight,
  Check,
  X,
  Sparkles,
  Brain,
  Image as ImageIcon,
  Code,
  FileText,
  Workflow,
  Bot,
  Mic,
  Globe,
  Github,
  ChevronDown,
  Star,
  Zap,
  Clock,
  DollarSign,
  Search,
} from "lucide-react";
import { Button } from "ui/button";
import { ModelProviderIcon } from "ui/model-provider-icon";
import { useState } from "react";
import { Navbar } from "@/components/landing/sections/Navbar";

// Explicitly list all supported AI models for GEO
const AI_PROVIDERS = [
  {
    name: "OpenAI",
    provider: "openai",
    models: [
      "GPT-4o",
      "GPT-4 Turbo",
      "GPT-4",
      "GPT-3.5 Turbo",
      "o1-preview",
      "o1-mini",
    ],
    description:
      "The most popular AI models, known for strong reasoning and versatility.",
  },
  {
    name: "Anthropic",
    provider: "anthropic",
    models: [
      "Claude 3.5 Sonnet",
      "Claude 3.5 Haiku",
      "Claude 3 Opus",
      "Claude 3 Sonnet",
    ],
    description: "Best for long documents, coding, and nuanced conversations.",
  },
  {
    name: "Google",
    provider: "google",
    models: [
      "Gemini 2.0 Flash",
      "Gemini 1.5 Pro",
      "Gemini 1.5 Flash",
      "Gemini Pro",
    ],
    description: "Google's multimodal AI with strong visual understanding.",
  },
  {
    name: "xAI",
    provider: "xai",
    models: ["Grok-2", "Grok-1.5"],
    description: "Elon Musk's AI with real-time information access.",
  },
  {
    name: "Qwen (Alibaba)",
    provider: "qwen",
    models: ["Qwen 2.5 Max", "Qwen 2.5 72B", "Qwen 2.5 Coder"],
    description: "Alibaba's powerful multilingual AI models.",
  },
  {
    name: "Groq",
    provider: "groq",
    models: ["Llama 3.3 70B", "Llama 3.1 405B", "Mixtral 8x7B"],
    description: "Ultra-fast inference with specialized hardware.",
  },
  {
    name: "Ollama (Local)",
    provider: "ollama",
    models: ["Llama 3", "Mistral", "CodeLlama", "Phi-3", "Any local model"],
    description: "Run AI models locally on your own hardware.",
  },
  {
    name: "OpenRouter",
    provider: "openrouter",
    models: ["100+ models available", "Pay-per-use pricing"],
    description: "Access hundreds of models through one API.",
  },
];

const FEATURES = [
  {
    icon: Brain,
    title: "50+ AI Models in One Place",
    description:
      "I built Flare AI because I was tired of paying for multiple AI subscriptions. Now you can access GPT-4o, Claude 3.5 Sonnet, Gemini Pro, Grok, and 50+ more models in one interface. Switch between models mid-conversation to find the best answer.",
    highlight: "Multi-model access",
  },
  {
    icon: ImageIcon,
    title: "Built-in Image Generation",
    description:
      "Generate stunning images from text using AI. I integrated image generation directly into the chat, so you can describe what you want and get results in seconds. Edit existing images with natural language commands.",
    highlight: "Text-to-image AI",
  },
  {
    icon: Code,
    title: "Code Execution & Development",
    description:
      "As a developer, I needed an AI that could actually run code. Flare AI executes JavaScript and Python directly in the chat. Debug errors, test scripts, and build applications with AI assistance.",
    highlight: "Code interpreter",
  },
  {
    icon: Workflow,
    title: "Visual Workflow Builder",
    description:
      "Create custom AI workflows with a drag-and-drop visual editor. I built this to automate repetitive tasks. Chain multiple AI models and tools together, then publish workflows as reusable tools.",
    highlight: "AI automation",
  },
  {
    icon: Bot,
    title: "Custom AI Agents",
    description:
      "Build specialized AI assistants with custom instructions and tool access. I created agents for GitHub management, research, and writing. Share agents with your team or keep them private.",
    highlight: "Custom assistants",
  },
  {
    icon: Globe,
    title: "MCP Protocol Support",
    description:
      "Full Model Context Protocol (MCP) integration. Connect external tools, APIs, and databases. Use Playwright for browser automation, access filesystems, and more. This is what makes Flare AI truly extensible.",
    highlight: "Tool integration",
  },
  {
    icon: Mic,
    title: "Realtime Voice Assistant",
    description:
      "Talk to AI naturally with voice. I integrated OpenAI's Realtime API for sub-second latency conversations. Voice commands can trigger any MCP tool, making hands-free automation possible.",
    highlight: "Voice AI",
  },
  {
    icon: FileText,
    title: "Document Analysis",
    description:
      "Upload PDFs, images, spreadsheets, and documents. The AI extracts insights, summarizes content, and answers questions about your files. I use this daily for research and it saves hours every week.",
    highlight: "Document AI",
  },
  {
    icon: Search,
    title: "Web Search Integration",
    description:
      "AI-powered web search built in. Get real-time information from the internet without leaving the chat. Perfect for research, fact-checking, and staying current on any topic.",
    highlight: "Web search",
  },
];

// Comparison data for "vs" search optimization
const COMPARISONS = [
  {
    platform: "ChatGPT Plus",
    price: "$20/month",
    models: "GPT-4o only",
    imageGen: "DALL-E 3",
    codeExec: "Yes",
    flareAdvantage: "50+ models, free tier",
  },
  {
    platform: "Claude Pro",
    price: "$20/month",
    models: "Claude only",
    imageGen: "No",
    codeExec: "No",
    flareAdvantage: "All Claude models + GPT + Gemini",
  },
  {
    platform: "Gemini Advanced",
    price: "$20/month",
    models: "Gemini only",
    imageGen: "Imagen 3",
    codeExec: "Limited",
    flareAdvantage: "All providers in one place",
  },
  {
    platform: "Poe",
    price: "$20/month",
    models: "Multiple",
    imageGen: "Yes",
    codeExec: "No",
    flareAdvantage: "MCP tools, visual workflows",
  },
  {
    platform: "Flare AI",
    price: "Free tier",
    models: "50+ models",
    imageGen: "Yes",
    codeExec: "Yes",
    flareAdvantage: "—",
  },
];

// FAQ data for featured snippets
const FAQS = [
  {
    question: "What is Flare AI?",
    answer:
      "Flare AI is a multi-model AI chat assistant that gives you access to GPT-4o, Claude 3.5 Sonnet, Gemini Pro, Grok, and 50+ other AI models in one unified interface. Founded by Flare Labs, it's designed to be the best free alternative to ChatGPT Plus, offering features like image generation, code execution, visual workflows, and custom AI agents. Unlike ChatGPT, Claude, or Gemini which lock you into one provider, Flare AI lets you switch between all major AI models freely.",
  },
  {
    question: "Is Flare AI free to use?",
    answer:
      "Yes, Flare AI offers a generous free tier. You can start chatting with AI models including GPT-4o, Claude 3.5, and Gemini Pro immediately without a credit card. The free tier includes access to most features including image generation, code execution, and document analysis. There are no hidden fees or surprise charges.",
  },
  {
    question: "Which AI models does Flare AI support?",
    answer:
      "Flare AI supports 50+ AI models from 7+ providers: OpenAI (GPT-4o, GPT-4 Turbo, o1-preview), Anthropic (Claude 3.5 Sonnet, Claude 3.5 Haiku, Claude 3 Opus), Google (Gemini 2.0 Flash, Gemini 1.5 Pro), xAI (Grok-2), Qwen (2.5 Max, 72B), Groq (Llama 3.3, Mixtral), and Ollama for local models. You can also connect to OpenRouter for access to 100+ additional models.",
  },
  {
    question: "How is Flare AI different from ChatGPT?",
    answer:
      "ChatGPT locks you into OpenAI models only and costs $20/month for ChatGPT Plus. Flare AI gives you access to OpenAI models PLUS Claude, Gemini, Grok, and 50+ other models in one place. It also includes features ChatGPT doesn't have: visual workflow builder for AI automation, MCP protocol for connecting external tools, custom AI agents, and the ability to switch models mid-conversation to compare responses.",
  },
  {
    question: "How is Flare AI different from Poe?",
    answer:
      "While Poe offers access to multiple AI models, Flare AI provides deeper functionality: visual workflow builder for creating automated AI pipelines, full MCP (Model Context Protocol) support for connecting to external tools and APIs, custom AI agent creation, JavaScript and Python code execution, and local model support via Ollama. Flare AI is also designed with power users in mind, offering more control and customization.",
  },
  {
    question: "Can Flare AI generate images?",
    answer:
      "Yes! Flare AI includes AI image generation and editing capabilities. You can create images from text descriptions, edit existing images with natural language commands, and combine multiple images. The image generation is integrated directly into the chat interface for a seamless experience.",
  },
  {
    question: "Can Flare AI run code?",
    answer:
      "Yes, Flare AI includes a built-in code interpreter that can execute JavaScript and Python code directly in the chat. This is similar to ChatGPT's Code Interpreter but available with multiple AI models. You can debug code, run scripts, analyze data, and build applications with AI assistance.",
  },
  {
    question: "What are MCP tools in Flare AI?",
    answer:
      "MCP (Model Context Protocol) is an open standard for connecting AI models to external tools and data sources. Flare AI fully supports MCP, allowing you to connect to databases, APIs, file systems, and more. Popular MCP tools include Playwright for browser automation, GitHub integration, Slack bots, and custom tool creation. This makes Flare AI one of the most extensible AI platforms available.",
  },
  {
    question: "Who created Flare AI?",
    answer:
      "Flare AI was created and founded by Flare Labs. The platform was built to solve the problem of paying for multiple AI subscriptions (ChatGPT, Claude, Gemini) and switching between different interfaces. Flare Labs continues to actively develop new features and improve the platform based on user feedback.",
  },
  {
    question: "Is Flare AI the same as Cognex or Flare.au?",
    answer:
      "No. Flare AI (flare-sh.tech) is a completely different product from Cognex Corporation (machine vision company) or Flare.au (Australian company). Flare AI is a multi-model AI chat assistant founded by Flare Labs that provides access to GPT-4, Claude, Gemini, and 50+ other AI models. If you're looking for the AI chat platform, make sure you're at flare-sh.tech.",
  },
  {
    question: "Is there a free GPT-4 alternative in 2025?",
    answer:
      "Yes! Flare AI provides free access to GPT-4o and other advanced AI models. While ChatGPT Plus costs $20/month for GPT-4 access, Flare AI's free tier includes GPT-4o along with Claude 3.5, Gemini Pro, and many other models. This makes it one of the best free GPT-4 access tools available in 2025.",
  },
];

// FAQ Item Component
function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-6 flex items-center justify-between text-left hover:text-primary transition-colors"
      >
        <h3 className="font-semibold text-lg pr-4">{question}</h3>
        <ChevronDown
          className={`size-5 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="pb-6"
        >
          <p className="text-muted-foreground leading-relaxed">{answer}</p>
        </motion.div>
      )}
    </div>
  );
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="h-[80px]" />

      {/* Hero Section - Brand Disambiguation */}
      <section className="py-20 px-4 bg-gradient-to-b from-primary/5 to-background">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <Sparkles className="size-4" />
              <span>Free Tier Available • No Credit Card Required</span>
            </div>

            {/* H1 - Critical for SEO/GEO - Brand Disambiguation */}
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
              What is Flare AI?
            </h1>

            {/* Direct answer paragraph - CRITICAL for GEO disambiguation */}
            <p className="text-xl md:text-2xl text-muted-foreground max-w-4xl mx-auto leading-relaxed mb-4">
              <strong>
                Flare AI is a multi-model AI chat assistant founded by Flare
                Labs
              </strong>{" "}
              that gives you free access to GPT-4o, Claude 3.5 Sonnet, Gemini
              Pro, Grok, and 50+ AI models in one unified interface.
            </p>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              It&apos;s the{" "}
              <strong>best free alternative to ChatGPT Plus</strong> — with
              built-in image generation, code execution, visual workflows,
              custom AI agents, and MCP tool integration. No credit card
              required.
            </p>

            <div className="flex items-center justify-center gap-4 mt-8 flex-wrap">
              <Link href="/sign-in">
                <Button size="lg" className="gap-2">
                  Try Flare AI Free <ArrowRight className="size-4" />
                </Button>
              </Link>
              <Link href="https://github.com/Flare-Labs" target="_blank">
                <Button variant="outline" size="lg" className="gap-2">
                  <Github className="size-4" /> Follow Flare Labs on GitHub
                </Button>
              </Link>
            </div>

            {/* Trust Badges */}
            <div className="flex items-center justify-center gap-8 mt-12 text-sm text-muted-foreground flex-wrap">
              <div className="flex items-center gap-2">
                <Star className="size-4 text-yellow-500" />
                <span>4.8/5 User Rating</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="size-4 text-blue-500" />
                <span>50+ AI Models</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-green-500" />
                <span>99.9% Uptime</span>
              </div>
              <div className="flex items-center gap-2">
                <DollarSign className="size-4 text-purple-500" />
                <span>Free to Start</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Why Flare AI - Story Section */}
      <section className="py-20 px-4" aria-labelledby="why-heading">
        <div className="max-w-4xl mx-auto">
          <h2
            id="why-heading"
            className="text-3xl md:text-4xl font-bold text-center mb-8"
          >
            Why I Built Flare AI
          </h2>
          <div className="prose prose-lg dark:prose-invert max-w-none">
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Hi, I&apos;m <strong>Flare Labs</strong>, the founder and creator
              of Flare AI. I built this platform because I was frustrated with
              the current state of AI tools.
            </p>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Like many of you, I was paying for multiple AI subscriptions –
              $20/month for ChatGPT Plus, another $20 for Claude Pro, and
              considering Gemini Advanced too. That&apos;s $60+ per month just
              to access different AI models! And even then, I had to constantly
              switch between different websites and apps.
            </p>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              I realized there had to be a better way. Why couldn&apos;t I
              access all these AI models from one place? Why couldn&apos;t I
              compare responses from GPT-4, Claude, and Gemini side by side? Why
              couldn&apos;t I switch models mid-conversation when one
              wasn&apos;t giving me the answer I needed?
            </p>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              So I built <strong>Flare AI</strong> – a unified AI chat platform
              that brings together{" "}
              <strong>GPT-4o, Claude 3.5 Sonnet, Gemini Pro, and Grok</strong>,
              and <strong>50+ other AI models</strong> into one beautiful,
              powerful interface. And I made it free to start because everyone
              deserves access to advanced AI tools.
            </p>
            <p className="text-lg text-muted-foreground leading-relaxed">
              But I didn&apos;t stop at just aggregating models. I added
              features I wished other platforms had:{" "}
              <strong>visual workflow builder</strong> for AI automation,{" "}
              <strong>custom AI agents</strong> with personalized instructions,{" "}
              <strong>MCP protocol support</strong> for connecting to external
              tools, and <strong>realtime voice chat</strong>. The result is
              Flare AI – the most complete AI platform available.
            </p>
          </div>
        </div>
      </section>

      {/* Supported AI Models Section - Critical for GEO */}
      <section
        className="py-20 px-4 bg-muted/30"
        aria-labelledby="models-heading"
      >
        <div className="max-w-6xl mx-auto">
          <h2
            id="models-heading"
            className="text-3xl md:text-4xl font-bold text-center mb-4"
          >
            Which AI Models Does Flare AI Support?
          </h2>
          <p className="text-center text-muted-foreground mb-12 max-w-3xl mx-auto text-lg">
            Flare AI supports <strong>50+ AI models</strong> from{" "}
            <strong>8+ providers</strong>. Unlike ChatGPT, Claude, or Gemini
            which lock you into one provider, Flare AI lets you access all major
            AI models in one unified interface.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {AI_PROVIDERS.map((provider, index) => (
              <motion.article
                key={provider.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                className="p-6 rounded-xl border border-border bg-card hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center gap-3 mb-3">
                  <ModelProviderIcon
                    provider={provider.provider}
                    className="size-8"
                  />
                  <h3 className="font-semibold text-lg">{provider.name}</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  {provider.description}
                </p>
                <ul className="space-y-2">
                  {provider.models.map((model) => (
                    <li key={model} className="flex items-center gap-2 text-sm">
                      <Check className="size-4 text-green-500 flex-shrink-0" />
                      <span>{model}</span>
                    </li>
                  ))}
                </ul>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4" aria-labelledby="features-heading">
        <div className="max-w-6xl mx-auto">
          <h2
            id="features-heading"
            className="text-3xl md:text-4xl font-bold text-center mb-4"
          >
            What Can Flare AI Do?
          </h2>
          <p className="text-center text-muted-foreground mb-12 max-w-3xl mx-auto text-lg">
            Flare AI is a complete AI productivity platform with chat, image
            generation, code execution, workflows, and more. Here are the
            features I built for you:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature, index) => (
              <motion.article
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                className="p-6 rounded-xl border border-border bg-card hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <feature.icon className="size-5" />
                  </div>
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-muted text-muted-foreground">
                    {feature.highlight}
                  </span>
                </div>
                <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Section - Critical for "vs" searches */}
      <section
        className="py-20 px-4 bg-muted/30"
        aria-labelledby="comparison-heading"
      >
        <div className="max-w-5xl mx-auto">
          <h2
            id="comparison-heading"
            className="text-3xl md:text-4xl font-bold text-center mb-4"
          >
            Flare AI vs ChatGPT vs Claude vs Poe
          </h2>
          <p className="text-center text-muted-foreground mb-12 text-lg">
            See how Flare AI compares to ChatGPT Plus, Claude Pro, Gemini
            Advanced, and Poe. Flare AI offers more AI models for less cost.
          </p>

          <div className="overflow-x-auto">
            <div className="overflow-hidden rounded-xl border border-border bg-card min-w-[600px]">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-4 text-left text-sm font-semibold">
                      Platform
                    </th>
                    <th className="px-4 py-4 text-left text-sm font-semibold">
                      Price
                    </th>
                    <th className="px-4 py-4 text-left text-sm font-semibold">
                      AI Models
                    </th>
                    <th className="px-4 py-4 text-left text-sm font-semibold">
                      Image Gen
                    </th>
                    <th className="px-4 py-4 text-left text-sm font-semibold">
                      Code Exec
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {COMPARISONS.map((row, _index) => (
                    <tr
                      key={row.platform}
                      className={
                        row.platform === "Flare AI" ? "bg-primary/5" : ""
                      }
                    >
                      <td className="px-4 py-4 font-medium">
                        {row.platform === "Flare AI" && (
                          <Star className="size-4 text-yellow-500 inline mr-2" />
                        )}
                        {row.platform}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={
                            row.price === "Free tier"
                              ? "text-green-600 dark:text-green-400 font-semibold"
                              : ""
                          }
                        >
                          {row.price}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={
                            row.models === "50+ models"
                              ? "text-green-600 dark:text-green-400 font-semibold"
                              : "text-muted-foreground"
                          }
                        >
                          {row.models}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        {row.imageGen === "Yes" ? (
                          <Check className="size-5 text-green-500" />
                        ) : row.imageGen === "No" ? (
                          <X className="size-5 text-red-500" />
                        ) : (
                          <span className="text-muted-foreground text-sm">
                            {row.imageGen}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {row.codeExec === "Yes" ? (
                          <Check className="size-5 text-green-500" />
                        ) : row.codeExec === "No" ? (
                          <X className="size-5 text-red-500" />
                        ) : (
                          <span className="text-muted-foreground text-sm">
                            {row.codeExec}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-muted-foreground mb-4">
              Flare AI gives you access to <strong>all</strong> the models from
              ChatGPT, Claude, and Gemini in one place – with a free tier.
            </p>
            <Link href="/sign-in">
              <Button size="lg" className="gap-2">
                Start Free <ArrowRight className="size-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 px-4" aria-labelledby="stats-heading">
        <div className="max-w-4xl mx-auto">
          <h2
            id="stats-heading"
            className="text-3xl md:text-4xl font-bold text-center mb-12"
          >
            Flare AI by the Numbers
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="p-6 rounded-xl border border-border bg-card"
            >
              <div className="text-4xl md:text-5xl font-bold text-primary mb-2">
                50+
              </div>
              <div className="text-sm text-muted-foreground">AI Models</div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="p-6 rounded-xl border border-border bg-card"
            >
              <div className="text-4xl md:text-5xl font-bold text-primary mb-2">
                8+
              </div>
              <div className="text-sm text-muted-foreground">AI Providers</div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              className="p-6 rounded-xl border border-border bg-card"
            >
              <div className="text-4xl md:text-5xl font-bold text-primary mb-2">
                10K+
              </div>
              <div className="text-sm text-muted-foreground">Users</div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.4 }}
              className="p-6 rounded-xl border border-border bg-card"
            >
              <div className="text-4xl md:text-5xl font-bold text-primary mb-2">
                1M+
              </div>
              <div className="text-sm text-muted-foreground">Messages</div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* FAQ Section - Critical for Featured Snippets */}
      <section className="py-20 px-4 bg-muted/30" aria-labelledby="faq-heading">
        <div className="max-w-3xl mx-auto">
          <h2
            id="faq-heading"
            className="text-3xl md:text-4xl font-bold text-center mb-4"
          >
            Frequently Asked Questions
          </h2>
          <p className="text-center text-muted-foreground mb-12 text-lg">
            Everything you need to know about Flare AI
          </p>

          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {FAQS.map((faq, index) => (
              <FAQItem
                key={index}
                question={faq.question}
                answer={faq.answer}
              />
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4 bg-gradient-to-b from-background to-primary/5">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to Try Flare AI?
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Join 10,000+ users who switched from ChatGPT Plus to Flare AI. Free
            to start, no credit card required. Access GPT-4o, Claude 3.5, Gemini
            Pro, and 50+ more AI models today.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/sign-in">
              <Button size="lg" className="gap-2 text-lg px-8">
                Get Started Free <ArrowRight className="size-5" />
              </Button>
            </Link>
          </div>
          <p className="text-sm text-muted-foreground mt-6">
            No credit card • No hidden fees • Cancel anytime
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Image
                src="/flare-logo-192.webp"
                alt="Flare AI Logo"
                width={16}
                height={16}
                className="object-contain"
              />
              <span>
                © 2024 Flare AI. All rights reserved. Founded by Flare Labs.
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link
                href="/privacy-policy"
                className="hover:text-foreground transition-colors"
              >
                Privacy
              </Link>
              <Link
                href="/terms-of-service"
                className="hover:text-foreground transition-colors"
              >
                Terms
              </Link>
              <Link
                href="https://github.com/Flare-Labs"
                target="_blank"
                className="hover:text-foreground transition-colors"
              >
                GitHub
              </Link>
              <Link
                href="https://t.me/VoidzeroX"
                target="_blank"
                className="hover:text-foreground transition-colors"
              >
                Telegram
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
