"use client";

import { SubscriptionTierName } from "app-types/subscription";
import {
  formatPrice,
  tierBadge,
  tierLabel,
  tierTagline,
} from "lib/payments/pricing-features";
import { Check, ExternalLink, Sparkles } from "lucide-react";
import { useRef, useState, useCallback, useEffect } from "react";
import { cn } from "lib/utils";

interface PlanCardProps {
  tier: SubscriptionTierName;
  isCurrent: boolean;
  isPopular?: boolean;
  pending: boolean;
  purchasable: boolean;
  onSelect: (tier: SubscriptionTierName) => void;
  variant?: "default" | "compact";
  /**
   * Disable mouse-tracking 3D tilt. Useful in the modal where the
   * hover-surface is small and tilt feels out of place.
   */
  disableTilt?: boolean;
}

/**
 * Editorial tier card. Renders a single paid plan as a numbered,
 * hairline-bordered card with a refined price display. Active plan
 * surfaces a teal accent + soft glow. Popular tiers get a small
 * mono eyebrow badge.
 *
 * 3D behaviors:
 *  - On hover/focus, the card tilts in 3D (perspective + rotateX/Y)
 *    following the cursor.
 *  - Inner content lifts on a translateZ layer for visible depth.
 *  - The price is rendered on a "pedestal" — a bottom shadow that
 *    fades into the card.
 *  - The CTA presses down on :active for a tactile 3D feel.
 */
export function PlanCard({
  tier,
  isCurrent,
  isPopular,
  pending,
  purchasable,
  onSelect,
  variant = "default",
  disableTilt = false,
}: PlanCardProps) {
  const isFree = tier === "free";
  const info = priceFromInfo(tier);
  const tagline = tierTagline(tier);
  const badge = tierBadge(tier);
  const showBadge = badge && !isCurrent;

  const compact = variant === "compact";

  // ── Mouse-tracking tilt ────────────────────────────────────────────────
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState<{ rx: number; ry: number; px: number; py: number }>({
    rx: 0,
    ry: 0,
    px: 50,
    py: 50,
  });
  const [hovered, setHovered] = useState(false);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (disableTilt) return;
      const el = cardRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * 100;
      const py = ((e.clientY - r.top) / r.height) * 100;
      // 12deg max tilt — felt but not gimmicky
      const ry = ((px - 50) / 50) * 9;
      const rx = -((py - 50) / 50) * 9;
      setTilt({ rx, ry, px, py });
    },
    [disableTilt],
  );

  const handleMouseLeave = useCallback(() => {
    setHovered(false);
    setTilt({ rx: 0, ry: 0, px: 50, py: 50 });
  }, []);

  // Reset tilt if the card is in a disabled state.
  useEffect(() => {
    if (isCurrent) {
      setTilt({ rx: 0, ry: 0, px: 50, py: 50 });
    }
  }, [isCurrent]);

  return (
    <div
      ref={cardRef}
      data-testid={`plan-card-${tier}`}
      data-current={isCurrent ? "true" : undefined}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "group relative [perspective:1200px]",
        // Lift on hover
        "transition-transform duration-300 ease-out",
        "hover:-translate-y-1",
        isCurrent && "z-10",
      )}
      style={{
        transform: disableTilt
          ? undefined
          : `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) translateZ(0)`,
        transition: "transform 0.18s cubic-bezier(0.22, 1, 0.36, 1)",
        transformStyle: "preserve-3d",
      }}
    >
      {/* Floor shadow — a long, stretched drop shadow under the card */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-3 -bottom-6 h-12 rounded-[40%]",
          "opacity-60 blur-2xl transition-all duration-500",
          isCurrent
            ? "bg-[#3d9e8c]/50 opacity-90"
            : hovered
              ? "bg-white/15"
              : "bg-black/60",
        )}
        style={{
          transform: "translateZ(-30px) rotateX(60deg)",
          transformOrigin: "center top",
        }}
      />

      <div
        className={cn(
          "relative flex flex-col overflow-hidden rounded-xl",
          "border [transform-style:preserve-3d]",
          "bg-[#0a0a0a] border-white/[0.07]",
          "transition-[border-color,box-shadow] duration-300",
          "hover:border-white/20",
          isCurrent &&
            "border-[#3d9e8c]/60 shadow-[0_0_0_1px_rgba(61,158,140,0.25),0_18px_60px_-12px_rgba(61,158,140,0.4),0_30px_80px_-30px_rgba(61,158,140,0.5)]",
          !isCurrent &&
            hovered &&
            "shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.05)]",
          compact ? "p-5" : "p-6",
        )}
        style={{
          // Spotlight that follows the cursor
          backgroundImage: hovered
            ? `radial-gradient(circle at ${tilt.px}% ${tilt.py}%, rgba(61,158,140,${isCurrent ? "0.10" : "0.06"}), transparent 45%), linear-gradient(180deg, #0d0d0d, #0a0a0a)`
            : undefined,
        }}
      >
        {/* Subtle grid pattern */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
            maskImage:
              "radial-gradient(ellipse 80% 60% at 50% 0%, black 0%, transparent 70%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 80% 60% at 50% 0%, black 0%, transparent 70%)",
          }}
        />
        {/* Teal glow on active */}
        {isCurrent && (
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full opacity-50 blur-3xl"
            style={{ background: "radial-gradient(circle, #3d9e8c, transparent 70%)" }}
          />
        )}

        <div
          className="relative flex flex-col gap-4 [transform-style:preserve-3d]"
          style={{ transform: "translateZ(12px)" }}
        >
          {/* Eyebrow row */}
          <div className="flex items-center justify-between">
            <span
              className={cn(
                "font-mono text-[10px] uppercase tracking-[0.18em]",
                isCurrent ? "text-[#3d9e8c]" : "text-white/45",
              )}
            >
              {isCurrent ? "Active" : "Tier"}
            </span>
            {showBadge && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
                  "font-mono text-[9px] uppercase tracking-[0.2em]",
                  isPopular
                    ? "bg-[#3d9e8c]/15 text-[#3d9e8c] border border-[#3d9e8c]/30"
                    : "bg-white/[0.06] text-white/70 border border-white/10",
                )}
              >
                {isPopular ? <Sparkles className="size-2.5" /> : null}
                {badge}
              </span>
            )}
          </div>

          {/* Plan name */}
          <div className="space-y-1">
            <h3 className="font-cooper text-2xl font-light tracking-tight text-white">
              {tierLabel(tier)}
            </h3>
            {tagline && (
              <p className="text-xs text-white/50">{tagline}</p>
            )}
          </div>

          {/* Price — sits on a 3D pedestal */}
          <div
            className="relative"
            style={{ transform: "translateZ(20px)" }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-x-1 bottom-[-6px] h-3 rounded-[50%] opacity-40 blur-md"
              style={{ background: "radial-gradient(ellipse, rgba(61,158,140,0.35), transparent 70%)" }}
            />
            <div className="flex items-baseline gap-1.5">
              <span className="font-cooper text-[40px] font-light leading-none tracking-tight text-white">
                {info.display}
              </span>
              {info.unit && (
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">
                  {info.unit}
                </span>
              )}
            </div>
          </div>

          {/* Description */}
          <p
            className={cn(
              "text-[13px] leading-relaxed text-white/55",
              compact ? "min-h-[2.5em]" : "min-h-[3em]",
            )}
          >
            {info.tagline}
          </p>

          {/* Hairline divider */}
          <div className="h-px w-full bg-white/[0.06]" />

          {/* CTA — 3D press on active */}
          <button
            type="button"
            onClick={() => onSelect(tier)}
            disabled={isCurrent || isFree || !purchasable || pending}
            data-testid={`dodo-upgrade-${tier}`}
            style={{ transform: "translateZ(18px)" }}
            className={cn(
              "group/btn relative inline-flex h-10 w-full items-center justify-center gap-2 overflow-hidden rounded-md",
              "font-mono text-[11px] uppercase tracking-[0.2em] transition-all",
              "shadow-[0_4px_0_rgba(0,0,0,0.4),0_2px_8px_rgba(0,0,0,0.3)]",
              "hover:shadow-[0_6px_0_rgba(0,0,0,0.5),0_4px_12px_rgba(0,0,0,0.4)]",
              "active:translate-y-[2px] active:shadow-[0_1px_0_rgba(0,0,0,0.4),0_0_4px_rgba(0,0,0,0.3)]",
              isCurrent
                ? "border border-[#3d9e8c]/40 bg-[#3d9e8c]/10 text-[#3d9e8c] cursor-default"
                : isFree
                  ? "border border-white/10 bg-white/[0.02] text-white/40 cursor-not-allowed"
                  : !purchasable
                    ? "border border-white/10 bg-white/[0.02] text-white/40 cursor-not-allowed"
                    : pending
                      ? "border border-white/15 bg-white/[0.04] text-white/60 cursor-progress"
                      : "border border-white/15 bg-white text-black hover:bg-[#3d9e8c] hover:border-[#3d9e8c] hover:text-white",
            )}
          >
            {/* Shimmer on hover */}
            {!isCurrent && !isFree && purchasable && !pending && (
              <span
                aria-hidden
                className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover/btn:translate-x-full"
              />
            )}
            {pending ? (
              <>
                <span className="size-1.5 animate-pulse rounded-full bg-current" />
                Redirecting
              </>
            ) : isCurrent ? (
              <>
                <Check className="size-3" />
                Current plan
              </>
            ) : isFree ? (
              "Free tier"
            ) : !purchasable ? (
              "Unavailable"
            ) : (
              <>
                Upgrade
                <ExternalLink className="size-3 transition-transform group-hover/btn:translate-x-0.5" />
              </>
            )}
          </button>

          {/* Features list */}
          {!compact && (
            <ul
              className="space-y-2.5 pt-2 [transform-style:preserve-3d]"
              style={{ transform: "translateZ(6px)" }}
            >
              {info.bullets.map((b) => (
                <li
                  key={b}
                  className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-white/65"
                >
                  <span
                    className={cn(
                      "mt-1 inline-block size-1 rounded-full",
                      isCurrent ? "bg-[#3d9e8c]" : "bg-white/30",
                    )}
                  />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper — derive the display fields per tier without dragging in the
// full feature matrix (the matrix is used by the /plans comparison table
// but not by the compact upgrade card).
function priceFromInfo(tier: SubscriptionTierName): {
  display: string;
  unit: string | null;
  tagline: string;
  bullets: string[];
} {
  switch (tier) {
    case "free":
      return {
        display: "Free",
        unit: null,
        tagline: "Default free plan for all users.",
        bullets: [
          "10K daily tokens",
          "Standard model access",
          "1 MCP server",
          "Community support",
        ],
      };
    case "flare-pro":
      return {
        display: formatPrice(799, { withUnit: false }),
        unit: "/ month",
        tagline: "Higher daily limits and faster models for power users.",
        bullets: [
          "200K daily tokens",
          "Pro model access",
          "5 MCP servers",
          "Email support",
        ],
      };
    case "flare-max":
      return {
        display: formatPrice(1999, { withUnit: false }),
        unit: "/ month",
        tagline: "Generous limits and priority access to premium models.",
        bullets: [
          "1M daily tokens",
          "Flagship model access",
          "Unlimited MCP servers",
          "Priority email support",
        ],
      };
    case "flare-enterprises":
      return {
        display: formatPrice(3999, { withUnit: false }),
        unit: "/ month",
        tagline: "Team-grade plan with deployment support.",
        bullets: [
          "5M daily tokens",
          "Custom model access",
          "Unlimited MCP servers",
          "Team workspace",
        ],
      };
    case "flare-enterprises-pro":
      return {
        display: formatPrice(5999, { withUnit: false }),
        unit: "/ month",
        tagline: "Enterprise plan with enhanced security and support.",
        bullets: [
          "20M daily tokens",
          "Private model access",
          "Priority + Slack support",
          "SSO & audit logs",
        ],
      };
    case "flare-enterprises-max":
      return {
        display: formatPrice(10999, { withUnit: false }),
        unit: "/ month",
        tagline: "Highest enterprise tier with dedicated endpoints.",
        bullets: [
          "Unlimited tokens",
          "Dedicated endpoints",
          "99.9% SLA",
          "Dedicated CSM",
        ],
      };
    default:
      return {
        display: "—",
        unit: null,
        tagline: "",
        bullets: [],
      };
  }
}
