import { motion } from "framer-motion";
import {
  ArrowRight,
  HeartPulse,
  ShieldCheck,
  Lock,
  BadgeCheck,
} from "lucide-react";
import { FadeIn } from "../ui/FadeIn";
import { staggerContainer, staggerItem } from "../lib/motion";
import { TEAL, FONT_GEIST } from "../lib/tokens";

const certs = [
  {
    icon: HeartPulse,
    code: "HIPAA",
    label: "HIPAA",
    description:
      "Compliant handling of protected health information across all transit and storage.",
  },
  {
    icon: ShieldCheck,
    code: "SOC2",
    label: "SOC 2 Type II",
    description:
      "Aligned with the AICPA Trust Services Criteria for security, availability, and confidentiality.",
  },
  {
    icon: Lock,
    code: "GDPR",
    label: "GDPR",
    description:
      "EU-grade privacy and data-protection practices — full data subject rights, fast deletion, regional storage.",
  },
  {
    icon: BadgeCheck,
    code: "ISO",
    label: "ISO 27001",
    description:
      "ISMS controls aligned to ISO/IEC 27001 — risk-based security, audited end-to-end.",
  },
];

export function EnterpriseSecurity() {
  return (
    <section
      style={{
        background: "#050505",
        padding: "120px 0",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Soft ambient glow */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          top: "15%",
          transform: "translateX(-50%)",
          width: 900,
          height: 420,
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
              maxWidth: 720,
              margin: "0 auto 64px",
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
              Security & Compliance
            </p>
            <h2
              className="font-cooper"
              style={{
                fontSize: "clamp(32px, 4.4vw, 56px)",
                fontWeight: 300,
                color: "#fff",
                lineHeight: 1.08,
                letterSpacing: "-0.01em",
                marginBottom: 16,
              }}
            >
              Built for the way enterprises ship.
            </h2>
            <p
              style={{
                color: "rgba(255,255,255,0.5)",
                fontSize: 15,
                fontFamily: FONT_GEIST,
                lineHeight: 1.65,
                marginBottom: 28,
                margin: "0 0 28px",
              }}
            >
              Your data lives behind the same controls your security team
              already audits — SOC 2, HIPAA, GDPR, ISO 27001, in the cloud or
              on-prem.
            </p>
            <motion.button
              whileHover={{
                background: "rgba(255,255,255,0.06)",
                borderColor: "rgba(255,255,255,0.32)",
              }}
              whileTap={{ scale: 0.97 }}
              style={{
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.16)",
                color: "#fff",
                fontSize: 13,
                fontFamily: FONT_GEIST,
                fontWeight: 500,
                padding: "10px 20px",
                borderRadius: 9,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                transition: "all 0.2s",
              }}
            >
              Security docs <ArrowRight size={13} />
            </motion.button>
          </div>
        </FadeIn>

        {/* ── Cards ── */}
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
          {certs.map((cert) => {
            const Icon = cert.icon;
            return (
              <motion.div
                key={cert.label}
                variants={staggerItem}
                whileHover={{
                  y: -3,
                  borderColor: "rgba(61,158,140,0.32)",
                }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                style={{
                  background: "rgba(255,255,255,0.025)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 14,
                  padding: 22,
                  fontFamily: FONT_GEIST,
                  backdropFilter: "blur(8px)",
                  transition: "all 0.25s",
                }}
              >
                {/* Top row: icon + small code chip */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 20,
                  }}
                >
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 9,
                      background: "rgba(61,158,140,0.10)",
                      border: "1px solid rgba(61,158,140,0.22)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon size={16} color={TEAL} strokeWidth={1.8} />
                  </div>
                  <span
                    style={{
                      fontSize: 9.5,
                      letterSpacing: "0.08em",
                      color: "rgba(255,255,255,0.42)",
                      fontWeight: 600,
                      padding: "3px 7px",
                      borderRadius: 4,
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    {cert.code}
                  </span>
                </div>

                <h3
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: "#fff",
                    margin: 0,
                    marginBottom: 8,
                    letterSpacing: "-0.005em",
                  }}
                >
                  {cert.label}
                </h3>

                <p
                  style={{
                    fontSize: 12.5,
                    color: "rgba(255,255,255,0.5)",
                    lineHeight: 1.6,
                    margin: 0,
                  }}
                >
                  {cert.description}
                </p>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
