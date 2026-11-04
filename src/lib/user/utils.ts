import { USER_ROLES } from "app-types/roles";
import { parseRoleString } from "lib/auth/types";

export const getUserAvatar = (user: { image?: string | null }): string => {
  const disableDefaultAvatar = process.env.DISABLE_DEFAULT_AVATAR === "true";
  return user.image || (disableDefaultAvatar ? "" : "/pf.png");
};

export const getIsUserAdmin = (user?: { role?: string | null }): boolean => {
  return parseRoleString(user?.role) === USER_ROLES.ADMIN;
};
