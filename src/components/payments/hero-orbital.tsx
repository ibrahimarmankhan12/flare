"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "lib/utils";

interface HeroOrbitalProps {
  className?: string;
}

/**
 * 3D holographic orbital shown in the hero of /plans. Built entirely
 * in CSS — no canvas, no WebGL. Uses `perspective` on a parent and
 * `rotate3d` on the nested rings to give a true 3D feel. Subtle
 * continuous rotation on multiple axes; mouse position over the
 * parent adds a small parallax tilt.
 */
export function HeroOrbital({ className }: HeroOrbitalProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const el = wrapRef.current?.parentElement?.parentElement;
    if (!el) return;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5; // -0.5..0.5
      const y = (e.clientY - r.top) / r.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setTilt({ x, y }));
    };
    const onLeave = () => {
      cancelAnimationFrame(raf);
      setTilt({ x: 0, y: 0 });
    };
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      aria-hidden
      className={cn(
        "relative mx-auto aspect-square w-full max-w-[460px]",
        "[perspective:1400px]",
        className,
      )}
      style={{
        transform: `rotateX(${-6 + tilt.y * 6}deg) rotateY(${tilt.x * 8}deg)`,
        transformStyle: "preserve-3d",
        transition: "transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      {/* Far back glow */}
      <div
        className="absolute inset-[-20%] rounded-full opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(61,158,140,0.55), transparent 60%)",
        }}
      />

      {/* Outermost ring — flat, slow clockwise */}
      <div
        className="absolute inset-[6%] animate-[hero-orbit-spin_60s_linear_infinite] [transform-style:preserve-3d]"
        style={{ transform: "rotateX(72deg)" }}
      >
        <div
          className="h-full w-full rounded-full"
          style={{
            border: "1px dashed rgba(255,255,255,0.12)",
            boxShadow:
              "inset 0 0 60px rgba(61,158,140,0.08), 0 0 0 1px rgba(255,255,255,0.02)",
          }}
        />
      </div>

      {/* Outer ring — slight tilt, counter-clockwise */}
      <div
        className="absolute inset-[12%] animate-[hero-orbit-spin_42s_linear_infinite_reverse] [transform-style:preserve-3d]"
        style={{ transform: "rotateX(64deg) rotateZ(15deg)" }}
      >
        <div
          className="h-full w-full rounded-full"
          style={{
            border: "1px solid rgba(255,255,255,0.10)",
            background:
              "radial-gradient(circle at 50% 0%, rgba(61,158,140,0.10), transparent 40%)",
          }}
        />
        {/* Satellite labels on this ring */}
        <Satellite
          angle={20}
          label="Pro"
          accent={false}
          radiusClass="inset-0"
        />
        <Satellite
          angle={200}
          label="Max"
          accent
          radiusClass="inset-0"
        />
      </div>

      {/* Middle ring — stronger tilt, faster clockwise */}
      <div
        className="absolute inset-[22%] animate-[hero-orbit-spin_28s_linear_infinite] [transform-style:preserve-3d]"
        style={{ transform: "rotateX(56deg) rotateZ(-25deg)" }}
      >
        <div
          className="h-full w-full rounded-full"
          style={{
            border: "1px solid rgba(255,255,255,0.10)",
            background:
              "radial-gradient(circle at 50% 100%, rgba(61,158,140,0.10), transparent 50%)",
          }}
        />
        <Satellite
          angle={110}
          label="Ent."
          accent={false}
          radiusClass="inset-0"
        />
        <Satellite
          angle={310}
          label="Ent. Pro"
          accent
          radiusClass="inset-0"
        />
      </div>

      {/* Inner ring — near vertical, slow */}
      <div
        className="absolute inset-[32%] animate-[hero-orbit-spin_22s_linear_infinite_reverse] [transform-style:preserve-3d]"
        style={{ transform: "rotateX(50deg) rotateZ(45deg)" }}
      >
        <div
          className="h-full w-full rounded-full"
          style={{
            border: "1px solid rgba(61,158,140,0.30)",
            boxShadow:
              "0 0 32px rgba(61,158,140,0.18), inset 0 0 16px rgba(61,158,140,0.18)",
          }}
        />
        <Satellite
          angle={170}
          label="Ent. Max"
          accent
          radiusClass="inset-0"
        />
      </div>

      {/* Core */}
      <div className="absolute inset-[40%] [transform-style:preserve-3d]">
        <div
          className="relative h-full w-full rounded-full"
          style={{
            background:
              "radial-gradient(circle at 30% 30%, #5fc4ad, #3d9e8c 50%, #1a3a35 100%)",
            boxShadow:
              "0 0 60px rgba(61,158,140,0.45), inset 0 0 20px rgba(255,255,255,0.18)",
          }}
        >
          {/* Specular highlight */}
          <div
            className="absolute left-[18%] top-[15%] h-[28%] w-[28%] rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(255,255,255,0.55), transparent 60%)",
              filter: "blur(2px)",
            }}
          />
        </div>
        {/* Vertical scan line */}
        <div className="pointer-events-none absolute inset-[-40%] rounded-full border border-[#3d9e8c]/20" />
        <div className="pointer-events-none absolute inset-[-80%] rounded-full border border-[#3d9e8c]/10" />
      </div>

      {/* Floating HUD tags */}
      <div className="absolute inset-0 [transform-style:preserve-3d]">
        <HudTag
          className="left-[6%] top-[10%]"
          text="tier.pro"
          delay="0s"
        />
        <HudTag
          className="right-[4%] top-[24%]"
          text="tier.max"
          delay="0.6s"
        />
        <HudTag
          className="bottom-[12%] left-[10%]"
          text="dodo.verified"
          delay="1.2s"
        />
        <HudTag
          className="bottom-[28%] right-[6%]"
          text="fingerprint"
          delay="1.8s"
        />
      </div>
    </div>
  );
}

function Satellite({
  angle,
  label,
  accent,
  radiusClass,
}: {
  angle: number;
  label: string;
  accent: boolean;
  radiusClass: string;
}) {
  return (
    <div
      className={cn("absolute", radiusClass)}
      style={{
        transform: `rotate(${angle}deg)`,
        transformOrigin: "center",
      }}
    >
      <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
        <div
          className={cn(
            "flex h-6 items-center gap-1 rounded-full px-2",
            "border backdrop-blur-md",
            "font-mono text-[9px] uppercase tracking-[0.18em]",
            accent
              ? "border-[#3d9e8c]/50 bg-[#3d9e8c]/15 text-[#3d9e8c] shadow-[0_0_16px_rgba(61,158,140,0.35)]"
              : "border-white/15 bg-white/[0.04] text-white/75",
          )}
          style={{ transform: `rotate(${-angle}deg)` }}
        >
          <span
            className={cn(
              "inline-block size-1 rounded-full",
              accent ? "bg-[#3d9e8c]" : "bg-white/40",
            )}
          />
          {label}
        </div>
      </div>
    </div>
  );
}

function HudTag({
  className,
  text,
  delay,
}: {
  className: string;
  text: string;
  delay: string;
}) {
  return (
    <div
      className={cn(
        "absolute font-mono text-[9px] uppercase tracking-[0.2em] text-white/35",
        className,
      )}
      style={{ animation: `hud-fade 6s ${delay} ease-in-out infinite` }}
    >
      <span className="mr-1 inline-block size-0.5 rounded-full bg-current align-middle" />
      {text}
    </div>
  );
}
