import { DEFAULT_USER_ROLE, USER_ROLES } from "app-types/roles";
// Base auth instance without "server-only" - can be used in seed scripts
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import {
  admin as adminPlugin,
  organization as organizationPlugin,
} from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  AccountTable,
  SessionTable,
  UserTable,
  VerificationTable,
} from "lib/db/pg/schema.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { userRepository } from "lib/db/repository";
import { sendEmail } from "lib/email/resend";
import {
  getLoginAlertEmailHtml,
  getWelcomeEmailHtml,
} from "lib/email/templates";
import { getRequestMetadata, recordSecurityEvent } from "lib/security";
import logger from "logger";
import { headers } from "next/headers";
import { getAuthConfig } from "./config";
import { onUserCreateCreatePersonalTeam } from "./org-hooks";
import { ac, admin, editor, user } from "./roles";

const {
  emailAndPasswordEnabled,
  signUpEnabled,
  socialAuthenticationProviders,
} = getAuthConfig();

const parsePositiveIntEnv = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const authSessionExpiresIn = parsePositiveIntEnv(
  process.env.AUTH_SESSION_EXPIRES_IN_SECONDS,
  60 * 60 * 24, // 24 hours
);
const authSessionUpdateAge = parsePositiveIntEnv(
  process.env.AUTH_SESSION_UPDATE_AGE_SECONDS,
  60 * 60 * 24, // 24 hours
);
const authSessionCookieCacheMaxAge = parsePositiveIntEnv(
  process.env.AUTH_SESSION_COOKIE_CACHE_MAX_AGE_SECONDS,
  60 * 60 * 24, // 24 hours
);

const cleanEnv = (value: string | undefined) => value?.trim();
const cleanBaseUrl = (value: string | undefined) =>
  cleanEnv(value)?.replace(/\/+$/, "");

const options = {
  secret: cleanEnv(process.env.BETTER_AUTH_SECRET)!,
  plugins: [
    adminPlugin({
      defaultRole: DEFAULT_USER_ROLE,
      adminRoles: [USER_ROLES.ADMIN],
      ac,
      roles: {
        admin,
        editor,
        user,
      },
    }),
    // -------------------------------------------------------------------------
    // P4.A — Better Auth `organization` plugin (#19 Team seats)
    // -------------------------------------------------------------------------
    // Enabled for its `createOrganization` / `acceptInvitation` /
    // `setActiveOrganization` flow helpers. The plugin's own
    // `organization` / `member` / `invitation` tables are INTENTIONALLY
    // UNUSED — our hand-rolled `team` / `team_member` tables (see
    // `src/lib/db/pg/schema.pg.ts`) are the canonical org table. The
    // personal team is mirrored into `team` by the
    // `onUserCreateCreatePersonalTeam` hook wired into the
    // `databaseHooks.user.create.after` chain below. Do not flip
    // `teams.enabled` to `true` — sub-teams are modelled through
    // `team_member.role` instead.
    // -------------------------------------------------------------------------
    organizationPlugin({
      allowUserToCreateOrganization: true,
      organizationLimit: 10,
      teams: { enabled: false },
    }),
    nextCookies(),
  ],
  baseURL:
    cleanBaseUrl(process.env.FLARE_AUTH_URL) ||
    cleanBaseUrl(process.env.NEXT_PUBLIC_BASE_URL),
  user: {
    changeEmail: {
      enabled: true,
    },
    deleteUser: {
      enabled: true,
    },
  },
  database: drizzleAdapter(pgDb, {
    provider: "pg",
    schema: {
      user: UserTable,
      session: SessionTable,
      account: AccountTable,
      verification: VerificationTable,
    },
  }),
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // This hook ONLY runs during user creation (sign-up), not on sign-in
          // Use our optimized getIsFirstUser function with caching
          const isFirstUser = await getIsFirstUser();

          // Set role based on whether this is the first user
          const role = isFirstUser ? USER_ROLES.ADMIN : DEFAULT_USER_ROLE;

          // Capture the IP address at the moment of account creation
          let createdIp: string | null = null;
          try {
            const meta = await getRequestMetadata();
            createdIp = meta.ip && meta.ip !== "unknown" ? meta.ip : null;
            logger.info(
              `User signup from IP ${createdIp} (${meta.country ?? "?"}/${meta.city ?? "?"}) — ${user.email}`,
            );
          } catch (e) {
            logger.error("Failed to capture IP for new user:", e);
          }

          logger.info(
            `User creation hook: ${user.email} will get role: ${role} (isFirstUser: ${isFirstUser})`,
          );

          return {
            data: {
              ...user,
              role,
              createdIp,
              lastIp: createdIp,
            },
          };
        },
        after: async (user) => {
          try {
            const meta = await getRequestMetadata();

            // Record the signup security event
            await recordSecurityEvent(user.id, "signup", meta);

            // Send welcome email
            const emailHtml = getWelcomeEmailHtml(
              user.name || "User",
              user.email,
              meta,
            );
            await sendEmail({
              to: user.email,
              subject: "Welcome to Flare AI! 🚀",
              html: emailHtml,
              from: "auth",
            });

            // P4.A — auto-create a personal team for the new user
            // (#19 Team seats). Best-effort: failures are logged but
            // never block sign-up.
            await onUserCreateCreatePersonalTeam({
              id: user.id,
              name: user.name,
            });
          } catch (error) {
            logger.error("Failed to send signup email:", error);
          }
        },
      },
      update: {
        after: async (_user) => {
          try {
            // In better-auth, the 'user' parameter in 'after' is the updated user record.
            // If they are banned, we can send the notification.
            // Note: This might trigger multiple times if they are updated while banned,
            // but for simplicity, we trigger if they are actively banned in this update.
          } catch (error) {
            logger.error("Error in user update hook:", error);
          }
        },
      },
    },
    session: {
      create: {
        after: async (session) => {
          try {
            const userRec = await userRepository.getUserById(session.userId);
            if (!userRec) return;

            const meta = await getRequestMetadata();
            const currentIp = meta.ip && meta.ip !== "unknown" ? meta.ip : null;

            // Always update lastIp on any session (login or signup)
            if (currentIp) {
              try {
                await pgDb
                  .update(UserTable)
                  .set({ lastIp: currentIp, updatedAt: new Date() })
                  .where(eq(UserTable.id, session.userId));
              } catch (e) {
                logger.error("Failed to update user lastIp:", e);
              }
            }

            // Only send login email if it's not a fresh signup (session created > 1 minute after user creation)
            const timeDiffMs =
              new Date(session.createdAt).getTime() -
              new Date(userRec.createdAt).getTime();
            const isLogin = timeDiffMs > 60000;

            if (isLogin) {
              // Record login security event + get flags
              const flags = await recordSecurityEvent(
                session.userId,
                "login",
                meta,
              );

              // Send login alert email
              const emailHtml = getLoginAlertEmailHtml(
                userRec.name || "User",
                userRec.email,
                meta,
              );
              await sendEmail({
                to: userRec.email,
                subject:
                  flags.isNewDevice || flags.isNewLocation
                    ? "⚠️ Unusual Login Detected — Flare"
                    : "New Login Detected — Flare",
                html: emailHtml,
                from:
                  flags.isNewDevice || flags.isNewLocation
                    ? "security"
                    : "auth",
              });
            }
          } catch (error) {
            logger.error("Failed to send signin email:", error);
          }
        },
      },
    },
  },
  emailAndPassword: {
    enabled: emailAndPasswordEnabled,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    disableSignUp: !signUpEnabled,
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: authSessionCookieCacheMaxAge,
    },
    expiresIn: authSessionExpiresIn,
    updateAge: authSessionUpdateAge,
  },
  advanced: {
    useSecureCookies:
      process.env.USE_SECURE_COOKIES === "1"
        ? true
        : process.env.USE_SECURE_COOKIES === "0"
          ? false
          : process.env.NODE_ENV === "production",
    database: {
      generateId: false,
    },
  },
  account: {
    accountLinking: {
      trustedProviders: (
        Object.keys(
          socialAuthenticationProviders,
        ) as (keyof typeof socialAuthenticationProviders)[]
      ).filter((key) => socialAuthenticationProviders[key]),
    },
  },
  socialProviders: socialAuthenticationProviders,
} satisfies BetterAuthOptions;

export const auth = betterAuth({
  ...options,
  plugins: [...(options.plugins ?? [])],
});

const bannedSessionCleanupCache = new Map<string, number>();
const BANNED_CLEANUP_THROTTLE_MS = 60 * 1000;

const shouldRunBannedCleanup = (userId: string): boolean => {
  const now = Date.now();
  const previous = bannedSessionCleanupCache.get(userId);
  if (previous && now - previous < BANNED_CLEANUP_THROTTLE_MS) {
    return false;
  }

  bannedSessionCleanupCache.set(userId, now);
  return true;
};

const purgeBannedUserAccess = async (userId: string) => {
  if (!shouldRunBannedCleanup(userId)) {
    return;
  }

  try {
    await pgDb.delete(SessionTable).where(eq(SessionTable.userId, userId));

    // Revoke upstream OAuth tokens stored on linked auth accounts.
    await pgDb
      .update(AccountTable)
      .set({
        accessToken: null,
        refreshToken: null,
        idToken: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(AccountTable.userId, userId));

    // Disable app connector tokens (Gmail/Outlook/etc.).
    await pgDb
      .update(UserConnectorTable)
      .set({
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        isConnected: false,
        updatedAt: new Date(),
      })
      .where(eq(UserConnectorTable.userId, userId));
  } catch (error) {
    logger.error("Failed to purge banned user auth/session data:", error);
  }
};

export const getSession = async () => {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session) {
      logger.error("No session found");
      return null;
    }

    if (session?.user?.banned) {
      await purgeBannedUserAccess(session.user.id);
      logger.warn(
        `Blocked request for banned user and purged auth/session state: ${session.user.id}`,
      );
      return null;
    }

    return session;
  } catch (error) {
    logger.error("Error getting session:", error);
    return null;
  }
};

// Cache the first user check to avoid repeated DB queries
let isFirstUserCache: boolean | null = null;

export const getIsFirstUser = async () => {
  // If we already know there's at least one user, return false immediately
  // This in-memory cache prevents any DB calls once we know users exist
  if (isFirstUserCache === false) {
    return false;
  }

  try {
    // Direct database query - simple and reliable
    const userCount = await userRepository.getUserCount();
    const isFirstUser = userCount === 0;

    // Once we have at least one user, cache it permanently in memory
    if (!isFirstUser) {
      isFirstUserCache = false;
    }

    return isFirstUser;
  } catch (error) {
    logger.error("Error checking if first user:", error);
    // Cache as false on error to prevent repeated attempts
    isFirstUserCache = false;
    return false;
  }
};
