import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";

import { getSession } from "lib/auth/server";
import { bugReportRepository } from "lib/db/repository";
import { Button } from "ui/button";
import { Badge } from "ui/badge";
import { Card, CardContent } from "ui/card";
import { formatBugBountyAmount } from "@/hooks/use-bug-bounty";
import { STATUS_BADGE } from "@/components/bug-bounty/bug-bounty-status";

export const metadata = {
  title: "My bug reports — Flare Bug Bounty",
};

export default async function MyBugReportsPage() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/sign-in?next=/bug-bounty/reports");
  }
  const reports = await bugReportRepository.listByUser(session.user.id);
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16 space-y-8">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">My reports</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Track the status of every report you have submitted to the Flare
            bug bounty.
          </p>
        </div>
        <Button asChild>
          <Link href="/bug-bounty/submit">
            <Plus className="size-4 mr-1" />
            New report
          </Link>
        </Button>
      </header>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            You haven&apos;t submitted any reports yet.{" "}
            <Link
              href="/bug-bounty/submit"
              className="text-primary underline-offset-2 hover:underline"
            >
              Submit your first report
            </Link>{" "}
            to start earning bounties.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => {
            const status = STATUS_BADGE[report.status];
            return (
              <Link
                key={report.id}
                href={`/bug-bounty/reports/${report.id}`}
                className="block"
              >
                <Card className="hover:border-foreground/30 transition-colors">
                  <CardContent className="pt-5 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="font-semibold">{report.title}</div>
                      <Badge variant={status.variant} className="capitalize">
                        {status.label}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="capitalize">
                          {report.severity}
                        </Badge>
                        <Badge variant="outline" className="capitalize">
                          {report.category.replace("-", " ")}
                        </Badge>
                        {report.affectedArea ? (
                          <span>· {report.affectedArea}</span>
                        ) : null}
                        <span>
                          · Submitted{" "}
                          {new Date(report.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {report.status === "awarded" ? (
                        <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                          Bounty:{" "}
                          {formatBugBountyAmount(
                            report.awardedAmountCents,
                            report.awardedCurrency,
                          )}
                        </div>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
