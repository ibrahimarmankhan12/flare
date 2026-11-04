import type { BugReportStatus } from "@/hooks/use-bug-bounty";

export const STATUS_BADGE: Record<
  BugReportStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pending: { label: "Pending review", variant: "outline" },
  triaging: { label: "Triaging", variant: "secondary" },
  accepted: { label: "Accepted", variant: "default" },
  duplicate: { label: "Duplicate", variant: "outline" },
  rejected: { label: "Not applicable", variant: "destructive" },
  awarded: { label: "Bounty awarded", variant: "default" },
};
