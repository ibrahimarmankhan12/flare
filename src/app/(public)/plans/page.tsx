import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { PlansPageContent } from "@/components/payments/plans-page-content";

export const metadata: Metadata = {
  title: "Plans & Pricing — Flare AI",
  description:
    "Pick the plan that fits your ambition. Free, Pro, Max, and Enterprise tiers for individuals, teams, and fleets. Secure billing by Dodo Payments.",
  alternates: { canonical: "/plans" },
  openGraph: {
    title: "Plans & Pricing — Flare AI",
    description:
      "Five plans, one surface. Choose how much intelligence you want at your fingertips.",
    type: "website",
  },
};

export default function PlansPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#050505]">
          <Loader2 className="size-5 animate-spin text-white/50" />
        </div>
      }
    >
      <PlansPageContent />
    </Suspense>
  );
}
