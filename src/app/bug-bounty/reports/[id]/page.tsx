import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getSession } from "lib/auth/server";
import { bugReportRepository } from "lib/db/repository";
import { Badge } from "ui/badge";
import { Button } from "ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "ui/card";
import { Separator } from "ui/separator";
import { ChevronLeft, ExternalLink, Mail } from "lucide-react";
import { formatBugBountyAmount } from "@/hooks/use-bug-bounty";
import { STATUS_BADGE } from "@/components/bug-bounty/bug-bounty-status";
import { BugReportComments } from "@/components/bug-bounty/bug-report-comments";

export const metadata = {
  title: "Bug report — Flare Bug Bounty",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BugReportDetailPage({ params }: PageProps) {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/sign-in?next=/bug-bounty/reports");
  }
  const { id } = await params;
  const report = await bugReportRepository.getByIdForUser(id, session.user.id);
  if (!report) {
    notFound();
  }
  const status = STATUS_BADGE[report.status];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16 space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/bug-bounty/reports">
            <ChevronLeft className="size-4 mr-1" />
            Back to my reports
          </Link>
        </Button>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            {report.title}
          </h1>
          <Badge variant={status.variant} className="capitalize">
            {status.label}
          </Badge>
        </div>
        <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
          <Badge variant="outline" className="capitalize">
            {report.severity}
          </Badge>
          <Badge variant="outline" className="capitalize">
            {report.category.replace("-", " ")}
          </Badge>
          {report.affectedArea ? <span>· {report.affectedArea}</span> : null}
          <span>· Submitted {new Date(report.createdAt).toLocaleString()}</span>
          {report.resolvedAt ? (
            <span>· Updated {new Date(report.resolvedAt).toLocaleString()}</span>
          ) : null}
        </div>
      </div>

      {report.status === "awarded" ? (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="pt-5 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-wide text-emerald-600 dark:text-emerald-400 font-semibold">
                Bounty awarded
              </div>
              <div className="text-2xl font-semibold mt-1">
                {formatBugBountyAmount(
                  report.awardedAmountCents,
                  report.awardedCurrency,
                )}
              </div>
              {report.awardedAt ? (
                <div className="text-xs text-muted-foreground mt-0.5">
                  Awarded {new Date(report.awardedAt).toLocaleString()}
                </div>
              ) : null}
            </div>
            <Button variant="outline" asChild>
              <a href="mailto:security@flareai.co">
                <Mail className="size-4 mr-1" />
                Contact security
              </a>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-line text-sm leading-relaxed">
            {report.description}
          </p>
        </CardContent>
      </Card>

      {report.reproductionSteps ? (
        <Card>
          <CardHeader>
            <CardTitle>Steps to reproduce</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
              {report.reproductionSteps}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      {report.impact ? (
        <Card>
          <CardHeader>
            <CardTitle>Impact</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line text-sm leading-relaxed">
              {report.impact}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {report.proofOfConcept ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Proof of concept
              <ExternalLink className="size-3.5 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm whitespace-pre-wrap font-mono bg-muted/40 p-3 rounded-md overflow-x-auto">
              {report.proofOfConcept}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      <Separator />

      <BugReportComments reportId={report.id} locked={report.status !== "pending" && report.status !== "triaging" && report.status !== "accepted"} />
    </div>
  );
}
