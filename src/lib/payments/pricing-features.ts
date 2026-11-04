import {
  SUBSCRIPTION_TIERS,
  SubscriptionTierName,
  subscriptionTiersInfo,
} from "app-types/subscription";

/**
 * Per-tier feature matrix used by the upgrade card, the upgrade dialog,
 * and the dedicated /plans page. Edit this to update every surface at once.
 *
 * Values are intentionally qualitative (e.g. "Priority") for limits that
 * vary server-side. Quantitative limits (e.g. "5 / day") use a number; a
 * null means the feature is not included.
 */
export type FeatureGroup = {
  label: string;
  items: Array<{
    key: string;
    label: string;
    hint?: string;
  }>;
};

export type TierFeatureValue = string | number | null | boolean;

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    label: "Usage",
    items: [
      {
        key: "dailyTokens",
        label: "Daily tokens",
        hint: "Resets at 00:00 IST",
      },
      { key: "imageGenerations", label: "Image generations" },
      { key: "imageEdits", label: "Image edits" },
      { key: "voiceMinutes", label: "Realtime voice minutes" },
    ],
  },
  {
    label: "Models",
    items: [
      { key: "modelTier", label: "Model tier" },
      { key: "priorityRouting", label: "Priority routing" },
    ],
  },
  {
    label: "Tools",
    items: [
      { key: "mcpServers", label: "MCP servers" },
      { key: "codeExecution", label: "Sandboxed code execution" },
      { key: "buildSandbox", label: "Build sandbox (E2B)" },
      { key: "browserAgent", label: "Embedded browser agent" },
      { key: "workflows", label: "Visual workflows" },
    ],
  },
  {
    label: "Support",
    items: [{ key: "support", label: "Support" }],
  },
];

const TIER_KEYS_ORDER: SubscriptionTierName[] = [
  SUBSCRIPTION_TIERS.FREE,
  SUBSCRIPTION_TIERS.FLARE_FLARE_PRO,
  SUBSCRIPTION_TIERS.FLARE_FLARE_MAX,
  SUBSCRIPTION_TIERS.FLARE_ENTERPRISES,
  SUBSCRIPTION_TIERS.FLARE_ENTERPRISES_PRO,
  SUBSCRIPTION_TIERS.FLARE_ENTERPRISES_MAX,
];

const TIER_FEATURES: Record<
  SubscriptionTierName,
  Record<string, TierFeatureValue>
> = {
  free: {
    dailyTokens: "10K / day",
    imageGenerations: "3 / day",
    imageEdits: "2 / day",
    voiceMinutes: "—",
    modelTier: "Standard",
    priorityRouting: false,
    mcpServers: "1",
    codeExecution: true,
    buildSandbox: true,
    browserAgent: false,
    workflows: "1 active",
    support: "Community",
  },
  "flare-pro": {
    dailyTokens: "200K / day",
    imageGenerations: "30 / day",
    imageEdits: "20 / day",
    voiceMinutes: "60 min / day",
    modelTier: "Pro",
    priorityRouting: true,
    mcpServers: "5",
    codeExecution: true,
    buildSandbox: true,
    browserAgent: true,
    workflows: "10 active",
    support: "Email",
  },
  "flare-max": {
    dailyTokens: "1M / day",
    imageGenerations: "120 / day",
    imageEdits: "80 / day",
    voiceMinutes: "300 min / day",
    modelTier: "Pro + Flagship",
    priorityRouting: true,
    mcpServers: "Unlimited",
    codeExecution: true,
    buildSandbox: true,
    browserAgent: true,
    workflows: "Unlimited",
    support: "Priority email",
  },
  "flare-enterprises": {
    dailyTokens: "5M / day",
    imageGenerations: "500 / day",
    imageEdits: "300 / day",
    voiceMinutes: "Unlimited",
    modelTier: "Flagship + Custom",
    priorityRouting: true,
    mcpServers: "Unlimited",
    codeExecution: true,
    buildSandbox: true,
    browserAgent: true,
    workflows: "Unlimited",
    support: "Team workspace",
  },
  "flare-enterprises-pro": {
    dailyTokens: "20M / day",
    imageGenerations: "2K / day",
    imageEdits: "1K / day",
    voiceMinutes: "Unlimited",
    modelTier: "All + Private",
    priorityRouting: true,
    mcpServers: "Unlimited",
    codeExecution: true,
    buildSandbox: true,
    browserAgent: true,
    workflows: "Unlimited",
    support: "Priority + Slack",
  },
  "flare-enterprises-max": {
    dailyTokens: "Unlimited",
    imageGenerations: "Unlimited",
    imageEdits: "Unlimited",
    voiceMinutes: "Unlimited",
    modelTier: "Dedicated endpoints",
    priorityRouting: true,
    mcpServers: "Unlimited",
    codeExecution: true,
    buildSandbox: true,
    browserAgent: true,
    workflows: "Unlimited",
    support: "Dedicated CSM + 99.9% SLA",
  },
};

export const getTierFeature = (
  tier: SubscriptionTierName,
  key: string,
): TierFeatureValue => TIER_FEATURES[tier]?.[key] ?? null;

export const PAID_TIER_DISPLAY_ORDER: SubscriptionTierName[] = [
  SUBSCRIPTION_TIERS.FLARE_FLARE_PRO,
  SUBSCRIPTION_TIERS.FLARE_FLARE_MAX,
  SUBSCRIPTION_TIERS.FLARE_ENTERPRISES,
  SUBSCRIPTION_TIERS.FLARE_ENTERPRISES_PRO,
  SUBSCRIPTION_TIERS.FLARE_ENTERPRISES_MAX,
];

export const ALL_TIERS_DISPLAY_ORDER: SubscriptionTierName[] = TIER_KEYS_ORDER;

export const formatPrice = (
  inr: number,
  opts: { withUnit?: boolean; currency?: string } = {},
) => {
  const { withUnit = true, currency = "₹" } = opts;
  if (inr <= 0) return withUnit ? "Free" : "0";
  return `${currency}${inr.toLocaleString("en-IN")}`;
};

export const tierLabel = (tier: SubscriptionTierName): string =>
  subscriptionTiersInfo[tier]?.label ?? tier;

/**
 * Returns a short marketing tag for the tier that the pricing UI surfaces
 * above the price. Empty string when no tag is set.
 */
export const tierTagline = (tier: SubscriptionTierName): string => {
  switch (tier) {
    case "free":
      return "Get started";
    case "flare-pro":
      return "For curious individuals";
    case "flare-max":
      return "Most loved by power users";
    case "flare-enterprises":
      return "Built for small teams";
    case "flare-enterprises-pro":
      return "For fast-moving companies";
    case "flare-enterprises-max":
      return "White-glove for serious scale";
    default:
      return "";
  }
};

export const tierBadge = (tier: SubscriptionTierName): string | null => {
  if (tier === "flare-max") return "Popular";
  if (tier === "flare-enterprises-pro") return "Best value";
  return null;
};
