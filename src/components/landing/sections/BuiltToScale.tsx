import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { FadeIn } from "../ui/FadeIn";
import { staggerContainer, staggerItem } from "../lib/motion";
import { TEAL, FONT_GEIST } from "../lib/tokens";
import { OpenAIIcon } from "@/components/ui/openai-icon";
import { ClaudeIcon } from "@/components/ui/claude-icon";
import { GeminiIcon } from "@/components/ui/gemini-icon";
import { GrokIcon } from "@/components/ui/grok-icon";
import { OllamaIcon } from "@/components/ui/ollama-icon";

/* ────────────────────────────────────────────────────────────────────────────
   Illustration cards — product-screenshot style, monochrome with one accent
   ──────────────────────────────────────────────────────────────────────── */

const CARD_BG = "#080808";
const CARD_BORDER = "rgba(255,255,255,0.08)";

// Tiny utility: a brand-icon tile (icon on a brand-colored square)
function BrandTile({
  bg,
  iconColor,
  Icon,
}: {
  bg: string;
  iconColor: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div
      style={{
        width: 18,
        height: 18,
        borderRadius: 5,
        background: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
        flexShrink: 0,
        color: iconColor,
        padding: 3,
      }}
    >
      <Icon className="size-full" />
    </div>
  );
}

// 1. Every Model — a "model picker" dropdown mockup
function ModelsCard() {
  const items = [
    {
      name: "GPT-4o",
      Icon: OpenAIIcon,
      bg: "#0a0a0a",
      iconColor: "#ffffff",
      selected: true,
    },
    {
      name: "Claude 3.5 Sonnet",
      Icon: ClaudeIcon,
      bg: "#fdf6f1",
      iconColor: "#d97757",
      selected: false,
    },
    {
      name: "Gemini 2.5 Pro",
      Icon: GeminiIcon,
      bg: "#f0f5ff",
      iconColor: "#1c69e0",
      selected: false,
    },
    {
      name: "Grok 4",
      Icon: GrokIcon,
      bg: "#0a0a0a",
      iconColor: "#ffffff",
      selected: false,
    },
    {
      name: "Llama 3.3 (Ollama)",
      Icon: OllamaIcon,
      bg: "#f5f5f5",
      iconColor: "#0a0a0a",
      selected: false,
    },
  ];
  return (
    <div
      style={{
        height: "100%",
        background: CARD_BG,
        padding: 22,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <motion.div
        initial={{ y: 6, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
        style={{
          width: "100%",
          maxWidth: 200,
          background: "#121212",
          border: `1px solid ${CARD_BORDER}`,
          borderRadius: 12,
          padding: 5,
          fontFamily: FONT_GEIST,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 8px 6px",
            fontSize: 9,
            color: "#a1a1aa",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          Model
          <span
            style={{
              fontSize: 9,
              color: "#a1a1aa",
              background: "#222",
              borderRadius: 4,
              padding: "1px 5px",
              fontWeight: 600,
              letterSpacing: "0.04em",
              marginLeft: "auto",
            }}
          >
            5
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {items.map((it) => (
            <div
              key={it.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 8px",
                borderRadius: 7,
                fontSize: 11,
                color: it.selected ? "#fff" : "#a1a1aa",
                background: it.selected
                  ? "rgba(61,158,140,0.15)"
                  : "transparent",
                fontWeight: it.selected ? 600 : 400,
                transition: "background 0.15s",
              }}
            >
              <BrandTile bg={it.bg} iconColor={it.iconColor} Icon={it.Icon} />
              <span
                style={{
                  flex: 1,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {it.name}
              </span>
              {it.selected && (
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3 8.5l3.5 3.5L13 5"
                    stroke={TEAL}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// 2. Tools & MCP — a tool palette popover with real labels
function ToolsCard() {
  const items = [
    { name: "web-search", desc: "Search the web" },
    { name: "code", desc: "Run JS / Python" },
    { name: "image", desc: "Generate & edit" },
    { name: "files", desc: "Read PDFs, docs" },
    { name: "playwright", desc: "MCP · Browser" },
  ];
  return (
    <div
      style={{
        height: "100%",
        background: CARD_BG,
        padding: 18,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 240,
          background: "#121212",
          border: `1px solid ${CARD_BORDER}`,
          borderRadius: 10,
          padding: 8,
          fontFamily: FONT_GEIST,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 8px 8px",
            fontSize: 9.5,
            color: "#a1a1aa",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            fontWeight: 600,
            borderBottom: `1px solid ${CARD_BORDER}`,
            marginBottom: 6,
          }}
        >
          @ Tools
        </div>
        {items.map((it, i) => (
          <motion.div
            key={it.name}
            initial={{ opacity: 0, x: -4 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 8px",
              borderRadius: 6,
              fontSize: 12,
              color: "#fff",
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: TEAL,
                fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
                fontWeight: 600,
              }}
            >
              @{it.name}
            </span>
            <span
              style={{ color: "#a1a1aa", fontSize: 11, marginLeft: "auto" }}
            >
              {it.desc}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// 3. Visual Workflows — mini workflow editor screenshot
function WorkflowsCard() {
  return (
    <div
      style={{
        height: "100%",
        background: CARD_BG,
        backgroundImage:
          "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
        backgroundSize: "14px 14px",
        position: "relative",
        padding: 18,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        viewBox="0 0 260 140"
        style={{ width: "100%", height: "100%" }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Dashed connections */}
        <path
          d="M 78 70 C 100 70, 100 70, 122 70"
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="1.4"
          strokeDasharray="3 3"
        />
        <path
          d="M 178 70 C 200 70, 200 70, 222 70"
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="1.4"
          strokeDasharray="3 3"
        />

        {/* INPUT */}
        <g>
          <rect
            x="18"
            y="46"
            width="60"
            height="48"
            rx="6"
            fill="#121212"
            stroke="rgba(255,255,255,0.08)"
          />
          <rect
            x="18"
            y="46"
            width="60"
            height="14"
            rx="6"
            fill="rgba(61,158,140,0.15)"
          />
          <rect x="22" y="50" width="8" height="6" rx="2" fill={TEAL} />
          <text
            x="34"
            y="56"
            fontSize="6"
            fontFamily="Geist, sans-serif"
            fontWeight="700"
            fill="#fff"
          >
            INPUT
          </text>
          <text
            x="22"
            y="74"
            fontSize="6"
            fontFamily="Geist, sans-serif"
            fill="#a1a1aa"
          >
            region
          </text>
          <text
            x="22"
            y="86"
            fontSize="5"
            fontFamily="Geist, sans-serif"
            fill="#666"
          >
            *string
          </text>
        </g>

        {/* LLM */}
        <g>
          <rect
            x="122"
            y="46"
            width="56"
            height="48"
            rx="6"
            fill="#121212"
            stroke="rgba(255,255,255,0.08)"
          />
          <rect
            x="122"
            y="46"
            width="56"
            height="14"
            rx="6"
            fill="rgba(74,143,209,0.15)"
          />
          <rect x="126" y="50" width="8" height="6" rx="2" fill="#4a8fd1" />
          <text
            x="138"
            y="56"
            fontSize="6"
            fontFamily="Geist, sans-serif"
            fontWeight="700"
            fill="#fff"
          >
            LLM
          </text>
          <text
            x="126"
            y="74"
            fontSize="6"
            fontFamily="Geist, sans-serif"
            fill="#a1a1aa"
          >
            gpt-4o
          </text>
          <text
            x="126"
            y="86"
            fontSize="5"
            fontFamily="Geist, sans-serif"
            fill="#666"
          >
            {"{} object"}
          </text>
        </g>

        {/* OUTPUT */}
        <g>
          <rect
            x="222"
            y="46"
            width="38"
            height="48"
            rx="6"
            fill="#121212"
            stroke="rgba(255,255,255,0.08)"
          />
          <rect
            x="222"
            y="46"
            width="38"
            height="14"
            rx="6"
            fill="rgba(217,102,102,0.15)"
          />
          <rect x="226" y="50" width="8" height="6" rx="2" fill="#d96666" />
          <text
            x="238"
            y="56"
            fontSize="6"
            fontFamily="Geist, sans-serif"
            fontWeight="700"
            fill="#fff"
          >
            OUT
          </text>
          <text
            x="226"
            y="74"
            fontSize="6"
            fontFamily="Geist, sans-serif"
            fill="#a1a1aa"
          >
            result
          </text>
        </g>
      </svg>
    </div>
  );
}

// 4. Realtime — chat thread with live transcription
function RealtimeCard() {
  return (
    <div
      style={{
        height: "100%",
        background: CARD_BG,
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        justifyContent: "center",
        fontFamily: FONT_GEIST,
      }}
    >
      {/* Voice mic chip */}
      <div
        style={{
          alignSelf: "flex-start",
          display: "flex",
          alignItems: "center",
          gap: 7,
          background: "#121212",
          border: `1px solid ${CARD_BORDER}`,
          borderRadius: 999,
          padding: "5px 10px 5px 7px",
        }}
      >
        <motion.span
          animate={{ scale: [1, 1.25, 1], opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#ef4444",
            display: "inline-block",
          }}
        />
        <span style={{ fontSize: 10, color: "#a1a1aa", fontWeight: 500 }}>
          Live
        </span>
        <div
          style={{
            display: "flex",
            gap: 2,
            alignItems: "center",
            marginLeft: 4,
          }}
        >
          {[6, 10, 14, 9, 12, 7, 11].map((h, i) => (
            <motion.div
              key={i}
              animate={{ height: [h, h * 1.5, h] }}
              transition={{
                duration: 0.7,
                repeat: Infinity,
                delay: i * 0.06,
                ease: "easeInOut",
              }}
              style={{ width: 2, borderRadius: 1, background: TEAL }}
            />
          ))}
        </div>
      </div>

      {/* Agent message */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.15, duration: 0.4 }}
        style={{
          alignSelf: "flex-start",
          maxWidth: "90%",
          background: "#121212",
          border: `1px solid ${CARD_BORDER}`,
          borderRadius: 10,
          padding: "8px 11px",
          fontSize: 11,
          color: "#fff",
          lineHeight: 1.4,
        }}
      >
        Found 3 flights to Tokyo on Friday. Booking the 8:40am direct.
      </motion.div>

      {/* Tool call chip */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.3, duration: 0.4 }}
        style={{
          alignSelf: "flex-start",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 10,
          color: TEAL,
          fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
          fontWeight: 600,
        }}
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="3" fill={TEAL} />
        </svg>
        @tool(&apos;book-flight&apos;) · 240ms
      </motion.div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Cards data
   ──────────────────────────────────────────────────────────────────────── */
const cards = [
  {
    name: "Every Model, One Interface",
    tag: "MULTI-LLM CONNECTOR",
    description:
      "Connect every major model — OpenAI, Anthropic, Google, xAI, Groq, OpenRouter, Ollama, and OpenAI-compatible endpoints — under a single unified chat.",
    features: [
      "50+ models from leading providers",
      "Bring-your-own API keys",
      "Auto-routing with fallback keys",
      "OpenAI-compatible custom providers",
    ],
    accent: TEAL,
    illustration: <ModelsCard />,
  },
  {
    name: "Tools & MCP",
    tag: "AGENT TOOLING",
    description:
      "Give every agent superpowers — web search, code execution, image generation, document analysis, and the full Model Context Protocol ecosystem.",
    features: [
      "Web search, code, image, files",
      "Full MCP protocol support",
      "OAuth-secured integrations",
      "Drop-in custom tools",
    ],
    accent: "#0a0a0a",
    illustration: <ToolsCard />,
  },
  {
    name: "Visual Workflows",
    tag: "WORKFLOW BUILDER",
    description:
      "Compose agentic pipelines with drag-and-drop — chain LLMs, HTTP calls, and tools into reusable flows that run end-to-end without writing glue code.",
    features: [
      "Drag-and-drop canvas",
      "Branching, loops, parallel runs",
      "Reusable as custom tools",
      "Share workflows with your team",
    ],
    accent: "#4a8fd1",
    illustration: <WorkflowsCard />,
  },
  {
    name: "Realtime Voice & Chat",
    tag: "CONVERSATIONAL LAYER",
    description:
      "Talk to your agents the way you talk to people. Full-duplex voice, streaming chat, and shared workspaces with full tool access on every channel.",
    features: [
      "OpenAI Realtime voice support",
      "Live tool calls during a call",
      "Collaborative shared threads",
      "Mobile + desktop ready",
    ],
    accent: "#c75c8a",
    illustration: <RealtimeCard />,
  },
];

/* ────────────────────────────────────────────────────────────────────────────
   Section
   ──────────────────────────────────────────────────────────────────────── */
export function BuiltToScale() {
  return (
    <section
      style={{
        background: "#000000",
        backgroundImage:
          "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
        padding: "96px 0",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 28px" }}>
        <FadeIn>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 60,
              gap: 24,
              flexWrap: "wrap",
            }}
          >
            <div>
              <p
                style={{
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: TEAL,
                  fontFamily: FONT_GEIST,
                  marginBottom: 10,
                }}
              >
                ONE PLATFORM
              </p>
              <h2
                className="font-cooper"
                style={{
                  fontSize: "clamp(34px, 4vw, 54px)",
                  fontWeight: 300,
                  color: "#fff",
                  lineHeight: 1.05,
                }}
              >
                Built for the
                <br />
                way you ship.
              </h2>
            </div>
            <p
              style={{
                maxWidth: 440,
                fontSize: 14,
                color: "rgba(255,255,255,0.48)",
                fontFamily: FONT_GEIST,
                lineHeight: 1.7,
                paddingTop: 38,
              }}
            >
              Flare connects every AI model, tool, and workflow into a unified
              platform — delivering real-time insights, advanced reasoning, and
              seamless collaboration across your favourite AI tools.
            </p>
          </div>
        </FadeIn>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 20,
          }}
        >
          {cards.map((card) => (
            <motion.div
              key={card.name}
              variants={staggerItem}
              whileHover={{
                y: -6,
                borderColor: "rgba(61,158,140,0.25)",
                boxShadow: "0 12px 30px rgba(61,158,140,0.06)",
              }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              style={{
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 14,
                overflow: "hidden",
                background: "#080808",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Illustration */}
              <div
                style={{
                  height: 200,
                  position: "relative",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                {card.illustration}
              </div>

              <div style={{ padding: "22px 22px 0", flex: 1 }}>
                <h3
                  className="font-cooper"
                  style={{
                    fontSize: 22,
                    fontWeight: 300,
                    color: "#fff",
                    marginBottom: 4,
                    lineHeight: 1.15,
                  }}
                >
                  {card.name}
                </h3>
                <p
                  style={{
                    fontSize: 9.5,
                    color: "#666",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    fontFamily: FONT_GEIST,
                    marginBottom: 14,
                  }}
                >
                  {card.tag}
                </p>
                <p
                  style={{
                    fontSize: 12.5,
                    color: "rgba(255,255,255,0.5)",
                    lineHeight: 1.68,
                    fontFamily: FONT_GEIST,
                  }}
                >
                  {card.description}
                </p>
              </div>

              <div
                style={{
                  margin: "18px 22px 0",
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {card.features.map((f) => (
                  <div
                    key={f}
                    style={{
                      padding: "10px 0",
                      fontSize: 12,
                      color: "rgba(255,255,255,0.65)",
                      fontFamily: FONT_GEIST,
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: "50%",
                        background: card.accent,
                        flexShrink: 0,
                      }}
                    />
                    {f}
                  </div>
                ))}
              </div>

              <div style={{ padding: "16px 22px" }}>
                <Link href="/sign-up" style={{ textDecoration: "none" }}>
                  <motion.div
                    whileHover={{
                      background: "#ffffff",
                      color: "#000000",
                      borderColor: "#ffffff",
                    }}
                    whileTap={{ scale: 0.98 }}
                    style={{
                      width: "100%",
                      background: "#121212",
                      border: "1px solid rgba(255,255,255,0.15)",
                      color: "#ffffff",
                      fontSize: 13,
                      fontFamily: FONT_GEIST,
                      fontWeight: 500,
                      padding: "11px 0",
                      borderRadius: 9,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      transition: "all 0.2s",
                    }}
                  >
                    Get Started <ArrowRight size={13} />
                  </motion.div>
                </Link>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
