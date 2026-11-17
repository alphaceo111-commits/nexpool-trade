import { v } from "convex/values";
import { query } from "./_generated/server";
import { getViewer, loadConfig, NEX_PRECISION, roundNex } from "./engine";
import {
  buildCandles,
  normaliseTimeframe,
  summariseCandles,
  TIMEFRAME_WINDOW_MS,
  type LedgerAmount,
} from "./terminalMath";

const LEDGER_READ_LIMIT = 4000;

const KIND_LABEL: Record<string, string> = {
  mining: "Mining rewards",
  task: "Task rewards",
  ad: "Verified ad rewards",
  referral: "Referral rewards",
  level: "Level rewards",
  deposit: "Deposits",
  withdrawal: "Withdrawals",
  refund: "Refunds",
  adjustment: "Adjustments",
};

/**
 * Everything the financial terminal renders, computed from the confirmed
 * ledger. Candles describe this account's own balance history — they are not a
 * market price, and nothing here is simulated.
 */
export const data = query({
  args: { timeframe: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { userId, profile, balance } = await getViewer(ctx);
    if (!userId || !profile || !balance) return null;

    const timeframe = normaliseTimeframe(args.timeframe);
    const config = await loadConfig(ctx);
    const now = Date.now();
    const windowMs = TIMEFRAME_WINDOW_MS[timeframe];
    const from = now - windowMs;

    const totalNano = Math.round(
      (balance.availableNex + balance.reservedNex) * NEX_PRECISION,
    );

    // Newest first so a very long history can never truncate the recent part
    // of the window; the array is reversed before aggregation.
    const windowRows = await ctx.db
      .query("ledger")
      .withIndex("by_user_createdAt", (q) =>
        q.eq("userId", profile.userId).gte("createdAt", from),
      )
      .order("desc")
      .take(LEDGER_READ_LIMIT);

    const points: LedgerAmount[] = windowRows.map((row) => ({
      t: row.createdAt,
      nano: Math.round(row.amountNex * NEX_PRECISION),
    }));

    const windowNano = points.reduce((sum, point) => sum + point.nano, 0);
    const baselineNano = totalNano - windowNano;

    const candles = buildCandles({
      points,
      timeframe,
      baselineNano,
      from,
      to: now,
    });
    const summary = summariseCandles(candles, baselineNano);

    const kindTotals = new Map<string, { nano: number; movements: number }>();
    for (const row of windowRows) {
      const entry = kindTotals.get(row.kind) ?? { nano: 0, movements: 0 };
      entry.nano += Math.round(row.amountNex * NEX_PRECISION);
      entry.movements += 1;
      kindTotals.set(row.kind, entry);
    }
    const byKind = [...kindTotals.entries()]
      .map(([kind, entry]) => ({
        kind,
        label: KIND_LABEL[kind] ?? kind,
        amountNex: roundNex(entry.nano / NEX_PRECISION),
        movements: entry.movements,
      }))
      .sort((left, right) => Math.abs(right.amountNex) - Math.abs(left.amountNex));

    const lifetimeMined = roundNex(balance.lifetimeMinedNex);
    const lifetimeTasks = roundNex(balance.lifetimeTaskNex);
    const lifetimeAds = roundNex(balance.lifetimeAdNex ?? 0);

    const day = new Date(now).toISOString().slice(0, 10);
    const today = await ctx.db
      .query("miningDays")
      .withIndex("by_user_day", (q) =>
        q.eq("userId", profile.userId).eq("day", day),
      )
      .first();

    const entries = await ctx.db
      .query("miningEntries")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", profile.userId))
      .order("desc")
      .take(14);

    const extensions = await ctx.db
      .query("miningExtensionSessions")
      .withIndex("by_user_startedAt", (q) => q.eq("userId", profile.userId))
      .order("desc")
      .take(6);

    const recent = await ctx.db
      .query("ledger")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", profile.userId))
      .order("desc")
      .take(12);

    return {
      serverNow: now,
      timeframe,
      windowMs,
      from,
      to: now,
      truncated: windowRows.length >= LEDGER_READ_LIMIT,
      candles,
      summary,
      byKind,
      today: {
        day,
        minedNex: roundNex(today?.minedNex ?? 0),
        limitNex: roundNex(config.dailyLimitNex),
        capReachedAt: today?.capReachedAt ?? null,
      },
      sessions: entries.map((row) => ({
        id: row._id,
        day: row.day,
        fromTs: row.fromTs,
        toTs: row.toTs,
        amountNex: roundNex(row.amountNex),
        rateNexPerHour: row.rateNexPerHour,
        normalNex: roundNex(row.normalNex ?? row.amountNex),
        extensionNex: roundNex(row.extensionNex ?? 0),
      })),
      extensionSessions: extensions.map((row) => ({
        id: row._id,
        status: row.status,
        grantedAt: row.grantedAt ?? null,
        startedAt: row.startedAt ?? null,
        endsAt: row.endsAt ?? null,
        minedNex: roundNex(row.minedNex),
        extensionHours: row.extensionHours,
      })),
      recent: recent.map((row) => ({
        id: row._id,
        kind: row.kind,
        amountNex: roundNex(row.amountNex),
        memo: row.memo,
        createdAt: row.createdAt,
      })),
      balance: {
        totalNex: roundNex(balance.availableNex + balance.reservedNex),
        availableNex: roundNex(balance.availableNex),
        reservedNex: roundNex(balance.reservedNex),
        lifetimeNex: roundNex(lifetimeMined + lifetimeTasks + lifetimeAds),
      },
      nexUsdRate: config.nexUsdRate,
    };
  },
});
