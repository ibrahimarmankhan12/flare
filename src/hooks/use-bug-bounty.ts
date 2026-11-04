"use client";

import useSWR from "swr";
import { fetcher } from "lib/utils";

export type BugReportSeverity = "low" | "medium" | "high" | "critical";

export type BugReportStatus =
  | "pending"
  | "triaging"
  | "accepted"
  | "duplicate"
  | "rejected"
  | "awarded";

export interface BugReport {
  id: string;
  userId: string;
  title: string;
  description: string;
  severity: BugReportSeverity;
  category: string;
  affectedArea: string | null;
  reproductionSteps: string;
  impact: string;
  proofOfConcept: string | null;
  status: BugReportStatus;
  awardedAmountCents: number | null;
  awardedCurrency: string;
  awardedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BugReportComment {
  id: string;
  reportId: string;
  userId: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
  userName?: string;
  userImage?: string | null;
}

export interface BugBountyRewardTier {
  severity: BugReportSeverity;
  label: string;
  amountCents: number;
  currency: string;
  description: string;
}

export interface BugBountyProgram {
  enabled: boolean;
  heroTitle: string;
  heroSubtitle: string;
  introMarkdown: string;
  inScope: string[];
  outOfScope: string[];
  rewardTiers: BugBountyRewardTier[];
  rulesMarkdown: string;
  disclosurePolicyMarkdown: string;
  contactEmail: string;
}

export interface BugBountyLeaderboardEntry {
  userId: string;
  userName: string;
  userEmail: string;
  userImage: string | null;
  acceptedCount: number;
  awardedCount: number;
  totalAwardedCents: number;
  currency: string;
}

export interface BugBountyStats {
  totalReports: number;
  acceptedReports: number;
  awardedReports: number;
  totalAwardedCents: number;
}

export interface BugBountyProgramResponse {
  program: BugBountyProgram;
  leaderboard: BugBountyLeaderboardEntry[];
  stats: BugBountyStats;
}

export function useBugBountyProgram() {
  return useSWR<BugBountyProgramResponse>(
    "/api/bug-bounty/program",
    fetcher,
    { revalidateOnFocus: false },
  );
}

export function useMyBugReports() {
  return useSWR<{ reports: BugReport[] }>(
    "/api/bug-bounty/reports",
    fetcher,
    { revalidateOnFocus: false },
  );
}

export function useBugReport(id: string | null) {
  return useSWR<{ report: BugReport }>(
    id ? `/api/bug-bounty/reports/${id}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
}

export function useBugReportComments(id: string | null) {
  return useSWR<{ comments: BugReportComment[] }>(
    id ? `/api/bug-bounty/reports/${id}/comments` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
}

export const BUG_REPORT_CATEGORY_OPTIONS = [
  { value: "security", label: "Security" },
  { value: "ui-ux", label: "UI / UX" },
  { value: "performance", label: "Performance" },
  { value: "data-loss", label: "Data loss" },
  { value: "auth", label: "Auth & account" },
  { value: "billing", label: "Billing" },
  { value: "ai-output", label: "AI output" },
  { value: "mcp", label: "MCP / Tools" },
  { value: "build", label: "Build / Sandbox" },
  { value: "other", label: "Other" },
] as const;

export const BUG_REPORT_SEVERITY_OPTIONS: Array<{
  value: BugReportSeverity;
  label: string;
  description: string;
}> = [
  {
    value: "low",
    label: "Low",
    description: "Cosmetic or low-impact issue.",
  },
  {
    value: "medium",
    label: "Medium",
    description: "Materially degrades a core feature.",
  },
  {
    value: "high",
    label: "High",
    description: "Compromises account or data integrity.",
  },
  {
    value: "critical",
    label: "Critical",
    description: "Account takeover, RCE, or mass-impact.",
  },
];

export const BUG_REPORT_STATUS_LABELS: Record<BugReportStatus, string> = {
  pending: "Pending review",
  triaging: "Triaging",
  accepted: "Accepted",
  duplicate: "Duplicate",
  rejected: "Not applicable",
  awarded: "Bounty awarded",
};

export const BUG_REPORT_STATUS_TONES: Record<
  BugReportStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "outline",
  triaging: "secondary",
  accepted: "default",
  duplicate: "outline",
  rejected: "destructive",
  awarded: "default",
};

export const formatBugBountyAmount = (
  cents: number | null | undefined,
  currency: string = "USD",
): string => {
  if (cents == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(0)} ${currency}`;
  }
};
