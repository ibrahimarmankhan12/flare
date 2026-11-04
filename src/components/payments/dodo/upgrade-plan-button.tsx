"use client";

import { ArrowUpRight, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { DodoUpgradeCard } from "@/components/payments/dodo/dodo-upgrade-card";
import { Button } from "ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "ui/dialog";
import { cn } from "lib/utils";

/**
 * Header upgrade button. Opens a full-bleed editorial dialog
 * containing the `<DodoUpgradeCard />` so the user can self-serve
 * a plan change via Dodo Payments without leaving the current page.
 */
export function UpgradePlanButton() {
  const [open, setOpen] = useState(false);
  // Lock body scroll when open so the dialog feels like a full-page
  // experience on mobile.
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          data-testid="header-upgrade-button"
          className={cn(
            "group/upgrade relative h-7 overflow-hidden rounded-full px-3",
            "border border-[#3d9e8c]/30 bg-[#3d9e8c]/10",
            "font-mono text-[10px] uppercase tracking-[0.18em] text-[#3d9e8c]",
            "transition-all hover:border-[#3d9e8c]/60 hover:bg-[#3d9e8c]/20 hover:text-[#5fc4ad]",
          )}
        >
          <span
            aria-hidden
            className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover/upgrade:translate-x-full"
          />
          <Loader2 className="size-0" />
          Upgrade
          <ArrowUpRight className="size-3 transition-transform group-hover/upgrade:-translate-y-0.5 group-hover/upgrade:translate-x-0.5" />
        </Button>
      </DialogTrigger>

      <DialogContent
        // Hand-rolled editorial surface — overrides the default shadcn
        // dialog chrome with a dark, full-width container.
        hideClose
        className={cn(
          "max-w-5xl gap-0 border-white/[0.08] bg-[#070707] p-0",
          "rounded-2xl overflow-hidden",
          "shadow-[0_40px_120px_-20px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.04)]",
        )}
      >
        {/* Visually hidden title for a11y — the visible header is
            inside the upgrade card itself. */}
        <DialogTitle className="sr-only">Upgrade your plan</DialogTitle>

        {/* Custom chrome bar (logo + close) */}
        <div className="relative flex items-center justify-between border-b border-white/[0.06] px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="font-cooper text-base text-white/80">Flare</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-white/30">
              · Plans
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={cn(
              "group flex h-7 w-7 items-center justify-center rounded-full",
              "border border-white/10 bg-white/[0.02] text-white/50",
              "transition-all hover:border-white/30 hover:text-white",
            )}
            aria-label="Close"
          >
            <span
              aria-hidden
              className="relative block h-3 w-3"
            >
              <span className="absolute left-1/2 top-1/2 h-px w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-current transition-transform group-hover:rotate-0" />
              <span className="absolute left-1/2 top-1/2 h-px w-3 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-current transition-transform group-hover:rotate-0" />
            </span>
          </button>
        </div>

        <div className="max-h-[88vh] overflow-y-auto">
          <DodoUpgradeCard />
        </div>
      </DialogContent>
    </Dialog>
  );
}
