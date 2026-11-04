import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { FadeIn } from "../ui/FadeIn";
import { WorkflowPreview } from "../ui/WorkflowPreview";
import { FONT_GEIST } from "../lib/tokens";

export function AtomsSection() {
  return (
    <section
      style={{
        background: "#000000",
        backgroundImage:
          "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
        padding: "96px 0 100px",
      }}
    >
      <div
        style={{
          maxWidth: 980,
          margin: "0 auto",
          padding: "0 28px",
          textAlign: "center",
        }}
      >
        <FadeIn>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              marginBottom: 20,
            }}
          >
            <img
              src="/flare-logo-512.webp"
              alt="Flare"
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                objectFit: "cover",
                flexShrink: 0,
              }}
            />
            <span
              style={{ fontSize: 15, fontFamily: FONT_GEIST, color: "#a1a1aa" }}
            >
              Flare
            </span>
          </div>
        </FadeIn>

        <FadeIn delay={0.1}>
          <h2
            className="font-cooper"
            style={{
              fontSize: "clamp(30px, 4.5vw, 56px)",
              fontWeight: 300,
              color: "#fff",
              lineHeight: 1.08,
              marginBottom: 18,
            }}
          >
            <span style={{ display: "block", whiteSpace: "nowrap" }}>
              AI Agents That Automate
            </span>
            <span style={{ display: "block", whiteSpace: "nowrap" }}>
              Workflows End-to-End
            </span>
          </h2>
        </FadeIn>

        <FadeIn delay={0.2}>
          <p
            style={{
              color: "rgba(255,255,255,0.48)",
              fontSize: 15,
              fontFamily: FONT_GEIST,
              marginBottom: 32,
              lineHeight: 1.65,
            }}
          >
            Agents that work like human, respond like humans, scale beyond
            humans.
          </p>
          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <motion.button
              whileHover={{ background: "#ffffff", color: "#000000" }}
              whileTap={{ scale: 0.97 }}
              style={{
                background: "#121212",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "#fff",
                fontSize: 14,
                fontFamily: FONT_GEIST,
                fontWeight: 500,
                padding: "12px 26px",
                borderRadius: 9,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.2s",
              }}
            >
              Try Flare <ArrowRight size={14} />
            </motion.button>
            <motion.button
              whileHover={{ background: "rgba(255,255,255,0.05)" }}
              whileTap={{ scale: 0.97 }}
              style={{
                background: "none",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "#fff",
                fontSize: 14,
                fontFamily: FONT_GEIST,
                padding: "12px 26px",
                borderRadius: 9,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              Book a Demo
            </motion.button>
          </div>
        </FadeIn>
      </div>

      {/* Workflow editor preview */}
      <div style={{ maxWidth: 1280, margin: "64px auto 0", padding: "0 28px" }}>
        <FadeIn delay={0.25}>
          <WorkflowPreview />
        </FadeIn>
      </div>
    </section>
  );
}
