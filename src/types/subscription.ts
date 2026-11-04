export const SUBSCRIPTION_TIERS = {
  FREE: "free",
  FLARE_FLARE_PRO: "flare-pro",
  FLARE_FLARE_MAX: "flare-max",
  FLARE_ENTERPRISES: "flare-enterprises",
  FLARE_ENTERPRISES_PRO: "flare-enterprises-pro",
  FLARE_ENTERPRISES_MAX: "flare-enterprises-max",
} as const;

export type SubscriptionTierName =
  (typeof SUBSCRIPTION_TIERS)[keyof typeof SUBSCRIPTION_TIERS];

export const DEFAULT_SUBSCRIPTION_TIER: SubscriptionTierName =
  SUBSCRIPTION_TIERS.FREE;

export const subscriptionTiersInfo: Record<
  SubscriptionTierName,
  {
    label: string;
    pricePerMonthInr: number;
    description: string;
  }
> = {
  free: {
    label: "Free",
    pricePerMonthInr: 0,
    description: "Default free plan for all users.",
  },
  "flare-pro": {
    label: "Flare Pro",
    pricePerMonthInr: 799,
    description: "Higher daily limits and faster models for power users.",
  },
  "flare-max": {
    label: "Flare Max",
    pricePerMonthInr: 1999,
    description: "Generous limits and priority access to premium models.",
  },
  "flare-enterprises": {
    label: "Flare Enterprises",
    pricePerMonthInr: 3999,
    description: "Team-grade plan with deployment support.",
  },
  "flare-enterprises-pro": {
    label: "Flare Enterprises Pro",
    pricePerMonthInr: 5999,
    description: "Enterprise plan with enhanced security and support.",
  },
  "flare-enterprises-max": {
    label: "Flare Enterprises Max",
    pricePerMonthInr: 10999,
    description: "Highest enterprise tier with dedicated endpoints.",
  },
};

export const SUBSCRIPTION_TIER_VALUES = Object.values(SUBSCRIPTION_TIERS) as [
  SubscriptionTierName,
  ...SubscriptionTierName[],
];

export const normalizeSubscriptionTier = (
  value: string | null | undefined,
): SubscriptionTierName => {
  if (!value) return DEFAULT_SUBSCRIPTION_TIER;
  return SUBSCRIPTION_TIER_VALUES.includes(value as SubscriptionTierName)
    ? (value as SubscriptionTierName)
    : DEFAULT_SUBSCRIPTION_TIER;
};

export const isFreeTier = (value: string | null | undefined): boolean =>
  normalizeSubscriptionTier(value) === SUBSCRIPTION_TIERS.FREE;
