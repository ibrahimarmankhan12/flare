"use client";

import { createAuthClient } from "better-auth/react"; // make sure to import from better-auth/react
import { adminClient, inferAdditionalFields } from "better-auth/client/plugins";

import { DEFAULT_USER_ROLE, USER_ROLES } from "app-types/roles";
import { ac, admin, editor, user } from "./roles";
import type { auth } from "./auth-instance";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BASE_URL || typeof window !== "undefined" ? window.location.origin : "",
  plugins: [
    inferAdditionalFields<typeof auth>(),
    adminClient({
      defaultRole: DEFAULT_USER_ROLE,
      adminRoles: [USER_ROLES.ADMIN],
      ac,
      roles: {
        admin,
        editor,
        user,
      },
    }),
  ],
});
