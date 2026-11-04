import { SUBSCRIPTION_TIER_VALUES } from "app-types/subscription";
import { z } from "zod";

export const CreateDodoCheckoutSchema = z.object({
  tier: z.enum(
    SUBSCRIPTION_TIER_VALUES.filter((t) => t !== "free") as [
      string,
      ...string[],
    ],
  ),
});

export type CreateDodoCheckoutInput = z.infer<typeof CreateDodoCheckoutSchema>;
