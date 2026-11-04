import { ArrowRight, ArrowUpRight, CheckCircle2, Clock, XCircle, AlertCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "ui/button";
import { cn } from "lib/utils";

import { getSession } from "lib/auth/server";
import { dodoPaymentsRepository, userRepository } from "lib/db/repository";
import { verifyUpgradeToken } from "lib/payments/upgrade-token";
import {
  type SubscriptionTierName,
  isFreeTier,
  subscriptionTiersInfo,
} from "app-types/subscription";
import { PendingReconcile } from "./pending-reconcile";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Profile — Flare AI",
  description: "Manage your subscription and account.",
};

type Status =
  | { kind: "success"; title: string; lede: string; tone: "success" }
  | { kind: "pending"; title: string; lede: string; tone: "info" }
  | { kind: "failed"; title: string; lede: string; tone: "error" }
  | { kind: "cancelled"; title: string; lede: string; tone: "info" }
  | null;

const statusFromState = (input: {
  urlIsAuthentic: boolean;
  hasActiveSubscription: boolean;
  upgrade: string | null;
  dodoStatus: string | null;
  subscriptionId: string | null;
}): Status => {
  if (input.upgrade === "cancelled") {
    return {
      kind: "cancelled",
      title: "Checkout cancelled",
      lede: "No payment was taken. You can come back any time and try a different plan.",
      tone: "info",
    };
  }

  if (!input.urlIsAuthentic) return null;

  if (input.dodoStatus === "failed" || input.upgrade === "failed") {
    return {
      kind: "failed",
      title: "Payment failed",
      lede: "Your card was not charged. You can try again from the upgrade menu — no subscription was created.",
      tone: "error",
    };
  }

  if (
    input.upgrade === "success" ||
    input.dodoStatus === "succeeded" ||
    input.dodoStatus === "active"
  ) {
    if (input.hasActiveSubscription) {
      return {
        kind: "success",
        title: "You're upgraded",
        lede: "Your subscription is active. Higher limits and priority model access are now in effect.",
        tone: "success",
      };
    }
    return {
      kind: "pending",
      title: "Payment is processing",
      lede: input.subscriptionId
        ? `Confirming the charge for subscription ${input.subscriptionId}. This usually takes a few seconds — refresh in a moment.`
        : "Confirming the charge. This usually takes a few seconds — refresh in a moment.",
      tone: "info",
    };
  }

  return null;
};

const formatDate = (date: Date | null) => {
  if (!date) return "—";
  return date.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatPassSerial = (input: string | null | undefined): string => {
  if (!input) return "—";
  const cleaned = input.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (cleaned.length < 4) return cleaned.padStart(4, "•");
  // Group into 4-4-4-4 for visual rhythm
  return cleaned.match(/.{1,4}/g)?.join(" · ") ?? cleaned;
};

interface PageProps {
  searchParams: Promise<{
    upgrade?: string;
    status?: string;
    subscription_id?: string;
    email?: string;
    token?: string;
    session?: string;
  }>;
}

export default async function ProfilePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const upgrade = sp.upgrade ?? null;
  const dodoStatus = sp.status ?? null;
  const subscriptionId = sp.subscription_id ?? null;
  const tokenParam = sp.token ?? null;
  const nonceParam = sp.session ?? null;

  const session = await getSession();
  if (!session?.user?.id) {
    return null;
  }

  const urlIsAuthentic = Boolean(
    tokenParam &&
      nonceParam &&
      verifyUpgradeToken({
        token: tokenParam,
        expectedUserId: session.user.id,
        expectedNonce: nonceParam,
      }).valid,
  );

  const tier = await dodoPaymentsRepository.syncUserTierFromSubscription(
    session.user.id,
  );

  const subscription =
    await dodoPaymentsRepository.getActiveSubscriptionForUser(
      session.user.id,
    );

  const user = await userRepository.getUserById(session.user.id);
  const tierInfo = subscriptionTiersInfo[tier];
  const status = statusFromState({
    urlIsAuthentic,
    hasActiveSubscription: Boolean(subscription),
    upgrade,
    dodoStatus,
    subscriptionId,
  });

  const isFree = isFreeTier(tier as SubscriptionTierName);
  const statusLabel = subscription?.status ?? (isFree ? "inactive" : "active");
  const serial = formatPassSerial(subscription?.dodoSubscriptionId);
  const holderName = user?.name?.trim() || session.user.email?.split("@")[0] || "Member";

  return (
    <div className="relative min-h-svh w-full overflow-hidden bg-[#0a0a0a] text-white">
      {/* Ambient backdrop — radial glow + grain */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 80% 50% at 80% 0%, rgba(61,158,140,0.10), transparent 60%), radial-gradient(ellipse 60% 40% at 0% 100%, rgba(61,158,140,0.05), transparent 65%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse 90% 70% at 50% 0%, black 0%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 90% 70% at 50% 0%, black 0%, transparent 80%)",
        }}
      />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-12 sm:px-10 sm:py-16">
        {/* ── Header ───────────────────────────────────────────────── */}
        <header className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="inline-block size-1.5 rounded-full bg-[#3d9e8c] shadow-[0_0_8px_rgba(61,158,140,0.7)]"
              />
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/45">
                Profile · No. {String(user?.id ?? "").slice(-6).toUpperCase() || "000000"}
              </span>
            </div>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.3em] text-white/35 sm:inline">
              {new Date().toLocaleDateString("en-IN", {
                year: "numeric",
                month: "short",
                day: "2-digit",
              })}
            </span>
          </div>
          <h1 className="font-cooper text-5xl font-light leading-[0.95] tracking-tight text-white sm:text-7xl">
            Your <em className="italic text-[#3d9e8c]">pass</em>
            <br />
            <span className="text-white/55">to the intelligence.</span>
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-white/55">
            Signed in as{" "}
            <span className="text-white/85">
              {user?.email ?? session.user.email}
            </span>
            . Everything below is the source of truth for what your
            account can do.
          </p>
        </header>

        {/* ── Status banner (chapter-style) ────────────────────────── */}
        {status ? (
          <StatusBanner status={status} subscriptionId={subscriptionId} />
        ) : null}

        {/* ── Subscription pass + side metadata ────────────────────── */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
          <SubscriptionPass
            tierLabel={tierInfo.label}
            tierDescription={tierInfo.description}
            priceLabel={
              tierInfo.pricePerMonthInr === 0
                ? "Free"
                : `₹${tierInfo.pricePerMonthInr.toLocaleString("en-IN")}`
            }
            priceUnit={tierInfo.pricePerMonthInr === 0 ? "" : "/ month"}
            holderName={holderName}
            serial={serial}
            statusLabel={statusLabel}
            renewsAt={formatDate(subscription?.nextBillingDate ?? null)}
            isFree={isFree}
          />

          <div className="flex flex-col gap-6">
            <MetaRow
              eyebrow="Holder"
              value={holderName}
              sub={user?.email ?? session.user.email}
            />
            <MetaRow
              eyebrow="Status"
              value={statusLabel}
              sub={
                subscription?.cancelAtNextBillingDate
                  ? "Cancels at period end"
                  : subscription
                    ? "Auto-renews"
                    : "No active subscription"
              }
              dot={subscription ? "active" : "inactive"}
            />
            <MetaRow
              eyebrow={subscription ? "Next renewal" : "Member since"}
              value={
                subscription
                  ? formatDate(subscription.nextBillingDate)
                  : user?.createdAt
                    ? formatDate(user.createdAt)
                    : "—"
              }
              sub="Asia / Kolkata"
            />
            {subscription ? (
              <MetaRow
                eyebrow="Provider"
                value="Dodo Payments"
                sub={formatPassSerial(subscription.dodoCustomerId)}
              />
            ) : null}
          </div>
        </section>

        {/* ── Upgrade call-to-action (free users) ──────────────────── */}
        {isFree ? <UpgradeCta /> : null}

        {/* ── Footer micro-credit ─────────────────────────────────── */}
        <footer className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-6 font-mono text-[10px] uppercase tracking-[0.25em] text-white/30">
          <span>Flare · Membership registry</span>
          <span>v1 · {tierInfo.label}</span>
        </footer>
      </div>
    </div>
  );
}

// ── Status banner ────────────────────────────────────────────────────────

function StatusBanner({
  status,
  subscriptionId,
}: {
  status: NonNullable<Status>;
  subscriptionId: string | null;
}) {
  const config = {
    success: {
      icon: CheckCircle2,
      accent: "text-[#3d9e8c]",
      border: "border-[#3d9e8c]/30",
      glow: "rgba(61,158,140,0.18)",
      label: "Confirmation",
    },
    info: {
      icon: Clock,
      accent: "text-amber-300",
      border: "border-amber-300/25",
      glow: "rgba(252,211,77,0.12)",
      label: "In progress",
    },
    error: {
      icon: XCircle,
      accent: "text-rose-400",
      border: "border-rose-400/25",
      glow: "rgba(251,113,133,0.12)",
      label: "Failed",
    },
  }[status.tone];

  const Icon = config.icon;

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-[#0d0d0d] p-8 sm:p-10",
        config.border,
      )}
      style={{
        backgroundImage: `radial-gradient(ellipse 60% 80% at 0% 50%, ${config.glow}, transparent 60%)`,
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={cn("inline-block size-1.5 rounded-full", config.accent.replace("text-", "bg-"))}
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/45">
            {config.label}
          </span>
        </div>
        <div className="flex-1 space-y-3">
          <div className="flex items-start gap-3">
            <Icon className={cn("mt-1 size-5 shrink-0", config.accent)} />
            <h2 className="font-cooper text-3xl font-light leading-[1.05] tracking-tight text-white sm:text-4xl">
              {status.title}
            </h2>
          </div>
          <p className="max-w-2xl pl-8 text-sm leading-relaxed text-white/60">
            {status.lede}
          </p>
          {status.kind === "pending" ? (
            <PendingReconcile subscriptionId={subscriptionId} />
          ) : null}
        </div>
        {(status.kind === "failed" || status.kind === "cancelled") && (
          <Button
            asChild
            variant="outline"
            size="sm"
            className="self-start border-white/15 bg-transparent text-white/70 hover:bg-white/[0.04] hover:text-white"
          >
            <Link href="/">
              Back to chat
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        )}
      </div>
    </section>
  );
}

// ── Subscription pass (the hero) ────────────────────────────────────────

function SubscriptionPass({
  tierLabel,
  tierDescription,
  priceLabel,
  priceUnit,
  holderName,
  serial,
  statusLabel,
  renewsAt,
  isFree,
}: {
  tierLabel: string;
  tierDescription: string;
  priceLabel: string;
  priceUnit: string;
  holderName: string;
  serial: string;
  statusLabel: string;
  renewsAt: string;
  isFree: boolean;
}) {
  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-[#0a0a0a]",
        isFree
          ? "border-white/[0.08]"
          : "border-[#3d9e8c]/30 shadow-[0_0_0_1px_rgba(61,158,140,0.10),0_30px_80px_-30px_rgba(61,158,140,0.35)]",
      )}
      style={{
        backgroundImage: isFree
          ? undefined
          : "radial-gradient(ellipse 80% 60% at 100% 0%, rgba(61,158,140,0.10), transparent 60%), linear-gradient(180deg, #0d0d0d, #0a0a0a)",
      }}
    >
      {/* Top hairline accent */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-x-0 top-0 h-px",
          isFree
            ? "bg-white/[0.10]"
            : "bg-gradient-to-r from-transparent via-[#3d9e8c]/60 to-transparent",
        )}
      />

      {/* Subtle grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
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

      <div className="relative flex h-full flex-col p-8 sm:p-10">
        {/* Header row */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className={cn(
                "inline-block size-1.5 rounded-full",
                isFree ? "bg-white/30" : "bg-[#3d9e8c] shadow-[0_0_8px_rgba(61,158,140,0.7)]",
              )}
            />
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/45">
              {isFree ? "Holder · no pass" : "Active pass"}
            </span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/30">
            Flare · MMXXVI
          </span>
        </div>

        {/* Plan title */}
        <div className="mt-10 space-y-3">
          <h2 className="font-cooper text-6xl font-light leading-[0.9] tracking-tight text-white sm:text-7xl">
            {tierLabel}
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-white/55">
            {tierDescription}
          </p>
        </div>

        {/* Price block — pedestal */}
        <div className="mt-10 flex items-baseline gap-2">
          <div className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-x-1 -bottom-1 h-3 rounded-[50%] opacity-40 blur-md"
              style={{
                background: isFree
                  ? "radial-gradient(ellipse, rgba(255,255,255,0.15), transparent 70%)"
                  : "radial-gradient(ellipse, rgba(61,158,140,0.45), transparent 70%)",
              }}
            />
            <span className="font-cooper text-5xl font-light leading-none tracking-tight text-white sm:text-6xl">
              {priceLabel}
            </span>
          </div>
          {priceUnit ? (
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/45">
              {priceUnit}
            </span>
          ) : null}
        </div>

        {/* Perforation + serial */}
        <div className="mt-12 flex items-center gap-3">
          <div className="h-px flex-1 border-t border-dashed border-white/15" />
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/40">
            {serial}
          </span>
          <div className="h-px flex-1 border-t border-dashed border-white/15" />
        </div>

        {/* Bottom metadata grid */}
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
          <PassField label="Holder" value={holderName} />
          <PassField label="Status" value={statusLabel} accent={!isFree} />
          <PassField label={isFree ? "Membership" : "Renews"} value={renewsAt} />
        </dl>

        {!isFree ? (
          <div className="mt-8 flex items-center gap-2 text-[11px] text-white/40">
            <AlertCircle className="size-3" />
            <span>
              Manage or cancel any time from the billing portal. We never
              store your card.
            </span>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function PassField({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <dt className="font-mono text-[9px] uppercase tracking-[0.25em] text-white/35">
        {label}
      </dt>
      <dd
        className={cn(
          "font-cooper text-lg font-light leading-tight tracking-tight",
          accent ? "text-[#3d9e8c]" : "text-white",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

// ── Meta rows (right column) ─────────────────────────────────────────────

function MetaRow({
  eyebrow,
  value,
  sub,
  dot,
}: {
  eyebrow: string;
  value: string;
  sub?: string;
  dot?: "active" | "inactive";
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02] p-5 transition-colors hover:border-white/[0.15] hover:bg-white/[0.03]">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/40">
          {eyebrow}
        </span>
        {dot ? (
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn(
                "inline-block size-1.5 rounded-full",
                dot === "active"
                  ? "bg-[#3d9e8c] shadow-[0_0_6px_rgba(61,158,140,0.7)]"
                  : "bg-white/20",
              )}
            />
            <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-white/30">
              {dot}
            </span>
          </span>
        ) : null}
      </div>
      <div className="mt-3 font-cooper text-2xl font-light leading-tight tracking-tight text-white">
        {value}
      </div>
      {sub ? (
        <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">
          {sub}
        </div>
      ) : null}
    </div>
  );
}

// ── Upgrade CTA (free users) ─────────────────────────────────────────────

function UpgradeCta() {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-[#3d9e8c]/30 bg-gradient-to-br from-[#0d0d0d] to-[#0a0a0a] p-8 sm:p-12">
      {/* Glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[60%] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
        style={{
          background: "radial-gradient(circle, #3d9e8c, transparent 70%)",
        }}
      />
      {/* Grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative flex flex-col items-start gap-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block size-1.5 rounded-full bg-[#3d9e8c] shadow-[0_0_8px_rgba(61,158,140,0.7)]"
            />
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#3d9e8c]">
              Open invitation
            </span>
          </div>
          <h3 className="font-cooper text-4xl font-light leading-[0.95] tracking-tight text-white sm:text-5xl">
            Step up to a <em className="italic text-[#3d9e8c]">real</em> pass.
          </h3>
          <p className="max-w-lg text-sm leading-relaxed text-white/55">
            Higher daily limits, priority model access, and a quiet seat at
            the front of the queue. Cancel any time, no questions asked.
          </p>
        </div>
        <Button
          asChild
          className="group/btn relative h-12 overflow-hidden rounded-full bg-[#3d9e8c] px-6 font-mono text-[11px] uppercase tracking-[0.2em] text-black shadow-[0_0_0_1px_rgba(61,158,140,0.5),0_18px_40px_-12px_rgba(61,158,140,0.5)] transition-all hover:bg-[#5fc4ad] hover:shadow-[0_0_0_1px_rgba(61,158,140,0.7),0_22px_50px_-12px_rgba(61,158,140,0.7)]"
        >
          <Link href="/plans">
            <span
              aria-hidden
              className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover/btn:translate-x-full"
            />
            See plans
            <ArrowUpRight className="size-3.5 transition-transform group-hover/btn:-translate-y-0.5 group-hover/btn:translate-x-0.5" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
