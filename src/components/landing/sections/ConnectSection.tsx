import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { FadeIn } from "../ui/FadeIn";
import { FONT_GEIST, SHADOW_TEAL } from "../lib/tokens";

export function ConnectSection() {
  return (
    <section
      style={{
        background: "#050505",
        padding: "96px 0 80px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          maxWidth: 640,
          margin: "0 auto",
          padding: "0 28px",
          textAlign: "center",
          position: "relative",
          zIndex: 2,
        }}
      >
        <FadeIn>
          <motion.img
            src="/flare-logo-512.webp"
            alt="Flare"
            initial={{ opacity: 0, scale: 0.85 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              objectFit: "cover",
              display: "block",
              margin: "0 auto 24px",
              boxShadow: SHADOW_TEAL,
            }}
          />
          <h2
            className="font-cooper"
            style={{
              fontSize: "clamp(32px, 5vw, 56px)",
              fontWeight: 300,
              color: "#fff",
              marginBottom: 14,
            }}
          >
            Connect with us
          </h2>
          <p
            style={{
              fontSize: 14,
              color: "rgba(255,255,255,0.42)",
              fontFamily: FONT_GEIST,
              marginBottom: 34,
              lineHeight: 1.65,
            }}
          >
            Explore how Flare AI can transform your enterprise
          </p>
          <motion.button
            whileHover={{
              background: "#1e1e1e",
              borderColor: "rgba(255,255,255,0.32)",
            }}
            whileTap={{ scale: 0.97 }}
            style={{
              background: "#181818",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#fff",
              fontSize: 14,
              fontFamily: FONT_GEIST,
              padding: "13px 28px",
              borderRadius: 9,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              transition: "all 0.25s",
            }}
          >
            Contact Sales <ArrowRight size={14} />
          </motion.button>
        </FadeIn>
      </div>
    </section>
  );
}
