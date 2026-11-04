import { useMemo } from "react";
import { motion } from "framer-motion";

interface WaveformBarsProps {
  count?: number;
  color?: string;
  playing?: boolean;
  heights?: number[];
}

export function WaveformBars({
  count = 13,
  color = "#fff",
  playing = true,
  heights: fixedHeights,
}: WaveformBarsProps) {
  const heights = useMemo(
    () =>
      fixedHeights ??
      Array.from(
        { length: count },
        (_, i) => 16 + Math.sin(i * 1.4) * 14 + Math.cos(i * 0.8) * 8
      ),
    [count, fixedHeights]
  );

  const mults  = useMemo(() => heights.map(() => 0.25 + Math.random() * 0.75), [heights]);
  const mults2 = useMemo(() => heights.map(() => 0.4  + Math.random() * 0.6),  [heights]);

  return (
    <div style={{ display: "flex", gap: 2.5, alignItems: "center", height: 40 }}>
      {heights.map((h, i) => (
        <motion.div
          key={i}
          style={{
            width: 2.5,
            borderRadius: 2,
            originY: 0.5,
            background: color,
            height: h,
          }}
          animate={
            playing
              ? { scaleY: [1, mults[i], mults2[i], 1, mults2[i]! * 0.6, 1] }
              : { scaleY: 0.25 }
          }
          transition={
            playing
              ? {
                  duration: 0.7 + i * 0.04,
                  repeat: Infinity,
                  delay: i * 0.06,
                  ease: "easeInOut",
                }
              : { duration: 0.3 }
          }
        />
      ))}
    </div>
  );
}
