import "server-only";

import { siteConfigRepository } from "lib/db/pg/repositories/site-config-repository.pg";

export interface BugBountyRewardTier {
  severity: "low" | "medium" | "high" | "critical";
  label: string;
  amountCents: number;
  currency: string;
  description: string;
}

export interface BugBountyProgramSettings {
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

const PROGRAM_CONFIG_KEY = "bug-bounty";

export const DEFAULT_BUG_BOUNTY_PROGRAM: BugBountyProgramSettings = {
  enabled: true,
  heroTitle: "Bug Bounty Program",
  heroSubtitle:
    "Help us keep Flare safe. Submit a valid security or product bug and earn a bounty.",
  introMarkdown:
    "Flare rewards researchers and power users who surface real bugs. Reports are triaged within 5 business days, and accepted reports are paid out according to the published severity tiers below.",
  inScope: [
    "flareai.co and all *.flareai.co subdomains",
    "Authenticated chat, agent, workflow, MCP, and Build flows",
    "Account, billing, and OAuth surfaces",
    "REST and streaming API endpoints under /api/*",
  ],
  outOfScope: [
    "Rate-limiting complaints without a reproducible impact",
    "Self-XSS or issues that require physical access to a victim device",
    "Third-party SaaS that we do not operate",
    "Theorised vulnerabilities without a working proof of concept",
    "Best-practice recommendations without a security impact",
  ],
  rewardTiers: [
    {
      severity: "low",
      label: "Low",
      amountCents: 5_000,
      currency: "USD",
      description:
        "Minor issues that affect a small subset of users or require unusual conditions.",
    },
    {
      severity: "medium",
      label: "Medium",
      amountCents: 25_000,
      currency: "USD",
      description:
        "Bugs that materially degrade a core feature or leak non-sensitive information.",
    },
    {
      severity: "high",
      label: "High",
      amountCents: 100_000,
      currency: "USD",
      description:
        "Vulnerabilities that compromise account integrity, data, or authentication boundaries.",
    },
    {
      severity: "critical",
      label: "Critical",
      amountCents: 300_000,
      currency: "USD",
      description:
        "Remote code execution, mass account takeover, or compromise of core infrastructure.",
    },
  ],
  rulesMarkdown:
    "- Be the first to report the issue. Duplicates are credited to the original reporter.\n- Provide a clear reproduction path and impact analysis.\n- Do not access or modify other users' data while testing.\n- Do not perform denial-of-service testing.\n- We may award a higher or lower bounty depending on impact, exploitability, and report quality.",
  disclosurePolicyMarkdown:
    "Please do not publicly disclose the issue until we have shipped a fix or 90 days have passed, whichever comes first. We will coordinate disclosure timing with the reporter.",
  contactEmail: "security@flareai.co",
};

export const getBugBountyProgram = async (): Promise<BugBountyProgramSettings> => {
  try {
    const stored = await siteConfigRepository.getConfig(PROGRAM_CONFIG_KEY);
    if (!stored) return DEFAULT_BUG_BOUNTY_PROGRAM;
    const merged: BugBountyProgramSettings = {
      ...DEFAULT_BUG_BOUNTY_PROGRAM,
      ...stored,
      rewardTiers:
        Array.isArray((stored as any).rewardTiers) &&
        (stored as any).rewardTiers.length > 0
          ? ((stored as any).rewardTiers as BugBountyRewardTier[])
          : DEFAULT_BUG_BOUNTY_PROGRAM.rewardTiers,
    };
    return merged;
  } catch (_err) {
    // The repository depends on the DB. Returning the default keeps the
    // public landing page working even when migrations have not been run.
    return DEFAULT_BUG_BOUNTY_PROGRAM;
  }
};
