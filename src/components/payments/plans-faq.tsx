"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "lib/utils";

interface FaqItem {
  q: string;
  a: React.ReactNode;
}

const FAQ: FaqItem[] = [
  {
    q: "What payment methods are supported?",
    a: "All major credit cards, debit cards, UPI, and netbanking through Dodo Payments. Enterprise customers can also pay by invoice with NET-30 terms.",
  },
  {
    q: "Can I change plans at any time?",
    a: "Yes — upgrades take effect immediately and are pro-rated for the current billing period. Downgrades take effect at the start of your next billing cycle.",
  },
  {
    q: "Is there a free trial of paid plans?",
    a: "We don't run a time-limited trial. The free plan is fully featured for its limits, and you can upgrade or downgrade without penalty. Refund requests within 7 days of a new purchase are honored case-by-case.",
  },
  {
    q: "How are daily token limits calculated?",
    a: "Token usage is counted at the time of generation across all models and all surfaces (chat, agents, workflows, build sandbox). Limits reset at 00:00 IST.",
  },
  {
    q: "Do unused tokens roll over?",
    a: "No. Daily limits are designed to be generous within the month, not as a banked balance. Enterprise tiers can request custom roll-over policies.",
  },
  {
    q: "How does the model fallback work?",
    a: "If your selected model is temporarily unavailable, we automatically retry on a robust fallback model — invisible to you, with no extra setup. You keep your selected model label in the UI.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Open the upgrade dialog from the header, choose Free, or cancel your subscription from the user profile. Access continues until the end of the current paid period.",
  },
  {
    q: "Do you offer student or non-profit discounts?",
    a: "Yes — 50% off Flare Pro and Flare Max for verified students, educators, and registered non-profits. Email support@flare-sh.tech with documentation.",
  },
];

export function PlansFaq() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0a0a0a]">
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

      <div className="relative">
        <div className="border-b border-white/[0.07] px-6 py-5 sm:px-8">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#3d9e8c]">
            <span className="mr-2 inline-block size-1 rounded-full bg-current" />
            Frequently asked
          </span>
          <h2 className="mt-2 font-cooper text-3xl font-light tracking-tight text-white sm:text-4xl">
            Questions,{" "}
            <span className="italic text-[#3d9e8c]">answered.</span>
          </h2>
        </div>

        <div className="divide-y divide-white/[0.05]">
          {FAQ.map((item, idx) => {
            const open = openIdx === idx;
            return (
              <button
                type="button"
                key={item.q}
                onClick={() => setOpenIdx(open ? null : idx)}
                className={cn(
                  "block w-full px-6 py-5 text-left transition-colors sm:px-8",
                  "hover:bg-white/[0.02]",
                )}
                aria-expanded={open}
              >
                <div className="flex items-center justify-between gap-6">
                  <span className="font-cooper text-lg font-light tracking-tight text-white sm:text-xl">
                    {item.q}
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-white/50 transition-transform duration-300",
                      open && "rotate-180 text-[#3d9e8c]",
                    )}
                  />
                </div>
                <div
                  className={cn(
                    "grid transition-all duration-300 ease-out",
                    open
                      ? "grid-rows-[1fr] opacity-100 mt-3"
                      : "grid-rows-[0fr] opacity-0",
                  )}
                >
                  <div className="min-h-0 overflow-hidden">
                    <p className="max-w-3xl text-sm leading-relaxed text-white/60">
                      {item.a}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
