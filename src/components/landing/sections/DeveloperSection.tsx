import { motion } from "framer-motion";
import { Bell } from "lucide-react";
import { FadeIn } from "../ui/FadeIn";
import { FONT_GEIST, EASE, TEAL, TEAL_LIGHT, TEAL_DARK } from "../lib/tokens";

const ACCENT = TEAL;
const ACCENT_SOFT = TEAL_LIGHT;
const ACCENT_DARK = TEAL_DARK;
const LINE = "rgba(255,255,255,0.7)";
const LINE_DIM = "rgba(255,255,255,0.35)";

/* ────────────────────────────────────────────────────────────────────────────
   Custom infrastructure illustration (SVG, isometric line-art style)
   ──────────────────────────────────────────────────────────────────────── */
function InfraIllustration() {
  return (
    <svg
      viewBox="0 0 800 520"
      style={{ width: "100%", height: "auto", display: "block" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Orange radial glow under centerpiece */}
        <radialGradient id="orangeGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor={ACCENT} stopOpacity={0.55} />
          <stop offset="40%"  stopColor={ACCENT} stopOpacity={0.22} />
          <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
        </radialGradient>

        {/* Conical light beam shooting up from disc */}
        <linearGradient id="beamGrad" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%"   stopColor={ACCENT} stopOpacity={0.45} />
          <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
        </linearGradient>

        {/* Subtle disc gradient */}
        <linearGradient id="discTop" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor={ACCENT_SOFT} />
          <stop offset="100%" stopColor={ACCENT_DARK} />
        </linearGradient>

        {/* Slight glow filter for orange elements */}
        <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ── Background glow halo behind centerpiece ── */}
      <ellipse cx="400" cy="320" rx="220" ry="110" fill="url(#orangeGlow)" />

      {/* ── Top-left cloud ── */}
      <g stroke={LINE} strokeWidth="1.4" fill="none" strokeLinejoin="round">
        <path d="M 100 90 q -22 0 -22 22 q 0 22 22 22 h 70 q 22 0 22 -22 q 0 -22 -22 -22 q -5 -16 -22 -16 q -17 0 -22 16 z" />
        <path d="M 100 134 l 14 14 q 5 5 12 5 h 64 q 7 0 12 -5 l 14 -14" opacity="0.55" />
        <path d="M 178 90 l 14 -10" opacity="0.6" />
      </g>

      {/* ── Top-right small cloud ── */}
      <g stroke={LINE} strokeWidth="1.4" fill="none" strokeLinejoin="round">
        <path d="M 540 70 q -16 0 -16 16 q 0 16 16 16 h 54 q 16 0 16 -16 q 0 -16 -16 -16 q -4 -12 -16 -12 q -12 0 -16 12 z" />
        <path d="M 540 102 l 10 10 q 4 4 9 4 h 48 q 5 0 9 -4 l 10 -10" opacity="0.55" />
      </g>

      {/* ── Connection wires ── */}
      <g stroke={LINE_DIM} strokeWidth="1.1" fill="none" strokeLinecap="round">
        <path d="M 240 360 C 290 360, 320 340, 360 320" />
        <path d="M 440 340 C 480 360, 540 380, 590 380" />
        <path d="M 590 380 C 620 380, 640 380, 670 360" />
        <path d="M 270 410 C 320 420, 360 420, 400 410" strokeDasharray="3 4" />
      </g>

      {/* ── Server stack (left) ── isometric line-art ── */}
      <g stroke={LINE} strokeWidth="1.4" fill="#0a0a0a" strokeLinejoin="round">
        {/* Bottom box base */}
        <path d="M 90 430 l 90 -45 l 90 45 l -90 45 z" />
        <path d="M 90 430 v 38 l 90 45 v -38 z" />
        <path d="M 180 475 l 90 -45 v 38 l -90 45 z" />
        {/* Bottom box details — vent & dial */}
        <circle cx="120" cy="455" r="6" fill="none" />
        <rect x="190" y="478" width="38" height="6" rx="2" fill="none" transform="skewX(-30)" />

        {/* Middle box */}
        <path d="M 110 380 l 80 -40 l 80 40 l -80 40 z" />
        <path d="M 110 380 v 18 l 80 40 v -18 z" />
        <path d="M 190 420 l 80 -40 v 18 l -80 40 z" />

        {/* Top box (smaller — the brain unit) */}
        <path d="M 130 332 l 60 -30 l 60 30 l -60 30 z" />
        <path d="M 130 332 v 14 l 60 30 v -14 z" />
        <path d="M 190 362 l 60 -30 v 14 l -60 30 z" />
        {/* Top platter inset */}
        <path d="M 152 335 l 38 -19 l 38 19 l -38 19 z" fill="#161616" opacity="0.9" />
        <path d="M 168 333 l 22 -11 l 22 11 l -22 11 z" fill="none" strokeDasharray="2 3" />
      </g>

      {/* Brain / blob with orange dot on top of stack */}
      <g transform="translate(190 300)">
        <path
          d="M -10 0 c -8 -8 -2 -22 8 -22 c 2 -10 14 -10 16 -2 c 10 -2 16 8 12 16 c 4 8 -4 18 -14 14 c -6 8 -20 4 -22 -6 z"
          fill="none"
          stroke={LINE}
          strokeWidth="1.4"
          strokeDasharray="2 3"
        />
        <circle cx="3" cy="-4" r="6" fill={ACCENT} filter="url(#softGlow)" />
      </g>

      {/* ── Centerpiece: glowing orange disc with lightning Z ── */}
      <g transform="translate(400 360)">
        {/* upward conical beam */}
        <path
          d="M -60 0 L -25 -160 L 25 -160 L 60 0 Z"
          fill="url(#beamGrad)"
          opacity="0.9"
        />

        {/* disc base — ellipse for isometric */}
        <ellipse cx="0" cy="14" rx="78" ry="20" fill="#06140f" stroke={LINE} strokeWidth="1.2" />
        <ellipse cx="0" cy="6"  rx="78" ry="20" fill="url(#discTop)" />
        <ellipse cx="0" cy="6"  rx="78" ry="20" fill="none" stroke="#9fdfd1" strokeWidth="1.2" opacity="0.7" />

        {/* lightning Z bolt */}
        <path
          d="M -16 -16 L 16 -16 L -4 6 L 16 6 L -8 30 L 4 6 L -16 6 Z"
          fill="#fff"
          opacity="0.96"
          filter="url(#softGlow)"
        />
      </g>

      {/* ── Small connector node (bottom centre) ── */}
      <g transform="translate(540 450)" stroke={LINE} strokeWidth="1.3" fill="#0a0a0a">
        <path d="M -12 0 l 12 -8 l 12 8 l -12 8 z" />
        <path d="M -12 0 v 8 l 12 8 v -8 z" />
        <path d="M 0 8 l 12 -8 v 8 l -12 8 z" />
      </g>

      {/* ── Connector node near server (small) ── */}
      <g transform="translate(290 370)" stroke={LINE} strokeWidth="1.3" fill="#0a0a0a">
        <path d="M -14 0 l 14 -9 l 14 9 l -14 9 z" />
        <path d="M -14 0 v 7 l 14 9 v -7 z" />
        <path d="M 0 9 l 14 -9 v 7 l -14 9 z" />
        <circle cx="0" cy="3" r="3" fill="none" stroke={LINE} />
      </g>

      {/* ── Code editor window (right) ── */}
      <g transform="translate(590 60)">
        {/* Outer window frame */}
        <g stroke={LINE} strokeWidth="1.4" fill="#0a0a0a" strokeLinejoin="round">
          <rect x="0" y="0" width="200" height="270" rx="6" />
          <rect x="0" y="0" width="200" height="22" rx="6" fill="#141414" />
        </g>

        {/* Title bar text */}
        <text
          x="10"
          y="15"
          fontSize="9"
          fontFamily="Geist, sans-serif"
          fill="rgba(255,255,255,0.55)"
        >
          index.js
        </text>
        {/* Close X */}
        <g transform="translate(186 11)" stroke={LINE} strokeWidth="1.2">
          <line x1="-3" y1="-3" x2="3" y2="3" />
          <line x1="3" y1="-3" x2="-3" y2="3" />
        </g>

        {/* Code lines */}
        <g fill={LINE}>
          <rect x="14" y="36" width="120" height="3.5" rx="1.5" />
          <rect x="14" y="52" width="160" height="3.5" rx="1.5" />
          <rect x="14" y="68" width="100" height="3.5" rx="1.5" />
          <rect x="14" y="84" width="140" height="3.5" rx="1.5" />
          <rect x="14" y="100" width="80"  height="3.5" rx="1.5" />
          <rect x="14" y="116" width="170" height="3.5" rx="1.5" />
          <rect x="14" y="132" width="120" height="3.5" rx="1.5" />
        </g>

        {/* Footer / status strip with bullets */}
        <rect x="0" y="186" width="200" height="50" fill="#141414" stroke={LINE} strokeWidth="1.2" />
        <g fill={LINE}>
          <circle cx="14" cy="198" r="2" />
          <rect x="22" y="196.5" width="60" height="3" rx="1.5" />
          <circle cx="14" cy="210" r="2" />
          <rect x="22" y="208.5" width="80" height="3" rx="1.5" />
          <circle cx="14" cy="222" r="2" />
          <rect x="22" y="220.5" width="50" height="3" rx="1.5" />
        </g>
        {/* Bottom command bar */}
        <rect x="0" y="236" width="200" height="34" fill="#0a0a0a" stroke={LINE} strokeWidth="1.2" />
        <g fill={LINE}>
          <rect x="14" y="248" width="140" height="3" rx="1.5" />
          <rect x="14" y="256" width="110" height="3" rx="1.5" />
        </g>
      </g>

      {/* ── Gear (far right) ── */}
      <g transform="translate(740 240)" stroke={LINE} strokeWidth="1.4" fill="none">
        <circle cx="0" cy="0" r="14" />
        <circle cx="0" cy="0" r="5" />
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i / 8) * Math.PI * 2;
          const x1 = Math.cos(a) * 14;
          const y1 = Math.sin(a) * 14;
          const x2 = Math.cos(a) * 19;
          const y2 = Math.sin(a) * 19;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
      </g>
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Section
   ──────────────────────────────────────────────────────────────────────── */
export function DeveloperSection() {
  return (
    <section style={{ background: "#000", padding: "120px 0", position: "relative", overflow: "hidden" }}>
      {/* Subtle orange ambient glow */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "55%",
          top: "50%",
          transform: "translate(-50%,-50%)",
          width: 900,
          height: 500,
          background:
            "radial-gradient(ellipse at center, rgba(61,158,140,0.12) 0%, rgba(61,158,140,0) 60%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "0 28px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.3fr",
            gap: 64,
            alignItems: "center",
          }}
        >
          {/* ── Text ── */}
          <FadeIn>
            <div>
              <motion.div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  border: `1px solid ${ACCENT}`,
                  borderRadius: 999,
                  padding: "4px 12px",
                  fontSize: 11,
                  fontFamily: FONT_GEIST,
                  color: ACCENT,
                  letterSpacing: "0.08em",
                  marginBottom: 26,
                  background: "rgba(61,158,140,0.06)",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: ACCENT,
                    boxShadow: `0 0 8px ${ACCENT}`,
                  }}
                />
                COMING SOON
              </motion.div>

              <h2
                className="font-cooper"
                style={{
                  fontSize: "clamp(36px, 4.4vw, 60px)",
                  fontWeight: 300,
                  color: "#fff",
                  lineHeight: 1.06,
                  marginBottom: 18,
                  letterSpacing: "-0.01em",
                }}
              >
                Flare cloud Infra.
              </h2>

              <p
                style={{
                  fontSize: 16,
                  color: "rgba(255,255,255,0.62)",
                  fontFamily: FONT_GEIST,
                  marginBottom: 34,
                  lineHeight: 1.65,
                }}
              >
                GPUs and VPS — purpose-built compute for running, scaling, and serving
                your agents and models on a network we own end-to-end.
              </p>

              <motion.button
                whileHover={{
                  background: ACCENT,
                  color: "#000",
                  boxShadow: `0 12px 32px ${ACCENT}55`,
                }}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.2, ease: EASE }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  border: `1px solid ${ACCENT}`,
                  background: "transparent",
                  color: ACCENT,
                  fontSize: 13,
                  fontFamily: FONT_GEIST,
                  fontWeight: 600,
                  padding: "11px 22px",
                  borderRadius: 9,
                  cursor: "pointer",
                }}
              >
                <Bell size={13} />
                Notify me at launch
              </motion.button>
            </div>
          </FadeIn>

          {/* ── Illustration ── */}
          <FadeIn delay={0.14}>
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.9, ease: EASE }}
              style={{ width: "100%" }}
            >
              <InfraIllustration />
            </motion.div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
