import { v } from "convex/values";
import { getViewer, loadConfig, notifyUser, requireProfile, roundNex } from "./engine";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * The ten-level progression. Every threshold, NEX reward and mining-speed
 * bonus below is only the seed default — the operator edits the live ladder in
 * the admin console, and claims are always validated against the stored rows.
 */
export const LEVEL_DEFAULTS = [
  { level: 1, name: "Beginner", xpRequired: 100, rewardNex: 0.000001, speedBonusNexPerHour: 0 },
  { level: 2, name: "Starter", xpRequired: 300, rewardNex: 0.000002, speedBonusNexPerHour: 0.000000005 },
  { level: 3, name: "Explorer", xpRequired: 700, rewardNex: 0.000004, speedBonusNexPerHour: 0.00000001 },
  { level: 4, name: "Miner", xpRequired: 1_500, rewardNex: 0.000008, speedBonusNexPerHour: 0.000000015 },
  { level: 5, name: "Advanced", xpRequired: 3_000, rewardNex: 0.000015, speedBonusNexPerHour: 0.00000002 },
  { level: 6, name: "Expert", xpRequired: 6_000, rewardNex: 0.00003, speedBonusNexPerHour: 0.000000025 },
  { level: 7, name: "Master", xpRequired: 12_000, rewardNex: 0.00006, speedBonusNexPerHour: 0.00000003 },
  { level: 8, name: "Elite", xpRequired: 25_000, rewardNex: 0.00012, speedBonusNexPerHour: 0.000000035 },
  { level: 9, name: "Champion", xpRequired: 50_000, rewardNex: 0.00025, speedBonusNexPerHour: 0.00000004 },
  { level: 10, name: "Legend", xpRequired: 100_000, rewardNex: 0.0005, speedBonusNexPerHour: 0.000000045 },
] as const;

export type LevelRow = {
  level: number;
  name: string;
  xpRequired: number;
  rewardNex: number;
  speedBonusNexPerHour: number;
};

/** Published XP for a verified task when the campaign does not set its own. */
export const DEFAULT_TASK_XP = 100;
/** XP for a referral that has completed its verified-task requirement. */
export const QUALIFIED_REFERRAL_XP = 250;

export async function seedLevels(ctx: MutationCtx) {
  const existing = await ctx.db.query("levels").first();
  if (existing) return;
  const now = Date.now();
  for (const level of LEVEL_DEFAULTS) {
    await ctx.db.insert("levels", { ...level, updatedAt: now });
  }
}

export async function loadLevels(ctx: QueryCtx | MutationCtx): Promise<LevelRow[]> {
  const rows = await ctx.db.query("levels").collect();
  if (rows.length === 0) return LEVEL_DEFAULTS.map((row) => ({ ...row }));
  return rows
    .map((row) => ({
      level: row.level,
      name: row.name,
      xpRequired: row.xpRequired,
      rewardNex: row.rewardNex,
      speedBonusNexPerHour: row.speedBonusNexPerHour,
    }))
    .sort((a, b) => a.level - b.level);
}

export async function loadClaims(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  return await ctx.db
    .query("levelClaims")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
}

/** Highest level the user has actually claimed, or 0 if none. */
export async function claimedLevel(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<number> {
  const claims = await loadClaims(ctx, userId);
  return claims.reduce((max, claim) => Math.max(max, claim.level), 0);
}

/** Mining-speed bonus from claimed levels only — XP alone unlocks nothing. */
export async function levelSpeedBonus(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<{ level: number; bonusNexPerHour: number }> {
  const [claims, levels] = await Promise.all([loadClaims(ctx, userId), loadLevels(ctx)]);
  const byLevel = new Map(levels.map((row) => [row.level, row]));
  let bonus = 0;
  let highest = 0;
  for (const claim of claims) {
    highest = Math.max(highest, claim.level);
    bonus += byLevel.get(claim.level)?.speedBonusNexPerHour ?? 0;
  }
  return { level: highest, bonusNexPerHour: roundNex(bonus) };
}

/**
 * Credits XP for a server-verified action. Only backend code calls this; no
 * client can hand itself XP. Returns the level reached on a threshold cross.
 */
export async function awardXp(
  ctx: MutationCtx,
  options: {
    userId: Id<"users">;
    profile: Doc<"profiles">;
    amountXp: number;
    source: string;
    refId?: string;
    memo: string;
  },
) {
  const amount = Math.round(options.amountXp);
  if (amount <= 0) return { xp: options.profile.xp ?? 0, levelReached: null as number | null };

  const before = options.profile.xp ?? 0;
  const after = before + amount;
  await ctx.db.patch(options.profile._id, { xp: after });
  await ctx.db.insert("xpEvents", {
    userId: options.userId,
    amountXp: amount,
    source: options.source,
    refId: options.refId,
    memo: options.memo,
    createdAt: Date.now(),
  });

  const levels = await loadLevels(ctx);
  const crossed = levels.filter(
    (row) => before < row.xpRequired && after >= row.xpRequired,
  );
  const reached = crossed.length > 0 ? crossed[crossed.length - 1] : null;
  if (reached) {
    await notifyUser(
      ctx,
      options.profile,
      "level",
      `Level ${reached.level} reached`,
      `You crossed ${reached.xpRequired} XP and unlocked ${reached.name}. Claim the level reward in the progression screen.`,
    );
  }
  return { xp: after, levelReached: reached?.level ?? null };
}

/** Everything the progression screen needs, computed from stored state. */
export const progress = query({
  args: {},
  handler: async (ctx) => {
    const { userId, profile } = await getViewer(ctx);
    if (!userId || !profile) return null;

    const [levels, claims, config] = await Promise.all([
      loadLevels(ctx),
      loadClaims(ctx, userId),
      loadConfig(ctx),
    ]);
    const claimedAt = new Map(claims.map((claim) => [claim.level, claim.claimedAt]));
    const highest = claims.reduce((max, claim) => Math.max(max, claim.level), 0);
    const xp = profile.xp ?? 0;
    const nextLevel = levels.find((row) => row.level === highest + 1) ?? null;
    const speedBonus = claims.reduce((sum, claim) => {
      const row = levels.find((entry) => entry.level === claim.level);
      return sum + (row?.speedBonusNexPerHour ?? 0);
    }, 0);

    return {
      xp,
      highestClaimed: highest,
      currentName: levels.find((row) => row.level === highest)?.name ?? "Unranked",
      nextLevel: nextLevel
        ? {
            level: nextLevel.level,
            name: nextLevel.name,
            xpRequired: nextLevel.xpRequired,
            xpMissing: Math.max(0, nextLevel.xpRequired - xp),
            rewardNex: nextLevel.rewardNex,
            claimable: xp >= nextLevel.xpRequired,
          }
        : null,
      speedBonusNexPerHour: roundNex(speedBonus),
      baseRateNexPerHour: config.baseRateNexPerHour,
      levels: levels.map((row) => {
        const claimed = claimedAt.has(row.level);
        const locked = !claimed && row.level !== highest + 1;
        return {
          ...row,
          state: claimed
            ? ("claimed" as const)
            : locked
              ? ("locked" as const)
              : xp >= row.xpRequired
                ? ("claimable" as const)
                : ("open" as const),
          claimedAt: claimedAt.get(row.level) ?? null,
        };
      }),
    };
  },
});

/**
 * Claims one level reward. Sequential only: the next unclaimed level has to be
 * the one being claimed, and the stored XP total has to meet its threshold.
 */
export const claim = mutation({
  args: { level: v.number() },
  handler: async (ctx, args) => {
    const { userId, profile, balance } = await requireProfile(ctx);
    if (profile.restricted) {
      throw new Error("Account restricted. Contact support before claiming levels.");
    }

    const levels = await loadLevels(ctx);
    const target = levels.find((row) => row.level === args.level);
    if (!target) throw new Error("Unknown level.");

    const claims = await loadClaims(ctx, userId);
    const highest = claims.reduce((max, claim) => Math.max(max, claim.level), 0);
    if (args.level <= highest) {
      throw new Error("This level reward was already claimed.");
    }
    if (args.level !== highest + 1) {
      throw new Error(`Claim level ${highest + 1} first — levels cannot be skipped.`);
    }

    const xp = profile.xp ?? 0;
    if (xp < target.xpRequired) {
      throw new Error(
        `You need ${target.xpRequired - xp} more XP to claim level ${target.level}.`,
      );
    }

    const now = Date.now();
    const reward = roundNex(target.rewardNex);
    await ctx.db.insert("levelClaims", {
      userId,
      level: target.level,
      rewardNex: reward,
      speedBonusNexPerHour: target.speedBonusNexPerHour,
      xpAtClaim: xp,
      claimedAt: now,
    });

    if (reward > 0) {
      await ctx.db.patch(balance._id, {
        availableNex: roundNex(balance.availableNex + reward),
        updatedAt: now,
      });
      await ctx.db.insert("ledger", {
        userId,
        kind: "level",
        amountNex: reward,
        memo: `Level ${target.level} reward · ${target.name}`,
        refId: String(target.level),
        createdAt: now,
      });
    }

    await notifyUser(
      ctx,
      profile,
      "level",
      `Level ${target.level} claimed`,
      `${reward > 0 ? `${reward} NEX credited.` : "Level confirmed."}${
        target.speedBonusNexPerHour > 0
          ? ` Mining speed +${target.speedBonusNexPerHour} NEX/h.`
          : ""
      }`,
    );

    return {
      level: target.level,
      rewardNex: reward,
      speedBonusNexPerHour: target.speedBonusNexPerHour,
      availableNex: roundNex(balance.availableNex + reward),
    };
  },
});

/** Operator migration entry point for the default ladder. */
export const seedLadder = internalMutation({
  args: {},
  handler: async (ctx) => {
    await seedLevels(ctx);
    return { levels: (await ctx.db.query("levels").collect()).length };
  },
});
