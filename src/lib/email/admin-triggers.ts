import { sendEmail } from "./resend";
import {
  getPolicyUpdateEmailHtml,
  getAccountDeactivatedEmailHtml,
  getSubscriptionEmailHtml,
} from "./templates";
import { userRepository } from "lib/db/repository";
import logger from "logger";
import { pgDb } from "lib/db/pg/db.pg";
import { UserTable } from "lib/db/pg/schema.pg";

/**
 * Notify ALL users about a policy/TOS change.
 * In production you should queue this via Inngest or QStash.
 */
export const notifyPolicyChange = async () => {
  try {
    // Fetch all user emails + names directly (no getAllUsers helper needed)
    const users = await pgDb
      .select({ email: UserTable.email, name: UserTable.name })
      .from(UserTable);

    const CHUNK_SIZE = 50;
    for (let i = 0; i < users.length; i += CHUNK_SIZE) {
      const chunk = users.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map((u) =>
          sendEmail({
            to: u.email,
            subject: "Important Updates to Our Policies",
            html: getPolicyUpdateEmailHtml(u.name || "User"),
            from: "noreply",
          }),
        ),
      );
    }
    logger.info(`Notified ${users.length} users about policy changes.`);
  } catch (error) {
    logger.error("Failed to notify policy changes:", error);
  }
};

/**
 * Notify a single user that their account has been deactivated/banned.
 */
export const notifyAccountBanned = async (userId: string) => {
  try {
    const user = await userRepository.getUserById(userId);
    if (!user) return;

    const html = getAccountDeactivatedEmailHtml(user.name || "User");

    await sendEmail({
      to: user.email,
      subject: "Account Deactivated — Flare",
      html,
      from: "security",
    });
    logger.info(`Sent ban notification to ${user.email}`);
  } catch (error) {
    logger.error("Failed to send ban notification:", error);
  }
};

/**
 * Notify a single user that their account has been upgraded.
 */
export const notifyAccountUpgraded = async (
  userId: string,
  planName = "Pro",
) => {
  try {
    const user = await userRepository.getUserById(userId);
    if (!user) return;

    const html = getSubscriptionEmailHtml(user.name || "User", planName);

    await sendEmail({
      to: user.email,
      subject: "Subscription Activated — Flare",
      html,
      from: "payments",
    });
    logger.info(`Sent upgrade notification to ${user.email}`);
  } catch (error) {
    logger.error("Failed to send upgrade notification:", error);
  }
};
