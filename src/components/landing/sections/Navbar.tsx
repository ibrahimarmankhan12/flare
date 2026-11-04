import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FONT_GEIST, RADIUS_SM, RADIUS_MD, EASE } from "../lib/tokens";
import { authClient } from "auth/client";

function useNavScrolled(threshold = 20) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > threshold);
    window.addEventListener("scroll", fn, { passive: true });
    fn();
    return () => window.removeEventListener("scroll", fn);
  }, [threshold]);
  return scrolled;
}

const navLinks: { label: string; href: string; items: string[] }[] = [
  { label: "About", href: "/about", items: [] },
  { label: "Blog", href: "/blog", items: [] },
  { label: "Pricing", href: "/plans", items: [] },
];

export function Navbar() {
  const scrolled = useNavScrolled();
  const [mobileOpen] = useState(false);
  const { data: session } = authClient.useSession();

  return (
    <>
      <motion.nav
        initial={{ y: -70, x: "-50%", opacity: 0 }}
        animate={{ y: 0, x: "-50%", opacity: 1 }}
        transition={{ duration: 0.75, ease: EASE }}
        style={{
          position: "fixed",
          top: scrolled ? 10 : 16,
          left: "50%",
          transform: "translateX(-50%)",
          width: "calc(100% - 32px)",
          maxWidth: 1280,
          zIndex: 100,
          background: scrolled ? "rgba(9,9,9,0.92)" : "rgba(9,9,9,0.65)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: scrolled
            ? "1px solid rgba(255,255,255,0.08)"
            : "1px solid rgba(255,255,255,0.04)",
          borderRadius: 14,
          boxShadow: scrolled ? "0 20px 40px rgba(0,0,0,0.5)" : "none",
          transition: "all 0.4s cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "0 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 60,
          }}
        >
          {/* ── Logo ── */}
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              textDecoration: "none",
              flexShrink: 0,
            }}
          >
            <motion.img
              src="/logo-icon.webp"
              alt="flare ai logo"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
              style={{
                width: 28,
                height: 28,
                objectFit: "contain",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                color: "#fff",
                fontSize: 18,
                fontWeight: 500,
                fontFamily: FONT_GEIST,
                letterSpacing: "-0.03em",
              }}
            >
              <span style={{ fontWeight: 800 }}>F</span>lare{" "}
              <span style={{ fontWeight: 800 }}>SH</span>
            </span>
          </Link>

          {/* ── Desktop nav links ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            {navLinks.map((link) => (
              <motion.a
                key={link.label}
                href={link.href}
                whileHover={{ color: "#fff" }}
                transition={{ duration: 0.15 }}
                style={{
                  color: "rgba(255,255,255,0.65)",
                  fontSize: 14,
                  fontFamily: FONT_GEIST,
                  padding: "6px 14px",
                  borderRadius: RADIUS_SM,
                  textDecoration: "none",
                }}
              >
                {link.label}
              </motion.a>
            ))}
          </div>

          {/* ── Right CTAs ── */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            {session ? (
              <Link href="/dashboard" style={{ textDecoration: "none" }}>
                <motion.button
                  whileHover={{ background: "#e8e8e8" }}
                  whileTap={{ scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  style={{
                    background: "#fff",
                    border: "none",
                    color: "#0a0a0a",
                    fontSize: 13,
                    fontFamily: FONT_GEIST,
                    fontWeight: 600,
                    padding: "7px 18px",
                    borderRadius: RADIUS_MD,
                    cursor: "pointer",
                    outline: "none",
                    transition: "background 0.18s cubic-bezier(0.22,1,0.36,1)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  Dashboard
                </motion.button>
              </Link>
            ) : (
              <>
                <Link href="/sign-in" style={{ textDecoration: "none" }}>
                  <motion.button
                    whileHover={{
                      borderColor: "rgba(255,255,255,0.35)",
                      color: "#fff",
                      background: "rgba(255,255,255,0.04)",
                    }}
                    whileTap={{ scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                    style={{
                      background: "transparent",
                      border: "1px solid rgba(255,255,255,0.14)",
                      color: "rgba(255,255,255,0.72)",
                      fontSize: 13,
                      fontFamily: FONT_GEIST,
                      fontWeight: 450,
                      padding: "7px 18px",
                      borderRadius: RADIUS_MD,
                      cursor: "pointer",
                      outline: "none",
                      transition: "all 0.2s cubic-bezier(0.22,1,0.36,1)",
                    }}
                  >
                    Sign In
                  </motion.button>
                </Link>
                <Link href="/sign-up" style={{ textDecoration: "none" }}>
                  <motion.button
                    whileHover={{ background: "#e8e8e8" }}
                    whileTap={{ scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                    style={{
                      background: "#fff",
                      border: "none",
                      color: "#0a0a0a",
                      fontSize: 13,
                      fontFamily: FONT_GEIST,
                      fontWeight: 600,
                      padding: "7px 18px",
                      borderRadius: RADIUS_MD,
                      cursor: "pointer",
                      outline: "none",
                      transition:
                        "background 0.18s cubic-bezier(0.22,1,0.36,1)",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    Sign Up
                  </motion.button>
                </Link>
              </>
            )}
          </div>
        </div>
      </motion.nav>

      {/* ── Mobile drawer ── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.28, ease: EASE }}
            style={{
              position: "fixed",
              top: 60,
              left: 0,
              right: 0,
              background: "rgba(9,9,9,0.98)",
              backdropFilter: "blur(28px)",
              zIndex: 99,
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              padding: "20px 28px",
            }}
          >
            {navLinks.map((link) => (
              <div
                key={link.label}
                style={{
                  padding: "12px 0",
                  color: "rgba(255,255,255,0.72)",
                  fontSize: 15,
                  fontFamily: FONT_GEIST,
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  cursor: "pointer",
                }}
              >
                {link.label}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
