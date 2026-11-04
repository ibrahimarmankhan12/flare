"use client";

import { Fragment } from "react";
import { SubscriptionTierName } from "app-types/subscription";
import {
  ALL_TIERS_DISPLAY_ORDER,
  FEATURE_GROUPS,
  getTierFeature,
  tierLabel,
} from "lib/payments/pricing-features";
import { Check, Minus } from "lucide-react";
import { cn } from "lib/utils";

interface ComparisonTableProps {
  highlightTiers?: SubscriptionTierName[];
}

/**
 * Full feature comparison table for the /plans page. Renders a 6-column
 * table (5 paid tiers + free), grouped by FEATURE_GROUPS. The
 * highlightTiers prop paints specific tier columns with a teal accent
 * (used to spotlight "Most popular").
 */
export function ComparisonTable({
  highlightTiers = [],
}: ComparisonTableProps) {
  const tiers = ALL_TIERS_DISPLAY_ORDER;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0a0a0a]">
      {/* Faint grid backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.7) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage:
            "radial-gradient(ellipse 80% 80% at 50% 0%, black 0%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 80% at 50% 0%, black 0%, transparent 80%)",
        }}
      />

      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[840px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-white/[0.07]">
              <th className="sticky left-0 z-10 w-56 bg-[#0a0a0a] px-5 py-5 align-bottom">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
                  Feature
                </span>
              </th>
              {tiers.map((tier) => {
                const isHighlighted = highlightTiers.includes(tier);
                return (
                  <th
                    key={tier}
                    className={cn(
                      "px-4 py-5 align-bottom",
                      isHighlighted && "bg-[#3d9e8c]/[0.06]",
                    )}
                  >
                    <div className="flex flex-col gap-1.5">
                      <span
                        className={cn(
                          "font-mono text-[9px] uppercase tracking-[0.22em]",
                          isHighlighted ? "text-[#3d9e8c]" : "text-white/35",
                        )}
                      >
                        {isHighlighted ? "★ Spotlight" : "Tier"}
                      </span>
                      <span className="font-cooper text-lg font-light tracking-tight text-white">
                        {tierLabel(tier)}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {FEATURE_GROUPS.map((group) => (
              <Fragment key={`group-${group.label}`}>
                <tr className="border-b border-white/[0.04] bg-white/[0.015]">
                  <td
                    colSpan={tiers.length + 1}
                    className="px-5 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-white/50"
                  >
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block h-px w-4 bg-white/30" />
                      {group.label}
                    </span>
                  </td>
                </tr>
                {group.items.map((item) => (
                  <tr
                    key={`${group.label}-${item.key}`}
                    className="border-b border-white/[0.04] transition-colors hover:bg-white/[0.015]"
                  >
                    <td className="sticky left-0 z-10 bg-[#0a0a0a] px-5 py-3.5 align-middle">
                      <div className="flex flex-col">
                        <span className="text-[13px] text-white/85">
                          {item.label}
                        </span>
                        {item.hint && (
                          <span className="font-mono text-[10px] tracking-[0.05em] text-white/35">
                            {item.hint}
                          </span>
                        )}
                      </div>
                    </td>
                    {tiers.map((tier) => {
                      const value = getTierFeature(tier, item.key);
                      const isHighlighted = highlightTiers.includes(tier);
                      return (
                        <td
                          key={`${tier}-${item.key}`}
                          className={cn(
                            "px-4 py-3.5 align-middle",
                            isHighlighted && "bg-[#3d9e8c]/[0.04]",
                          )}
                        >
                          <CellValue value={value} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CellValue({ value }: { value: unknown }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-white/85">
        <Check className="size-3 text-[#3d9e8c]" />
        Included
      </span>
    );
  }
  if (value === false || value === null || value === undefined) {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-white/25">
        <Minus className="size-3" />
        Not included
      </span>
    );
  }
  if (typeof value === "string") {
    return (
      <span className="font-mono text-[11px] tracking-[0.02em] text-white/80">
        {value}
      </span>
    );
  }
  if (typeof value === "number") {
    return (
      <span className="font-cooper text-base text-white/90">{value}</span>
    );
  }
  return null;
}
