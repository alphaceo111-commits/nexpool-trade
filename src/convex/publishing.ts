import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  LIBRARY_TEMPLATES,
  SCHEDULABLE_TEMPLATE_IDS,
  renderLibraryTemplate,
} from "./telegramLibrary";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { loadConfig, requireAdmin } from "./engine";

/**
 * Central automated publishing platform.
 *
 * The copy lives in code (PUBLISH_TEMPLATES) so every message is reviewable and
 * versioned. The database only stores operator configuration (which template,
 * where, how often) plus scheduler state. Every number in a post comes from a
 * confirmed backend record; nothing is invented and a template that cannot get
 * real data refuses to publish.
 */

const DAY = 86_400_000;

/* ------------------------------------------------------------------ format */

function nex(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0.000000000";
  return value.toFixed(9);
}

function int(value: number): string {
  const rounded = Math.round(value);
  return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Telegram HTML: only the three entities we use, and names are escaped. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function name(row: { displayName: string }, max = 22): string {
  const clean = row.displayName.trim() || "NEX miner";
  return esc(clean.length > max ? `${clean.slice(0, max - 1)}…` : clean);
}

const MEDALS = ["🥇", "🥈", "🥉"];

function rankLine(rank: number, row: Ranked, suffix: string): string {
  const badge = rank <= 3 ? MEDALS[rank - 1] : `${rank}.`;
  return `${badge} ${name(row)} — ${suffix}`;
}

/* -------------------------------------------------------------------- data */

export type Ranked = {
  displayName: string;
  username?: string;
  nexId: string;
  value: number;
  secondary: string;
  level: number;
  joinedAt: number;
};

export type PublishStats = {
  generatedAt: number;
  day: string;
  users: {
    total: number;
    newToday: number;
    activeToday: number;
    telegramLinked: number;
  };
  mining: {
    todayNex: number;
    weekNex: number;
    allTimeNex: number;
    minersToday: number;
  };
  ads: { verifiedToday: number; allTime: number };
  tasks: { active: number; verifiedToday: number; verifiedAllTime: number };
  referrals: {
    total: number;
    qualified: number;
    newToday: number;
    qualifiedToday: number;
    pending: number;
  };
  payouts: {
    paidToday: number;
    paidTodayNex: number;
    paidWeekNex: number;
    paidAllTime: number;
    pending: number;
    pendingNex: number;
    biggestPaidNex: number;
  };
  config: {
    dailyLimitNex: number;
    baseRateNexPerHour: number;
    extensionHours: number;
    awayMiningHours: number;
    adRewardNex: number;
    minWithdrawNex: number;
    nexUsdRate: number;
  };
  top: {
    earnersToday: Ranked[];
    earnersWeek: Ranked[];
    earnersAll: Ranked[];
    minersToday: Ranked[];
    minersAll: Ranked[];
    inviters: Ranked[];
    activeToday: Ranked[];
    tasksWeek: Ranked[];
  };
};

function utcDayStart(ts: number) {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Aggregates only confirmed rows. Pending task claims, unverified ads, rejected
 * withdrawals and unpaid payout requests never appear in a published number.
 */
async function computeStats(ctx: QueryCtx): Promise<PublishStats> {
    const now = Date.now();
    const todayStart = utcDayStart(now);
    const weekStart = now - 7 * DAY;
    const config = await loadConfig(ctx);

    const [
      profiles,
      ledger,
      completions,
      miningEntries,
      referrals,
      withdrawals,
      tasks,
      ads,
      claims,
    ] = await Promise.all([
      ctx.db.query("profiles").collect(),
      ctx.db.query("ledger").collect(),
      ctx.db.query("taskCompletions").collect(),
      ctx.db.query("miningEntries").collect(),
      ctx.db.query("referrals").collect(),
      ctx.db.query("withdrawals").collect(),
      ctx.db.query("tasks").collect(),
      ctx.db.query("miningAdChallenges").collect(),
      ctx.db.query("levelClaims").collect(),
    ]);

    const byUser = new Map(profiles.map((p) => [String(p.userId), p]));
    const levelByUser = new Map<string, number>();
    for (const claim of claims) {
      const key = String(claim.userId);
      levelByUser.set(key, Math.max(levelByUser.get(key) ?? 0, claim.level));
    }

    const stats: PublishStats = {
      generatedAt: now,
      day: new Date(todayStart).toISOString().slice(0, 10),
      users: {
        total: profiles.length,
        newToday: profiles.filter((p) => p.createdAt >= todayStart).length,
        activeToday: 0,
        telegramLinked: profiles.filter((p) => Boolean(p.telegramId)).length,
      },
      mining: { todayNex: 0, weekNex: 0, allTimeNex: 0, minersToday: 0 },
      ads: { verifiedToday: 0, allTime: 0 },
      tasks: { active: 0, verifiedToday: 0, verifiedAllTime: 0 },
      referrals: {
        total: referrals.length,
        qualified: 0,
        newToday: 0,
        qualifiedToday: 0,
        pending: 0,
      },
      payouts: {
        paidToday: 0,
        paidTodayNex: 0,
        paidWeekNex: 0,
        paidAllTime: 0,
        pending: 0,
        pendingNex: 0,
        biggestPaidNex: 0,
      },
      config: {
        dailyLimitNex: config.dailyLimitNex,
        baseRateNexPerHour: config.baseRateNexPerHour,
        extensionHours: config.extensionHours,
        awayMiningHours: config.awayMiningHours,
        adRewardNex: config.adRewardNex,
        minWithdrawNex: config.minWithdrawNex,
        nexUsdRate: config.nexUsdRate,
      },
      top: {
        earnersToday: [],
        earnersWeek: [],
        earnersAll: [],
        minersToday: [],
        minersAll: [],
        inviters: [],
        activeToday: [],
        tasksWeek: [],
      },
    };

    /* mining + earnings ledger */
    const earnToday = new Map<string, number>();
    const earnWeek = new Map<string, number>();
    const earnAll = new Map<string, number>();
    const mineToday = new Map<string, number>();
    const mineAll = new Map<string, number>();
    const activeToday = new Map<string, number>();

    for (const entry of ledger) {
      if (!entry.userId) continue;
      const key = String(entry.userId);
      if (entry.amountNex <= 0) continue;
      if (entry.kind === "mining") {
        stats.mining.allTimeNex += entry.amountNex;
        if (entry.createdAt >= todayStart) {
          stats.mining.todayNex += entry.amountNex;
          mineToday.set(key, (mineToday.get(key) ?? 0) + entry.amountNex);
        }
        if (entry.createdAt >= weekStart) stats.mining.weekNex += entry.amountNex;
        mineAll.set(key, (mineAll.get(key) ?? 0) + entry.amountNex);
      }
      if (
        entry.kind === "mining" ||
        entry.kind === "task" ||
        entry.kind === "referral" ||
        entry.kind === "level"
      ) {
        earnAll.set(key, (earnAll.get(key) ?? 0) + entry.amountNex);
        if (entry.createdAt >= weekStart) {
          earnWeek.set(key, (earnWeek.get(key) ?? 0) + entry.amountNex);
        }
        if (entry.createdAt >= todayStart) {
          earnToday.set(key, (earnToday.get(key) ?? 0) + entry.amountNex);
        }
      }
    }

    for (const entry of miningEntries) {
      if (entry.createdAt >= todayStart) {
        const key = String(entry.userId);
        activeToday.set(key, (activeToday.get(key) ?? 0) + 1);
      }
    }
    stats.mining.minersToday = mineToday.size;

    /* tasks */
    stats.tasks.active = tasks.filter((t) => t.status === "active").length;
    const tasksWeek = new Map<string, Set<string>>();
    for (const row of completions) {
      if (row.status !== "verified") continue;
      stats.tasks.verifiedAllTime += 1;
      const verifiedAt = row.verifiedAt ?? 0;
      if (verifiedAt >= todayStart) stats.tasks.verifiedToday += 1;
      if (verifiedAt >= weekStart) {
        const key = String(row.userId);
        const set = tasksWeek.get(key) ?? new Set<string>();
        set.add(String(row.taskId));
        tasksWeek.set(key, set);
        activeToday.set(key, (activeToday.get(key) ?? 0) + 1);
      }
    }

    /* rewarded ads */
    for (const ad of ads) {
      if (ad.status !== "completed") continue;
      stats.ads.allTime += 1;
      if ((ad.completedAt ?? 0) >= todayStart) {
        stats.ads.verifiedToday += 1;
        activeToday.set(
          String(ad.userId),
          (activeToday.get(String(ad.userId)) ?? 0) + 1,
        );
      }
    }

    /* referrals */
    for (const row of referrals) {
      if (row.status === "qualified") {
        stats.referrals.qualified += 1;
        if ((row.qualifiedAt ?? 0) >= todayStart) stats.referrals.qualifiedToday += 1;
      }
      if (row.status === "pending") stats.referrals.pending += 1;
    }
    stats.referrals.newToday = referrals.filter(
      (row) => row.createdAt >= todayStart,
    ).length;

    /* payouts */
    for (const row of withdrawals) {
      if (row.status === "requested" || row.status === "reviewing") {
        stats.payouts.pending += 1;
        stats.payouts.pendingNex += row.nexAmount;
        continue;
      }
      if (row.status !== "paid") continue;
      const paidAt = row.decidedAt ?? row.requestedAt;
      stats.payouts.paidAllTime += 1;
      stats.payouts.biggestPaidNex = Math.max(
        stats.payouts.biggestPaidNex,
        row.nexAmount,
      );
      if (paidAt >= todayStart) {
        stats.payouts.paidToday += 1;
        stats.payouts.paidTodayNex += row.nexAmount;
      }
      if (paidAt >= weekStart) stats.payouts.paidWeekNex += row.nexAmount;
    }
    stats.users.activeToday = activeToday.size;

    /* rankings */
    const build = (
      map: Map<string, number>,
      limit = 10,
    ): Ranked[] => {
      const rows: Ranked[] = [];
      for (const [userId, value] of map.entries()) {
        const profile = byUser.get(userId);
        if (!profile || value <= 0) continue;
        rows.push({
          displayName: profile.displayName,
          username: profile.username,
          nexId: profile.nexId,
          value: Math.round(value * 1e9) / 1e9,
          secondary: profile.nexId,
          level: levelByUser.get(userId) ?? 0,
          joinedAt: profile.createdAt,
        });
      }
      return rows
        .sort(
          (a, b) =>
            b.value - a.value ||
            a.joinedAt - b.joinedAt ||
            a.nexId.localeCompare(b.nexId),
        )
        .slice(0, limit);
    };

    stats.top.earnersToday = build(earnToday);
    stats.top.earnersWeek = build(earnWeek);
    stats.top.earnersAll = build(earnAll);
    stats.top.minersToday = build(mineToday);
    stats.top.minersAll = build(mineAll);
    stats.top.activeToday = build(activeToday);

    const inviterCounts = new Map<string, number>();
    for (const row of referrals) {
      if (row.status !== "qualified") continue;
      const key = String(row.inviterProfileId);
      inviterCounts.set(key, (inviterCounts.get(key) ?? 0) + 1);
    }
    const profileById = new Map(profiles.map((p) => [String(p._id), p]));
    stats.top.inviters = Array.from(inviterCounts.entries())
      .flatMap(([profileId, value]) => {
        const profile = profileById.get(profileId);
        if (!profile) return [];
        return [
          {
            displayName: profile.displayName,
            username: profile.username,
            nexId: profile.nexId,
            value,
            secondary: profile.nexId,
            level: levelByUser.get(String(profile.userId)) ?? 0,
            joinedAt: profile.createdAt,
          } satisfies Ranked,
        ];
      })
      .sort((a, b) => b.value - a.value || a.nexId.localeCompare(b.nexId))
      .slice(0, 10);

    stats.top.tasksWeek = Array.from(tasksWeek.entries())
      .flatMap(([userId, set]) => {
        const profile = byUser.get(userId);
        if (!profile) return [];
        return [
          {
            displayName: profile.displayName,
            username: profile.username,
            nexId: profile.nexId,
            value: set.size,
            secondary: profile.nexId,
            level: levelByUser.get(userId) ?? 0,
            joinedAt: profile.createdAt,
          } satisfies Ranked,
        ];
      })
      .sort((a, b) => b.value - a.value || a.nexId.localeCompare(b.nexId))
      .slice(0, 10);

    return stats;
}

export const collectStats = internalQuery({
  args: {},
  handler: async (ctx): Promise<PublishStats> => await computeStats(ctx),
});

/* --------------------------------------------------------------- templates */

export const PUBLISH_CATEGORIES = [
  { key: "leaderboards", label: "Leaderboards & rankings" },
  { key: "mining", label: "Mining & rewards" },
  { key: "payouts", label: "Payouts & wallet" },
  { key: "referrals", label: "Referrals & community" },
  { key: "tasks", label: "Tasks & missions" },
  { key: "motivation", label: "Motivation" },
  { key: "education", label: "Education" },
] as const;

export type PublishCategory = (typeof PUBLISH_CATEGORIES)[number]["key"];
export type Frequency = "daily" | "weekly" | "monthly";

export type PublishTemplate = {
  key: string;
  category: PublishCategory;
  label: string;
  description: string;
  frequency: Frequency;
  hourUtc: number;
  minuteUtc: number;
  /** Rotating bodies so a recurring slot never repeats the same wording. */
  variants: number;
  /** Returns null when the underlying data cannot support an honest post. */
  build: (
    stats: PublishStats,
    variant: number,
  ) => { title: string; text: string } | null;
};

function rankingBlock(
  rows: Ranked[],
  suffix: (row: Ranked) => string,
  empty: string,
): string {
  if (rows.length === 0) return empty;
  return rows
    .map((row, index) => rankLine(index + 1, row, suffix(row)))
    .join("\n");
}

/**
 * Library posts that can be scheduled honestly today: static copy only, no
 * dynamic placeholder and no dependency on a feature NEXPOOL does not record.
 * They use the same automation engine, delivery queue and idempotency keys as
 * the native templates, so a library post is not a second publishing system.
 */
const LIBRARY_CATEGORY_BY_ID: Record<string, PublishCategory> = {
  C01: "motivation",
  C10: "motivation",
  C15: "education",
  C19: "motivation",
  C20: "motivation",
  G01: "motivation",
  G03: "tasks",
  G08: "referrals",
  G09: "motivation",
  G11: "education",
  G12: "motivation",
  G16: "motivation",
  G18: "education",
  G19: "motivation",
  G20: "motivation",
};

const LIBRARY_AUTOMATION_TEMPLATES: PublishTemplate[] = SCHEDULABLE_TEMPLATE_IDS.map(
  (id) => {
    const template = LIBRARY_TEMPLATES.find((row) => row.id === id);
    if (!template?.schedule) {
      throw new Error(`Library template ${id} has no schedule.`);
    }
    return {
      key: `lib_${id.toLowerCase()}`,
      category: LIBRARY_CATEGORY_BY_ID[id] ?? "motivation",
      label: `${id} · ${template.title}`,
      description: `${template.trigger}. Library copy, sent as plain text.`,
      frequency: template.schedule.frequency,
      hourUtc: template.schedule.hourUtc,
      minuteUtc: template.schedule.minuteUtc,
      variants: 1,
      build: () => renderLibraryTemplate(id, {}),
    };
  },
);

export const PUBLISH_TEMPLATES: PublishTemplate[] = [
  /* ---------------------------------------------------- leaderboards */
  {
    key: "daily_top_earners",
    category: "leaderboards",
    label: "Daily top earners",
    description: "Top 10 accounts by confirmed NEX earned in the last UTC day.",
    frequency: "daily",
    hourUtc: 18,
    minuteUtc: 0,
    variants: 1,
    build: (stats) => ({
      title: "Daily top earners",
      text: [
        "🏆 <b>NEXPOOL · DAILY TOP EARNERS</b>",
        `<i>${stats.day} · confirmed rewards only</i>`,
        "",
        rankingBlock(
          stats.top.earnersToday,
          (row) => `${nex(row.value)} NEX`,
          "No confirmed earnings have been recorded yet today.",
        ),
        "",
        "Every amount above is a confirmed ledger credit — mining, verified tasks, qualified referrals or claimed levels.",
        '🚀 <a href="https://nexpool.freebuff.app/app">Open NEXPOOL</a> to see your position.',
      ].join("\n"),
    }),
  },
  {
    key: "weekly_top_earners",
    category: "leaderboards",
    label: "Weekly top earners",
    description: "Top 10 accounts by confirmed NEX earned over the last 7 days.",
    frequency: "weekly",
    hourUtc: 19,
    minuteUtc: 0,
    variants: 1,
    build: (stats) => ({
      title: "Weekly top earners",
      text: [
        "🏆 <b>NEXPOOL · WEEKLY TOP EARNERS</b>",
        "<i>Last 7 days · confirmed rewards only</i>",
        "",
        rankingBlock(
          stats.top.earnersWeek,
          (row) => `${nex(row.value)} NEX`,
          "Not enough confirmed activity this week yet.",
        ),
        "",
        "Consistency beats one big day. Sessions, verified tasks and qualified referrals all count.",
      ].join("\n"),
    }),
  },
  {
    key: "all_time_top_earners",
    category: "leaderboards",
    label: "All-time top earners",
    description: "Lifetime confirmed NEX leaders across the whole platform.",
    frequency: "weekly",
    hourUtc: 20,
    minuteUtc: 0,
    variants: 1,
    build: (stats) => ({
      title: "All-time top earners",
      text: [
        "👑 <b>NEXPOOL · ALL-TIME TOP EARNERS</b>",
        `<i>${int(stats.users.total)} accounts have joined so far</i>`,
        "",
        rankingBlock(
          stats.top.earnersAll,
          (row) => `${nex(row.value)} NEX · Level ${row.level}`,
          "The all-time board opens as soon as confirmed rewards exist.",
        ),
        "",
        "These totals are lifetime confirmed credits, not wallet balances.",
      ].join("\n"),
    }),
  },
  {
    key: "daily_top_miners",
    category: "leaderboards",
    label: "Daily top miners",
    description: "Top 10 accounts by confirmed NEX mined today.",
    frequency: "daily",
    hourUtc: 21,
    minuteUtc: 0,
    variants: 1,
    build: (stats) => ({
      title: "Daily top miners",
      text: [
        "⛏️ <b>NEXPOOL · DAILY TOP MINERS</b>",
        `<i>${int(stats.mining.minersToday)} accounts mined today</i>`,
        "",
        rankingBlock(
          stats.top.minersToday,
          (row) => `${nex(row.value)} NEX`,
          "No mining settlements yet today. Start a session to open the board.",
        ),
        "",
        `Normal mining stops at ${nex(stats.config.dailyLimitNex)} NEX per UTC day.`,
      ].join("\n"),
    }),
  },
  {
    key: "top_inviters",
    category: "leaderboards",
    label: "Top inviters",
    description: "Top 10 accounts by qualified referrals.",
    frequency: "weekly",
    hourUtc: 20,
    minuteUtc: 30,
    variants: 1,
    build: (stats) => ({
      title: "Top inviters",
      text: [
        "🤝 <b>NEXPOOL · TOP INVITERS</b>",
        `<i>${int(stats.referrals.qualified)} qualified referrals so far</i>`,
        "",
        rankingBlock(
          stats.top.inviters,
          (row) => `${int(row.value)} qualified`,
          "No qualified referrals yet. A referral qualifies after its first verified task.",
        ),
        "",
        "A join alone is not a qualification. Only verified invitee activity counts.",
      ].join("\n"),
    }),
  },
  {
    key: "top_active",
    category: "leaderboards",
    label: "Most active today",
    description: "Top 10 accounts by verified activity events today.",
    frequency: "daily",
    hourUtc: 16,
    minuteUtc: 0,
    variants: 1,
    build: (stats) => ({
      title: "Most active today",
      text: [
        "⚡ <b>NEXPOOL · MOST ACTIVE TODAY</b>",
        `<i>${int(stats.users.activeToday)} accounts active in the last 24h</i>`,
        "",
        rankingBlock(
          stats.top.activeToday,
          (row) => `${int(row.value)} verified events`,
          "No backend activity has been recorded yet today.",
        ),
        "",
        "Activity means a confirmed settlement, verified task or rewarded ad — not opening the app.",
      ].join("\n"),
    }),
  },
  {
    key: "top_task_completers",
    category: "leaderboards",
    label: "Top task completers",
    description: "Top 10 accounts by distinct verified tasks this week.",
    frequency: "weekly",
    hourUtc: 17,
    minuteUtc: 30,
    variants: 1,
    build: (stats) => ({
      title: "Top task completers",
      text: [
        "📋 <b>NEXPOOL · TOP TASK COMPLETERS</b>",
        `<i>Last 7 days · ${int(stats.tasks.active)} active campaigns</i>`,
        "",
        rankingBlock(
          stats.top.tasksWeek,
          (row) => `${int(row.value)} tasks`,
          "No verified task completions this week yet.",
        ),
        "",
        "Each task counts once per account, and only after its verification passes.",
      ].join("\n"),
    }),
  },

  /* -------------------------------------------------------- mining */
  {
    key: "daily_mining_report",
    category: "mining",
    label: "Daily mining report",
    description: "Confirmed mining totals and miner count for the UTC day.",
    frequency: "daily",
    hourUtc: 22,
    minuteUtc: 0,
    variants: 1,
    build: (stats) => ({
      title: "Daily mining report",
      text: [
        "📊 <b>NEXPOOL · DAILY MINING REPORT</b>",
        `<i>${stats.day}</i>`,
        "",
        `⛏️ Confirmed today: <b>${nex(stats.mining.todayNex)} NEX</b>`,
        `👥 Miners today: <b>${int(stats.mining.minersToday)}</b>`,
        `📅 Last 7 days: <b>${nex(stats.mining.weekNex)} NEX</b>`,
        `🏦 All time mined: <b>${nex(stats.mining.allTimeNex)} NEX</b>`,
        `🎬 Verified ads today: <b>${int(stats.ads.verifiedToday)}</b>`,
        "",
        `Base rate: ${nex(stats.config.baseRateNexPerHour)} NEX/h · normal daily cap ${nex(stats.config.dailyLimitNex)} NEX.`,
        "Only settlements confirmed by the backend are included here.",
      ].join("\n"),
    }),
  },
  {
    key: "mining_reminder",
    category: "mining",
    label: "Mining reminder",
    description: "Daily prompt that a session must be started manually.",
    frequency: "daily",
    hourUtc: 9,
    minuteUtc: 0,
    variants: 3,
    build: (stats, variant) => {
      const openers = [
        "⛏️ <b>A new day of mining is waiting</b>",
        "🌅 <b>Your mining allowance has reset</b>",
        "🚀 <b>Ready to start today's session?</b>",
      ];
      return {
        title: "Mining reminder",
        text: [
          openers[variant % openers.length],
          "",
          `The UTC day has reset, so your normal allowance is back to <b>${nex(stats.config.dailyLimitNex)} NEX</b>.`,
          "",
          "A new day never starts mining on its own. Open the app and press <b>Start mining</b> when you are ready.",
          "",
          "Opening, refreshing or returning to the app does not create a session either — only an explicit start does.",
          '👉 <a href="https://nexpool.freebuff.app/app/earn/mining">Open the mining engine</a>',
        ].join("\n"),
      };
    },
  },
  {
    key: "background_mining_explainer",
    category: "mining",
    label: "Background mining explainer",
    description: "Explains the 10-verified-ad background entitlement.",
    frequency: "weekly",
    hourUtc: 12,
    minuteUtc: 0,
    variants: 1,
    build: (stats) => ({
      title: "Background mining",
      text: [
        "📡 <b>WHAT BACKGROUND MINING ACTUALLY DOES</b>",
        "",
        `Complete <b>10</b> provider-verified ads to keep an already-started session running for up to <b>${int(stats.config.awayMiningHours)} hours</b> while the Mini App is closed.`,
        "",
        "What it does:",
        "• continues a session you already started",
        "• stops on its own when the window ends",
        "",
        "What it never does:",
        "• start a new session",
        "• resume after a manual Stop",
        "• count an ad open or click as progress",
        "",
        `Each valued postback also credits ${nex(stats.config.adRewardNex)} NEX once to your balance.`,
      ].join("\n"),
    }),
  },
  {
    key: "extension_explainer",
    category: "mining",
    label: "Extra session explainer",
    description: "Explains the 20-ad extension after the normal cap.",
    frequency: "weekly",
    hourUtc: 15,
    minuteUtc: 0,
    variants: 1,
    build: (stats) => ({
      title: "Extra mining session",
      text: [
        `⏱️ <b>BEYOND THE NORMAL CAP · ${int(stats.config.extensionHours)} MORE HOURS</b>`,
        "",
        `After you reach the normal daily cap of <b>${nex(stats.config.dailyLimitNex)} NEX</b>, complete <b>20</b> verified ads to unlock an extra <b>${int(stats.config.extensionHours)}-hour</b> session.`,
        "",
        "The two unlocks are separate:",
        "• 10 ads → background continuation",
        `• 20 ads → the extra ${int(stats.config.extensionHours)}-hour bucket`,
        "",
        "Completing the ads grants the entitlement. Starting it is always a separate action, and the clock does not begin until you press Start.",
      ].join("\n"),
    }),
  },
  {
    key: "weekly_mining_report",
    category: "mining",
    label: "Weekly mining report",
    description: "Seven-day confirmed mining summary.",
    frequency: "weekly",
    hourUtc: 20,
    minuteUtc: 0,
    variants: 1,
    build: (stats) => ({
      title: "Weekly mining report",
      text: [
        "🗓️ <b>NEXPOOL · WEEKLY MINING REPORT</b>",
        "",
        `Last 7 days: <b>${nex(stats.mining.weekNex)} NEX</b> confirmed`,
        `All time: <b>${nex(stats.mining.allTimeNex)} NEX</b>`,
        `Active accounts today: <b>${int(stats.users.activeToday)}</b>`,
        `Tasks verified today: <b>${int(stats.tasks.verifiedToday)}</b>`,
        "",
        "The rate you earn is the rate configured by the operator plus the bonuses you actually hold — claimed levels, qualified referrals and active sponsor campaigns.",
      ].join("\n"),
    }),
  },

  /* ------------------------------------------------------- payouts */
  {
    key: "daily_payout_report",
    category: "payouts",
    label: "Daily payout report",
    description: "Completed payouts for the UTC day, without wallet data.",
    frequency: "daily",
    hourUtc: 19,
    minuteUtc: 0,
    variants: 1,
    build: (stats) => ({
      title: "Daily payout report",
      text: [
        "💸 <b>NEXPOOL · DAILY PAYOUT REPORT</b>",
        `<i>${stats.day}</i>`,
        "",
        `Completed payouts: <b>${int(stats.payouts.paidToday)}</b>`,
        `NEX paid out: <b>${nex(stats.payouts.paidTodayNex)} NEX</b>`,
        `Requests in review: <b>${int(stats.payouts.pending)}</b>`,
        "",
        "Only completed payouts are counted. A request under review has not been paid.",
        "Wallet addresses and transaction references are never published.",
      ].join("\n"),
    }),
  },
  {
    key: "weekly_payout_report",
    category: "payouts",
    label: "Weekly payout report",
    description: "Seven-day payout totals and pending queue.",
    frequency: "weekly",
    hourUtc: 18,
    minuteUtc: 30,
    variants: 1,
    build: (stats) => ({
      title: "Weekly payout report",
      text: [
        "🏦 <b>NEXPOOL · WEEKLY PAYOUT REPORT</b>",
        "",
        `Paid in the last 7 days: <b>${nex(stats.payouts.paidWeekNex)} NEX</b>`,
        `Completed payouts all time: <b>${int(stats.payouts.paidAllTime)}</b>`,
        `Queue right now: <b>${int(stats.payouts.pending)}</b> requests · ${nex(stats.payouts.pendingNex)} NEX`,
        "",
        `Minimum withdrawal: ${nex(stats.config.minWithdrawNex)} NEX.`,
        "Requests are reviewed against real treasury coverage before they are paid.",
      ].join("\n"),
    }),
  },

  /* ----------------------------------------------------- referrals */
  {
    key: "community_growth",
    category: "referrals",
    label: "Community growth",
    description: "Account, referral and activity totals.",
    frequency: "weekly",
    hourUtc: 11,
    minuteUtc: 0,
    variants: 1,
    build: (stats) => ({
      title: "Community growth",
      text: [
        "🌱 <b>NEXPOOL · COMMUNITY GROWTH</b>",
        "",
        `Accounts: <b>${int(stats.users.total)}</b> · new today <b>${int(stats.users.newToday)}</b>`,
        `Telegram-linked: <b>${int(stats.users.telegramLinked)}</b>`,
        `Referrals invited: <b>${int(stats.referrals.total)}</b>`,
        `Qualified referrals: <b>${int(stats.referrals.qualified)}</b>`,
        `New referrals today: <b>${int(stats.referrals.newToday)}</b>`,
        "",
        "A referral only qualifies once the invited account completes the required verified tasks.",
      ].join("\n"),
    }),
  },
  {
    key: "referral_explainer",
    category: "referrals",
    label: "How referrals qualify",
    description: "Explains pending vs qualified referrals.",
    frequency: "weekly",
    hourUtc: 14,
    minuteUtc: 0,
    variants: 1,
    build: (stats) => ({
      title: "How referrals qualify",
      text: [
        "🤝 <b>HOW NEXPOOL REFERRALS WORK</b>",
        "",
        "1. Share your referral link from the Community tab.",
        "2. Your friend opens NEXPOOL inside Telegram.",
        "3. They complete verified tasks to qualify.",
        "",
        `Pending referrals do not count toward the withdrawal requirement or the referral speed bonus. Qualified referrals do.`,
        "",
        `Right now: <b>${int(stats.referrals.qualified)}</b> qualified out of <b>${int(stats.referrals.total)}</b> invited.`,
      ].join("\n"),
    }),
  },

  /* --------------------------------------------------------- tasks */
  {
    key: "daily_task_reminder",
    category: "tasks",
    label: "Daily task reminder",
    description: "Daily nudge toward active sponsor campaigns.",
    frequency: "daily",
    hourUtc: 13,
    minuteUtc: 0,
    variants: 2,
    build: (stats, variant) => {
      const openers = [
        "📋 <b>MISSIONS ARE OPEN</b>",
        "🎯 <b>VERIFIED TASKS ARE WAITING</b>",
      ];
      return {
        title: "Daily task reminder",
        text: [
          openers[variant % openers.length],
          "",
          `Active campaigns right now: <b>${int(stats.tasks.active)}</b>`,
          `Tasks verified today: <b>${int(stats.tasks.verifiedToday)}</b>`,
          "",
          "Every reward is released only after its verification passes — Telegram membership, the sponsor's provider callback, or an operator review.",
          "",
          "A click alone is never enough.",
          '👉 <a href="https://nexpool.freebuff.app/app/earn/tasks">Open the mission board</a>',
        ].join("\n"),
      };
    },
  },
  {
    key: "task_verification_explainer",
    category: "tasks",
    label: "How task verification works",
    description: "Explains each verification method honestly.",
    frequency: "weekly",
    hourUtc: 10,
    minuteUtc: 30,
    variants: 1,
    build: () => ({
      title: "How task verification works",
      text: [
        "🔍 <b>HOW NEXPOOL VERIFIES A TASK</b>",
        "",
        "• <b>Telegram channel or group</b> — the bot asks Telegram whether you are still a member.",
        "• <b>Ads</b> — the provider's signed server callback confirms the completed view.",
        "• <b>Manual</b> — an operator reviews the submission before any reward is released.",
        "",
        "Rewards are never granted because a button was pressed. If a check cannot run, the task fails closed and you can try again.",
      ].join("\n"),
    }),
  },

  /* ------------------------------------------------------ motivation */
  {
    key: "morning_motivation",
    category: "motivation",
    label: "Morning motivation",
    description: "Rotating good-morning message. Never promises earnings.",
    frequency: "daily",
    hourUtc: 8,
    minuteUtc: 0,
    variants: 5,
    build: (_stats, variant) => {
      const bodies = [
        [
          "☀️ <b>Good morning, NEXPOOL</b>",
          "",
          "Small, repeated actions build real habits. Start one session today and let consistency do the rest.",
        ],
        [
          "🌅 <b>A fresh UTC day is open</b>",
          "",
          "You do not have to be the fastest. You just have to show up again today. Progress compounds quietly.",
        ],
        [
          "☕ <b>Morning, miners</b>",
          "",
          "Check your missions, start your session, and leave the rest to the engine. One clear step at a time.",
        ],
        [
          "🌤️ <b>Good morning</b>",
          "",
          "Yesterday is settled. Today is a clean allowance. Use it well and stop when you are done.",
        ],
        [
          "🫱 <b>Rise and mine</b>",
          "",
          "Discipline is quieter than motivation, and it lasts longer. A short session today is worth more than a perfect plan tomorrow.",
        ],
      ];
      const body = bodies[variant % bodies.length];
      return {
        title: "Morning motivation",
        text: [...body, "", "— NEXPOOL"].join("\n"),
      };
    },
  },
  {
    key: "evening_motivation",
    category: "motivation",
    label: "Evening motivation",
    description: "Rotating good-evening message. Never promises earnings.",
    frequency: "daily",
    hourUtc: 21,
    minuteUtc: 0,
    variants: 5,
    build: (_stats, variant) => {
      const bodies = [
        [
          "🌙 <b>Good evening, NEXPOOL</b>",
          "",
          "Whatever today looked like, you can close it out calmly. Settle what is running and rest.",
        ],
        [
          "✨ <b>Evening check-in</b>",
          "",
          "Did you finish one thing today? That counts. Small progress is still progress.",
        ],
        [
          "🌌 <b>Wrapping up</b>",
          "",
          "Your session keeps its own server clock. You do not need to watch it. Step away and let it settle.",
        ],
        [
          "🕯️ <b>Good evening</b>",
          "",
          "Consistency is not intensity. Coming back tomorrow matters more than pushing too hard tonight.",
        ],
        [
          "🌠 <b>Night, miners</b>",
          "",
          "Thank you for being part of NEXPOOL. Rest well — the next UTC day is already on its way.",
        ],
      ];
      const body = bodies[variant % bodies.length];
      return {
        title: "Evening motivation",
        text: [...body, "", "— NEXPOOL"].join("\n"),
      };
    },
  },
  {
    key: "progress_motivation",
    category: "motivation",
    label: "Progress over perfection",
    description: "Weekly rotating encouragement for the community.",
    frequency: "weekly",
    hourUtc: 10,
    minuteUtc: 0,
    variants: 4,
    build: (_stats, variant) => {
      const bodies = [
        [
          "🌱 <b>PROGRESS OVER PERFECTION</b>",
          "",
          "Nobody climbs a leaderboard in one day. They show up, verify a task, settle a session, and repeat.",
        ],
        [
          "🧭 <b>KEEP YOUR OWN PACE</b>",
          "",
          "Comparing your first week to someone else's tenth is not a fair race. Track your own line.",
        ],
        [
          "🔁 <b>THE BORING PART IS THE POINT</b>",
          "",
          "The habits that look unremarkable day to day are the ones that compound. Keep them small and keep them going.",
        ],
        [
          "🫶 <b>THANK YOU FOR BEING HERE</b>",
          "",
          "Every account, every verified task and every referral makes this community real. Appreciate you.",
        ],
      ];
      const body = bodies[variant % bodies.length];
      return {
        title: "Progress over perfection",
        text: [...body, "", "— NEXPOOL"].join("\n"),
      };
    },
  },

  /* ------------------------------------------------------ education */
  {
    key: "edu_how_mining_works",
    category: "education",
    label: "How mining works",
    description: "Permanent explainer for new members.",
    frequency: "weekly",
    hourUtc: 16,
    minuteUtc: 30,
    variants: 1,
    build: (stats) => ({
      title: "How mining works",
      text: [
        "📚 <b>HOW NEXPOOL MINING WORKS</b>",
        "",
        `1. Press <b>Start mining</b>. The backend opens a server-timed session.`,
        `2. NEX accrues at your configured rate — currently ${nex(stats.config.baseRateNexPerHour)} NEX/h before bonuses.`,
        `3. Normal mining stops at the daily cap of ${nex(stats.config.dailyLimitNex)} NEX.`,
        `4. A heartbeat proves you are present. It never starts a session.`,
        "",
        "A manual Stop is final for that session: nothing resumes it until you press Start again.",
      ].join("\n"),
    }),
  },
  {
    key: "edu_rewards_ledger",
    category: "education",
    label: "Where rewards come from",
    description: "Explains confirmed ledger credits versus claims.",
    frequency: "weekly",
    hourUtc: 13,
    minuteUtc: 30,
    variants: 1,
    build: () => ({
      title: "Where rewards come from",
      text: [
        "📚 <b>WHERE YOUR NEX COMES FROM</b>",
        "",
        "Every credit is a confirmed ledger row:",
        "• <b>Mining</b> — a settled server-timed session",
        "• <b>Tasks</b> — a verification that actually passed",
        "• <b>Referrals</b> — a qualified invitee, capped by the operator",
        "• <b>Levels</b> — a claimed level reward",
        "",
        "Pending, rejected and failed attempts are never credited. Opening the app changes nothing.",
      ].join("\n"),
    }),
  },
  {
    key: "edu_account_security",
    category: "education",
    label: "Account security",
    description: "Security reminder for all members.",
    frequency: "weekly",
    hourUtc: 22,
    minuteUtc: 30,
    variants: 1,
    build: () => ({
      title: "Account security",
      text: [
        "🔐 <b>PROTECT YOUR NEXPOOL ACCOUNT</b>",
        "",
        "• Sign in only through the official Telegram Mini App.",
        "• No NEXPOOL operator will ever ask for your seed phrase or wallet key.",
        "• Check the wallet address before you confirm a withdrawal.",
        "• Report suspicious DMs to support instead of replying to them.",
        "",
        "Your Telegram identity is your login. Keep that account secure first.",
      ].join("\n"),
    }),
  },
  ...LIBRARY_AUTOMATION_TEMPLATES,
];

export const templateByKey = new Map(PUBLISH_TEMPLATES.map((t) => [t.key, t]));

/* ------------------------------------------------------------- scheduler */

function nextOccurrence(
  from: number,
  frequency: Frequency,
  hourUtc: number,
  minuteUtc: number,
  weekday?: number,
  dayOfMonth?: number,
): number {
  const d = new Date(from);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  if (frequency === "daily") {
    let candidate = Date.UTC(y, m, day, hourUtc, minuteUtc);
    if (candidate <= from) candidate = Date.UTC(y, m, day + 1, hourUtc, minuteUtc);
    return candidate;
  }
  if (frequency === "weekly") {
    const target = Math.min(Math.max(weekday ?? 1, 0), 6);
    const currentWeekday = new Date(Date.UTC(y, m, day)).getUTCDay();
    let delta = (target - currentWeekday + 7) % 7;
    let candidate = Date.UTC(y, m, day + delta, hourUtc, minuteUtc);
    if (candidate <= from) {
      delta += 7;
      candidate = Date.UTC(y, m, day + delta, hourUtc, minuteUtc);
    }
    return candidate;
  }
  const target = Math.min(Math.max(dayOfMonth ?? 1, 1), 28);
  let candidate = Date.UTC(y, m, target, hourUtc, minuteUtc);
  if (candidate <= from) candidate = Date.UTC(y, m + 1, target, hourUtc, minuteUtc);
  return candidate;
}

/* -------------------------------------------------------------- operator */

async function assertOperator(ctx: ActionCtx): Promise<string> {
  const result = (await ctx.runMutation(internal.admin.assertOperator, {})) as {
    userId: string;
  };
  return String(result.userId);
}

async function assertAdminCtx(ctx: QueryCtx | MutationCtx) {
  await requireAdmin(ctx);
}

/* ------------------------------------------------------------- templates */

export const templates = query({
  args: {},
  handler: async (ctx) => {
    await assertAdminCtx(ctx);
    return {
      categories: PUBLISH_CATEGORIES,
      templates: PUBLISH_TEMPLATES.map((t) => ({
        key: t.key,
        category: t.category,
        label: t.label,
        description: t.description,
        frequency: t.frequency,
        hourUtc: t.hourUtc,
        minuteUtc: t.minuteUtc,
        variants: t.variants,
      })),
    };
  },
});

export const preview = query({
  args: { templateKey: v.string(), variant: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await assertAdminCtx(ctx);
    const template = templateByKey.get(args.templateKey);
    if (!template) throw new Error("Unknown template.");
    const stats = await computeStats(ctx);
    const built = template.build(stats, args.variant ?? 0);
    return {
      key: template.key,
      label: template.label,
      available: Boolean(built),
      title: built?.title ?? template.label,
      text:
        built?.text ??
        "This template refused to render because the backend has no confirmed data for it yet.",
    };
  },
});

/* ----------------------------------------------------------- automations */

export const listAutomations = query({
  args: {},
  handler: async (ctx) => {
    await assertAdminCtx(ctx);
    const rows = await ctx.db
      .query("telegramAutomations")
      .withIndex("by_nextRunAt")
      .order("asc")
      .collect();
    return rows.map((row) => {
      const template = templateByKey.get(row.templateKey);
      return {
        id: row._id,
        templateKey: row.templateKey,
        label: template?.label ?? row.templateKey,
        category: template?.category ?? "mining",
        enabled: row.enabled,
        destinationIds: row.destinationIds,
        frequency: row.frequency,
        hourUtc: row.hourUtc,
        minuteUtc: row.minuteUtc,
        weekday: row.weekday ?? null,
        dayOfMonth: row.dayOfMonth ?? null,
        requireApproval: row.requireApproval,
        nextRunAt: row.nextRunAt,
        lastRunAt: row.lastRunAt ?? null,
        lastError: row.lastError ?? null,
      };
    });
  },
});

export const upsertAutomation = mutation({
  args: {
    id: v.optional(v.id("telegramAutomations")),
    templateKey: v.string(),
    enabled: v.boolean(),
    destinationIds: v.array(v.string()),
    frequency: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
    ),
    hourUtc: v.number(),
    minuteUtc: v.number(),
    weekday: v.optional(v.number()),
    dayOfMonth: v.optional(v.number()),
    requireApproval: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const template = templateByKey.get(args.templateKey);
    if (!template) throw new Error("Unknown template.");
    if (args.hourUtc < 0 || args.hourUtc > 23) throw new Error("Hour must be 0–23 UTC.");
    if (args.minuteUtc < 0 || args.minuteUtc > 59) {
      throw new Error("Minute must be 0–59.");
    }
    if (args.weekday !== undefined && (args.weekday < 0 || args.weekday > 6)) {
      throw new Error("Weekday must be 0 (Sunday) to 6 (Saturday).");
    }
    if (args.dayOfMonth !== undefined && (args.dayOfMonth < 1 || args.dayOfMonth > 28)) {
      throw new Error("Day of month must be 1–28 so every month is valid.");
    }
    const destinationIds = [...new Set(args.destinationIds.map((id) => id.trim()))]
      .filter(Boolean);
    if (args.enabled && destinationIds.length === 0) {
      throw new Error("Connect at least one destination before enabling this schedule.");
    }
    if (destinationIds.length > 0) {
      const rows = await Promise.all(
        destinationIds.map((chatId) =>
          ctx.db
            .query("telegramDestinations")
            .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
            .first(),
        ),
      );
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        if (!row) throw new Error(`Destination ${destinationIds[index]} is not connected.`);
        if (!row.permissions.canPostMessages) {
          throw new Error(`${row.title} does not grant the bot permission to post.`);
        }
      }
    }

    const now = Date.now();
    const nextRunAt = nextOccurrence(
      now,
      args.frequency,
      args.hourUtc,
      args.minuteUtc,
      args.weekday,
      args.dayOfMonth,
    );

    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing) throw new Error("Automation no longer exists.");
      await ctx.db.patch(args.id, {
        templateKey: args.templateKey,
        enabled: args.enabled,
        destinationIds,
        frequency: args.frequency,
        hourUtc: args.hourUtc,
        minuteUtc: args.minuteUtc,
        weekday: args.weekday,
        dayOfMonth: args.dayOfMonth,
        requireApproval: args.requireApproval,
        // Always honour the schedule the operator just saved.
        nextRunAt,
        updatedAt: now,
        lastError: undefined,
      });
      return { id: args.id, nextRunAt };
    }

    const id = await ctx.db.insert("telegramAutomations", {
      templateKey: args.templateKey,
      enabled: args.enabled,
      destinationIds,
      frequency: args.frequency,
      hourUtc: args.hourUtc,
      minuteUtc: args.minuteUtc,
      weekday: args.weekday,
      dayOfMonth: args.dayOfMonth,
      requireApproval: args.requireApproval,
      rotationIndex: 0,
      nextRunAt,
      createdBy: String(userId),
      createdAt: now,
      updatedAt: now,
    });
    return { id, nextRunAt };
  },
});

export const deleteAutomation = mutation({
  args: { id: v.id("telegramAutomations") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.delete(args.id);
  },
});

export const getAutomation = internalQuery({
  args: { id: v.id("telegramAutomations") },
  handler: async (ctx, args) => await ctx.db.get(args.id),
});

/**
 * Operator bootstrap for scheduled publishing. Idempotent per template: calling
 * it again enables and re-points the existing rule instead of duplicating it.
 * `runNow` is for a deliberate first-run test; normal rules wait for their slot.
 */
export const seedAutomation = internalMutation({
  args: {
    templateKey: v.string(),
    destinationIds: v.array(v.string()),
    weekday: v.optional(v.number()),
    requireApproval: v.optional(v.boolean()),
    runNow: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const template = templateByKey.get(args.templateKey);
    if (!template) throw new Error(`Unknown template ${args.templateKey}.`);
    if (args.destinationIds.length === 0) {
      throw new Error("Choose at least one destination.");
    }
    const now = Date.now();
    const nextRunAt = args.runNow
      ? now
      : nextOccurrence(
          now + 60_000,
          template.frequency,
          template.hourUtc,
          template.minuteUtc,
          args.weekday,
        );
    const existing = await ctx.db
      .query("telegramAutomations")
      .withIndex("by_templateKey", (q) => q.eq("templateKey", args.templateKey))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: true,
        destinationIds: args.destinationIds,
        weekday: args.weekday ?? existing.weekday,
        requireApproval: args.requireApproval ?? existing.requireApproval,
        nextRunAt,
        lastError: undefined,
        updatedAt: now,
      });
      return { id: existing._id, created: false, nextRunAt };
    }
    const id = await ctx.db.insert("telegramAutomations", {
      templateKey: args.templateKey,
      enabled: true,
      destinationIds: args.destinationIds,
      frequency: template.frequency,
      hourUtc: template.hourUtc,
      minuteUtc: template.minuteUtc,
      weekday: args.weekday,
      requireApproval: args.requireApproval ?? false,
      rotationIndex: 0,
      nextRunAt,
      createdBy: "operator-cli",
      createdAt: now,
      updatedAt: now,
    });
    return { id, created: true, nextRunAt };
  },
});

export const dueAutomations = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("telegramAutomations")
      .withIndex("by_nextRunAt", (q) => q.lte("nextRunAt", args.now))
      .collect();
    return rows.filter((row) => row.enabled);
  },
});

export const recordRun = internalMutation({
  args: {
    id: v.id("telegramAutomations"),
    slot: v.number(),
    nextRunAt: v.number(),
    rotationIndex: v.number(),
    postId: v.optional(v.id("telegramPosts")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      lastRunAt: args.slot,
      nextRunAt: args.nextRunAt,
      rotationIndex: args.rotationIndex,
      lastPostId: args.postId,
      lastError: args.error,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Renders one automation and hands the finished post to the shared delivery
 * pipeline. Duplicate scheduler ticks are harmless: the post idempotency key is
 * derived from the scheduled slot, so the same slot can never produce two posts.
 */
export const runAutomation = internalAction({
  args: { id: v.id("telegramAutomations"), slot: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const automation = (await ctx.runQuery(
      internal.publishing.getAutomation,
      { id: args.id },
    )) as Doc<"telegramAutomations"> | null;
    if (!automation || !automation.enabled) return { status: "skipped" as const };

    const template = templateByKey.get(automation.templateKey);
    if (!template) return { status: "unknown-template" as const };

    const slot = args.slot ?? automation.nextRunAt;
    const stats = (await ctx.runQuery(
      internal.publishing.collectStats,
      {},
    )) as PublishStats;
    const built = template.build(stats, automation.rotationIndex);
    // Never schedule a run in the past: if the deployment was offline over
    // several slots, publish one catch-up post and skip the missed ones.
    const nextRunAt = nextOccurrence(
      Math.max(slot, Date.now()) + 60_000,
      automation.frequency,
      automation.hourUtc,
      automation.minuteUtc,
      automation.weekday,
      automation.dayOfMonth,
    );

    if (!built) {
      await ctx.runMutation(internal.publishing.recordRun, {
        id: automation._id,
        slot,
        nextRunAt,
        rotationIndex: automation.rotationIndex + 1,
        error: "Template had no confirmed data to publish.",
      });
      return { status: "no-data" as const };
    }

    const postId = (await ctx.runMutation(
      internal.telegramControl.createPost,
      {
        title: built.title,
        text: built.text.slice(0, 4096),
        parseMode: "HTML" as const,
        destinationIds: automation.destinationIds,
        idempotencyKey: `auto:${automation.templateKey}:${slot}`,
        createdBy: automation.createdBy,
        kind: "broadcast" as const,
        templateKey: automation.templateKey,
        automationId: automation._id,
      },
    )) as Id<"telegramPosts">;

    if (!automation.requireApproval) {
      await ctx.scheduler.runAfter(0, internal.telegramControl.deliverPost, {
        postId,
      });
    }

    await ctx.runMutation(internal.publishing.recordRun, {
      id: automation._id,
      slot,
      nextRunAt,
      rotationIndex: automation.rotationIndex + 1,
      postId,
    });
    return { status: "queued" as const, postId };
  },
});

/** Cron entry point: runs every enabled automation whose slot has arrived. */
export const runDueAutomations = internalAction({
  args: {},
  handler: async (ctx) => {
    const due = (await ctx.runQuery(internal.publishing.dueAutomations, {
      now: Date.now(),
    })) as Doc<"telegramAutomations">[];
    for (const row of due) {
      await ctx.runAction(internal.publishing.runAutomation, { id: row._id });
    }
    return { ran: due.length };
  },
});

/**
 * Releases a post that was generated in draft mode. Nothing is sent until an
 * operator explicitly approves it.
 */
export const approvePost = action({
  args: { postId: v.id("telegramPosts") },
  handler: async (ctx, args) => {
    const actor = await assertOperator(ctx);
    const post = (await ctx.runQuery(internal.telegramControl.getPost, {
      postId: args.postId,
    })) as Doc<"telegramPosts"> | null;
    if (!post) throw new Error("Post no longer exists.");
    if (post.status !== "draft") {
      throw new Error("Only a draft can be approved.");
    }
    await ctx.scheduler.runAfter(0, internal.telegramControl.deliverPost, {
      postId: post._id,
    });
    await ctx.runMutation(internal.telegramControl.audit, {
      actorId: actor,
      action: "telegram.post.approve",
      detail: `${post.title} · ${post.destinationIds.length} destinations`,
    });
    return { queued: true };
  },
});

/** Operator-triggered run that ignores the schedule but not the template data. */
export const runNow = action({
  args: { id: v.id("telegramAutomations") },
  handler: async (ctx, args) => {
    await assertOperator(ctx);
    const automation = (await ctx.runQuery(
      internal.publishing.getAutomation,
      { id: args.id },
    )) as Doc<"telegramAutomations"> | null;
    if (!automation) throw new Error("Automation no longer exists.");
    const result = (await ctx.runAction(
      internal.publishing.runAutomation,
      { id: args.id, slot: Date.now() },
    )) as { status: string; postId?: string };
    return result;
  },
});

/* --------------------------------------------------- private messaging */

export const SEGMENTS = [
  {
    key: "all_linked",
    label: "All Telegram-linked accounts",
    description: "Every account the bot can message directly.",
  },
  {
    key: "joined_today",
    label: "Joined today",
    description: "Accounts created since 00:00 UTC.",
  },
  {
    key: "never_mined",
    label: "Never started mining",
    description: "Telegram-linked accounts with no confirmed mining settlement.",
  },
  {
    key: "inactive_7d",
    label: "Inactive for 7 days",
    description: "Telegram-linked accounts with no recorded presence this week.",
  },
] as const;

export type SegmentKey = (typeof SEGMENTS)[number]["key"];

type Recipient = {
  telegramId: string;
  displayName: string;
  nexId: string;
};

async function resolveSegmentRows(
  ctx: QueryCtx,
  segment: string,
  limit: number,
): Promise<Recipient[]> {
  const now = Date.now();
  const todayStart = utcDayStart(now);
  const profiles = (await ctx.db.query("profiles").collect()).filter((p) =>
    Boolean(p.telegramId),
  );

  let pool = profiles;
  if (segment === "joined_today") {
    pool = profiles.filter((p) => p.createdAt >= todayStart);
  } else if (segment === "never_mined") {
    const miners = new Set(
      (await ctx.db.query("miningEntries").collect()).map((row) =>
        String(row.userId),
      ),
    );
    pool = profiles.filter((p) => !miners.has(String(p.userId)));
  } else if (segment === "inactive_7d") {
    const cutoff = now - 7 * DAY;
    pool = profiles.filter((p) => (p.lastActiveAt ?? 0) < cutoff);
  }

  return pool
    .slice(0, Math.min(Math.max(limit, 1), 500))
    .map((p) => ({
      telegramId: String(p.telegramId),
      displayName: p.displayName,
      nexId: p.nexId,
    }));
}

export const resolveSegment = internalQuery({
  args: { segment: v.string(), limit: v.number() },
  handler: async (ctx, args): Promise<Recipient[]> =>
    await resolveSegmentRows(ctx, args.segment, args.limit),
});

export const segmentCounts = query({
  args: {},
  handler: async (ctx) => {
    await assertAdminCtx(ctx);
    const counts: Record<string, number> = {};
    for (const segment of SEGMENTS) {
      counts[segment.key] = (
        await resolveSegmentRows(ctx, segment.key, 500)
      ).length;
    }
    return { segments: SEGMENTS, counts };
  },
});

function segmentBody(segment: string, stats: PublishStats): string {
  if (segment === "inactive_7d") {
    return [
      "👋 <b>We saved your spot</b>",
      "",
      "It has been a week since your last visit. Nothing expired that you had already earned — your confirmed rewards stay in your account.",
      "",
      `Missions open right now: <b>${int(stats.tasks.active)}</b>`,
      '👉 <a href="https://nexpool.freebuff.app/app">Open NEXPOOL</a>',
    ].join("\n");
  }
  if (segment === "never_mined") {
    return [
      "⛏️ <b>Your first session is waiting</b>",
      "",
      "Your account is ready but no mining session has been settled yet. Mining never starts by itself — open the engine and press <b>Start mining</b>.",
      "",
      `Normal daily allowance: <b>${nex(stats.config.dailyLimitNex)} NEX</b>`,
      '👉 <a href="https://nexpool.freebuff.app/app/earn/mining">Start your first session</a>',
    ].join("\n");
  }
  if (segment === "joined_today") {
    return [
      "🎉 <b>Welcome to NEXPOOL</b>",
      "",
      "Three things will get you started:",
      "1. Start a mining session from the Earn tab.",
      "2. Complete one verified mission for an instant reward.",
      "3. Join the community channel so you never miss a payout report.",
      "",
      '👉 <a href="https://nexpool.freebuff.app/app">Open your dashboard</a>',
    ].join("\n");
  }
  return [
    "📣 <b>Quick update from NEXPOOL</b>",
    "",
    `${int(stats.users.total)} accounts are on NEXPOOL and ${int(stats.ads.verifiedToday)} rewarded ads were verified today.`,
    "",
    `Missions open: <b>${int(stats.tasks.active)}</b>`,
    '👉 <a href="https://nexpool.freebuff.app/app">Open NEXPOOL</a>',
  ].join("\n");
}

/**
 * Sends a real private bot message to a targeted segment. Telegram only allows
 * this for users who have started the bot, so unreachable chats are recorded as
 * failed deliveries rather than silently skipped.
 */
export const sendSegment = action({
  args: {
    segment: v.string(),
    limit: v.optional(v.number()),
    requireApproval: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await assertOperator(ctx);
    if (!SEGMENTS.some((segment) => segment.key === args.segment)) {
      throw new Error("Unknown segment.");
    }
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 500);
    const recipients = (await ctx.runQuery(
      internal.publishing.resolveSegment,
      { segment: args.segment, limit },
    )) as Recipient[];
    if (recipients.length === 0) {
      return { queued: 0, postId: null };
    }
    const stats = (await ctx.runQuery(
      internal.publishing.collectStats,
      {},
    )) as PublishStats;

    const postId = (await ctx.runMutation(
      internal.telegramControl.createPost,
      {
        title: `Private · ${args.segment}`,
        text: segmentBody(args.segment, stats),
        parseMode: "HTML" as const,
        destinationIds: recipients.map((row) => row.telegramId),
        idempotencyKey: `dm:${args.segment}:${actor}:${Date.now()}`,
        createdBy: actor,
        kind: "private" as const,
        templateKey: `private:${args.segment}`,
      },
    )) as Id<"telegramPosts">;

    await ctx.runMutation(internal.telegramControl.audit, {
      actorId: actor,
      action: "telegram.segment.send",
      detail: `${args.segment} · ${recipients.length} recipients`,
    });

    if (!args.requireApproval) {
      await ctx.scheduler.runAfter(0, internal.telegramControl.deliverPost, {
        postId,
      });
    }
    return { queued: recipients.length, postId };
  },
});
