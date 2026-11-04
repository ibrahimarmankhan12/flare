"use client";

/**
 * Centered Flare logo decoration for the empty flex-1 slot in the
 * (auth) split-screen layout.
 *
 * Visual: the existing /flare-logo-192.webp logo, scaled larger than
 * the header version, centered. Behind it, a soft radial gradient
 * blob that pulses (opacity loop) and the logo itself has a slow,
 * subtle scale loop. Both animations are wrapped in
 * `useReducedMotion` checks so users who opted out of motion get a
 * static logo. No new assets — reuses the same webp as the top-left
 * header.
 */

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";

export function AuthIntroDecoration() {
  const reducedMotion = useReducedMotion();

  return (
    <div className="flex-1 flex items-center justify-center relative">
      {/* Soft pulsing radial blob behind the logo. Sits below the
          logo in the stacking order; absolute so it doesn't push the
          flex centering around. */}
      <motion.div
        aria-hidden
        className="absolute inset-0 m-auto h-56 w-56 rounded-full bg-[radial-gradient(circle_at_center,theme(colors.primary/0.25),transparent_70%)]"
        animate={
          reducedMotion
            ? undefined
            : { opacity: [0.55, 0.9, 0.55], scale: [1, 1.08, 1] }
        }
        transition={
          reducedMotion
            ? undefined
            : { duration: 5, ease: "easeInOut", repeat: Infinity }
        }
      />
      {/* Logo, centered, with a slow scale loop on top of the
          pulsing blob. The loop is intentionally subtle (1.0 -> 1.03)
          so it reads as "alive" without being distracting. */}
      <motion.div
        className="relative"
        animate={reducedMotion ? undefined : { scale: [1, 1.03, 1] }}
        transition={
          reducedMotion
            ? undefined
            : { duration: 6, ease: "easeInOut", repeat: Infinity }
        }
      >
        <Image
          src="/flare-logo-192.webp"
          alt="Flare AI"
          width={128}
          height={128}
          className="object-contain drop-shadow-[0_0_24px_theme(colors.primary/0.35)]"
          priority
        />
      </motion.div>
    </div>
  );
}

export default AuthIntroDecoration;
