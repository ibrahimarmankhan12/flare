import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { FadeIn } from "../ui/FadeIn";
import { FONT_GEIST } from "../lib/tokens";

export function CareersCTA() {
  return (
    <section
      style={{
        background: "#000000",
        padding: "60px 0 96px",
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
        }}
      >
        <FadeIn>
          <motion.img
            src="/flare-logo-512.webp"
            alt="Flare"
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              objectFit: "cover",
              margin: "0 auto 28px",
              display: "block",
              boxShadow: "0 18px 48px rgba(61,158,140,0.18)",
            }}
          />
          <h2
            className="font-cooper"
            style={{
              fontSize: "clamp(36px, 5vw, 64px)",
              fontWeight: 300,
              color: "#ffffff",
              lineHeight: 1.08,
              marginBottom: 36,
            }}
          >
            Want to help us build the future of Voice AI?
          </h2>
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
              padding: "14px 30px",
              borderRadius: 9,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              transition: "all 0.2s",
            }}
          >
            View Open Roles <ArrowRight size={14} />
          </motion.button>
        </FadeIn>
      </div>
    </section>
  );
}
