"use client";

import {
  SubscriptionTierName,
  subscriptionTiersInfo,
} from "app-types/subscription";
import { fetcher } from "lib/utils";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { PlanCard } from "@/components/payments/plan-card";
import { cn } from "lib/utils";

interface DodoSubscriptionState {
  enabled: boolean;
  tier: SubscriptionTierName;
  isFreeTier: boolean;
  activeSubscription: {
    id: string;
    dodoSubscriptionId: string;
    dodoCustomerId: string | null;
    status: string;
    previousBillingDate: string | null;
    nextBillingDate: string | null;
    cancelAtNextBillingDate: boolean;
    cancelledAt: string | null;
  } | null;
  availableTiers: Array<{
    tier: SubscriptionTierName;
    label: string;
    pricePerMonthInr: number;
    description: string;
    productId: string | null;
    purchasable: boolean;
  }>;
}

const formatPeriod = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
};

/**
 * Standalone self-service plan upgrade UI. Editorial dark aesthetic
 * that matches the rest of the Flare brand. Renders inside any page
 * (typically the user profile popup). Calls
 * /api/payments/dodo/subscription for state and
 * /api/payments/dodo/checkout to start a checkout.
 */
export function DodoUpgradeCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, isLoading, mutate } = useSWR<DodoSubscriptionState>(
    "/api/payments/dodo/subscription",
    fetcher,
    { revalidateOnFocus: false },
  );

  const [pendingTier, setPendingTier] = useState<SubscriptionTierName | null>(
    null,
  );
  const [, startTransition] = useTransition();

  // If we just bounced back from Dodo, refresh subscription state.
  const upgradeFlag = searchParams?.get("upgrade");
  useEffect(() => {
    if (upgradeFlag === "success") {
      toast.success("Payment received. Refreshing your subscription…");
      startTransition(() => {
        mutate();
        router.replace(window.location.pathname);
      });
    } else if (upgradeFlag === "cancelled") {
      toast.info("Checkout cancelled. You were not charged.");
      startTransition(() => {
        router.replace(window.location.pathname);
      });
    }
  }, [upgradeFlag, mutate, router, startTransition]);

  const startCheckout = useCallback(async (tier: SubscriptionTierName) => {
    if (tier === "free") return;
    setPendingTier(tier);
    try {
      const res = await fetch("/api/payments/dodo/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const json = (await res.json()) as
        | { success: true; checkoutUrl: string }
        | { success: false; error: string; message?: string };
      if (!json.success) {
        toast.error(json.message ?? "Failed to start checkout");
        return;
      }
      window.location.href = json.checkoutUrl;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start checkout",
      );
    } finally {
      setPendingTier(null);
    }
  }, []);

  // ---------- Loading state ----------
  if (isLoading || !data) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0a0a0a]",
        )}
      >
        <GridBackdrop />
        <div className="relative flex items-center gap-3 px-6 py-5 text-sm text-white/60">
          <Loader2 className="h-4 w-4 animate-spin text-[#3d9e8c]" />
          Loading subscription…
        </div>
      </div>
    );
  }

  // ---------- Disabled state ----------
  if (!data.enabled) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0a0a0a]">
        <GridBackdrop />
        <div className="relative flex flex-col gap-3 px-6 py-6">
          <Eyebrow tone="muted">Subscription</Eyebrow>
          <h2 className="font-cooper text-2xl font-light tracking-tight text-white">
            Self-service upgrades offline
          </h2>
          <p className="text-sm text-white/55">
            Self-service plan upgrades are not available right now. An
            administrator can change your plan from the admin console.
          </p>
        </div>
      </div>
    );
  }

  const currentTier = data.tier;
  const sub = data.activeSubscription;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0a0a0a]",
      )}
    >
      <GridBackdrop />
      {/* Top hairline accent */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(61,158,140,0.6), transparent)",
        }}
      />

      <div className="relative flex flex-col">
        {/* Header */}
        <header className="flex flex-col gap-6 px-6 pt-6 pb-2 sm:flex-row sm:items-end sm:justify-between sm:px-8 sm:pt-8">
          <div className="space-y-3">
            <Eyebrow>Plan &amp; Billing</Eyebrow>
            <h2 className="font-cooper text-3xl font-light leading-[1.05] tracking-tight text-white sm:text-[34px]">
              Choose the
              <br />
              <span className="italic text-[#3d9e8c]">intelligence</span> that
              scales with you.
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-white/55">
              Payments are processed securely by Dodo Payments. Plans renew
              monthly and can be cancelled at any time.
            </p>
          </div>

          {/* Current plan readout */}
          <div className="flex shrink-0 flex-col gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-3 sm:items-end">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
              Current plan
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/80">
                {subscriptionTiersInfo[currentTier].label}
              </span>
              {sub && (
                <span
                  className={cn(
                    "inline-flex size-1.5 rounded-full",
                    sub.status === "active"
                      ? "bg-[#3d9e8c] shadow-[0_0_8px_rgba(61,158,140,0.7)]"
                      : "bg-white/30",
                  )}
                />
              )}
            </div>
            {sub?.nextBillingDate && (
              <span className="font-mono text-[10px] tracking-[0.05em] text-white/45">
                {sub.cancelAtNextBillingDate ? "Ends" : "Renews"} {formatPeriod(sub.nextBillingDate)}
              </span>
            )}
          </div>
        </header>

        {/* Divider */}
        <div className="mx-6 mt-4 h-px bg-white/[0.06] sm:mx-8" />

        {/* Tier grid */}
        <div className="px-6 py-6 sm:px-8 sm:py-8">
          <div className="mb-4 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
              Available plans
            </span>
            <a
              href="/plans"
              className="group inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.2em] text-white/55 transition-colors hover:text-white"
            >
              Compare all
              <ArrowUpRight className="size-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.availableTiers
              .filter((t) => t.tier !== "free")
              .map((t) => {
                const isCurrent = t.tier === currentTier;
                const busy = pendingTier === t.tier;
                return (
                  <PlanCard
                    key={t.tier}
                    tier={t.tier}
                    isCurrent={isCurrent}
                    isPopular={t.tier === "flare-max"}
                    pending={busy}
                    purchasable={t.purchasable}
                    onSelect={startCheckout}
                    variant="compact"
                  />
                );
              })}
          </div>

          {/* Footer notes */}
          <div className="mt-6 flex flex-col gap-2 border-t border-white/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono text-[10px] tracking-[0.05em] text-white/40">
              Prices in INR · exclude 18% GST · billed monthly
            </p>
            <p className="font-mono text-[10px] tracking-[0.05em] text-white/40">
              Cancel anytime from this dialog
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Local primitives ────────────────────────────────────────────────────────

function Eyebrow({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "muted";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em]",
        tone === "muted" ? "text-white/35" : "text-[#3d9e8c]",
      )}
    >
      <span className="inline-block size-1 rounded-full bg-current" />
      {children}
    </span>
  );
}

function GridBackdrop() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.7) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage:
            "radial-gradient(ellipse 90% 70% at 50% 0%, black 0%, transparent 70%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 90% 70% at 50% 0%, black 0%, transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-72 w-[60%] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, #3d9e8c, transparent 70%)" }}
      />
    </>
  );
}
