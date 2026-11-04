import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { LogIn } from "lucide-react";

type Section = {
  id: string;
  title: string;
  summary: string;
  paragraphs?: string[];
  bullets?: string[];
  subSections?: {
    title: string;
    paragraphs?: string[];
    bullets?: string[];
  }[];
};

const sections: Section[] = [
  {
    id: "purchases-billing",
    title: "Purchases & Billing",
    summary: "What you may buy and how billing works.",
    paragraphs: [
      "Flare AI may offer paid subscriptions, one-time credit purchases, upgrades or add-ons, and API usage-based billing.",
      "All payments are processed securely through authorized payment providers.",
    ],
  },
  {
    id: "refund-eligibility",
    title: "Refund Eligibility",
    summary: "When refunds may be granted (not guaranteed).",
    paragraphs: [
      "Refund approval is not guaranteed unless it fits the situations below.",
    ],
    subSections: [
      {
        title: "Accidental or Duplicate Purchases",
        paragraphs: [
          "You may request a refund if you purchased the same plan or credits twice, or were charged more than once due to a billing error.",
        ],
      },
      {
        title: "Technical Issues",
        paragraphs: [
          "Refunds may be approved if the service was completely unusable, a major outage prevented usage for an extended period, or you could not access paid features despite support attempts.",
        ],
      },
      {
        title: "Unauthorized Transactions",
        paragraphs: [
          "If a payment was made without your permission, notify us immediately. Verification may be required before issuing a refund.",
        ],
      },
    ],
  },
  {
    id: "non-refundable",
    title: "Non-Refundable Situations",
    summary: "When refunds are not provided.",
    bullets: [
      "Change of mind.",
      "Unused time on a subscription after cancellation.",
      "Remaining unused credits.",
      "Dissatisfaction with AI responses.",
      "Temporary downtime or minor issues.",
      "Misuse or violation of Terms of Service.",
    ],
    paragraphs: [
      "All digital goods are considered delivered once added to your account.",
    ],
  },
  {
    id: "subscription-cancellations",
    title: "Subscription Cancellations",
    summary: "How cancellations work.",
    paragraphs: [
      "You may cancel your subscription at any time. Your plan stays active until the end of the current billing period, no future payments are charged, and no partial-period refunds are issued.",
    ],
  },
  {
    id: "refund-process",
    title: "Refund Request Process",
    summary: "What to send and how we review.",
    paragraphs: [
      "To request a refund, contact us with your full name, account email, payment method, transaction ID or receipt, and the reason for your request.",
      "We aim to review all refund requests within 7 business days.",
    ],
  },
  {
    id: "chargebacks",
    title: "Chargebacks",
    summary: "What happens if you open a dispute.",
    paragraphs: [
      "If you initiate a chargeback, your Flare AI account may be suspended and prior usage may be reviewed for violations. We may dispute invalid chargebacks. Contact us first — most issues are resolved quickly.",
    ],
  },
  {
    id: "policy-updates",
    title: "Policy Updates",
    summary: "How changes are communicated.",
    paragraphs: [
      "We may update this policy; changes will be posted with an updated effective date.",
    ],
  },
  {
    id: "contact",
    title: "Contact Us",
    summary: "How to reach us for refunds or cancellations.",
    paragraphs: [
      "Email: support@flare-sh.tech",
      "Website: https://flare-sh.tech",
    ],
  },
];

export const metadata: Metadata = {
  title: "Refund Policy | Flare AI",
  description:
    "Learn how Flare AI handles refunds, cancellations, and chargebacks.",
};

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-zinc-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 pb-16 pt-10 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-6 border-b border-zinc-800 pb-8 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="group flex items-center gap-3">
            <div className="relative h-10 w-10 overflow-hidden rounded-lg bg-zinc-900 ring-1 ring-zinc-800">
              <Image
                src="/flare-logo-192.webp"
                alt="Flare AI logo"
                fill
                priority
                sizes="40px"
                className="object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <div className="leading-tight">
              <p className="text-sm uppercase tracking-[0.12em] text-zinc-400">
                Flare AI
              </p>
              <p className="text-lg font-semibold text-white">Refund Policy</p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300 ring-1 ring-emerald-500/40">
              Effective: December 8, 2025
            </span>
            <Link
              href="/sign-in"
              className="flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/10 transition hover:bg-white/10 hover:ring-white/30"
            >
              <LogIn className="h-4 w-4" />
              Login
            </Link>
          </div>
        </header>

        <div className="grid gap-10 lg:grid-cols-[260px_1fr]">
          <aside className="sticky top-8 h-fit rounded-2xl border border-white/5 bg-white/[0.03] p-4 shadow-[0_10px_60px_-40px_rgba(0,0,0,0.6)]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-white">Topics</p>
              <span className="rounded-full bg-white/5 px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-zinc-400">
                Navigate
              </span>
            </div>
            <nav className="space-y-1 text-sm">
              {sections.map((section) => (
                <Link
                  key={section.id}
                  href={`#${section.id}`}
                  className="block rounded-lg px-3 py-2 text-zinc-300 transition hover:bg-white/5 hover:text-white"
                >
                  {section.title}
                </Link>
              ))}
            </nav>
          </aside>

          <article className="space-y-10">
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-6 shadow-[0_10px_60px_-40px_rgba(0,0,0,0.6)]">
              <p className="text-sm text-zinc-300">
                Thank you for using Flare AI.
              </p>
              <p className="mt-2 text-xl font-semibold text-white">
                This Refund & Cancellation Policy explains when refunds are
                granted, how cancellations work, and what to expect after
                requesting one. By purchasing or using any paid feature of Flare
                AI, you agree to this policy.
              </p>
            </div>

            {sections.map((section, index) => (
              <section
                key={section.id}
                id={section.id}
                aria-labelledby={`${section.id}-title`}
                className="scroll-mt-24 rounded-2xl border border-white/5 bg-white/[0.02] p-6 shadow-[0_10px_60px_-40px_rgba(0,0,0,0.6)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-zinc-400">
                      {String(index + 1).padStart(2, "0")}
                    </p>
                    <h2
                      id={`${section.id}-title`}
                      className="mt-1 text-xl font-semibold text-white"
                    >
                      {section.title}
                    </h2>
                    <p className="mt-1 text-sm text-zinc-300">
                      {section.summary}
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-200">
                  {section.paragraphs?.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}

                  {section.bullets && (
                    <ul className="list-disc space-y-2 pl-5 text-zinc-200">
                      {section.bullets.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}

                  {section.subSections?.map((sub) => (
                    <div
                      key={sub.title}
                      className="space-y-2 rounded-xl bg-white/5 p-4 text-zinc-100"
                    >
                      <p className="text-sm font-semibold text-white">
                        {sub.title}
                      </p>
                      {sub.paragraphs?.map((paragraph) => (
                        <p key={paragraph} className="text-sm text-zinc-200">
                          {paragraph}
                        </p>
                      ))}
                      {sub.bullets && (
                        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-200">
                          {sub.bullets.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}

                  {section.id === "contact" && (
                    <div className="flex flex-wrap gap-3 pt-2 text-sm">
                      <Link
                        href="mailto:support@flare-sh.tech"
                        className="inline-flex items-center justify-center rounded-full bg-white/10 px-4 py-2 font-medium text-white ring-1 ring-white/20 transition hover:bg-white/20"
                      >
                        Email Support
                      </Link>
                      <Link
                        href="https://flare-sh.tech"
                        className="inline-flex items-center justify-center rounded-full bg-emerald-500/15 px-4 py-2 font-medium text-emerald-100 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/25"
                      >
                        Visit Website
                      </Link>
                    </div>
                  )}
                </div>
              </section>
            ))}
          </article>
        </div>
      </div>
    </div>
  );
}
