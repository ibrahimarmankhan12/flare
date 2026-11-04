import { motion } from "framer-motion";
import { Users, Building2, Cpu, Sparkles } from "lucide-react";
import { FadeIn } from "../ui/FadeIn";
import { staggerContainer, staggerItem } from "../lib/motion";
import { TEAL, FONT_GEIST } from "../lib/tokens";

type Category = {
  title: string;
  caption: string;
  icon: React.ComponentType<{
    size?: number;
    color?: string;
    strokeWidth?: number;
  }>;
  items: string[];
};

const categories: Category[] = [
  {
    title: "B2C",
    caption: "Consumer apps & assistants",
    icon: Users,
    items: ["Notetakers", "AI companions", "AI celebrity clones"],
  },
  {
    title: "B2B",
    caption: "Enterprise automation",
    icon: Building2,
    items: ["Collections", "Lead qualifications", "Customer support"],
  },
  {
    title: "Edge",
    caption: "On-device intelligence",
    icon: Cpu,
    items: ["Custom chips", "Specialized hardware", "Mobile devices"],
  },
];

export function MachineIntelligence() {
  return (
    <section
      style={{
        background: "#050505",
        padding: "120px 0",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Ambient glow */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          top: "10%",
          transform: "translateX(-50%)",
          width: 900,
          height: 500,
          background:
            "radial-gradient(ellipse at top, rgba(61,158,140,0.07) 0%, rgba(61,158,140,0) 60%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "0 28px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* ── Header ── */}
        <FadeIn>
          <div
            style={{
              textAlign: "center",
              marginBottom: 56,
              maxWidth: 720,
              margin: "0 auto 56px",
            }}
          >
            <p
              style={{
                fontSize: 11,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: TEAL,
                fontFamily: FONT_GEIST,
                fontWeight: 600,
                marginBottom: 16,
              }}
            >
              Use Cases
            </p>
            <h2
              className="font-cooper"
              style={{
                fontSize: "clamp(30px, 4.2vw, 56px)",
                fontWeight: 300,
                color: "#fff",
                lineHeight: 1.08,
                letterSpacing: "-0.01em",
                marginBottom: 16,
              }}
            >
              One stack. 100+ specialized
              <br />
              machine-intelligence workloads.
            </h2>
            <p
              style={{
                color: "rgba(255,255,255,0.5)",
                fontSize: 15,
                fontFamily: FONT_GEIST,
                lineHeight: 1.65,
                margin: 0,
              }}
            >
              From personal notetakers to enterprise contact centres and
              on-device agents — Flare powers conversational AI across every
              form factor.
            </p>
          </div>
        </FadeIn>

        {/* ── Hub pill ── */}
        <FadeIn delay={0.1}>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: 0,
            }}
          >
            <motion.div
              whileHover={{
                borderColor: "rgba(61,158,140,0.55)",
                background: "rgba(61,158,140,0.07)",
              }}
              transition={{ duration: 0.2 }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 18px",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 999,
                color: "#fff",
                fontSize: 13,
                fontFamily: FONT_GEIST,
                fontWeight: 500,
                cursor: "default",
                backdropFilter: "blur(8px)",
              }}
            >
              <Sparkles size={13} color={TEAL} strokeWidth={2} />
              Conversational AI
            </motion.div>
          </div>
        </FadeIn>

        {/* ── SVG connector tree ── */}
        <FadeIn delay={0.15}>
          <div style={{ height: 60, position: "relative", margin: "8px 0 0" }}>
            <svg
              width="100%"
              height="60"
              viewBox="0 0 1000 60"
              preserveAspectRatio="none"
              style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            >
              {/* Vertical from hub */}
              <motion.line
                x1="500"
                y1="0"
                x2="500"
                y2="22"
                stroke="rgba(255,255,255,0.16)"
                strokeWidth="1"
                initial={{ pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45 }}
              />
              {/* Horizontal bridge */}
              <motion.line
                x1="167"
                y1="22"
                x2="833"
                y2="22"
                stroke="rgba(255,255,255,0.16)"
                strokeWidth="1"
                initial={{ pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55, delay: 0.15 }}
              />
              {/* Three drops to cards */}
              {[167, 500, 833].map((x, i) => (
                <motion.line
                  key={x}
                  x1={x}
                  y1="22"
                  x2={x}
                  y2="60"
                  stroke="rgba(255,255,255,0.16)"
                  strokeWidth="1"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.35, delay: 0.5 + i * 0.05 }}
                />
              ))}
              {/* Glow dot on hub */}
              <circle cx="500" cy="0" r="2.5" fill={TEAL} />
              {/* Glow dots above each card */}
              {[167, 500, 833].map((x) => (
                <circle
                  key={x}
                  cx={x}
                  cy="60"
                  r="2"
                  fill={TEAL}
                  opacity="0.7"
                />
              ))}
            </svg>
          </div>
        </FadeIn>

        {/* ── Category cards ── */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 18,
          }}
        >
          {categories.map((cat) => {
            const Icon = cat.icon;
            return (
              <motion.div
                key={cat.title}
                variants={staggerItem}
                whileHover={{ y: -4, borderColor: "rgba(61,158,140,0.35)" }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 14,
                  padding: 26,
                  fontFamily: FONT_GEIST,
                  backdropFilter: "blur(8px)",
                  transition: "all 0.25s",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 18,
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: "rgba(61,158,140,0.12)",
                      border: "1px solid rgba(61,158,140,0.25)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={15} color={TEAL} strokeWidth={1.8} />
                  </div>
                  <div>
                    <h3
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: "#fff",
                        margin: 0,
                        marginBottom: 1,
                        letterSpacing: "-0.005em",
                      }}
                    >
                      {cat.title}
                    </h3>
                    <p
                      style={{
                        fontSize: 11,
                        color: "rgba(255,255,255,0.42)",
                        margin: 0,
                      }}
                    >
                      {cat.caption}
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 0,
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  {cat.items.map((item) => (
                    <div
                      key={item}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 0",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        fontSize: 13,
                        color: "rgba(255,255,255,0.72)",
                      }}
                    >
                      <span
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: "50%",
                          background: TEAL,
                          opacity: 0.7,
                          flexShrink: 0,
                        }}
                      />
                      {item}
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
