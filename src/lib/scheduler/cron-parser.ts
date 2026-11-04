// ---------------------------------------------------------------------------
// P3.1 — #11 scheduled agents. Tiny inline 5-field cron parser. No I/O, no
// deps. Supports `*`, `,`, `-`, `/` in minute / hour / day-of-month / month
// / day-of-week fields.
//
// Field ranges (matching crontab convention):
//   minute          0-59
//   hour            0-23
//   day-of-month    1-31
//   month           1-12
//   day-of-week     0-6 (Sun=0)
//
// "Next run" iterates minute-by-minute for up to ~4 years (a leap-year-aware
// safety bound) and returns the first instant that matches all 5 fields.
// ---------------------------------------------------------------------------

export const CRON_FIELDS = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day-of-month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12 },
  { name: "day-of-week", min: 0, max: 6 },
] as const;

const SAFETY_BOUND_MS = 4 * 365 * 24 * 60 * 60 * 1000; // ~4 years

type FieldMask = boolean[];

const parseField = (
  raw: string,
  min: number,
  max: number,
): FieldMask | { error: string } => {
  const mask: FieldMask = new Array(max + 1).fill(false);
  const segments = raw.split(",");
  for (const segmentRaw of segments) {
    const segment = segmentRaw.trim();
    if (!segment) {
      return { error: `Empty cron field segment in "${raw}"` };
    }
    let stepStr: string | null = null;
    let body = segment;
    const slashIdx = segment.indexOf("/");
    if (slashIdx !== -1) {
      body = segment.slice(0, slashIdx);
      stepStr = segment.slice(slashIdx + 1);
    }
    let rangeStart: number;
    let rangeEnd: number;
    if (body === "*" || body === "") {
      rangeStart = min;
      rangeEnd = max;
    } else {
      const dashIdx = body.indexOf("-");
      if (dashIdx === -1) {
        const n = Number(body);
        if (!Number.isInteger(n) || Number.isNaN(n)) {
          return { error: `Cron field "${segment}" is not numeric` };
        }
        rangeStart = n;
        rangeEnd = n;
      } else {
        const a = body.slice(0, dashIdx);
        const b = body.slice(dashIdx + 1);
        const na = Number(a);
        const nb = Number(b);
        if (!Number.isInteger(na) || Number.isNaN(na)) {
          return { error: `Cron range start "${a}" is not numeric` };
        }
        if (!Number.isInteger(nb) || Number.isNaN(nb)) {
          return { error: `Cron range end "${b}" is not numeric` };
        }
        rangeStart = na;
        rangeEnd = nb;
      }
    }
    if (rangeStart < min || rangeStart > max) {
      return {
        error: `Cron value ${rangeStart} out of range ${min}-${max}`,
      };
    }
    if (rangeEnd < min || rangeEnd > max) {
      return {
        error: `Cron value ${rangeEnd} out of range ${min}-${max}`,
      };
    }
    if (rangeEnd < rangeStart) {
      return {
        error: `Cron range end ${rangeEnd} < start ${rangeStart}`,
      };
    }
    let step = 1;
    if (stepStr !== null) {
      const n = Number(stepStr);
      if (!Number.isInteger(n) || Number.isNaN(n) || n <= 0) {
        return { error: `Cron step "${stepStr}" is not a positive integer` };
      }
      step = n;
    }
    for (let v = rangeStart; v <= rangeEnd; v += step) {
      mask[v] = true;
    }
  }
  return mask;
};

const parseAllFields = (cron: string): FieldMask[] | { error: string } => {
  const trimmed = cron.trim();
  if (!trimmed) {
    return { error: "Cron expression is empty" };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length !== 5) {
    return {
      error: `Cron must have exactly 5 fields, got ${parts.length}`,
    };
  }
  const masks: FieldMask[] = [];
  for (let i = 0; i < 5; i += 1) {
    const parsed = parseField(parts[i], CRON_FIELDS[i].min, CRON_FIELDS[i].max);
    if ("error" in parsed) {
      return { error: `${CRON_FIELDS[i].name}: ${parsed.error}` };
    }
    masks.push(parsed);
  }
  return masks;
};

export const validateCron = (
  cron: string,
): { ok: true } | { ok: false; error: string } => {
  const result = parseAllFields(cron);
  if ("error" in result) return { ok: false, error: result.error };
  return { ok: true };
};

const matchesMasks = (masks: FieldMask[], date: Date): boolean => {
  // Field offsets inside the masks array (matching CRON_FIELDS order).
  const minute = date.getUTCMinutes();
  const hour = date.getUTCHours();
  const dom = date.getUTCDate();
  const month = date.getUTCMonth() + 1; // 1-12
  const dow = date.getUTCDay(); // 0-6 (Sun=0)

  if (!masks[0][minute]) return false;
  if (!masks[1][hour]) return false;
  if (!masks[2][dom]) return false;
  if (!masks[3][month]) return false;
  if (!masks[4][dow]) return false;
  return true;
};

/**
 * Compute the next instant strictly after `from` that matches the cron
 * expression. Throws on invalid input. Returns a Date (UTC math, then
 * constructed in local time — the date arithmetic is tz-agnostic).
 */
export const computeNextRun = (cron: string, from: Date): Date => {
  const masks = parseAllFields(cron);
  if ("error" in masks) {
    throw new Error(`Invalid cron "${cron}": ${masks.error}`);
  }
  // Normalize to the start of the next minute, then iterate minute-by-minute.
  const start = new Date(from.getTime());
  start.setUTCSeconds(0, 0);
  start.setUTCMinutes(start.getUTCMinutes() + 1);

  const limit = start.getTime() + SAFETY_BOUND_MS;
  // Cap iteration at the safety bound to avoid an infinite loop on garbage
  // input (e.g. day=31 in a month that never has 31 days would otherwise
  // loop forever — the bound ensures we exit with the last candidate).
  const cursor = new Date(start.getTime());
  while (cursor.getTime() <= limit) {
    if (matchesMasks(masks, cursor)) {
      return new Date(cursor.getTime());
    }
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  // Should not happen for valid crons; fall back to "no next run" via far
  // future date so callers can detect and skip.
  return new Date(limit);
};
