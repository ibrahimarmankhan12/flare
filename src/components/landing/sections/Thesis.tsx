import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { FadeIn } from "../ui/FadeIn";
import { TEAL, FONT_GEIST, EASE } from "../lib/tokens";

const paragraphs = [
  `The frontier of AI is no longer a single model — it is a stack. Every week a new state-of-the-art ships from a different lab, each with its own API, pricing, and quirks. Teams burn weeks gluing providers together before they ever ship anything that touches a user.\n\nLock-in is the silent tax on every AI roadmap. Switching a model means rewriting prompts, swapping SDKs, re-running evals. Adding a tool means another integration, another credential, another point of failure. The promise of intelligence as a utility has stalled at the seams between providers.`,
  `Flare is our answer. One open, model-agnostic surface where every major LLM, every tool, every workflow lives side-by-side and composes cleanly. Bring your own keys. Switch models mid-conversation. Wire up MCP servers in a click. Build agents visually, deploy them on voice, chat, or API — without touching glue code.\n\nIntelligence should be infrastructure, and infrastructure should belong to the people building on it. The Flare thesis is that the winners of this wave will treat AI the way they treat their database: open, composable, observable, and owned end-to-end by the team using it.`,
];

export function Thesis() {
  return (
    <section style={{ background: "#000000", padding: "96px 0" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 28px" }}>
        <FadeIn>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 56,
              gap: 20,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2
                className="font-cooper"
                style={{
                  fontSize: "clamp(32px, 4.5vw, 58px)",
                  fontWeight: 300,
                  color: "#ffffff",
                  marginBottom: 14,
                }}
              >
                The Flare AI Thesis
              </h2>
              <motion.div
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.9, ease: EASE }}
                style={{ width: 220, height: 2, background: TEAL, originX: 0 }}
              />
            </div>
            <motion.button
              whileHover={{ background: "#ffffff", color: "#000000" }}
              whileTap={{ scale: 0.97 }}
              style={{
                background: "#121212",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "#fff",
                fontSize: 13,
                fontFamily: FONT_GEIST,
                fontWeight: 500,
                padding: "11px 22px",
                borderRadius: 9,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.2s",
                marginTop: 8,
                alignSelf: "flex-start",
              }}
            >
              View Full Thesis <ArrowRight size={14} />
            </motion.button>
          </div>
        </FadeIn>

        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56 }}
        >
          {paragraphs.map((text, i) => (
            <FadeIn key={i} delay={i * 0.14}>
              <p
                style={{
                  fontSize: 14,
                  color: "rgba(255,255,255,0.65)",
                  fontFamily: FONT_GEIST,
                  lineHeight: 1.9,
                  whiteSpace: "pre-line",
                }}
              >
                {text}
              </p>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
