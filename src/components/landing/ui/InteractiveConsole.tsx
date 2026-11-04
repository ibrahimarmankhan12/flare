import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal, Radio, Sparkles, Database } from "lucide-react";
import { FONT_MONO, FONT_GEIST } from "../lib/tokens";

interface ConsoleStep {
  text: string;
  color?: string;
  isBold?: boolean;
}

const PRESETS: Record<string, { cmd: string; steps: ConsoleStep[] }> = {
  optimize: {
    cmd: 'Flare prompt optimize --prompt "summarize"',
    steps: [
      {
        text: "[Flare] Analyzing request schema...",
        color: "rgba(255,255,255,0.4)",
      },
      {
        text: "[Flare] Applying Vercel/Cloudflare edge heuristics...",
        color: "rgba(255,255,255,0.4)",
      },
      {
        text: "[Flare] Optimized Prompt System prompt resolved:",
        color: "#3d9e8c",
        isBold: true,
      },
      {
        text: '  "Act as an edge-optimized summarizer. Analyze input text and output a JSON array of core concepts under 50ms latency."',
        color: "#ffffff",
      },
      {
        text: "[Flare] Done. Token cost: $0.000045 (Savings: 35%)",
        color: "#3d9e8c",
      },
    ],
  },
  mcp: {
    cmd: "Flare mcp link --server pg-database",
    steps: [
      {
        text: "[mcp] Handshaking with pg-database secure tunnel...",
        color: "rgba(255,255,255,0.4)",
      },
      {
        text: "[mcp] Synchronized schemas successfully. Registered 2 tools:",
        color: "#ffffff",
      },
      {
        text: "  -> query_db (Execute read-only queries with index checks)",
        color: "rgba(255,255,255,0.7)",
      },
      {
        text: "  -> get_schema_summary (Inspect table metadata)",
        color: "rgba(255,255,255,0.7)",
      },
      {
        text: "[mcp] Connection live: pg-database @ Flare-sh edge",
        color: "#3d9e8c",
        isBold: true,
      },
    ],
  },
  voice: {
    cmd: "Flare voice init --agent custom-agent-01",
    steps: [
      {
        text: "[voice] Provisioning real-time WebSocket connection...",
        color: "rgba(255,255,255,0.4)",
      },
      {
        text: "[voice] Pipeline Config: STT (Groq) | Model (GPT-4o) | TTS (ElevenLabs)",
        color: "rgba(255,255,255,0.7)",
      },
      { text: "[voice] Latency test (edge loopback): 112ms", color: "#3d9e8c" },
      {
        text: "[voice] Streaming active. Status: Listening for 'Hey Flare'...",
        color: "#3d9e8c",
        isBold: true,
      },
    ],
  },
};

export function InteractiveConsole() {
  const [activePreset, setActivePreset] = useState<
    "optimize" | "mcp" | "voice"
  >("optimize");
  const [displayedSteps, setDisplayedSteps] = useState<ConsoleStep[]>([]);
  const [typedCommand, setTypedCommand] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    // Run typing simulation for command
    setIsTyping(true);
    setTypedCommand("");
    setDisplayedSteps([]);

    const preset = PRESETS[activePreset];
    const cmdText = preset.cmd;
    let index = 0;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    const interval = setInterval(() => {
      if (index >= cmdText.length) {
        clearInterval(interval);
        setIsTyping(false);
        // Play steps sequentially (inline to avoid hoisting issues)
        const steps = preset.steps;
        let stepIdx = 0;
        const addStep = () => {
          if (stepIdx < steps.length) {
            const currentStep = steps[stepIdx];
            setDisplayedSteps((prev) => [...prev, currentStep]);
            stepIdx++;
            timeouts.push(setTimeout(addStep, 400));
          }
        };
        timeouts.push(setTimeout(addStep, 150));
        return;
      }
      setTypedCommand((prev) => prev + cmdText[index]);
      index++;
    }, 25);

    return () => {
      clearInterval(interval);
      timeouts.forEach(clearTimeout);
    };
  }, [activePreset]);

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 500,
        background: "#080808",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        boxShadow: "0 24px 60px rgba(0,0,0,0.8), 0 0 1px rgba(255,255,255,0.1)",
        overflow: "hidden",
        fontFamily: FONT_GEIST,
        display: "flex",
        flexDirection: "column",
        textAlign: "left",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(61,158,140,0.25)";
        e.currentTarget.style.boxShadow =
          "0 24px 60px rgba(0,0,0,0.8), 0 0 20px rgba(61,158,140,0.1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
        e.currentTarget.style.boxShadow =
          "0 24px 60px rgba(0,0,0,0.8), 0 0 1px rgba(255,255,255,0.1)";
      }}
    >
      {/* Window Header */}
      <div
        style={{
          background: "#121212",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "#ff5f56",
            }}
          />
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "#ffbd2e",
            }}
          />
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "#27c93f",
            }}
          />
        </div>
        <div
          style={{
            color: "rgba(255,255,255,0.4)",
            fontSize: 11,
            fontFamily: FONT_MONO,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Terminal size={11} /> flare-sh --console
        </div>
        <div style={{ width: 40 }} />
      </div>

      {/* Tabs Row */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "#0c0c0c",
          padding: "6px 12px",
          gap: 6,
        }}
      >
        <button
          onClick={() => setActivePreset("optimize")}
          style={{
            background:
              activePreset === "optimize"
                ? "rgba(255,255,255,0.06)"
                : "transparent",
            border:
              activePreset === "optimize"
                ? "1px solid rgba(255,255,255,0.1)"
                : "1px solid transparent",
            color:
              activePreset === "optimize"
                ? "#ffffff"
                : "rgba(255,255,255,0.45)",
            fontSize: 12,
            padding: "5px 10px",
            borderRadius: 6,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 5,
            transition: "all 0.2s",
          }}
        >
          <Sparkles size={11} /> Prompt
        </button>
        <button
          onClick={() => setActivePreset("mcp")}
          style={{
            background:
              activePreset === "mcp" ? "rgba(255,255,255,0.06)" : "transparent",
            border:
              activePreset === "mcp"
                ? "1px solid rgba(255,255,255,0.1)"
                : "1px solid transparent",
            color:
              activePreset === "mcp" ? "#ffffff" : "rgba(255,255,255,0.45)",
            fontSize: 12,
            padding: "5px 10px",
            borderRadius: 6,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 5,
            transition: "all 0.2s",
          }}
        >
          <Database size={11} /> Link MCP
        </button>
        <button
          onClick={() => setActivePreset("voice")}
          style={{
            background:
              activePreset === "voice"
                ? "rgba(255,255,255,0.06)"
                : "transparent",
            border:
              activePreset === "voice"
                ? "1px solid rgba(255,255,255,0.1)"
                : "1px solid transparent",
            color:
              activePreset === "voice" ? "#ffffff" : "rgba(255,255,255,0.45)",
            fontSize: 12,
            padding: "5px 10px",
            borderRadius: 6,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 5,
            transition: "all 0.2s",
          }}
        >
          <Radio size={11} /> Voice Pipeline
        </button>
      </div>

      {/* Terminal Screen */}
      <div
        style={{
          padding: "16px",
          minHeight: 180,
          background: "#080808",
          fontFamily: FONT_MONO,
          fontSize: 12,
          lineHeight: 1.6,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Command Line */}
        <div
          style={{
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 12,
          }}
        >
          <span style={{ color: "#3d9e8c" }}>$</span>
          <span>{typedCommand}</span>
          {isTyping && (
            <motion.span
              animate={{ opacity: [0, 1, 0] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
              style={{
                display: "inline-block",
                width: 6,
                height: 14,
                background: "#3d9e8c",
                verticalAlign: "middle",
              }}
            />
          )}
        </div>

        {/* Steps Output */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <AnimatePresence>
            {displayedSteps.map((step, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25 }}
                style={{
                  color: step.color || "#ffffff",
                  fontWeight: step.isBold ? 600 : 400,
                  whiteSpace: "pre-wrap",
                }}
              >
                {step.text}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
