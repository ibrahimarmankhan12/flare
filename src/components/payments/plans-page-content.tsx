"use client";

import { SubscriptionTierName, isFreeTier } from "app-types/subscription";
import { fetcher } from "lib/utils";
import { ArrowUpRight, ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { PlanCard } from "@/components/payments/plan-card";
import { ComparisonTable } from "@/components/payments/comparison-table";
import { PlansFaq } from "@/components/payments/plans-faq";
import { HeroOrbital } from "@/components/payments/hero-orbital";
import { PAID_TIER_DISPLAY_ORDER } from "lib/payments/pricing-features";
import { cn } from "lib/utils";

interface SubscriptionState {
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

type BillingPeriod = "monthly" | "annual";

/**
 * Public /plans page content. Loaded by the server route. Authenticated
 * users can start a checkout directly; unauthenticated users are
 * prompted to sign in first.
 */
export function PlansPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [pendingTier, setPendingTier] = useState<SubscriptionTierName | null>(
    null,
  );
  const [, startTransition] = useTransition();

  const { data, isLoading } = useSWR<SubscriptionState>(
    "/api/payments/dodo/subscription",
    fetcher,
    { revalidateOnFocus: false },
  );

  const upgradeFlag = searchParams?.get("upgrade");
  useEffect(() => {
    if (upgradeFlag === "success") {
      toast.success("Payment received. Refreshing your subscription…");
      startTransition(() => {
        router.replace("/plans");
      });
    } else if (upgradeFlag === "cancelled") {
      toast.info("Checkout cancelled. You were not charged.");
      startTransition(() => {
        router.replace("/plans");
      });
    }
  }, [upgradeFlag, router, startTransition]);

  const startCheckout = useCallback(
    async (tier: SubscriptionTierName) => {
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
          if (json.error === "UNAUTHENTICATED") {
            toast.info("Sign in to upgrade your plan");
            router.push(`/sign-in?next=${encodeURIComponent("/plans")}`);
            return;
          }
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
    },
    [router],
  );

  const currentTier = data?.tier ?? null;
  const isFree = currentTier ? isFreeTier(currentTier) : true;
  const paidTiers = useMemo(
    () =>
      data?.availableTiers.filter((t) => t.tier !== "free") ??
      PAID_TIER_DISPLAY_ORDER.map((tier) => ({
        tier,
        label: "",
        pricePerMonthInr: 0,
        description: "",
        productId: null,
        purchasable: false,
      })),
    [data],
  );

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#050505] text-white">
      {/* Global ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[1100px] -translate-x-1/2 rounded-full opacity-30 blur-3xl"
        style={{
          background:
            "radial-gradient(ellipse, rgba(61,158,140,0.45), transparent 60%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 -right-40 h-[400px] w-[400px] rounded-full opacity-20 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(61,158,140,0.5), transparent 70%)",
        }}
      />

      {/* Top nav */}
      <header className="relative z-20 mx-auto flex max-w-[1500px] items-center justify-between px-6 py-5 sm:px-10">
        <Link
          href="/"
          className="group flex items-center gap-2.5"
          aria-label="Flare home"
        >
          <span className="font-cooper text-xl tracking-tight text-white/90 transition-colors group-hover:text-white">
            Flare
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-white/30">
            · Plans
          </span>
        </Link>
        <div className="flex items-center gap-2">
          {data ? (
            <Link
              href="/dashboard"
              className={cn(
                "inline-flex h-8 items-center rounded-full px-3",
                "border border-white/10 bg-white/[0.02]",
                "font-mono text-[10px] uppercase tracking-[0.2em] text-white/70",
                "transition-colors hover:bg-white/[0.05] hover:text-white",
              )}
            >
              Open chat
              <ArrowUpRight className="ml-1 size-3" />
            </Link>
          ) : (
            <Link
              href="/sign-in?next=/plans"
              className={cn(
                "inline-flex h-8 items-center rounded-full px-3",
                "border border-[#3d9e8c]/40 bg-[#3d9e8c]/10",
                "font-mono text-[10px] uppercase tracking-[0.2em] text-[#3d9e8c]",
                "transition-colors hover:bg-[#3d9e8c]/20",
              )}
            >
              Sign in
              <ChevronRight className="ml-1 size-3" />
            </Link>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-[1500px] px-6 pt-12 pb-12 sm:px-10 sm:pt-20 sm:pb-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20">
          <div className="space-y-7">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#3d9e8c]">
                <span className="mr-2 inline-block size-1.5 rounded-full bg-current shadow-[0_0_10px_currentColor]" />
                Pricing · v3
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/30">
                · 5 plans · 1 free
              </span>
            </div>

            <h1 className="font-cooper text-[48px] font-light leading-[1.02] tracking-[-0.02em] text-white sm:text-[72px] lg:text-[88px]">
              Intelligence,{" "}
              <span className="italic text-white/40">priced for</span>
              <br />
              every <span className="italic text-[#3d9e8c]">ambition.</span>
            </h1>

            <p className="max-w-xl text-[15px] leading-relaxed text-white/55 sm:text-base">
              From curious individuals to dedicated fleets — choose how much
              intelligence you want at your fingertips. All plans include
              invisible fallback routing, encrypted payments, and the same
              multi-model surface.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <BillingToggle value={period} onChange={setPeriod} />
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
                  "border border-[#3d9e8c]/30 bg-[#3d9e8c]/10",
                  "font-mono text-[10px] uppercase tracking-[0.18em] text-[#3d9e8c]",
                )}
              >
                Save 20% annually
              </span>
            </div>

            <CurrentPlanInline
              isLoading={isLoading}
              data={data}
              isFree={isFree}
              currentTier={currentTier}
            />
          </div>

          {/* Right column — 3D orbital */}
          <div className="relative">
            <HeroOrbital />
            {/* Decorative corner markers */}
            <CornerTicks />
          </div>
        </div>
      </section>

      {/* Tier grid — sits on a 3D perspective stage */}
      <section className="relative z-10 mx-auto max-w-[1500px] px-6 pb-16 sm:px-10 sm:pb-24">
        <div
          className="relative [perspective:1800px]"
          style={{ perspectiveOrigin: "50% 30%" }}
        >
          {/* 3D floor — perspective grid that recedes into the distance */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-[-10%] -top-10 bottom-0 overflow-hidden"
            style={{ transformStyle: "preserve-3d" }}
          >
            <div
              className="absolute inset-x-0 top-1/2 h-[120%] origin-top opacity-[0.18]"
              style={{
                transform: "rotateX(68deg) translateZ(0)",
                backgroundImage:
                  "linear-gradient(rgba(61,158,140,0.55) 1px, transparent 1px), linear-gradient(90deg, rgba(61,158,140,0.55) 1px, transparent 1px)",
                backgroundSize: "80px 80px",
                maskImage:
                  "linear-gradient(180deg, transparent 0%, black 18%, black 60%, transparent 100%)",
                WebkitMaskImage:
                  "linear-gradient(180deg, transparent 0%, black 18%, black 60%, transparent 100%)",
              }}
            />
            {/* Horizon glow */}
            <div
              className="absolute left-1/2 top-[42%] h-32 w-[80%] -translate-x-1/2 rounded-full opacity-50 blur-2xl"
              style={{
                background:
                  "radial-gradient(ellipse, rgba(61,158,140,0.45), transparent 70%)",
              }}
            />
          </div>

          <div className="relative">
            <SectionHeader
              eyebrow="Choose a tier"
              title={
                <>
                  Five <span className="italic text-[#3d9e8c]">plans</span>,
                  <br /> one surface.
                </>
              }
              subtitle="Tap any card to start a checkout. You can downgrade, upgrade, or cancel at any time."
            />

            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
              {paidTiers.map((t, i) => {
                const isCurrent = t.tier === currentTier;
                const busy = pendingTier === t.tier;
                const isPopular = t.tier === "flare-max";
                return (
                  <div
                    key={t.tier}
                    className="relative"
                    style={{
                      animation:
                        "plan-card-rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) both",
                      animationDelay: `${i * 80}ms`,
                    }}
                  >
                    {/* Center "popular" tier sits higher on the stage */}
                    {isPopular ? (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute -top-3 left-1/2 z-20 -translate-x-1/2"
                      >
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-3 py-1",
                            "border border-[#3d9e8c]/50 bg-[#3d9e8c]/15 backdrop-blur-md",
                            "font-mono text-[9px] uppercase tracking-[0.22em] text-[#3d9e8c]",
                            "shadow-[0_0_24px_rgba(61,158,140,0.35)]",
                          )}
                        >
                          <SparklesMini />
                          Most popular
                        </span>
                      </div>
                    ) : null}
                    <PlanCard
                      tier={t.tier}
                      isCurrent={isCurrent}
                      isPopular={isPopular}
                      pending={busy}
                      purchasable={t.purchasable}
                      onSelect={startCheckout}
                      variant="default"
                    />
                  </div>
                );
              })}
            </div>

            {/* Pricing breakdown strip */}
            <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-white/[0.07] pt-6 sm:flex-row sm:items-center">
              <p className="font-mono text-[10px] tracking-[0.05em] text-white/35">
                Prices in INR · exclude 18% GST · billed{" "}
                {period === "annual" ? "annually" : "monthly"}
              </p>
              <Link
                href="#comparison"
                className="group inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.2em] text-white/55 transition-colors hover:text-white"
              >
                See full comparison
                <ChevronRight className="size-3 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section
        id="comparison"
        className="relative z-10 mx-auto max-w-[1500px] px-6 pb-16 sm:px-10 sm:pb-24"
      >
        <SectionHeader
          eyebrow="Comparison"
          title={
            <>
              The full <span className="italic text-[#3d9e8c]">matrix</span>.
            </>
          }
          subtitle="Every plan, every limit, side by side. Hover any row to focus it."
        />
        <div className="mt-10">
          <ComparisonTable
            highlightTiers={["flare-max", "flare-enterprises-pro"]}
          />
        </div>
      </section>

      {/* FAQ */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pb-16 sm:px-10 sm:pb-24">
        <PlansFaq />
      </section>

      {/* Final CTA */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 pb-24 text-center sm:px-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#3d9e8c]">
          · Ready ·
        </p>
        <h2 className="mt-4 font-cooper text-4xl font-light tracking-tight text-white sm:text-5xl">
          Start with free.{" "}
          <span className="italic text-[#3d9e8c]">Scale on demand.</span>
        </h2>
        <p className="mt-4 text-sm text-white/55">
          No credit card to start. Upgrade when you need more.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href={data ? "/dashboard" : "/sign-in?next=/plans"}
            className={cn(
              "group inline-flex h-11 items-center gap-2 rounded-full px-6",
              "bg-white text-black",
              "font-mono text-[11px] uppercase tracking-[0.2em]",
              "transition-all hover:bg-[#3d9e8c] hover:text-white",
              "active:translate-y-[1px]",
            )}
          >
            {data ? "Open chat" : "Get started free"}
            <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
          <a
            href="mailto:support@flare-sh.tech"
            className={cn(
              "inline-flex h-11 items-center gap-2 rounded-full px-6",
              "border border-white/15 bg-white/[0.02] text-white/85",
              "font-mono text-[11px] uppercase tracking-[0.2em]",
              "transition-colors hover:bg-white/[0.05] hover:text-white",
              "active:translate-y-[1px]",
            )}
          >
            Talk to sales
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 mx-auto max-w-[1500px] border-t border-white/[0.06] px-6 py-8 sm:px-10">
        <div className="flex flex-col items-start justify-between gap-3 text-xs text-white/40 sm:flex-row sm:items-center">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em]">
            © Flare Labs · {new Date().getFullYear()}
          </span>
          <div className="flex gap-4">
            <Link
              href="/refund-policy"
              className="transition-colors hover:text-white/80"
            >
              Refund policy
            </Link>
            <Link
              href="/terms-of-service"
              className="transition-colors hover:text-white/80"
            >
              Terms
            </Link>
            <Link
              href="/privacy-policy"
              className="transition-colors hover:text-white/80"
            >
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

// ── Local primitives ────────────────────────────────────────────────────────

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#3d9e8c]">
          <span className="mr-2 inline-block size-1 rounded-full bg-current" />
          {eyebrow}
        </span>
        <h2 className="font-cooper text-4xl font-light leading-[1.05] tracking-tight text-white sm:text-5xl">
          {title}
        </h2>
      </div>
      {subtitle && (
        <p className="max-w-md text-sm leading-relaxed text-white/55 sm:text-right">
          {subtitle}
        </p>
      )}
    </div>
  );
}

function BillingToggle({
  value,
  onChange,
}: {
  value: BillingPeriod;
  onChange: (v: BillingPeriod) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Billing period"
      className={cn(
        "relative inline-flex items-center rounded-full p-0.5",
        "border border-white/10 bg-white/[0.02]",
      )}
    >
      {(["monthly", "annual"] as const).map((p) => {
        const active = value === p;
        return (
          <button
            key={p}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(p)}
            className={cn(
              "relative z-10 inline-flex h-7 items-center rounded-full px-3.5",
              "font-mono text-[10px] uppercase tracking-[0.2em] transition-colors",
              active
                ? "bg-white text-black"
                : "text-white/55 hover:text-white/85",
            )}
          >
            {p}
          </button>
        );
      })}
    </div>
  );
}

function CurrentPlanInline({
  isLoading,
  data,
  isFree,
  currentTier,
}: {
  isLoading: boolean;
  data: SubscriptionState | undefined;
  isFree: boolean;
  currentTier: SubscriptionTierName | null;
}) {
  if (isLoading) {
    return (
      <div className="inline-flex items-center gap-2 pt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
        <Loader2 className="size-3 animate-spin" />
        <span>Loading plan…</span>
      </div>
    );
  }
  if (!data) {
    return (
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
        · Browse anonymously ·{" "}
        <Link
          href="/sign-in?next=/plans"
          className="text-white/70 underline-offset-4 hover:text-white hover:underline"
        >
          sign in
        </Link>{" "}
        to subscribe
      </p>
    );
  }
  return (
    <div className="inline-flex items-center gap-3 rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1.5">
      <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-white/40">
        Current
      </span>
      <span
        className={cn(
          "inline-block size-1.5 rounded-full",
          isFree
            ? "bg-white/30"
            : "bg-[#3d9e8c] shadow-[0_0_8px_rgba(61,158,140,0.7)]",
        )}
      />
      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/85">
        {currentTier ? labelFor(currentTier) : "Free"}
      </span>
      {data.activeSubscription?.nextBillingDate && (
        <>
          <span className="font-mono text-[9px] text-white/25">·</span>
          <span className="font-mono text-[10px] tracking-[0.05em] text-white/55">
            Renews{" "}
            {new Date(
              data.activeSubscription.nextBillingDate,
            ).toLocaleDateString()}
          </span>
        </>
      )}
      {isFree && (
        <span className="font-mono text-[10px] tracking-[0.05em] text-white/55">
          · Upgrade to unlock more
        </span>
      )}
    </div>
  );
}

function CornerTicks() {
  return (
    <>
      <span
        aria-hidden
        className="absolute left-0 top-0 h-3 w-3 border-l border-t border-white/15"
      />
      <span
        aria-hidden
        className="absolute right-0 top-0 h-3 w-3 border-r border-t border-white/15"
      />
      <span
        aria-hidden
        className="absolute left-0 bottom-0 h-3 w-3 border-l border-b border-white/15"
      />
      <span
        aria-hidden
        className="absolute right-0 bottom-0 h-3 w-3 border-r border-b border-white/15"
      />
      <span
        aria-hidden
        className="absolute -left-3 top-1/2 -translate-y-1/2 font-mono text-[8px] uppercase tracking-[0.25em] text-white/30 [writing-mode:vertical-rl]"
      >
        orbital · v3
      </span>
      <span
        aria-hidden
        className="absolute -right-3 top-1/2 -translate-y-1/2 font-mono text-[8px] uppercase tracking-[0.25em] text-white/30 [writing-mode:vertical-rl]"
      >
        dodo.secure
      </span>
    </>
  );
}

function SparklesMini() {
  return (
    <svg viewBox="0 0 8 8" className="size-2.5" fill="currentColor" aria-hidden>
      <path d="M4 0L4.6 3L8 4L4.6 5L4 8L3.4 5L0 4L3.4 3Z" />
    </svg>
  );
}

function labelFor(tier: SubscriptionTierName) {
  switch (tier) {
    case "flare-pro":
      return "Flare Pro";
    case "flare-max":
      return "Flare Max";
    case "flare-enterprises":
      return "Flare Enterprises";
    case "flare-enterprises-pro":
      return "Flare Enterprises Pro";
    case "flare-enterprises-max":
      return "Flare Enterprises Max";
    default:
      return "Free";
  }
}
