import "server-only";

import type { UserSkill } from "app-types/user";
import { createScheduledJobForUser } from "lib/scheduler/jobs";
import { validateCron } from "lib/scheduler";

// ---------------------------------------------------------------------------
// P3.1 — #11 scheduled agents. The /schedule slash skill.
//
// `scheduleSkill` is a built-in UserSkill that teaches the LLM how to parse
// `/schedule 0 9 * * * <message>` invocations. The user types the slash
// command, the chat layer resolves it to this skill's markdown (via the
// `BUILT_IN_SKILLS` fallback in `lib/ai/skills/index.ts`), and the model
// then emits a structured tool call that the chat route dispatches to
// `createScheduledJobFromSkill`.
//
// Parsing here is deliberately tiny — the same rules as the cron parser
// upstream, so the user sees consistent errors at chat-time and at tick
// time. We never call the LLM to validate the cron.
// ---------------------------------------------------------------------------

export const SCHEDULE_SKILL_NAME = "schedule";
const SCHEDULE_SKILL_ID = "built-in-schedule";

const SCHEDULE_MARKDOWN = `# /schedule

Schedule the current agent to run on a cron schedule.

## Usage

\`/schedule <cron> <message…>\`

- **cron** — 5-field cron expression: \`minute hour day-of-month month day-of-week\`.
  - minute: 0-59
  - hour: 0-23
  - day-of-month: 1-31
  - month: 1-12
  - day-of-week: 0-6 (Sun=0)
  - Supports \`*\`, \`,\`, \`-\`, \`/\`. Example: \`0 9 * * 1-5\` = weekdays at 9am.
- **message** — the trigger message that gets sent to the assistant on every run.

One-shot timer shorthand is also supported:

- \`/schedule in 5 minutes check deploy\`
- \`/schedule in 2 hours send me a reminder\`

## Examples

- \`/schedule 0 9 * * 1-5 morning standup reminder\`
- \`/schedule */15 * * * * check the deploy dashboard\`
- \`/schedule 0 0 1 * * send monthly recap\`

## Notes

- The job is created with status \`active\`. Pause / resume from the schedules UI.
- One-shot timers are disabled after their first run.
- Runs are logged in the \`scheduled_run\` table — failed runs preserve the
  error message for inspection.
`;

export const scheduleSkill: UserSkill = {
  id: SCHEDULE_SKILL_ID,
  name: SCHEDULE_SKILL_NAME,
  description:
    "Schedule this agent to run on a cron. Usage: /schedule 0 9 * * * <message>",
  markdown: SCHEDULE_MARKDOWN,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

export type ParsedScheduleArgs =
  | {
      ok: true;
      scheduleType: "once" | "recurring";
      cron?: string;
      runAt?: Date;
      triggerMessage: string;
      name: string;
    }
  | { ok: false; error: string };

const CRON_TOKENS = 5;

const slugify = (text: string): string => {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "scheduled-job";
};

export const parseScheduleArgs = (text: string): ParsedScheduleArgs => {
  // Strip the leading /schedule prefix (we don't actually receive it here
  // — the chat layer cleans it before dispatch — but be defensive).
  const cleaned = text.replace(/^\s*\/+schedule\b\s*/i, "").trim();
  if (!cleaned) {
    return {
      ok: false,
      error: "Empty /schedule invocation. Usage: /schedule <cron> <message…>",
    };
  }
  const oneShotMatch = cleaned.match(
    /^in\s+(\d{1,5})\s+(minutes?|hours?|days?)\s+(.+)$/i,
  );
  if (oneShotMatch) {
    const amount = Number(oneShotMatch[1]);
    const unit = oneShotMatch[2].toLowerCase();
    const triggerMessage = oneShotMatch[3].trim();
    const ms = unit.startsWith("minute")
      ? amount * 60_000
      : unit.startsWith("hour")
        ? amount * 60 * 60_000
        : amount * 24 * 60 * 60_000;
    return {
      ok: true,
      scheduleType: "once",
      runAt: new Date(Date.now() + ms),
      triggerMessage,
      name: slugify(triggerMessage),
    };
  }

  const tokens = cleaned.split(/\s+/);
  if (tokens.length < CRON_TOKENS + 1) {
    return {
      ok: false,
      error: `Need 5 cron fields plus a message. Got ${tokens.length} token(s).`,
    };
  }
  const cron = tokens.slice(0, CRON_TOKENS).join(" ");
  const triggerMessage = tokens.slice(CRON_TOKENS).join(" ").trim();
  if (!triggerMessage) {
    return { ok: false, error: "Trigger message is required." };
  }
  const validation = validateCron(cron);
  if (!validation.ok) {
    return { ok: false, error: `Invalid cron: ${validation.error}` };
  }
  return {
    ok: true,
    scheduleType: "recurring",
    cron,
    triggerMessage,
    name: slugify(triggerMessage),
  };
};

export const createScheduledJobFromSkill = async (
  userId: string,
  agentId: string | undefined,
  parsed: ParsedScheduleArgs,
  threadId?: string,
) => {
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }

  return createScheduledJobForUser(userId, {
    scheduleType: parsed.scheduleType,
    title: parsed.name,
    prompt: parsed.triggerMessage,
    cron: parsed.cron,
    runAt: parsed.runAt,
    agentId,
    threadId,
    createdFrom: "slash",
  });
};
