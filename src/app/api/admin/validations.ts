import { z } from "zod";
import { USER_ROLES, UserRoleNames } from "app-types/roles";
import {
  SUBSCRIPTION_TIER_VALUES,
  SubscriptionTierName,
} from "app-types/subscription";

import { ActionState } from "lib/action-utils";
import { BasicUserWithLastLogin } from "app-types/user";

export const UpdateUserRoleSchema = z.object({
  userId: z.uuid("Invalid user ID"),
  role: z
    .enum(Object.values(USER_ROLES) as [UserRoleNames, ...UserRoleNames[]])
    .optional(),
});

export const UpdateUserBanStatusSchema = z.object({
  userId: z.uuid("Invalid user ID"),
  banned: z.enum(["true", "false"]).transform((value) => value === "true"),
  banReason: z.string().optional(),
});

export const UpdateUserTierSchema = z.object({
  userId: z.uuid("Invalid user ID"),
  tier: z.enum(SUBSCRIPTION_TIER_VALUES).optional(),
});

export type UpdateUserRoleActionState = ActionState & {
  user?: BasicUserWithLastLogin | null;
};

export type UpdateUserBanStatusActionState = ActionState & {
  user?: BasicUserWithLastLogin | null;
};

export type UpdateUserTierActionState = ActionState & {
  user?: BasicUserWithLastLogin | null;
  tier?: SubscriptionTierName;
};
