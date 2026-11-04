import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useAnimationFrame } from "framer-motion";

interface MarqueeProps {
  items: React.ReactNode[];
  speed?: number;
  direction?: "left" | "right";
}

export function Marquee({ items, speed = 35, direction = "left" }: MarqueeProps) {
  const x = useMotionValue(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (containerRef.current) {
      const halfWidth = containerRef.current.scrollWidth / 2;
      setWidth(halfWidth);
      if (direction === "right") {
        x.set(-halfWidth);
      } else {
        x.set(0);
      }
    }
  }, [items, direction, x]);

  useAnimationFrame((_, delta) => {
    if (paused || width === 0) return;
    const dir = direction === "right" ? 1 : -1;
    const next = x.get() + dir * (delta / 1000) * speed;
    
    if (direction === "right") {
      x.set(next >= 0 ? -width : next);
    } else {
      x.set(next <= -width ? 0 : next);
    }
  });

  const doubled = [...items, ...items];

  return (
    <div
      style={{ overflow: "hidden", width: "100%" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <motion.div
        ref={containerRef}
        style={{ display: "flex", gap: 0, x, willChange: "transform" }}
      >
        {doubled.map((item, i) => (
          <div key={i} style={{ flexShrink: 0, padding: "0 36px", display: "flex", alignItems: "center" }}>
            {item}
          </div>
        ))}
      </motion.div>
    </div>
  );
}
