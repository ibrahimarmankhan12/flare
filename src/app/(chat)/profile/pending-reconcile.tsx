"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "ui/button";
import { Loader2, RotateCw, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "lib/utils";

interface PendingReconcileProps {
  /**
   * The Dodo subscription id from the post-checkout URL. If absent
   * (e.g. the user reached the page via a different code path),
   * the button is hidden — there's nothing to reconcile against.
   */
  subscriptionId: string | null;
}

/**
 * Small client island inside the profile page's pending banner.
 * Lets the user explicitly ask the server to reconcile their
 * subscription against the Dodo API when the webhook hasn't
 * arrived. The page itself is server-rendered, so this is the
 * narrowest possible client footprint.
 */
export function PendingReconcile({
  subscriptionId,
}: PendingReconcileProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [justReconciled, setJustReconciled] = useState(false);

  if (!subscriptionId) return null;

  const handleReconcile = async () => {
    setJustReconciled(false);
    try {
      const res = await fetch("/api/payments/dodo/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId }),
      });
      const data = (await res.json().catch(() => null)) as
        | { success: true; tier: string; status: string }
        | { success: false; error: string; message?: string }
        | null;

      if (res.ok && data && "success" in data && data.success) {
        toast.success("Payment confirmed. Your plan is now active.");
        setJustReconciled(true);
        // Re-render the server component so the banner re-derives
        // from the now-active subscription row.
        startTransition(() => router.refresh());
      } else if (data && "error" in data) {
        if (data.error === "SUBSCRIPTION_NOT_ACTIVE") {
          toast.error(
            data.message ??
              "The payment is still being processed by the provider.",
          );
        } else if (data.error === "OWNERSHIP_MISMATCH" || data.error === "OWNERSHIP_UNKNOWN") {
          toast.error(
            data.message ??
              "We couldn't link this subscription to your account. Please contact support.",
          );
        } else {
          toast.error(data.message ?? "Couldn't verify your payment.");
        }
      } else {
        toast.error("Couldn't verify your payment. Please try again.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    }
  };

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 pl-8">
      <Button
        onClick={handleReconcile}
        disabled={isPending || justReconciled}
        className={cn(
          "group/btn relative h-8 overflow-hidden rounded-full px-4",
          "border border-white/[0.12] bg-white/[0.04] font-mono text-[10px] uppercase tracking-[0.2em] text-white/85",
          "transition-all hover:border-[#3d9e8c]/40 hover:bg-[#3d9e8c]/10 hover:text-[#3d9e8c]",
          "disabled:opacity-60",
        )}
      >
        <span
          aria-hidden
          className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover/btn:translate-x-full"
        />
        {isPending ? (
          <>
            <Loader2 className="size-3 animate-spin" />
            Checking
          </>
        ) : justReconciled ? (
          <>
            <Check className="size-3" />
            Confirmed
          </>
        ) : (
          <>
            <RotateCw className="size-3" />
            Re-check payment
          </>
        )}
      </Button>
      <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-white/30">
        or refresh in a minute
      </span>
    </div>
  );
}
