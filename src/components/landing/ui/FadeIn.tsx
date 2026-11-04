import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { EASE } from "../lib/motion";

interface FadeInProps {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  x?: number;
  className?: string;
  style?: React.CSSProperties;
  /** If true, never reverses once in view (default false → animates both ways). */
  once?: boolean;
}

export function FadeIn({
  children,
  delay = 0,
  y = 28,
  x = 0,
  className = "",
  style = {},
  once = false,
}: FadeInProps) {
  const ref = useRef(null);
  const inView = useInView(ref, { once, margin: "-80px" });

  return (
    <motion.div
      ref={ref}
      className={className}
      style={style}
      initial={{ opacity: 0, y, x }}
      animate={inView ? { opacity: 1, y: 0, x: 0 } : { opacity: 0, y, x }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
