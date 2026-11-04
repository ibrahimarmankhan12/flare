import Link from "next/link";
import { motion } from "framer-motion";
import {
  Github,
  Linkedin,
  Twitter,
  Youtube,
  MessageCircle,
} from "lucide-react";
import { TEAL, FONT_GEIST, EASE } from "../lib/tokens";

type FooterLink = { label: string; href: string; external?: boolean };

const columns: { title: string; links: FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Chat", href: "/sign-up" },
      { label: "Workflows", href: "/sign-up" },
      { label: "Agents", href: "/sign-up" },
      { label: "MCP Tools", href: "/sign-up" },
      { label: "Voice", href: "/sign-up" },
    ],
  },
  {
    title: "Use Cases",
    links: [
      { label: "Customer Support", href: "/sign-up" },
      { label: "Sales & Lead Qual", href: "/sign-up" },
      { label: "Notetakers", href: "/sign-up" },
      { label: "Collections", href: "/sign-up" },
      { label: "Healthcare", href: "/sign-up" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "About", href: "/about" },
      { label: "Blog", href: "/blog" },
      {
        label: "Documentation",
        href: "https://github.com/Flare-Labs/flare-ai",
        external: true,
      },
      { label: "Pricing", href: "/plans" },
      { label: "Careers", href: "/about" },
      {
        label: "GitHub",
        href: "https://github.com/Flare-Labs/flare-ai",
        external: true,
      },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy-policy" },
      { label: "Terms of Service", href: "/terms-of-service" },
      { label: "Cookies Policy", href: "/cookies-policy" },
      { label: "Refund Policy", href: "/refund-policy" },
      { label: "HIPAA Notice", href: "/privacy-policy" },
      { label: "Data Processing", href: "/privacy-policy" },
      { label: "Bug Bounty", href: "/bug-bounty" },
    ],
  },
];

const socials = [
  { Icon: Twitter, href: "https://twitter.com", label: "Twitter" },
  { Icon: Linkedin, href: "https://linkedin.com", label: "LinkedIn" },
  {
    Icon: Github,
    href: "https://github.com/Flare-Labs/flare-ai",
    label: "GitHub",
  },
  { Icon: Youtube, href: "https://youtube.com", label: "YouTube" },
  { Icon: MessageCircle, href: "https://t.me/VoidzeroX", label: "Telegram" },
];

function FooterAnchor({
  link,
  children,
}: {
  link: FooterLink;
  children: React.ReactNode;
}) {
  const style: React.CSSProperties = {
    fontSize: 12,
    fontFamily: FONT_GEIST,
    color: "rgba(255,255,255,0.45)",
    textDecoration: "none",
    transition: "color 0.15s",
    display: "inline-block",
  };

  if (link.external) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        style={style}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={link.href} style={style}>
      {children}
    </Link>
  );
}

export function Footer() {
  return (
    <footer
      style={{
        background: "#050505",
        borderTop: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "60px 28px 0" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.6fr 1fr 1fr 1fr 1fr",
            gap: 32,
          }}
        >
          {/* ── Brand column ── */}
          <div>
            <Link
              href="/"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 14,
                textDecoration: "none",
              }}
            >
              <img
                src="/flare-logo-512.webp"
                alt="Flare"
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  objectFit: "cover",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  color: "#fff",
                  fontSize: 15,
                  fontFamily: FONT_GEIST,
                  fontWeight: 600,
                }}
              >
                Flare AI
              </span>
            </Link>

            <p
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.42)",
                fontFamily: FONT_GEIST,
                lineHeight: 1.65,
                marginBottom: 20,
                maxWidth: 280,
                margin: "0 0 20px",
              }}
            >
              One open platform for every AI model, tool, and workflow. Bring
              your own keys; ship agents that work end-to-end.
            </p>

            <p
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.28)",
                fontFamily: FONT_GEIST,
                lineHeight: 1.7,
                marginBottom: 22,
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                margin: "0 0 22px",
              }}
            >
              311, California Street, 320 Suite
              <br />
              San Francisco, CA 94104
            </p>

            {/* Socials */}
            <div style={{ display: "flex", gap: 7, marginBottom: 22 }}>
              {socials.map(({ Icon, href, label }) => (
                <motion.a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  whileHover={{ borderColor: TEAL, color: TEAL, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ duration: 0.18 }}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "rgba(255,255,255,0.55)",
                    cursor: "pointer",
                    textDecoration: "none",
                  }}
                >
                  <Icon size={14} strokeWidth={1.6} />
                </motion.a>
              ))}
            </div>

            {/* Status */}
            <a
              href="https://github.com/Flare-Labs/flare-ai"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                textDecoration: "none",
              }}
            >
              <motion.div
                animate={{ opacity: [1, 0.35, 1] }}
                transition={{ duration: 2.2, repeat: Infinity }}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#22c55e",
                  boxShadow: "0 0 10px rgba(34,197,94,0.55)",
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  fontFamily: FONT_GEIST,
                  color: "rgba(255,255,255,0.42)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                All systems operational
              </span>
            </a>
          </div>

          {/* ── Link columns ── */}
          {columns.map((col) => (
            <div key={col.title}>
              <h4
                style={{
                  fontSize: 13,
                  fontFamily: FONT_GEIST,
                  fontWeight: 600,
                  color: "#fff",
                  marginBottom: 18,
                  letterSpacing: "-0.005em",
                }}
              >
                {col.title}
              </h4>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 11 }}
              >
                {col.links.map((link) => (
                  <FooterAnchor key={link.label} link={link}>
                    <motion.span
                      whileHover={{ x: 3, color: "rgba(255,255,255,0.85)" }}
                      style={{
                        display: "inline-block",
                        transition: "color 0.15s",
                      }}
                    >
                      {link.label}
                    </motion.span>
                  </FooterAnchor>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Giant watermark wordmark */}
        <div style={{ marginTop: 56, overflow: "hidden" }}>
          <motion.p
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 1.2, ease: EASE }}
            className="font-cooper"
            style={{
              fontSize: "clamp(76px, 13vw, 186px)",
              fontWeight: 300,
              color: "rgba(255,255,255,0.05)",
              lineHeight: 0.86,
              letterSpacing: "-0.03em",
              userSelect: "none",
              whiteSpace: "nowrap",
              margin: 0,
            }}
          >
            Flare AI
          </motion.p>
        </div>

        {/* Bottom strip */}
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.05)",
            padding: "20px 0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
            marginTop: -8,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontFamily: FONT_GEIST,
              color: "rgba(255,255,255,0.32)",
            }}
          >
            © {new Date().getFullYear()} Flare AI. All rights reserved.
          </span>
          <div style={{ display: "flex", gap: 18 }}>
            <Link
              href="/privacy-policy"
              style={{
                fontSize: 11,
                fontFamily: FONT_GEIST,
                color: "rgba(255,255,255,0.32)",
                textDecoration: "none",
              }}
            >
              Privacy
            </Link>
            <Link
              href="/terms-of-service"
              style={{
                fontSize: 11,
                fontFamily: FONT_GEIST,
                color: "rgba(255,255,255,0.32)",
                textDecoration: "none",
              }}
            >
              Terms
            </Link>
            <Link
              href="/cookies-policy"
              style={{
                fontSize: 11,
                fontFamily: FONT_GEIST,
                color: "rgba(255,255,255,0.32)",
                textDecoration: "none",
              }}
            >
              Cookies
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
