import { motion } from "framer-motion";
import { Sparkles, FlaskConical, Rocket, BarChart3 } from "lucide-react";
import { FadeIn } from "../ui/FadeIn";
import { staggerContainer, staggerItem } from "../lib/motion";
import { FONT_GEIST } from "../lib/tokens";

const steps = [
  {
    num: "01",
    icon: Sparkles,
    title: "Create",
    desc: "Create agents with 3 clicks, with an extremely intuitive UI that supports integrations with enterprise systems.",
  },
  {
    num: "02",
    icon: FlaskConical,
    title: "Test",
    desc: "Run fully simulated customer conversations from start to finish to see exactly how the agent will behave before go-live.",
  },
  {
    num: "03",
    icon: Rocket,
    title: "Deploy",
    desc: "Set the agent live across every channel — voice, email, chat, and social — for consistent conversations wherever customers reach out.",
  },
  {
    num: "04",
    icon: BarChart3,
    title: "Analyze",
    desc: "Use AI-powered Insights to analyze and improve the agent's performance and deliver better customer experiences.",
  },
];

export function PlatformUI() {
  return (
    <section style={{ background: "#000000", padding: "120px 0" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 28px" }}>
        {/* Header */}
        <FadeIn>
          <div style={{ marginBottom: 56, maxWidth: 640 }}>
            <p
              style={{
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#888888",
                fontFamily: FONT_GEIST,
                fontWeight: 500,
                marginBottom: 14,
              }}
            >
              How it works
            </p>
            <h2
              className="font-cooper"
              style={{
                fontSize: "clamp(28px, 3.6vw, 44px)",
                fontWeight: 300,
                color: "#ffffff",
                lineHeight: 1.15,
                letterSpacing: "-0.01em",
                marginBottom: 14,
              }}
            >
              From idea to production in four steps.
            </h2>
            <p
              style={{
                fontSize: 15,
                color: "rgba(255,255,255,0.48)",
                fontFamily: FONT_GEIST,
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              A complete loop — build, validate, ship, and learn — without
              leaving the platform.
            </p>
          </div>
        </FadeIn>

        {/* Cards */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
          }}
        >
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.title}
                variants={staggerItem}
                whileHover={{ y: -3 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                style={{
                  background: "#080808",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  padding: 24,
                  fontFamily: FONT_GEIST,
                  cursor: "default",
                  position: "relative",
                  transition: "border-color 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                }}
              >
                {/* Top row: icon + number */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 28,
                  }}
                >
                  <Icon size={18} strokeWidth={1.6} color="#ffffff" />
                  <span
                    style={{
                      fontSize: 11,
                      color: "#a3a3a3",
                      letterSpacing: "0.04em",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {step.num}
                  </span>
                </div>

                <h3
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: "#ffffff",
                    margin: 0,
                    marginBottom: 6,
                    letterSpacing: "-0.005em",
                  }}
                >
                  {step.title}
                </h3>

                <p
                  style={{
                    fontSize: 13,
                    color: "rgba(255,255,255,0.5)",
                    lineHeight: 1.6,
                    margin: 0,
                  }}
                >
                  {step.desc}
                </p>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
