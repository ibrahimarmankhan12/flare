// ─── Shared Framer Motion Variants — Flare AI ───────────────────────────────
import { EASE } from "./tokens";

export { EASE };

// ── Stagger container / item ──────────────────────────────────────────────────
export const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

export const staggerItem = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE } },
};
