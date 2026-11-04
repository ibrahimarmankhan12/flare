"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Award,
  Bug,
  CheckCircle2,
  Clock,
  ExternalLink,
  Mail,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Users,
  XCircle,
} from "lucide-react";

import { Button } from "ui/button";
import { Badge } from "ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "ui/card";
import { Skeleton } from "ui/skeleton";
import {
  BUG_REPORT_STATUS_LABELS,
  formatBugBountyAmount,
  useBugBountyProgram,
} from "@/hooks/use-bug-bounty";

const SEVERITY_TONES: Record<
  "low" | "medium" | "high" | "critical",
  string
> = {
  low: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  medium: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  high: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  critical: "bg-red-500/15 text-red-700 dark:text-red-300",
};

const SEVERITY_RANK: Record<
  "low" | "medium" | "high" | "critical",
  number
> = { low: 0, medium: 1, high: 2, critical: 3 };

export default function BugBountyLandingPage() {
  const { data, isLoading } = useBugBountyProgram();
  const program = data?.program;
  const leaderboard = data?.leaderboard ?? [];
  const stats = data?.stats;

  const tiers = (program?.rewardTiers ?? []).slice().sort((a, b) => {
    return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16 space-y-16">
      {/* HERO */}
      <section className="grid lg:grid-cols-[1.2fr_1fr] gap-10 items-center">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-6"
        >
          <Badge variant="secondary" className="text-xs font-medium">
            <ShieldCheck className="size-3.5 mr-1.5" />
            Responsible disclosure program
          </Badge>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight">
            {program?.heroTitle ?? "Bug Bounty Program"}
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl">
            {program?.heroSubtitle ??
              "Help us keep Flare safe. Submit a valid security or product bug and earn a bounty."}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/bug-bounty/submit">
                <Bug className="size-4 mr-2" />
                Submit a report
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/bug-bounty/reports">
                <Trophy className="size-4 mr-2" />
                See my reports
              </Link>
            </Button>
            {program?.contactEmail ? (
              <Button asChild size="lg" variant="ghost">
                <a href={`mailto:${program.contactEmail}`}>
                  <Mail className="size-4 mr-2" />
                  {program.contactEmail}
                </a>
              </Button>
            ) : null}
          </div>
          {program?.introMarkdown ? (
            <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl whitespace-pre-line">
              {program.introMarkdown}
            </p>
          ) : null}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="grid grid-cols-2 gap-3"
        >
          <StatTile
            label="Total reports"
            value={stats?.totalReports ?? null}
            icon={<Bug className="size-4" />}
            loading={isLoading}
          />
          <StatTile
            label="Accepted"
            value={stats?.acceptedReports ?? null}
            icon={<CheckCircle2 className="size-4" />}
            loading={isLoading}
          />
          <StatTile
            label="Bounties paid"
            value={stats?.awardedReports ?? null}
            icon={<Award className="size-4" />}
            loading={isLoading}
          />
          <StatTile
            label="Total paid out"
            value={
              stats
                ? formatBugBountyAmount(stats.totalAwardedCents, "USD")
                : null
            }
            icon={<Sparkles className="size-4" />}
            loading={isLoading}
            isString
          />
        </motion.div>
      </section>

      {/* REWARDS */}
      <section className="space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Reward tiers
            </h2>
            <p className="text-sm text-muted-foreground">
              Payouts scale with the real-world impact of the report, not just
              the CVSS score.
            </p>
          </div>
        </div>
        {isLoading && !program ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-44 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {tiers.map((tier) => (
              <Card key={tier.severity} className="flex flex-col">
                <CardHeader>
                  <Badge
                    className={cn(
                      "w-fit",
                      SEVERITY_TONES[tier.severity],
                    )}
                  >
                    {tier.label}
                  </Badge>
                  <CardTitle className="text-3xl font-semibold mt-2">
                    {formatBugBountyAmount(tier.amountCents, tier.currency)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {tier.description}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* SCOPE */}
      <section className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="size-4 text-emerald-500" />
              In scope
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {program?.inScope?.length ? (
              <ul className="space-y-1.5">
                {program.inScope.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2 className="size-4 text-emerald-500 mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">
                The scope is being finalised. Please email us if you would like
                to coordinate testing.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <XCircle className="size-4 text-muted-foreground" />
              Out of scope
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {program?.outOfScope?.length ? (
              <ul className="space-y-1.5">
                {program.outOfScope.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <XCircle className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      </section>

      {/* RULES */}
      {program?.rulesMarkdown ? (
        <section className="space-y-3">
          <h2 className="text-2xl font-semibold tracking-tight">
            Rules of engagement
          </h2>
          <Card>
            <CardContent className="pt-6 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
              {program.rulesMarkdown}
            </CardContent>
          </Card>
        </section>
      ) : null}

      {/* LEADERBOARD */}
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Trophy className="size-5 text-amber-500" />
              Top reporters
            </h2>
            <p className="text-sm text-muted-foreground">
              Researchers who have earned the most from this program.
            </p>
          </div>
        </div>
        {isLoading && !program ? (
          <Skeleton className="h-40 w-full" />
        ) : leaderboard.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground flex items-center gap-2">
              <Users className="size-4" />
              No awards yet. Be the first to submit a valid report.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-4 py-3 font-medium">Researcher</th>
                    <th className="px-4 py-3 font-medium">Accepted</th>
                    <th className="px-4 py-3 font-medium">Awarded</th>
                    <th className="px-4 py-3 font-medium text-right">
                      Total earned
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry, idx) => (
                    <tr
                      key={entry.userId}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="px-4 py-3 font-semibold">
                        {idx === 0
                          ? "🥇"
                          : idx === 1
                            ? "🥈"
                            : idx === 2
                              ? "🥉"
                              : `#${idx + 1}`}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {entry.userName || entry.userEmail}
                        </div>
                        {entry.userName && entry.userEmail ? (
                          <div className="text-xs text-muted-foreground">
                            {entry.userEmail}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">{entry.acceptedCount}</td>
                      <td className="px-4 py-3">{entry.awardedCount}</td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {formatBugBountyAmount(
                          entry.totalAwardedCents,
                          entry.currency || "USD",
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {/* DISCLOSURE POLICY */}
      {program?.disclosurePolicyMarkdown ? (
        <section className="space-y-3">
          <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Clock className="size-5 text-primary" />
            Disclosure policy
          </h2>
          <Card>
            <CardContent className="pt-6 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
              {program.disclosurePolicyMarkdown}
            </CardContent>
          </Card>
        </section>
      ) : null}

      {/* CTA */}
      <section className="text-center space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">
          Found something interesting?
        </h2>
        <p className="text-muted-foreground">
          Reproduce it, capture the impact, and submit a clear report. We will
          triage within 5 business days.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/bug-bounty/submit">
              <Bug className="size-4 mr-2" />
              Submit a report
            </Link>
          </Button>
          <Button asChild size="lg" variant="ghost">
            <Link href="https://github.com/Flare-Labs/flare-ai" target="_blank">
              <ExternalLink className="size-4 mr-2" />
              View source on GitHub
            </Link>
          </Button>
        </div>
      </section>

      <p className="text-xs text-muted-foreground text-center">
        Reports are stored in the bug-report table. Statuses:{" "}
        {Object.values(BUG_REPORT_STATUS_LABELS).join(" · ")}
      </p>
    </div>
  );
}

function StatTile(props: {
  label: string;
  value: number | string | null;
  icon: React.ReactNode;
  loading: boolean;
  isString?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          {props.icon}
          {props.label}
        </div>
        {props.loading ? (
          <Skeleton className="h-7 w-20 mt-2" />
        ) : (
          <div className="text-2xl font-semibold mt-1.5">
            {props.value ?? "—"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Local cn util to avoid an import path debate inside a "use client" file.
function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
