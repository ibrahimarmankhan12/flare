import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Marquee } from "../ui/Marquee";
import { FONT_GEIST, EASE } from "../lib/tokens";
import { InteractiveConsole } from "../ui/InteractiveConsole";

const partners = [
  { name: "neon", src: "/partners/neon.svg", filter: "none" },
  {
    name: "nvidia",
    src: "/partners/Nvidia-Light-Horizontal-Logo.wine.svg",
    filter: "none",
  },
  { name: "cc5a", src: "/partners/cc5a.svg", filter: "invert(1)" },
  {
    name: "partner4",
    src: "/partners/image_5.png",
    filter: "invert(1) hue-rotate(180deg)",
  },
  { name: "modal", src: "/partners/modal.svg", filter: "none" },
  { name: "partner7", src: "/partners/image_7.png", filter: "invert(1)" },
];

export function Hero() {
  const { scrollY } = useScroll();
  const heroOpacity = useTransform(scrollY, [0, 500], [1, 0]);
  const heroY = useTransform(scrollY, [0, 600], [0, -80]);

  return (
    <section
      style={{
        background: "#000000",
        backgroundImage:
          "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
        minHeight: "100vh",
        paddingTop: 58,
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Scanning laser line on dotted grid ── */}
      <motion.div
        animate={{ top: ["0%", "100%", "0%"] }}
        transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          height: 1,
          background:
            "linear-gradient(90deg, transparent 0%, rgba(61,158,140,0.25) 20%, rgba(61,158,140,0.45) 50%, rgba(61,158,140,0.25) 80%, transparent 100%)",
          boxShadow:
            "0 0 20px rgba(61,158,140,0.15), 0 0 60px rgba(61,158,140,0.06)",
          pointerEvents: "none",
          zIndex: 2,
        }}
      />

      {/* Center — background Flare Logo decoration */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: 600,
          height: 600,
          pointerEvents: "none",
          zIndex: 1,
        }}
      >
        <motion.img
          src="/flare-logo-512.webp"
          alt="Flare Logo"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.18 }}
          transition={{ duration: 1.4, delay: 0.5, ease: EASE }}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </div>

      {/* Main content */}
      <motion.div
        style={{
          y: heroY,
          opacity: heroOpacity,
          flex: 1,
          maxWidth: 1280,
          margin: "0 auto",
          width: "100%",
          padding: "140px 32px 48px",
          position: "relative",
          zIndex: 3,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            gap: "56px",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          {/* Left Column: Headline and CTAs */}
          <div
            style={{
              flex: "1 1 540px",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
            }}
          >
            {/* Headline */}
            <div style={{ width: "100%", textAlign: "left" }}>
              {["The Intelligence Layer", "for Modern AI", "Conversations"].map(
                (line, i) => (
                  <div key={i} style={{ overflow: "hidden" }}>
                    <motion.h1
                      className="font-cooper"
                      initial={{ y: 80, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{
                        duration: 0.85,
                        delay: 0.12 + i * 0.1,
                        ease: EASE,
                      }}
                      style={{
                        fontSize: "clamp(38px, 5.2vw, 70px)",
                        color: "#fff",
                        fontWeight: 300,
                        lineHeight: 1.1,
                        letterSpacing: "-0.02em",
                        margin: 0,
                        paddingBottom: 2,
                      }}
                    >
                      {line}
                    </motion.h1>
                  </div>
                ),
              )}
            </div>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.6, ease: EASE }}
              style={{
                color: "rgba(255,255,255,0.48)",
                fontSize: 16,
                fontFamily: FONT_GEIST,
                marginTop: 22,
                marginBottom: 36,
                maxWidth: 420,
                lineHeight: 1.55,
                textAlign: "left",
              }}
            >
              Driving the future of small, efficient multi-modal models
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.72, ease: EASE }}
              style={{ display: "flex", gap: 16, alignItems: "center" }}
            >
              <Link href="/about" style={{ textDecoration: "none" }}>
                <motion.div
                  whileHover={{
                    background: "rgba(255,255,255,0.12)",
                    borderColor: "rgba(255,255,255,0.3)",
                  }}
                  whileTap={{ scale: 0.97 }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    color: "#fff",
                    fontSize: 14,
                    fontFamily: FONT_GEIST,
                    fontWeight: 500,
                    padding: "12px 26px",
                    borderRadius: 10,
                    cursor: "pointer",
                    transition: "all 0.2s cubic-bezier(0.22,1,0.36,1)",
                  }}
                >
                  About us <ArrowRight size={14} />
                </motion.div>
              </Link>
              <Link href="/sign-up" style={{ textDecoration: "none" }}>
                <motion.div
                  whileHover={{ opacity: 0.9, scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    background:
                      "linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%)",
                    border: "none",
                    color: "#0a0a0a",
                    fontSize: 14,
                    fontFamily: FONT_GEIST,
                    fontWeight: 600,
                    padding: "12px 26px",
                    borderRadius: 10,
                    cursor: "pointer",
                    transition: "all 0.2s cubic-bezier(0.22,1,0.36,1)",
                    boxShadow: "0 4px 14px rgba(255,255,255,0.1)",
                  }}
                >
                  Get started <ArrowRight size={14} />
                </motion.div>
              </Link>
            </motion.div>
          </div>

          {/* Right Column: Simulated Terminal Playground */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.85, delay: 0.4, ease: EASE }}
            style={{
              flex: "1 1 450px",
              display: "flex",
              justifyContent: "center",
              zIndex: 4,
            }}
          >
            <InteractiveConsole />
          </motion.div>
        </div>
      </motion.div>

      {/* Bottom partner logos strip */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.9, ease: EASE }}
        style={{
          borderTop: "1px solid rgba(255,255,255,0.07)",
          padding: "24px 0",
          position: "relative",
          zIndex: 3,
          maxWidth: "100%",
          background:
            "linear-gradient(180deg, rgba(9,9,9,0) 0%, rgba(13,13,13,0.5) 100%)",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            WebkitMaskImage:
              "linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%)",
            maskImage:
              "linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%)",
          }}
        >
          <Marquee
            direction="right"
            speed={15}
            items={partners.map((partner) => (
              <div
                key={partner.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  cursor: "pointer",
                }}
              >
                <img
                  src={partner.src}
                  alt={`${partner.name} logo`}
                  style={{
                    height:
                      partner.src.includes("image_6.png") ||
                      partner.src.includes(
                        "Nvidia-Light-Horizontal-Logo.wine.svg",
                      )
                        ? 60
                        : 24,
                    maxWidth:
                      partner.src.includes("image_6.png") ||
                      partner.src.includes(
                        "Nvidia-Light-Horizontal-Logo.wine.svg",
                      )
                        ? 250
                        : 130,
                    objectFit: "contain",
                    opacity: 0.8,
                    filter: partner.filter,
                    transition: "all 0.3s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = "1";
                    e.currentTarget.style.transform = "scale(1.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = "0.8";
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                />
              </div>
            ))}
          />
        </div>
      </motion.div>
    </section>
  );
}
