import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { loadConfig } from "./engine";
import { getViewer } from "./engine";
import { verifiedTaskCount } from "./referralEngine";

const DAY = 86_400_000;

export const leaderboardCategory = v.union(
  v.literal("earners"),
  v.literal("miners"),
  v.literal("inviters"),
  v.literal("active"),
  v.literal("tasks"),
  v.literal("levels"),
);

export const leaderboardPeriod = v.union(
  v.literal("daily"),
  v.literal("weekly"),
  v.literal("monthly"),
  v.literal("all"),
);

function utcDayStart(ts: number) {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function periodWindow(period: "daily" | "weekly" | "monthly" | "all", now: number) {
  if (period === "daily") return utcDayStart(now);
  if (period === "weekly") return now - 7 * DAY;
  if (period === "monthly") return now - 30 * DAY;
  return 0;
}

type RankRow = {
  profileId: Id<"profiles">;
  userId: Id<"users">;
  displayName: string;
  username?: string;
  photoUrl?: string;
  nexId: string;
  value: number;
  secondary: string;
  level: number;
  joinedAt: number;
};

const labels: Record<
  "earners" | "miners" | "inviters" | "active" | "tasks" | "levels",
  string
> = {
  earners: "Confirmed NEX earned",
  miners: "Confirmed NEX mined",
  inviters: "Qualified referrals",
  active: "Verified activity events",
  tasks: "Distinct verified tasks",
  levels: "Level reached",
};

/**
 * Server-side rankings. Every number is computed from confirmed backend
 * records; pending/rejected rewards are excluded, duplicate task rows collapse
 * to distinct task ids, and ties break deterministically by join date then id.
 */
export const rankings = query({
  args: {
    category: leaderboardCategory,
    period: leaderboardPeriod,
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, profile } = await getViewer(ctx);
    const now = Date.now();
    const from = periodWindow(args.period, now);
    const config = await loadConfig(ctx);

    const [profiles, ledger, completions, claims, referralRows, ads, miningEntries, xpEvents] =
      await Promise.all([
        ctx.db.query("profiles").collect(),
        ctx.db.query("ledger").collect(),
        ctx.db.query("taskCompletions").collect(),
        ctx.db.query("levelClaims").collect(),
        ctx.db.query("referrals").collect(),
        ctx.db.query("miningAdChallenges").collect(),
        ctx.db.query("miningEntries").collect(),
        ctx.db.query("xpEvents").collect(),
      ]);

    const profileByUser = new Map(profiles.map((p) => [String(p.userId), p]));
    const profileById = new Map(profiles.map((p) => [String(p._id), p]));
    const claimsByUser = new Map<string, number>();
    for (const claim of claims) {
      const key = String(claim.userId);
      claimsByUser.set(key, Math.max(claimsByUser.get(key) ?? 0, claim.level));
    }

    const rows = new Map<string, RankRow>();
    const ensureRow = (p: Doc<"profiles">): RankRow => {
      const key = String(p._id);
      const existing = rows.get(key);
      if (existing) return existing;
      const row: RankRow = {
        profileId: p._id,
        userId: p.userId,
        displayName: p.displayName,
        username: p.username,
        photoUrl: p.photoUrl,
        nexId: p.nexId,
        value: 0,
        secondary: "",
        level: claimsByUser.get(String(p.userId)) ?? 0,
        joinedAt: p.createdAt,
      };
      rows.set(key, row);
      return row;
    };

    if (args.category === "earners" || args.category === "miners") {
      const kinds: Array<Doc<"ledger">["kind"]> =
        args.category === "earners"
          ? ["mining", "task", "referral", "level"]
          : ["mining"];
      for (const entry of ledger) {
        if (!kinds.includes(entry.kind)) continue;
        if (entry.createdAt < from) continue;
        if (entry.amountNex <= 0) continue;
        const p = profileByUser.get(String(entry.userId));
        if (!p) continue;
        ensureRow(p).value += entry.amountNex;
      }
      for (const row of rows.values()) {
        row.value = Math.round(row.value * 1e9) / 1e9;
        row.secondary =
          args.category === "earners"
            ? `Level ${row.level} · ${row.nexId}`
            : `Mining ledger · ${row.nexId}`;
      }
      if (args.category === "miners") {
        const entryCounts = new Map<string, number>();
        for (const entry of miningEntries) {
          if (entry.createdAt < from) continue;
          const key = String(entry.userId);
          entryCounts.set(key, (entryCounts.get(key) ?? 0) + 1);
        }
        for (const row of rows.values()) {
          row.secondary = `${entryCounts.get(String(row.userId)) ?? 0} settled day(s) · ${row.nexId}`;
        }
      }
    }

    if (args.category === "inviters") {
      const totals = new Map<
        string,
        {
          qualifiedPeriod: number;
          qualifiedAll: number;
          total: number;
          pending: number;
          inProgress: number;
        }
      >();
      const bump = (
        inviterId: string,
        status: string,
        qualifiedInPeriod: boolean,
      ) => {
        const p = profileById.get(inviterId);
        if (!p) return;
        ensureRow(p);
        const entry = totals.get(inviterId) ?? {
          qualifiedPeriod: 0,
          qualifiedAll: 0,
          total: 0,
          pending: 0,
          inProgress: 0,
        };
        entry.total += 1;
        if (status === "qualified") {
          entry.qualifiedAll += 1;
          if (qualifiedInPeriod) entry.qualifiedPeriod += 1;
        } else if (status === "in_progress") entry.inProgress += 1;
        else entry.pending += 1;
        totals.set(inviterId, entry);
      };
      const seenProfiles = new Set<string>();
      for (const row of referralRows) {
        if (row.inviteeProfileId) seenProfiles.add(String(row.inviteeProfileId));
        bump(
          String(row.inviterProfileId),
          row.status,
          from === 0 || (row.qualifiedAt ?? 0) >= from,
        );
      }
      for (const p of profiles) {
        if (!p.referredBy) continue;
        if (seenProfiles.has(String(p._id))) continue;
        const count = await verifiedTaskCount(ctx, p.userId);
        const qualified =
          count >= config.referralTaskTarget ||
          p.referralQualifiedAt !== undefined;
        bump(
          String(p.referredBy),
          qualified ? "qualified" : count > 0 ? "in_progress" : "pending",
          from === 0 || (p.referralQualifiedAt ?? 0) >= from,
        );
      }
      for (const row of rows.values()) {
        const entry = totals.get(String(row.profileId));
        row.value = entry?.qualifiedPeriod ?? 0;
        row.secondary = entry
          ? `${entry.total} invited · ${entry.pending} pending · ${entry.inProgress} in progress · ${entry.qualifiedAll} qualified`
          : `0 invited · ${row.nexId}`;
      }
    }

    if (args.category === "active") {
      // One point per real backend activity event. Refreshing the app changes
      // lastActiveAt but not this score.
      const scores = new Map<string, number>();
      const add = (userIdValue: Id<"users">, amount: number) => {
        const p = profileByUser.get(String(userIdValue));
        if (!p) return;
        ensureRow(p);
        scores.set(String(p._id), (scores.get(String(p._id)) ?? 0) + amount);
      };
      const seenTask = new Set<string>();
      for (const completion of completions) {
        if (completion.status !== "verified") continue;
        if ((completion.verifiedAt ?? 0) < from) continue;
        const key = `${completion.userId}:${completion.taskId}`;
        if (seenTask.has(key)) continue;
        seenTask.add(key);
        add(completion.userId, 1);
      }
      for (const ad of ads) {
        if (ad.status !== "completed" || (ad.completedAt ?? 0) < from) continue;
        add(ad.userId, 1);
      }
      for (const entry of miningEntries) {
        if (entry.createdAt < from) continue;
        add(entry.userId, 1);
      }
      for (const row of rows.values()) {
        row.value = scores.get(String(row.profileId)) ?? 0;
        row.secondary = `${row.value} verified events · Level ${row.level}`;
      }
    }

    if (args.category === "tasks") {
      const byUser = new Map<string, Set<string>>();
      for (const completion of completions) {
        if (completion.status !== "verified") continue;
        if ((completion.verifiedAt ?? 0) < from) continue;
        const key = String(completion.userId);
        const set = byUser.get(key) ?? new Set<string>();
        set.add(String(completion.taskId));
        byUser.set(key, set);
      }
      for (const [key, set] of byUser) {
        const p = profileByUser.get(key);
        if (!p) continue;
        const row = ensureRow(p);
        row.value = set.size;
        row.secondary = `${set.size} distinct tasks · ${p.nexId}`;
      }
    }

    if (args.category === "levels") {
      // Levels are a lifetime achievement; the period selector still filters
      // the XP used as the tie-breaker for daily/weekly/monthly views.
      const xpInWindow = new Map<string, number>();
      for (const event of xpEvents) {
        if (event.createdAt < from) continue;
        const key = String(event.userId);
        xpInWindow.set(key, (xpInWindow.get(key) ?? 0) + event.amountXp);
      }
      for (const p of profiles) {
        const row = ensureRow(p);
        const level = claimsByUser.get(String(p.userId)) ?? 0;
        row.value = level;
        row.secondary =
          from === 0
            ? `${p.xp ?? 0} XP · ${p.nexId}`
            : `${xpInWindow.get(String(p.userId)) ?? 0} XP this period · ${p.nexId}`;
      }
    }

    const ranked = Array.from(rows.values())
      .filter((row) => row.value > 0 || args.category === "levels")
      .sort(
        (a, b) =>
          b.value - a.value ||
          a.joinedAt - b.joinedAt ||
          String(a.profileId).localeCompare(String(b.profileId)),
      );

    const limit = Math.min(Math.max(args.limit ?? 25, 1), 50);
    const offset = Math.max(args.offset ?? 0, 0);
    const page = ranked.slice(offset, offset + limit);
    const myIndex = userId
      ? ranked.findIndex((row) => String(row.userId) === String(userId))
      : -1;
    const me = myIndex >= 0 ? ranked[myIndex] : null;

    return {
      category: args.category,
      period: args.period,
      valueLabel: labels[args.category],
      total: ranked.length,
      offset,
      limit,
      rows: page.map((row, index) => ({
        rank: offset + index + 1,
        profileId: row.profileId,
        displayName: row.displayName,
        username: row.username ?? null,
        photoUrl: row.photoUrl ?? null,
        nexId: row.nexId,
        value: row.value,
        secondary: row.secondary,
        level: row.level,
        isMe: userId ? String(row.userId) === String(userId) : false,
      })),
      me: me
        ? {
            rank: myIndex + 1,
            displayName: me.displayName,
            nexId: me.nexId,
            value: me.value,
            secondary: me.secondary,
            level: me.level,
          }
        : profile
          ? {
              rank: null,
              displayName: profile.displayName,
              nexId: profile.nexId,
              value: 0,
              secondary: "No confirmed activity in this period yet.",
              level: claimsByUser.get(String(profile.userId)) ?? 0,
            }
          : null,
      config: {
        referralBonusPerHour: config.referralBonusNexPerHour,
        referralBonusCap: config.referralBonusCap,
      },
      privacy: "Only public profile fields are shown. Telegram IDs are never exposed.",
    };
  },
});
