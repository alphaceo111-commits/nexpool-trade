/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { DAY_MS, dayIndexOf, readStreak, summarizeStreak } from "./streaks";

const modules = import.meta.glob([
  "./**/*.ts",
  "!./**/*.test.ts",
  "!./**/*.spec.ts",
]);

const NOON = Date.UTC(2026, 10, 20, 12, 0, 0);
const today = dayIndexOf(NOON);

describe("summarizeStreak", () => {
  test("no qualifying days", () => {
    const streak = summarizeStreak([], NOON);
    expect(streak.current).toBe(0);
    expect(streak.best).toBe(0);
    expect(streak.qualifiedToday).toBe(false);
    expect(streak.nextMilestone).toBe(3);
    expect(streak.daysToNextMilestone).toBe(3);
    expect(streak.lastQualifiedDay).toBeNull();
  });

  test("today plus two previous days is a three-day streak", () => {
    const streak = summarizeStreak([today, today - 1, today - 2], NOON);
    expect(streak.current).toBe(3);
    expect(streak.best).toBe(3);
    expect(streak.totalDays).toBe(3);
    expect(streak.qualifiedToday).toBe(true);
    expect(streak.nextMilestone).toBe(7);
    expect(streak.daysToNextMilestone).toBe(4);
  });

  test("yesterday-only streak stays alive through today", () => {
    const streak = summarizeStreak([today - 1, today - 2], NOON);
    expect(streak.current).toBe(2);
    expect(streak.qualifiedToday).toBe(false);
  });

  test("a missed day breaks the current streak but not the best", () => {
    const streak = summarizeStreak([today, today - 2, today - 3], NOON);
    expect(streak.current).toBe(1);
    expect(streak.best).toBe(2);
  });

  test("streak is dead after two missed days", () => {
    const streak = summarizeStreak([today - 3], NOON);
    expect(streak.current).toBe(0);
    expect(streak.best).toBe(1);
  });

  test("multiple entries on one day count once", () => {
    const streak = summarizeStreak([today, today, today], NOON);
    expect(streak.current).toBe(1);
    expect(streak.totalDays).toBe(1);
  });

  test("milestones advance and stop at the last one", () => {
    const seven = Array.from({ length: 7 }, (_, i) => today - i);
    expect(summarizeStreak(seven, NOON).nextMilestone).toBe(14);
    const hundred = Array.from({ length: 100 }, (_, i) => today - i);
    expect(summarizeStreak(hundred, NOON).nextMilestone).toBeNull();
    expect(summarizeStreak(hundred, NOON).daysToNextMilestone).toBeNull();
  });
});

describe("readStreak", () => {
  test("counts only positive participation credits", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", { name: "Streak Tester" });
      const rows = [
        { kind: "mining" as const, amountNex: 0.0001, at: NOON },
        { kind: "task" as const, amountNex: 0.0002, at: NOON - DAY_MS },
        { kind: "referral" as const, amountNex: 0.001, at: NOON - 2 * DAY_MS },
        // Not participation: money in, payout out, operator adjustment.
        { kind: "deposit" as const, amountNex: 5, at: NOON - 3 * DAY_MS },
        { kind: "withdrawal" as const, amountNex: -1, at: NOON - 4 * DAY_MS },
        { kind: "adjustment" as const, amountNex: 2, at: NOON - 5 * DAY_MS },
        // Zero-value mining rows do not qualify a day.
        { kind: "mining" as const, amountNex: 0, at: NOON - 6 * DAY_MS },
      ];
      for (const row of rows) {
        await ctx.db.insert("ledger", {
          userId: id,
          kind: row.kind,
          amountNex: row.amountNex,
          memo: "streak test",
          createdAt: row.at,
        });
      }
      return id;
    });

    const streak = await t.run(async (ctx) => readStreak(ctx, userId, NOON));
    expect(streak.current).toBe(3);
    expect(streak.totalDays).toBe(3);
    expect(streak.qualifiedToday).toBe(true);
  });

  test("a user with no ledger history has no streak", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "Fresh" }),
    );
    const streak = await t.run(async (ctx) => readStreak(ctx, userId, NOON));
    expect(streak.current).toBe(0);
    expect(streak.qualifiedToday).toBe(false);
  });
});
