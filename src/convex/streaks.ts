import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/**
 * Streaks are derived from the ledger, never stored as a counter.
 *
 * A day qualifies when the backend credited a positive amount for genuine
 * participation: a settled mining session, a verified task, a rewarded ad, or a
 * qualified referral. Opening the app, tapping around, deposits, withdrawals and
 * admin adjustments never count. Because the rule reads existing ledger rows,
 * there is no backfill, no second source of truth and nothing a client can bump.
 *
 * Days are UTC calendar days. "Current" stays alive through the whole day after
 * the last qualifying day, and breaks once that day is also missed.
 */

export const DAY_MS = 86_400_000;
export const STREAK_WINDOW_DAYS = 365;
export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100] as const;

const QUALIFYING_KINDS = new Set(["mining", "task", "ad", "referral"]);

export type StreakSummary = {
  current: number;
  best: number;
  totalDays: number;
  qualifiedToday: boolean;
  lastQualifiedDay: number | null;
  nextMilestone: number | null;
  daysToNextMilestone: number | null;
  windowDays: number;
};

export function dayIndexOf(timestamp: number): number {
  return Math.floor(timestamp / DAY_MS);
}

export function summarizeStreak(
  days: Iterable<number>,
  now: number,
): StreakSummary {
  const unique = [...new Set(days)].sort((a, b) => a - b);
  const present = new Set(unique);
  const today = dayIndexOf(now);
  const qualifiedToday = present.has(today);

  let current = 0;
  let cursor: number | null = qualifiedToday
    ? today
    : present.has(today - 1)
      ? today - 1
      : null;
  while (cursor !== null && present.has(cursor)) {
    current += 1;
    cursor -= 1;
  }

  let best = 0;
  let run = 0;
  let previous: number | null = null;
  for (const day of unique) {
    run = previous !== null && day === previous + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }

  const nextMilestone = STREAK_MILESTONES.find((m) => m > current) ?? null;
  return {
    current,
    best,
    totalDays: unique.length,
    qualifiedToday,
    lastQualifiedDay: unique.length > 0 ? unique[unique.length - 1] : null,
    nextMilestone,
    daysToNextMilestone: nextMilestone === null ? null : nextMilestone - current,
    windowDays: STREAK_WINDOW_DAYS,
  };
}

export async function readStreak(
  ctx: QueryCtx,
  userId: Id<"users">,
  now = Date.now(),
): Promise<StreakSummary> {
  const since = now - STREAK_WINDOW_DAYS * DAY_MS;
  const rows = await ctx.db
    .query("ledger")
    .withIndex("by_user_createdAt", (q) =>
      q.eq("userId", userId).gte("createdAt", since),
    )
    .order("asc")
    .take(4000);

  const days = new Set<number>();
  for (const row of rows) {
    if (!QUALIFYING_KINDS.has(row.kind)) continue;
    if (row.amountNex <= 0) continue;
    days.add(dayIndexOf(row.createdAt));
  }
  return summarizeStreak(days, now);
}
