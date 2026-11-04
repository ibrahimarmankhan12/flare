"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import {
  ArrowRight,
  Edit3,
  MessageSquarePlus,
  Play,
  Plus,
  Settings,
  Users,
  Workflow,
  Home,
  MessageCircle,
  Cloud,
  LogOut,
  Link2,
  Info,
  X,
} from "lucide-react";
import { FONT_GEIST, TEAL } from "../lib/tokens";

/* ────────────────────────────────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────────────────────────────── */
type NodeId = "input" | "llm" | "weather" | "output";

interface NodePos {
  x: number;
  y: number;
}

/* ────────────────────────────────────────────────────────────────────────────
   Sidebar items
   ──────────────────────────────────────────────────────────────────────── */
const NAV_ITEMS = [
  { icon: MessageSquarePlus, label: "New Chat", active: true },
  { icon: Workflow, label: "Workflow", active: false },
  { icon: Users, label: "Community", active: false },
  { icon: Settings, label: "Customize", active: false },
];

const OLDER_CHATS = [
  "Hey greeting",
  "New Chat",
  "Roleplay Prompt fo...",
  "ENI sweater wearin...",
  "Hey bc greeting",
  "Hey...",
];

/* ────────────────────────────────────────────────────────────────────────────
   Node definitions (initial positions inside the canvas)
   ──────────────────────────────────────────────────────────────────────── */
const NODE_DEFS: Record<
  NodeId,
  {
    title: string;
    subtitle: string;
    icon: React.ComponentType<{ size?: number; color?: string }>;
    iconBg: string;
    accent: string;
    badge?: { kind: "text" | "url"; label: string; value: string };
    initial: NodePos;
  }
> = {
  input: {
    title: "INPUT",
    subtitle: "Collect story requirements and preferences from user",
    icon: Home,
    iconBg: "#3d9e8c",
    accent: "#3d9e8c",
    badge: { kind: "text", label: "region", value: "*string" },
    initial: { x: 0, y: 60 },
  },
  llm: {
    title: "LLM",
    subtitle: "Get latitude and longitude from the LLM",
    icon: MessageCircle,
    iconBg: "#4a8fd1",
    accent: "#4a8fd1",
    badge: { kind: "text", label: "Gemini-2.5-Flash", value: "{} object" },
    initial: { x: 200, y: 60 },
  },
  weather: {
    title: "WEATHER API",
    subtitle: "Get weather data from the API",
    icon: Cloud,
    iconBg: "#e57373",
    accent: "#e57373",
    badge: {
      kind: "url",
      label: "GET",
      value: "https://api.open-meteo.com/v1/...",
    },
    initial: { x: 400, y: 60 },
  },
  output: {
    title: "OUTPUT",
    subtitle: "Output the weather data",
    icon: LogOut,
    iconBg: "#d96666",
    accent: "#d96666",
    badge: { kind: "text", label: "WEATHER API", value: "responseBody" },
    initial: { x: 600, y: 60 },
  },
};

const NODE_WIDTH = 180;
const NODE_HEIGHT = 92;

/* ────────────────────────────────────────────────────────────────────────────
   Single draggable node card
   ──────────────────────────────────────────────────────────────────────── */
function NodeCard({
  id,
  x,
  y,
  selected,
  onSelect,
  canvasRef,
}: {
  id: NodeId;
  x: ReturnType<typeof useMotionValue<number>>;
  y: ReturnType<typeof useMotionValue<number>>;
  selected: boolean;
  onSelect: () => void;
  canvasRef: React.RefObject<HTMLDivElement | null>;
}) {
  const def = NODE_DEFS[id];
  const Icon = def.icon;

  return (
    <motion.div
      drag
      dragConstraints={canvasRef}
      dragMomentum={false}
      dragElastic={0}
      onMouseDown={onSelect}
      style={{
        position: "absolute",
        x,
        y,
        width: NODE_WIDTH,
        background: "#fff",
        borderRadius: 10,
        border: selected
          ? `1.5px solid ${def.accent}`
          : "1px solid rgba(0,0,0,0.08)",
        boxShadow: selected
          ? `0 10px 28px rgba(0,0,0,0.10), 0 0 0 3px ${def.accent}22`
          : "0 4px 14px rgba(0,0,0,0.06)",
        cursor: "grab",
        userSelect: "none",
        zIndex: selected ? 5 : 2,
      }}
      whileDrag={{ cursor: "grabbing", scale: 1.03, zIndex: 10 }}
      transition={{ duration: 0.18 }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "8px 10px",
          borderBottom: "1px solid rgba(0,0,0,0.05)",
          background: "rgba(0,0,0,0.015)",
          borderRadius: "10px 10px 0 0",
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            background: def.iconBg,
            borderRadius: 5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon size={11} color="#fff" />
        </div>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            fontFamily: FONT_GEIST,
            color: "#0a0a0a",
            letterSpacing: "0.04em",
          }}
        >
          {def.title}
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: "8px 10px 10px" }}>
        {def.badge && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 6,
            }}
          >
            {def.badge.kind === "text" ? (
              <>
                <span
                  style={{
                    fontSize: 9,
                    fontFamily: FONT_GEIST,
                    color: "#888",
                    background: "rgba(0,0,0,0.04)",
                    padding: "1px 5px",
                    borderRadius: 3,
                  }}
                >
                  (*)
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: FONT_GEIST,
                    fontWeight: 500,
                    color: "#0a0a0a",
                  }}
                >
                  {def.badge.label}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    fontFamily: FONT_GEIST,
                    color: def.accent,
                    marginLeft: "auto",
                  }}
                >
                  {def.badge.value}
                </span>
              </>
            ) : (
              <>
                <span
                  style={{
                    fontSize: 9,
                    fontFamily: FONT_GEIST,
                    color: "#fff",
                    background: "#4a8fd1",
                    padding: "1px 5px",
                    borderRadius: 3,
                    fontWeight: 600,
                  }}
                >
                  {def.badge.label}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    fontFamily: FONT_GEIST,
                    color: "#666",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {def.badge.value}
                </span>
              </>
            )}
          </div>
        )}

        <p
          style={{
            margin: 0,
            fontSize: 10,
            fontFamily: FONT_GEIST,
            color: "#555",
            lineHeight: 1.4,
          }}
        >
          {def.subtitle}
        </p>
      </div>

      {/* Port dots */}
      <div
        style={{
          position: "absolute",
          left: -4,
          top: "50%",
          transform: "translateY(-50%)",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#fff",
          border: `1.5px solid ${def.accent}`,
        }}
      />
      <div
        style={{
          position: "absolute",
          right: -4,
          top: "50%",
          transform: "translateY(-50%)",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#fff",
          border: `1.5px solid ${def.accent}`,
        }}
      />
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Animated connection line between two motion-value positions
   ──────────────────────────────────────────────────────────────────────── */
function ConnectionLine({
  from,
  to,
  color = "#cbd5e1",
}: {
  from: {
    x: ReturnType<typeof useMotionValue<number>>;
    y: ReturnType<typeof useMotionValue<number>>;
  };
  to: {
    x: ReturnType<typeof useMotionValue<number>>;
    y: ReturnType<typeof useMotionValue<number>>;
  };
  color?: string;
}) {
  // x1: right edge of `from` node, y1: vertical center
  const x1 = useTransform(from.x, (v) => v + NODE_WIDTH);
  const y1 = useTransform(from.y, (v) => v + NODE_HEIGHT / 2);
  const x2 = useTransform(to.x, (v) => v);
  const y2 = useTransform(to.y, (v) => v + NODE_HEIGHT / 2);

  // Build a cubic-bezier path string that updates whenever positions change.
  const d = useTransform([x1, y1, x2, y2], (vals) => {
    const arr = vals as number[];
    const [a, b, c, dd] = arr;
    const dx = Math.max(40, (c - a) / 2);
    return `M ${a} ${b} C ${a + dx} ${b}, ${c - dx} ${dd}, ${c} ${dd}`;
  });

  return (
    <motion.path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={1.6}
      strokeDasharray="4 4"
    />
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Main component
   ──────────────────────────────────────────────────────────────────────── */
export function WorkflowPreview() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<NodeId>("input");
  const [running, setRunning] = useState(false);

  // One motion-value pair per node so we can animate connections live.
  const inputX = useMotionValue(NODE_DEFS.input.initial.x);
  const inputY = useMotionValue(NODE_DEFS.input.initial.y);
  const llmX = useMotionValue(NODE_DEFS.llm.initial.x);
  const llmY = useMotionValue(NODE_DEFS.llm.initial.y);
  const weatherX = useMotionValue(NODE_DEFS.weather.initial.x);
  const weatherY = useMotionValue(NODE_DEFS.weather.initial.y);
  const outputX = useMotionValue(NODE_DEFS.output.initial.x);
  const outputY = useMotionValue(NODE_DEFS.output.initial.y);

  const positions = {
    input: { x: inputX, y: inputY },
    llm: { x: llmX, y: llmY },
    weather: { x: weatherX, y: weatherY },
    output: { x: outputX, y: outputY },
  };

  // Subtle pulse on Run button when running
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setRunning(false), 1800);
    return () => clearTimeout(t);
  }, [running]);

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1200,
        margin: "0 auto",
        background: "#fff",
        borderRadius: 14,
        border: "1px solid #e5e5e5",
        boxShadow: "0 28px 64px rgba(0,0,0,0.08)",
        overflow: "hidden",
        display: "flex",
        height: 560,
        position: "relative",
      }}
    >
      {/* ──────────────────────────────────────────────────────────────────
          LEFT SIDEBAR
          ────────────────────────────────────────────────────────────── */}
      <div
        style={{
          width: 200,
          background: "#fafafa",
          borderRight: "1px solid #ececec",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        {/* Brand */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "12px 12px 10px",
            borderBottom: "1px solid #eee",
          }}
        >
          <img
            src="/flare-logo-512.webp"
            alt="Flare"
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              objectFit: "cover",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 12,
              fontFamily: FONT_GEIST,
              fontWeight: 600,
              color: "#0a0a0a",
            }}
          >
            Flare AI
          </span>
          <span
            style={{
              fontSize: 8,
              fontFamily: FONT_GEIST,
              fontWeight: 700,
              color: "#0a0a0a",
              background: "rgba(0,0,0,0.07)",
              padding: "1.5px 5px",
              borderRadius: 3,
              letterSpacing: "0.06em",
            }}
          >
            BETA
          </span>
        </div>

        {/* Nav items */}
        <div
          style={{
            padding: "8px 8px 4px",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {NAV_ITEMS.map((item, i) => {
            const Icon = item.icon;
            return (
              <motion.button
                key={item.label}
                whileHover={{ background: "rgba(0,0,0,0.05)" }}
                whileTap={{ scale: 0.98 }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 10px",
                  border: "none",
                  background: i === 0 ? "rgba(0,0,0,0.06)" : "transparent",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontFamily: FONT_GEIST,
                  fontSize: 11.5,
                  color: "#0a0a0a",
                  textAlign: "left",
                  outline: "none",
                  transition: "background 0.15s",
                }}
              >
                <Icon size={13} />
                {item.label}
              </motion.button>
            );
          })}
        </div>

        {/* Agents */}
        <div style={{ padding: "12px 12px 6px" }}>
          <p
            style={{
              fontSize: 9.5,
              fontFamily: FONT_GEIST,
              color: "#999",
              fontWeight: 600,
              margin: 0,
              marginBottom: 6,
              letterSpacing: "0.04em",
            }}
          >
            Agents
          </p>
        </div>
        <div style={{ padding: "0 8px" }}>
          <motion.div
            whileHover={{
              borderColor: TEAL,
              background: "rgba(61,158,140,0.04)",
            }}
            style={{
              border: "1px dashed #d4d4d4",
              borderRadius: 8,
              padding: "10px 10px",
              fontFamily: FONT_GEIST,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                marginBottom: 4,
              }}
            >
              <span
                style={{ fontSize: 10.5, fontWeight: 600, color: "#0a0a0a" }}
              >
                Create an agent
              </span>
              <ArrowRight size={10} style={{ transform: "rotate(-45deg)" }} />
            </div>
            <p
              style={{ fontSize: 9, color: "#888", margin: 0, lineHeight: 1.4 }}
            >
              Create your own specialized AI agent or select from shared agents.
            </p>
          </motion.div>
        </div>

        {/* Older */}
        <div style={{ padding: "16px 12px 4px" }}>
          <p
            style={{
              fontSize: 9.5,
              fontFamily: FONT_GEIST,
              color: "#999",
              fontWeight: 600,
              margin: 0,
              letterSpacing: "0.04em",
            }}
          >
            Older
          </p>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "4px 8px" }}>
          {OLDER_CHATS.map((chat) => (
            <motion.div
              key={chat}
              whileHover={{ background: "rgba(0,0,0,0.04)" }}
              style={{
                padding: "6px 10px",
                fontSize: 10.5,
                fontFamily: FONT_GEIST,
                color: "#555",
                borderRadius: 6,
                cursor: "pointer",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {chat}
            </motion.div>
          ))}
        </div>

        {/* User pill */}
        <div
          style={{
            borderTop: "1px solid #eee",
            padding: "8px 10px",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #ffd76d, #f8b04a)",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 10,
              fontFamily: FONT_GEIST,
              color: "#0a0a0a",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            raju@gmail.com
          </span>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────
          CENTER: Action bar + canvas
          ────────────────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: "#fbfbfb",
          minWidth: 0,
        }}
      >
        {/* Top action bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 8,
            padding: "10px 14px",
            background: "#fff",
            borderBottom: "1px solid #eee",
          }}
        >
          <motion.button
            onClick={() => setRunning(true)}
            whileHover={{ background: "#f0f0f0" }}
            whileTap={{ scale: 0.96 }}
            animate={running ? { scale: [1, 1.06, 1] } : { scale: 1 }}
            transition={{ duration: 0.5 }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 14px",
              border: "1px solid #e5e5e5",
              background: "#fff",
              borderRadius: 7,
              fontFamily: FONT_GEIST,
              fontSize: 12,
              fontWeight: 500,
              color: "#0a0a0a",
              cursor: "pointer",
            }}
          >
            <Play
              size={11}
              fill={running ? TEAL : "currentColor"}
              color={running ? TEAL : "currentColor"}
            />
            Run
          </motion.button>

          <motion.button
            whileHover={{ background: "#f0f0f0" }}
            whileTap={{ scale: 0.96 }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 14px",
              border: "1px solid #e5e5e5",
              background: "#fff",
              borderRadius: 7,
              fontFamily: FONT_GEIST,
              fontSize: 12,
              fontWeight: 500,
              color: "#0a0a0a",
              cursor: "pointer",
            }}
          >
            <Edit3 size={11} />
            Edit
          </motion.button>
        </div>

        {/* Canvas */}
        <div
          ref={canvasRef}
          style={{
            flex: 1,
            position: "relative",
            overflow: "hidden",
            backgroundImage:
              "radial-gradient(circle, rgba(0,0,0,0.07) 1px, transparent 1px)",
            backgroundSize: "16px 16px",
          }}
        >
          {/* SVG connection layer */}
          <svg
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              overflow: "visible",
            }}
          >
            <ConnectionLine from={positions.input} to={positions.llm} />
            <ConnectionLine from={positions.llm} to={positions.weather} />
            <ConnectionLine from={positions.weather} to={positions.output} />
          </svg>

          {/* Nodes */}
          <NodeCard
            id="input"
            x={inputX}
            y={inputY}
            selected={selected === "input"}
            onSelect={() => setSelected("input")}
            canvasRef={canvasRef}
          />
          <NodeCard
            id="llm"
            x={llmX}
            y={llmY}
            selected={selected === "llm"}
            onSelect={() => setSelected("llm")}
            canvasRef={canvasRef}
          />
          <NodeCard
            id="weather"
            x={weatherX}
            y={weatherY}
            selected={selected === "weather"}
            onSelect={() => setSelected("weather")}
            canvasRef={canvasRef}
          />
          <NodeCard
            id="output"
            x={outputX}
            y={outputY}
            selected={selected === "output"}
            onSelect={() => setSelected("output")}
            canvasRef={canvasRef}
          />
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────
          RIGHT PANEL: selected node properties
          ────────────────────────────────────────────────────────────── */}
      <RightPanel nodeId={selected} onClose={() => setSelected(selected)} />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Right panel (properties of selected node)
   ──────────────────────────────────────────────────────────────────────── */
function RightPanel({
  nodeId,
  onClose,
}: {
  nodeId: NodeId;
  onClose: () => void;
}) {
  const def = NODE_DEFS[nodeId];
  const Icon = def.icon;

  return (
    <motion.div
      key={nodeId}
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        width: 240,
        flexShrink: 0,
        borderLeft: "1px solid #ececec",
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        fontFamily: FONT_GEIST,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderBottom: "1px solid #eee",
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 5,
            background: def.iconBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={11} color="#fff" />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#0a0a0a" }}>
          {def.title}
        </span>
        <motion.button
          whileHover={{ background: "#f0f0f0" }}
          onClick={onClose}
          style={{
            marginLeft: "auto",
            background: "none",
            border: "none",
            padding: 4,
            cursor: "pointer",
            display: "flex",
            borderRadius: 4,
          }}
        >
          <X size={12} />
        </motion.button>
      </div>

      <div style={{ padding: "12px 12px 6px" }}>
        <p
          style={{
            fontSize: 10,
            color: "#555",
            lineHeight: 1.5,
            margin: 0,
            marginBottom: 14,
          }}
        >
          {def.subtitle}
        </p>

        {/* Input fields */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 10.5, fontWeight: 600, color: "#0a0a0a" }}>
            Input Fields
          </span>
          <Info size={10} color="#bbb" />
        </div>

        {def.badge && (
          <div
            style={{
              border: "1px solid #eee",
              borderRadius: 6,
              padding: "7px 9px",
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 8,
              background: "#fafafa",
            }}
          >
            <span
              style={{
                fontSize: 9,
                color: "#888",
                background: "rgba(0,0,0,0.06)",
                padding: "1px 5px",
                borderRadius: 3,
              }}
            >
              (*)
            </span>
            <span style={{ fontSize: 10.5, fontWeight: 500, color: "#0a0a0a" }}>
              {def.badge.label}
            </span>
            <span
              style={{ fontSize: 9, color: def.accent, marginLeft: "auto" }}
            >
              {def.badge.value}
            </span>
          </div>
        )}

        <motion.button
          whileHover={{ background: "#f5f5f5", borderColor: "#ccc" }}
          style={{
            width: "100%",
            background: "#fff",
            border: "1px dashed #ddd",
            borderRadius: 6,
            padding: "8px 10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            fontSize: 10,
            color: "#666",
            cursor: "pointer",
            fontFamily: FONT_GEIST,
            marginBottom: 18,
          }}
        >
          <Plus size={11} /> Add Input Field
        </motion.button>

        {/* Next node */}
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            color: "#0a0a0a",
            marginBottom: 4,
          }}
        >
          Next Node
        </div>
        <p
          style={{
            fontSize: 9.5,
            color: "#888",
            margin: 0,
            marginBottom: 8,
            lineHeight: 1.4,
          }}
        >
          Add a next node to this workflow.
        </p>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            marginBottom: 10,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 5,
              background: NODE_DEFS.input.iconBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Home size={11} color="#fff" />
          </div>
          <div
            style={{
              flex: 1,
              height: 1,
              background: "#ddd",
              position: "relative",
            }}
          >
            <Link2
              size={10}
              color="#aaa"
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%,-50%)",
                background: "#fff",
              }}
            />
          </div>
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 5,
              border: "1px solid #eee",
              borderRadius: 6,
              padding: "4px 7px",
              background: "#fafafa",
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                background: NODE_DEFS.llm.iconBg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <MessageCircle size={9} color="#fff" />
            </div>
            <span style={{ fontSize: 9.5, color: "#0a0a0a", fontWeight: 500 }}>
              LLM
            </span>
          </div>
        </div>

        <motion.button
          whileHover={{ background: "#f5f5f5", borderColor: "#ccc" }}
          style={{
            width: "100%",
            background: "#fff",
            border: "1px dashed #ddd",
            borderRadius: 6,
            padding: "8px 10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            fontSize: 10,
            color: "#666",
            cursor: "pointer",
            fontFamily: FONT_GEIST,
          }}
        >
          <Plus size={11} /> Add Next Node
        </motion.button>
      </div>
    </motion.div>
  );
}
