import { redirect } from "next/navigation";

import { getSession } from "lib/auth/server";
import { BugBountySubmitForm } from "@/components/bug-bounty/bug-bounty-submit-form";

export const metadata = {
  title: "Submit a bug report — Flare Bug Bounty",
};

export default async function SubmitBugReportPage() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/sign-in?next=/bug-bounty/submit");
  }
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Submit a bug report
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          Be specific, reproducible, and clear about impact. The stronger your
          report, the faster we can triage and the higher the chance of a
          bounty.
        </p>
      </header>
      <BugBountySubmitForm />
    </div>
  );
}
