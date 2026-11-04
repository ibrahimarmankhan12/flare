import { pgDb } from "lib/db/pg/db.pg";
import { SecurityEventTable } from "lib/db/pg/schema.pg";
import { eq, desc } from "drizzle-orm";
import logger from "logger";
import { getAdminConfigSection } from "lib/admin/site-config-reader";
import type {
  RequestMetadata,
  SecurityFlags,
  SecurityEventType,
} from "./types";

const FALLBACK_SECURITY_EVENTS_LOOKBACK = 50;

// ── Flag detection ──────────────────────────────────────────────────

/**
 * Compare the current request metadata against the user's most recent
 * security events to decide whether the device or location is new.
 *
 * "New device"   = the {device, os, browser} triple has never been seen.
 * "New location" = the country differs from the most recent event.
 *
 * If the user has NO prior events (first login/signup) both flags are false
 * since we don't want to alarm a brand-new user.
 */
export const computeSecurityFlags = async (
  userId: string,
  meta: RequestMetadata,
): Promise<SecurityFlags> => {
  try {
    // The lookback window is configurable from the admin security panel.
    const security = await getAdminConfigSection("security").catch(() => null);
    const lookback = Math.max(
      1,
      Math.min(
        500,
        (security?.securityEventsLookback as number | undefined) ??
          FALLBACK_SECURITY_EVENTS_LOOKBACK,
      ),
    );

    // Fetch most recent events for fingerprint matching
    const recentEvents = await pgDb
      .select({
        device: SecurityEventTable.device,
        os: SecurityEventTable.os,
        browser: SecurityEventTable.browser,
        country: SecurityEventTable.country,
      })
      .from(SecurityEventTable)
      .where(eq(SecurityEventTable.userId, userId))
      .orderBy(desc(SecurityEventTable.createdAt))
      .limit(lookback);

    // Brand-new user — nothing to compare against
    if (recentEvents.length === 0) {
      return { isNewDevice: false, isNewLocation: false };
    }

    // ── New device check ──
    const isNewDevice = !recentEvents.some(
      (e) =>
        e.device === meta.device &&
        e.os === meta.os &&
        e.browser === meta.browser,
    );

    // ── New location check (compare against the LAST event only) ──
    const lastCountry = recentEvents[0]?.country ?? null;
    const isNewLocation =
      meta.country !== null &&
      lastCountry !== null &&
      meta.country !== lastCountry;

    return { isNewDevice, isNewLocation };
  } catch (error) {
    logger.error("Failed to compute security flags:", error);
    return { isNewDevice: false, isNewLocation: false };
  }
};

// ── Event storage ───────────────────────────────────────────────────

/**
 * Record a security event and return the computed flags.
 *
 * This is the main function the auth hooks and sensitive routes should call.
 */
export const recordSecurityEvent = async (
  userId: string,
  eventType: SecurityEventType,
  meta: RequestMetadata,
): Promise<SecurityFlags> => {
  const flags = await computeSecurityFlags(userId, meta);

  try {
    await pgDb.insert(SecurityEventTable).values({
      userId,
      eventType,
      ip: meta.ip,
      country: meta.country,
      city: meta.city,
      device: meta.device,
      os: meta.os,
      browser: meta.browser,
      userAgent: meta.userAgent,
      referer: meta.referer,
      isNewDevice: flags.isNewDevice,
      isNewLocation: flags.isNewLocation,
    });

    if (flags.isNewDevice || flags.isNewLocation) {
      logger.warn(
        `Security flag for user ${userId}: newDevice=${flags.isNewDevice}, newLocation=${flags.isNewLocation} (${meta.ip}, ${meta.country})`,
      );
    }
  } catch (error) {
    // Never block the request — just log
    logger.error("Failed to record security event:", error);
  }

  return flags;
};

/**
 * Retrieve recent security events for a user (for account activity page).
 */
export const getRecentSecurityEvents = async (userId: string, limit = 20) => {
  return pgDb
    .select()
    .from(SecurityEventTable)
    .where(eq(SecurityEventTable.userId, userId))
    .orderBy(desc(SecurityEventTable.createdAt))
    .limit(limit);
};
