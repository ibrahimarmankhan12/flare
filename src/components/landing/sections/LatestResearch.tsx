import { motion } from "framer-motion";
import { FadeIn } from "../ui/FadeIn";
import { staggerContainer, staggerItem, EASE } from "../lib/motion";
import { TEAL, FONT_GEIST } from "../lib/tokens";

export function LatestResearch() {
  return (
    <section
      style={{
        background: "#000000",
        backgroundImage:
          "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
        padding: "0 0 120px",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 28px" }}>
        {/* ── Header ── */}
        <FadeIn>
          <div style={{ marginBottom: 56, maxWidth: 720 }}>
            <motion.div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                border: `1px solid ${TEAL}`,
                borderRadius: 999,
                padding: "4px 12px",
                fontSize: 11,
                fontFamily: FONT_GEIST,
                color: TEAL,
                letterSpacing: "0.08em",
                marginBottom: 22,
                background: "rgba(61,158,140,0.06)",
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: TEAL,
                  boxShadow: `0 0 8px ${TEAL}`,
                }}
              />
              COMING SOON
            </motion.div>

            <h2
              className="font-cooper"
              style={{
                fontSize: "clamp(32px, 4.5vw, 58px)",
                fontWeight: 300,
                color: "#ffffff",
                lineHeight: 1.08,
                letterSpacing: "-0.01em",
                marginBottom: 16,
              }}
            >
              Latest Research X{" "}
              <span style={{ fontFamily: FONT_GEIST, fontWeight: 400 }}>
                Flare
              </span>{" "}
              Labs
            </h2>

            <p
              style={{
                fontSize: 15,
                color: "rgba(255,255,255,0.48)",
                fontFamily: FONT_GEIST,
                lineHeight: 1.65,
                margin: 0,
                maxWidth: 540,
              }}
            >
              Our applied-research lab is spinning up. Expect papers, open
              weights, and reproducible experiments on every hard problem we hit
              while building Flare.
            </p>
          </div>
        </FadeIn>

        {/* ── Skeleton placeholder cards (suggest 3 future papers) ── */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 24,
            marginBottom: 40,
          }}
        >
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              variants={staggerItem}
              style={{
                position: "relative",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 14,
                padding: 24,
                fontFamily: FONT_GEIST,
                background: "#080808",
                overflow: "hidden",
              }}
            >
              {/* Shimmer overlay */}
              <motion.div
                aria-hidden
                animate={{ x: ["-100%", "200%"] }}
                transition={{
                  duration: 2.4,
                  repeat: Infinity,
                  ease: "linear",
                  delay: i * 0.4,
                }}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "60%",
                  background:
                    "linear-gradient(90deg, transparent 0%, rgba(61,158,140,0.06) 50%, transparent 100%)",
                  pointerEvents: "none",
                }}
              />

              {/* Soon tag + year */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 18,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: TEAL,
                    fontWeight: 600,
                    padding: "3px 8px",
                    borderRadius: 4,
                    background: "rgba(61,158,140,0.15)",
                  }}
                >
                  Soon
                </span>
                <span style={{ fontSize: 11, color: "#666" }}>2026</span>
              </div>

              {/* Faux title bars */}
              <div
                style={{
                  height: 9,
                  background: "#1c1c1c",
                  borderRadius: 4,
                  marginBottom: 6,
                  width: "85%",
                }}
              />
              <div
                style={{
                  height: 9,
                  background: "#1c1c1c",
                  borderRadius: 4,
                  marginBottom: 16,
                  width: "65%",
                }}
              />

              <motion.div
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.65, ease: EASE }}
                style={{
                  width: 48,
                  height: 2,
                  background: "#2a2a2a",
                  marginBottom: 18,
                  originX: 0,
                }}
              />

              {/* Faux summary bars */}
              {[100, 95, 88, 70].map((w, j) => (
                <div
                  key={j}
                  style={{
                    height: 6,
                    background: "#121212",
                    borderRadius: 3,
                    marginBottom: 8,
                    width: `${w}%`,
                  }}
                />
              ))}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
