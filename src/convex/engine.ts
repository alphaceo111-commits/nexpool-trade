import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { isTelegramAdmin, telegramAdminIds } from "./auth/telegram";

export const CONFIG_KEY = "default";

/**
 * NEX is accounted in fixed smallest units (nano-NEX, 9 decimals). Every
 * accrual, ledger and payout figure is rounded to this grid before it is
 * stored, so display and storage never disagree and no float dust accumulates.
 */
export const NEX_DECIMALS = 9;
export const NEX_PRECISION = 1_000_000_000;
export const roundNex = (value: number) =>
  Math.round(value * NEX_PRECISION) / NEX_PRECISION;

export type AppConfigShape = {
  baseRateNexPerHour: number;
  dailyLimitNex: number;
  nexUsdRate: number;
  tonUsdRate: number;
  minWithdrawNex: number;
  qualifiedReferralTarget: number;
  referralTaskTarget: number;
  referralBonusNexPerHour: number;
  referralBonusCap: number;
  treasuryAvailableUsd: number;
  miningEnabled: boolean;
  miningEnabledAt: number;
  awayMiningHours: number;
  extensionHours: number;
  adRewardNex: number;
  miningEconomyVersion: number;
  withdrawalsEnabled: boolean;
  ownerUserId?: Id<"users">;
};

/** Verified-ad rules. The two entitlements are deliberately independent. */
export const AWAY_ADS_REQUIRED = 10;
export const EXTENSION_ADS_REQUIRED = 20;
export const AWAY_MINING_HOURS_DEFAULT = 24;
export const EXTENSION_HOURS_DEFAULT = 5;
/** One verified provider postback credits one hour of base-rate NEX by default. */
export const AD_REWARD_NEX_DEFAULT = 0.0000005;
/** Bumped whenever the server economy needs a one-time stored-config patch. */
export const MINING_ECONOMY_VERSION = 2;

/**
 * A hard safety rail: bonuses can never push the server rate above twice the
 * configured base rate. This keeps legacy task/referral bonuses from turning
 * nano-NEX mining into a cap-in-minutes race.
 */
export const MAX_SPEED_MULTIPLIER = 2;

/**
 * Backend defaults. The first signed-in account persists these into
 * `appConfig`; after that the owner edits them in the admin console.
 */
export const CONFIG_DEFAULTS: AppConfigShape = {
  // 0.000000500 NEX/hour: 12 hours of base mining reaches the daily cap.
  baseRateNexPerHour: 0.0000005,
  // 0.000006000 NEX per UTC day.
  dailyLimitNex: 0.000006,
  nexUsdRate: 2.5,
  tonUsdRate: 5.2,
  minWithdrawNex: 1,
  qualifiedReferralTarget: 10,
  referralTaskTarget: 3,
  referralBonusNexPerHour: 0.02,
  referralBonusCap: 10,
  treasuryAvailableUsd: 0,
  miningEnabled: true,
  miningEnabledAt: 0,
  awayMiningHours: AWAY_MINING_HOURS_DEFAULT,
  extensionHours: EXTENSION_HOURS_DEFAULT,
  adRewardNex: AD_REWARD_NEX_DEFAULT,
  miningEconomyVersion: MINING_ECONOMY_VERSION,
  withdrawalsEnabled: false,
};

export async function loadConfig(
  ctx: QueryCtx | MutationCtx,
): Promise<AppConfigShape> {
  const row = await ctx.db
    .query("appConfig")
    .withIndex("by_key", (q) => q.eq("key", CONFIG_KEY))
    .first();
  if (!row) return { ...CONFIG_DEFAULTS };
  return {
    baseRateNexPerHour: row.baseRateNexPerHour,
    dailyLimitNex: row.dailyLimitNex,
    nexUsdRate: row.nexUsdRate,
    tonUsdRate: row.tonUsdRate,
    minWithdrawNex: row.minWithdrawNex,
    qualifiedReferralTarget: row.qualifiedReferralTarget,
    referralTaskTarget: row.referralTaskTarget,
    referralBonusNexPerHour: row.referralBonusNexPerHour,
    referralBonusCap: row.referralBonusCap,
    treasuryAvailableUsd: row.treasuryAvailableUsd,
    miningEnabled: row.miningEnabled,
    miningEnabledAt: row.miningEnabledAt,
    awayMiningHours: row.awayMiningHours ?? CONFIG_DEFAULTS.awayMiningHours,
    extensionHours: row.extensionHours ?? CONFIG_DEFAULTS.extensionHours,
    adRewardNex: row.adRewardNex ?? CONFIG_DEFAULTS.adRewardNex,
    miningEconomyVersion: row.miningEconomyVersion ?? 0,
    withdrawalsEnabled: row.withdrawalsEnabled,
    ownerUserId: row.ownerUserId,
  };
}

export function dayKey(ts: number) {
  return new Date(ts).toISOString().slice(0, 10);
}

export function nextUtcMidnight(ts: number) {
  const date = new Date(ts);
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
  );
}

export async function getViewer(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) return { userId: null as null, profile: null, balance: null };
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  const balance = await ctx.db
    .query("balances")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  return { userId, profile, balance };
}

export async function requireProfile(ctx: MutationCtx) {
  const { userId, profile, balance } = await getViewer(ctx);
  if (!userId) throw new Error("Sign in to continue.");
  if (!profile) throw new Error("Your NEXPOOL account is not ready yet. Reload the app.");
  if (!balance) throw new Error("Your NEXPOOL balance is not ready yet. Reload the app.");
  return { userId, profile, balance };
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(length: number) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

async function uniqueCode(
  ctx: MutationCtx,
  field: "nexId" | "referralCode",
  prefix = "",
) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const value = `${prefix}${randomCode(field === "nexId" ? 6 : 8)}`;
    const existing =
      field === "nexId"
        ? await ctx.db
            .query("profiles")
            .withIndex("by_nexId", (q) => q.eq("nexId", value))
            .first()
        : await ctx.db
            .query("profiles")
            .withIndex("by_referralCode", (q) => q.eq("referralCode", value))
            .first();
    if (!existing) return value;
  }
  throw new Error("Could not allocate an account code. Try again.");
}

export async function ensureAccount(
  ctx: MutationCtx,
  options: { referralCode?: string; displayName?: string } = {},
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Sign in to open NEXPOOL.");

  let profile = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  let balance = await ctx.db
    .query("balances")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();

  const now = Date.now();
  const existingConfig = await ctx.db
    .query("appConfig")
    .withIndex("by_key", (q) => q.eq("key", CONFIG_KEY))
    .first();
  if (!existingConfig) {
    await ctx.db.insert("appConfig", {
      key: CONFIG_KEY,
      ...CONFIG_DEFAULTS,
      miningEnabledAt: now,
      updatedAt: now,
    });
  }

  if (!profile) {
    const user = await ctx.db.get(userId);
    const fallbackName = user?.name?.trim() || "NEX miner";

    const nexId = await uniqueCode(ctx, "nexId", "NXP-");
    const referralCode = await uniqueCode(ctx, "referralCode");

    const profileId = await ctx.db.insert("profiles", {
      userId,
      nexId,
      displayName: options.displayName?.trim() || fallbackName,
      // Username is only populated from a validated Telegram identity. Email
      // prefixes are never exposed to referrers.
      username: undefined,
      referralCode,
      language: "en",
      notifyTasks: true,
      notifyMining: true,
      notifyWallet: true,
      notifyAnnouncements: true,
      restricted: false,
      complianceCleared: false,
      createdAt: now,
    });
    profile = (await ctx.db.get(profileId))!;

    await ctx.db.insert("notifications", {
      userId,
      kind: "announcement",
      title: "Welcome to NEXPOOL",
      body:
        "Open the Earn tab and press Start Mining when you are ready. Mining never starts automatically, not even after a daily reset. Complete 3 verified tasks per invited friend to unlock withdrawal eligibility.",
      createdAt: now,
    });
  }

  if (!balance) {
    const balanceId = await ctx.db.insert("balances", {
      userId,
      availableNex: 0,
      reservedNex: 0,
      lifetimeMinedNex: 0,
      lifetimeTaskNex: 0,
      lifetimeAdNex: 0,
      lastSettledAt: now,
      updatedAt: now,
    });
    balance = (await ctx.db.get(balanceId))!;
  }

  // Presence is only written by backend events. Keeping it here means a real
  // Mini App launch counts as activity; refreshing a report never does.
  await ctx.db.patch(profile._id, {
    lastActiveAt: now,
    miniAppOpenedAt: profile.miniAppOpenedAt ?? now,
  });
  profile = (await ctx.db.get(profile._id))!;

  // Referral attribution is deliberately NOT done here. The referral engine
  // owns it and is called by `app.ensure` / `telegram.attachIdentity`, which
  // know whether the launch came from the bot or the Mini App.
  return { profile, balance };
}

// ---------------------------------------------------------------------------
// Speed model
// ---------------------------------------------------------------------------

export type TaskBonusLine = {
  completionId: Id<"taskCompletions">;
  taskId: Id<"tasks">;
  title: string;
  sponsor: string;
  bonusNexPerHour: number;
  active: boolean;
  verifiedAt: number;
};

export type ReferralRow = {
  profileId: Id<"profiles">;
  displayName: string;
  username?: string;
  photoUrl?: string;
  joinedAt: number;
  verifiedTasks: number;
  requiredTasks: number;
  qualified: boolean;
  speedContribution: number;
  qualifiedAt?: number;
};

export async function listReferralRows(
  ctx: QueryCtx | MutationCtx,
  profileId: Id<"profiles">,
  config: AppConfigShape,
): Promise<ReferralRow[]> {
  const rows = await ctx.db
    .query("profiles")
    .withIndex("by_referredBy", (q) => q.eq("referredBy", profileId))
    .collect();

  const out: ReferralRow[] = [];
  for (const row of rows) {
    const completions = await ctx.db
      .query("taskCompletions")
      .withIndex("by_user", (q) => q.eq("userId", row.userId))
      .collect();
    const verifiedTaskIds = new Set(
      completions.filter((c) => c.status === "verified").map((c) => c.taskId),
    );
    const verifiedTasks = verifiedTaskIds.size;
    const qualified = verifiedTasks >= config.referralTaskTarget;
    out.push({
      profileId: row._id,
      displayName: row.displayName,
      username: row.username,
      photoUrl: row.photoUrl,
      joinedAt: row.createdAt,
      verifiedTasks,
      requiredTasks: config.referralTaskTarget,
      qualified,
      speedContribution: qualified ? config.referralBonusNexPerHour : 0,
      qualifiedAt: row.referralQualifiedAt,
    });
  }
  return out.sort((a, b) => b.joinedAt - a.joinedAt);
}

export type SpeedModel = {
  base: number;
  taskBonus: number;
  referralBonus: number;
  levelBonus: number;
  claimedLevel: number;
  referralQualifiedCount: number;
  total: number;
  uncappedTotal: number;
  rateCapNexPerHour: number;
  capped: boolean;
  taskLines: TaskBonusLine[];
  referralCount: number;
  qualifiedReferralCount: number;
};

export async function computeSpeed(
  ctx: QueryCtx | MutationCtx,
  profile: Doc<"profiles">,
  config: AppConfigShape,
): Promise<SpeedModel> {
  const completions = await ctx.db
    .query("taskCompletions")
    .withIndex("by_user", (q) => q.eq("userId", profile.userId))
    .collect();

  const now = Date.now();
  const taskLines: TaskBonusLine[] = [];
  for (const completion of completions) {
    if (completion.status !== "verified") continue;
    const task = await ctx.db.get(completion.taskId);
    const active = Boolean(
      task &&
        task.status === "active" &&
        (!task.expiresAt || task.expiresAt > now),
    );
    if (completion.speedBonusNexPerHour <= 0) continue;
    taskLines.push({
      completionId: completion._id,
      taskId: completion.taskId,
      title: task?.title ?? "Sponsor task",
      sponsor: task?.sponsor ?? "NEXPOOL",
      bonusNexPerHour: active ? completion.speedBonusNexPerHour : 0,
      active,
      verifiedAt: completion.verifiedAt ?? completion.startedAt,
    });
  }

  const referrals = await listReferralRows(ctx, profile._id, config);
  const qualified = referrals.filter((row) => row.qualified);

  // Level bonuses come from claimed levels only, priced by the live ladder.
  const claims = await ctx.db
    .query("levelClaims")
    .withIndex("by_user", (q) => q.eq("userId", profile.userId))
    .collect();
  const ladder = await ctx.db.query("levels").collect();
  const bonusByLevel = new Map(
    ladder.map((row) => [row.level, row.speedBonusNexPerHour]),
  );
  let claimedLevel = 0;
  let levelBonus = 0;
  for (const claim of claims) {
    claimedLevel = Math.max(claimedLevel, claim.level);
    levelBonus += bonusByLevel.get(claim.level) ?? 0;
  }

  const taskBonus = taskLines.reduce((sum, line) => sum + line.bonusNexPerHour, 0);
  const referralBonus =
    Math.min(qualified.length, config.referralBonusCap) *
    config.referralBonusNexPerHour;

  const uncappedTotal = roundNex(
    config.baseRateNexPerHour + taskBonus + referralBonus + levelBonus,
  );
  const rateCapNexPerHour = roundNex(
    config.baseRateNexPerHour * MAX_SPEED_MULTIPLIER,
  );
  return {
    base: config.baseRateNexPerHour,
    taskBonus: roundNex(taskBonus),
    referralBonus: roundNex(referralBonus),
    levelBonus: roundNex(levelBonus),
    claimedLevel,
    referralQualifiedCount: qualified.length,
    total: roundNex(Math.min(uncappedTotal, rateCapNexPerHour)),
    uncappedTotal,
    rateCapNexPerHour,
    capped: uncappedTotal > rateCapNexPerHour,
    taskLines: taskLines.sort((a, b) => b.verifiedAt - a.verifiedAt),
    referralCount: referrals.length,
    qualifiedReferralCount: qualified.length,
  };
}

// ---------------------------------------------------------------------------
// Accrual projection + settlement
// ---------------------------------------------------------------------------

const LOOKBACK_MS = 31 * 864e5;

export type AccrualSlice = {
  day: string;
  amountNex: number;
  capNex: number;
  alreadyMinedNex: number;
  remainingAfterNex: number;
};

export async function projectAccrual(
  ctx: QueryCtx | MutationCtx,
  options: {
    userId: Id<"users">;
    rateNexPerHour: number;
    dailyLimitNex: number;
    from: number;
    to: number;
  },
) {
  const start = Math.max(options.from, options.to - LOOKBACK_MS);
  if (
    options.rateNexPerHour <= 0 ||
    options.dailyLimitNex <= 0 ||
    options.to <= start
  ) {
    return { total: 0, slices: [] as AccrualSlice[] };
  }

  const slices: AccrualSlice[] = [];
  let cursor = start;
  let total = 0;
  let guard = 0;

  while (cursor < options.to && guard < 40) {
    guard += 1;
    const day = dayKey(cursor);
    const dayRow = await ctx.db
      .query("miningDays")
      .withIndex("by_user_day", (q) =>
        q.eq("userId", options.userId).eq("day", day),
      )
      .first();
    const alreadyMined = dayRow?.normalMinedNex ?? dayRow?.minedNex ?? 0;
    const boundary = Math.min(nextUtcMidnight(cursor), options.to);
    const hours = Math.max(0, (boundary - cursor) / 3_600_000);
    const remaining = Math.max(0, options.dailyLimitNex - alreadyMined);
    const credit = roundNex(
      Math.min(hours * options.rateNexPerHour, remaining),
    );

    total = roundNex(total + credit);
    slices.push({
      day,
      amountNex: credit,
      capNex: options.dailyLimitNex,
      alreadyMinedNex: roundNex(alreadyMined),
      remainingAfterNex: roundNex(Math.max(0, remaining - credit)),
    });

    cursor = boundary;
    if (boundary >= options.to) break;
  }

  return { total, slices };
}

export const MINING_SESSION_GRACE_MS = 60_000;
const MAX_SESSION_CREDIT_MS = 90_000;

/** A session is live only while the app has heartbeated recently. */
function miningSessionActive(profile: Doc<"profiles">, now: number) {
  return Boolean(
    profile.miningSessionStartedAt &&
      profile.miningSessionHeartbeatAt &&
      now - profile.miningSessionHeartbeatAt <= MINING_SESSION_GRACE_MS,
  );
}

function extensionWindow(
  profile: Doc<"profiles">,
  now: number,
): { startedAt: number; endsAt: number } | null {
  // `extensionUnlockedAt` is only a grant. The five-hour clock must not start
  // until the user explicitly presses Start Extra Mining.
  const startedAt = profile.miningExtensionStartedAt;
  const endsAt = profile.miningExtensionEndsAt;
  if (!startedAt || !endsAt || endsAt <= now || startedAt > now) return null;
  return { startedAt, endsAt };
}

function extensionGranted(profile: Doc<"profiles">) {
  return Boolean(
    profile.extensionUnlockedAt &&
      !profile.miningExtensionStartedAt &&
      !profile.miningExtensionEndsAt,
  );
}

function awayMiningActive(profile: Doc<"profiles">, now: number) {
  return Boolean(
    profile.awayMiningExpiresAt && profile.awayMiningExpiresAt > now,
  );
}

async function getMiningDay(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  day: string,
) {
  return await ctx.db
    .query("miningDays")
    .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
    .first();
}

function normalMinedFromRow(
  row: { minedNex: number; normalMinedNex?: number } | null,
) {
  return roundNex(row?.normalMinedNex ?? row?.minedNex ?? 0);
}

function extensionMinedFromRow(
  row: { extensionMinedNex?: number } | null,
) {
  return roundNex(row?.extensionMinedNex ?? 0);
}

async function markCapReached(
  ctx: MutationCtx,
  userId: Id<"users">,
  day: string,
  capNex: number,
  reachedAt: number,
) {
  const row = await getMiningDay(ctx, userId, day);
  if (
    row &&
    row.capReachedAt === undefined &&
    normalMinedFromRow(row) >= capNex
  ) {
    await ctx.db.patch(row._id, { capReachedAt: reachedAt });
  }
}

/** Upserts one day's normal and extension buckets plus their ledger rows. */
async function applyMiningCredit(
  ctx: MutationCtx,
  profile: Doc<"profiles">,
  day: string,
  normalNex: number,
  extensionNex: number,
  rateNexPerHour: number,
  fromTs: number,
  toTs: number,
) {
  const total = roundNex(normalNex + extensionNex);
  if (total <= 0) return;

  const dayRow = await getMiningDay(ctx, profile.userId, day);
  if (dayRow) {
    await ctx.db.patch(dayRow._id, {
      minedNex: roundNex(dayRow.minedNex + total),
      normalMinedNex: roundNex(normalMinedFromRow(dayRow) + normalNex),
      extensionMinedNex: roundNex(
        extensionMinedFromRow(dayRow) + extensionNex,
      ),
      updatedAt: toTs,
    });
  } else {
    await ctx.db.insert("miningDays", {
      userId: profile.userId,
      day,
      minedNex: total,
      normalMinedNex: normalNex,
      extensionMinedNex: extensionNex,
      updatedAt: toTs,
    });
  }

  if (extensionNex > 0 && profile.activeExtensionSessionId) {
    const session = await ctx.db.get(profile.activeExtensionSessionId);
    if (session) {
      await ctx.db.patch(session._id, {
        minedNex: roundNex(session.minedNex + extensionNex),
      });
    }
  }

  const entry = await ctx.db
    .query("miningEntries")
    .withIndex("by_user_day", (q) =>
      q.eq("userId", profile.userId).eq("day", day),
    )
    .first();
  if (entry) {
    await ctx.db.patch(entry._id, {
      amountNex: roundNex(entry.amountNex + total),
      normalNex: roundNex((entry.normalNex ?? entry.amountNex) + normalNex),
      extensionNex: roundNex((entry.extensionNex ?? 0) + extensionNex),
      rateNexPerHour,
      toTs,
    });
  } else {
    await ctx.db.insert("miningEntries", {
      userId: profile.userId,
      day,
      amountNex: total,
      normalNex,
      extensionNex,
      rateNexPerHour,
      fromTs,
      toTs,
      createdAt: toTs,
    });
  }

  const buckets: Array<{
    amount: number;
    ref: string;
    memo: string;
  }> = [];
  if (normalNex > 0) {
    buckets.push({
      amount: normalNex,
      ref: `mining:${day}:normal`,
      memo: `Normal mining · ${rateNexPerHour} NEX/h`,
    });
  }
  if (extensionNex > 0) {
    buckets.push({
      amount: extensionNex,
      ref: `mining:${day}:extension`,
      memo: `5-hour extension mining · ${rateNexPerHour} NEX/h`,
    });
  }

  for (const bucket of buckets) {
    const ledgerRow = await ctx.db
      .query("ledger")
      .withIndex("by_user_refId", (q) =>
        q.eq("userId", profile.userId).eq("refId", bucket.ref),
      )
      .first();
    if (ledgerRow) {
      await ctx.db.patch(ledgerRow._id, {
        amountNex: roundNex(ledgerRow.amountNex + bucket.amount),
        memo: bucket.memo,
      });
    } else {
      await ctx.db.insert("ledger", {
        userId: profile.userId,
        kind: "mining",
        amountNex: bucket.amount,
        memo: bucket.memo,
        refId: bucket.ref,
        createdAt: toTs,
      });
    }
  }
}

/**
 * Credits a server-time window into normal mining until the UTC-day cap, then
 * into an active five-hour extension. Extension time always takes priority
 * while it is live, so reaching 00:00 UTC cannot silently waste it.
 */
async function creditMiningWindow(
  ctx: MutationCtx,
  profile: Doc<"profiles">,
  balance: Doc<"balances">,
  config: AppConfigShape,
  speed: SpeedModel,
  from: number,
  to: number,
) {
  let cursor = from;
  let normalNex = 0;
  let extensionNex = 0;
  let lastCreditedAt = from;
  let guard = 0;

  while (cursor < to && guard < 16) {
    guard += 1;
    const day = dayKey(cursor);
    const dayRow = await getMiningDay(ctx, profile.userId, day);
    const normalRemaining = Math.max(
      0,
      config.dailyLimitNex - normalMinedFromRow(dayRow),
    );
    const extension = extensionWindow(profile, cursor);
    const dayEnd = Math.min(to, nextUtcMidnight(cursor));
    const extensionStart = profile.miningExtensionStartedAt;

    let mode: "normal" | "extension" | null = null;
    let sliceEnd = dayEnd;
    if (extension) {
      mode = "extension";
      sliceEnd = Math.min(dayEnd, extension.endsAt);
    } else if (
      normalRemaining <= 0 &&
      extensionStart &&
      profile.miningExtensionEndsAt &&
      extensionStart > cursor &&
      extensionStart < dayEnd
    ) {
      cursor = extensionStart;
      continue;
    } else if (normalRemaining > 0) {
      mode = "normal";
      const hoursToCap =
        speed.total > 0 ? normalRemaining / speed.total : 0;
      sliceEnd = Math.min(dayEnd, cursor + hoursToCap * 3_600_000);
    } else {
      // Cap reached and no extension is live on this day. Move to the next day;
      // a multi-day away window can resume at 00:00 UTC.
      cursor = dayEnd;
      continue;
    }

    if (sliceEnd <= cursor) {
      cursor = dayEnd;
      continue;
    }

    const amount = roundNex(((sliceEnd - cursor) / 3_600_000) * speed.total);
    if (amount > 0) {
      if (mode === "normal") normalNex = roundNex(normalNex + amount);
      else extensionNex = roundNex(extensionNex + amount);
      await applyMiningCredit(
        ctx,
        profile,
        day,
        mode === "normal" ? amount : 0,
        mode === "extension" ? amount : 0,
        speed.total,
        cursor,
        sliceEnd,
      );
      if (mode === "normal") {
        await markCapReached(
          ctx,
          profile.userId,
          day,
          config.dailyLimitNex,
          sliceEnd,
        );
      }
      lastCreditedAt = sliceEnd;
    }
    cursor = sliceEnd;
  }

  // Finalize the granted session as soon as the server has credited through
  // its expiry. Keeping the row preserves the final extension earnings.
  if (profile.activeExtensionSessionId) {
    const session = await ctx.db.get(profile.activeExtensionSessionId);
    if (
      session &&
      session.endsAt !== undefined &&
      session.endsAt <= to &&
      session.status === "active"
    ) {
      await ctx.db.patch(session._id, {
        status: "expired",
        finalizedAt: Math.min(to, session.endsAt),
      });
    }
  }

  const creditedNex = roundNex(normalNex + extensionNex);
  if (creditedNex > 0) {
    await ctx.db.patch(balance._id, {
      availableNex: roundNex(balance.availableNex + creditedNex),
      lifetimeMinedNex: roundNex(balance.lifetimeMinedNex + creditedNex),
      lastSettledAt: to,
      updatedAt: to,
    });
    await ctx.db.patch(profile._id, { miningSessionCreditedAt: lastCreditedAt });
  }

  const today = dayKey(to);
  const dayRow = await getMiningDay(ctx, profile.userId, today);
  const todayNormal = normalMinedFromRow(dayRow);
  const extensionLive = Boolean(extensionWindow(profile, to));
  const reachedCap = todayNormal >= config.dailyLimitNex;

  if (reachedCap && !extensionLive && profile.notifyMining) {
    const recentNotes = await ctx.db
      .query("notifications")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", profile.userId))
      .order("desc")
      .take(30);
    const alreadyNotified = recentNotes.some(
      (note) =>
        note.kind === "mining" &&
        note.title === "Daily mining limit reached" &&
        dayKey(note.createdAt) === today,
    );
    if (!alreadyNotified) {
      await notifyUser(
        ctx,
        profile,
        "mining",
        "Daily mining limit reached",
        `You mined the full ${config.dailyLimitNex} NEX normal allowance for today. Watch ${EXTENSION_ADS_REQUIRED} verified ads to unlock another ${config.extensionHours} hours of mining.`,
      );
    }
  }

  return {
    creditedNex,
    normalNex,
    extensionNex,
    status:
      reachedCap && !extensionLive
        ? ("limit" as const)
        : ("active" as const),
  };
}

/**
 * Credits at most the last 90 seconds of presence. A missed heartbeat can
 * never pay the time the app was closed unless away-mining is active.
 */
async function creditMiningSession(
  ctx: MutationCtx,
  profile: Doc<"profiles">,
  balance: Doc<"balances">,
  config: AppConfigShape,
  speed: SpeedModel,
  now: number,
) {
  const from =
    profile.miningSessionCreditedAt ?? profile.miningSessionHeartbeatAt ?? now;
  const to = Math.min(now, from + MAX_SESSION_CREDIT_MS);
  const result = await creditMiningWindow(
    ctx,
    profile,
    balance,
    config,
    speed,
    from,
    to,
  );
  await ctx.db.patch(profile._id, { miningSessionHeartbeatAt: now });
  return { creditedNex: result.creditedNex, status: result.status };
}

/**
 * Settles the gap while the app was closed, but only inside the verified
 * away-mining permission and never past its expiry.
 */
async function settleAwayMining(
  ctx: MutationCtx,
  profile: Doc<"profiles">,
  balance: Doc<"balances">,
  config: AppConfigShape,
  speed: SpeedModel,
  now: number,
) {
  if (
    !config.miningEnabled ||
    profile.restricted ||
    speed.total <= 0 ||
    !profile.awayMiningExpiresAt ||
    profile.miningPausedAt ||
    (!profile.miningSessionStartedAt && !profile.awayMiningStartedAt)
  ) {
    await ctx.db.patch(profile._id, { awayMiningStartedAt: undefined });
    return { creditedNex: 0, status: "paused" as const };
  }

  // A clean visibility/pagehide transition records `awayMiningStartedAt`.
  // Telegram can also terminate the WebView without firing either event, so
  // fall back to the last server-credited presence timestamp. This credits the
  // real absence only; it can never pay the time the app was open and already
  // settled, and it is always clipped to the entitlement expiry.
  const lastPresence =
    profile.miningSessionCreditedAt ?? profile.miningSessionHeartbeatAt;
  const from = Math.max(
    profile.awayMiningStartedAt ??
      lastPresence ??
      profile.awayMiningUnlockedAt ??
      now,
    profile.awayMiningUnlockedAt ?? 0,
  );
  // Settle even if the permission window has already ended: the user is
  // entitled to the part of the absence that fell inside the window.
  const to = Math.min(now, profile.awayMiningExpiresAt);
  if (to <= from) {
    await ctx.db.patch(profile._id, {
      awayMiningStartedAt: undefined,
      miningSessionCreditedAt: to,
    });
    return { creditedNex: 0, status: "paused" as const };
  }

  const result = await creditMiningWindow(
    ctx,
    profile,
    balance,
    config,
    speed,
    from,
    to,
  );
  await ctx.db.patch(profile._id, {
    awayMiningStartedAt: undefined,
    // Anchor the next presence credit at the end of the settled absence. This
    // avoids double-crediting a gap when the user returns online.
    miningSessionCreditedAt: to,
  });
  return { creditedNex: result.creditedNex, status: result.status };
}

/**
 * The five-hour extension is an explicitly authorized session. Once started it
 * is allowed to settle its full server-time window, even if the Mini App was
 * closed, because the user spent 20 verified ads to start it. It never credits
 * normal mining after the extension window ends.
 */
async function settleExtensionGap(
  ctx: MutationCtx,
  profile: Doc<"profiles">,
  balance: Doc<"balances">,
  config: AppConfigShape,
  speed: SpeedModel,
  now: number,
) {
  if (
    !config.miningEnabled ||
    profile.restricted ||
    profile.miningPausedAt ||
    speed.total <= 0
  ) {
    return { creditedNex: 0, status: "paused" as const };
  }
  const startedAt = profile.miningExtensionStartedAt;
  const endsAt = profile.miningExtensionEndsAt;
  if (!startedAt || !endsAt) {
    return { creditedNex: 0, status: "paused" as const };
  }
  const from = Math.max(
    startedAt,
    profile.miningSessionCreditedAt ?? startedAt,
  );
  const to = Math.min(now, endsAt);
  if (to <= from) {
    return { creditedNex: 0, status: "paused" as const };
  }

  let cursor = from;
  let creditedNex = 0;
  while (cursor < to) {
    const boundary = Math.min(to, nextUtcMidnight(cursor));
    const amount = roundNex(((boundary - cursor) / 3_600_000) * speed.total);
    if (amount > 0) {
      await applyMiningCredit(
        ctx,
        profile,
        dayKey(cursor),
        0,
        amount,
        speed.total,
        cursor,
        boundary,
      );
      creditedNex = roundNex(creditedNex + amount);
    }
    cursor = boundary;
  }
  await ctx.db.patch(profile._id, { miningSessionCreditedAt: to });
  if (creditedNex > 0) {
    await ctx.db.patch(balance._id, {
      availableNex: roundNex(balance.availableNex + creditedNex),
      lifetimeMinedNex: roundNex(balance.lifetimeMinedNex + creditedNex),
      lastSettledAt: to,
      updatedAt: to,
    });
  }
  if (profile.activeExtensionSessionId) {
    const session = await ctx.db.get(profile.activeExtensionSessionId);
    if (session && session.endsAt !== undefined && session.endsAt <= now) {
      if (session.status === "active") {
        await ctx.db.patch(session._id, {
          status: "expired",
          finalizedAt: session.endsAt,
        });
      }
    }
  }
  return {
    creditedNex,
    status: (endsAt > now ? "active" : "paused") as "active" | "paused",
  };
}

export type MiningState =
  | "IDLE"
  | "ACTIVE"
  | "BACKGROUND_ACTIVE"
  | "PAUSED"
  | "CAP_REACHED"
  | "EXPIRED"
  | "COMPLETED";

export type MiningSnapshot = {
  status: "active" | "paused" | "limit" | "restricted";
  state: MiningState;
  rateNexPerHour: number;
  todayMinedNex: number;
  todayTotalNex: number;
  extensionMinedNex: number;
  todayLimitNex: number;
  remainingTodayNex: number;
  projectedAccrualNex: number;
  resetAt: number;
  lastSettledAt: number;
  lastHeartbeatAt: number | null;
  uncollectedMs: number;
  capReachedAt: number | null;
  sessionActive: boolean;
  manuallyPaused: boolean;
  backgroundSessionPending: boolean;
  awayMiningActive: boolean;
  awayMiningEntitled: boolean;
  awayMiningExpiresAt: number | null;
  awayMiningExpired: boolean;
  awayMiningHours: number;
  extensionActive: boolean;
  extensionUnlocked: boolean;
  extensionStartable: boolean;
  extensionUnlockedAt: number | null;
  extensionStartedAt: number | null;
  extensionEndsAt: number | null;
  extensionRemainingMs: number;
  extensionExpiredToday: boolean;
  ads: {
    providerReady: boolean;
    away: {
      required: number;
      completed: number;
      active: boolean;
      sessionActive: boolean;
      unlockedAt: number | null;
      expiresAt: number | null;
      expired: boolean;
    };
    extension: {
      required: number;
      completed: number;
      active: boolean;
      eligible: boolean;
      unlocked: boolean;
      startable: boolean;
      endsAt: number | null;
      unlockedToday: boolean;
      expiredToday: boolean;
    };
    pending: { id: string; purpose: "away" | "extension"; expiresAt: number } | null;
  };
};

export async function readMiningSnapshot(
  ctx: QueryCtx | MutationCtx,
  profile: Doc<"profiles">,
  balance: Doc<"balances">,
  config: AppConfigShape,
  speed: SpeedModel,
  now = Date.now(),
): Promise<MiningSnapshot> {
  const today = dayKey(now);
  const dayRow = await getMiningDay(ctx, profile.userId, today);
  const alreadyMined = normalMinedFromRow(dayRow);
  const todayMined = roundNex(Math.min(config.dailyLimitNex, alreadyMined));
  const extensionMined = extensionMinedFromRow(dayRow);
  const remaining = roundNex(Math.max(0, config.dailyLimitNex - todayMined));
  const sessionActive = miningSessionActive(profile, now);
  const awayEntitled = awayMiningActive(profile, now);
  const extension = extensionWindow(profile, now);
  const extensionLive = Boolean(extension);
  const extensionUnlocked = extensionGranted(profile);
  const manuallyPaused = Boolean(profile.miningPausedAt);
  const backgroundSessionActive = Boolean(
    awayEntitled &&
      (profile.awayMiningStartedAt !== undefined ||
        profile.miningSessionStartedAt !== undefined),
  );
  const backgroundSessionPending = Boolean(
    !sessionActive &&
      profile.awayMiningExpiresAt !== undefined &&
      (profile.awayMiningStartedAt !== undefined ||
        profile.miningSessionStartedAt !== undefined),
  );
  const extensionOfflineActive = Boolean(extensionLive && !sessionActive);
  const pendingMs =
    sessionActive && !manuallyPaused
      ? Math.min(
          Math.max(
            0,
            now -
              (profile.miningSessionCreditedAt ??
                profile.miningSessionHeartbeatAt ??
                now),
          ),
          MAX_SESSION_CREDIT_MS,
        )
      : 0;
  const projectedMs = extensionLive
    ? pendingMs
    : Math.min(pendingMs, remaining / Math.max(speed.total, 1e-12) * 3_600_000);
  const pendingNex =
    sessionActive && !manuallyPaused
      ? roundNex((projectedMs / 3_600_000) * speed.total)
      : 0;

  const pendingChallenge = await ctx.db
    .query("miningAdChallenges")
    .withIndex("by_user_status_createdAt", (q) =>
      q.eq("userId", profile.userId).eq("status", "pending"),
    )
    .order("asc")
    .first();

  let status: MiningSnapshot["status"] = "active";
  if (profile.restricted) status = "restricted";
  else if (!config.miningEnabled) status = "paused";
  else if (remaining <= 0 && !extensionLive) status = "limit";
  else if (manuallyPaused) status = "paused";
  else if (!sessionActive && !backgroundSessionActive && !extensionLive) {
    status = "paused";
  }

  let state: MiningState = "IDLE";
  if (profile.restricted || !config.miningEnabled) state = "PAUSED";
  else if (remaining <= 0 && !extensionLive) state = "CAP_REACHED";
  else if (sessionActive) state = "ACTIVE";
  else if (backgroundSessionActive || extensionOfflineActive) {
    state = manuallyPaused ? "PAUSED" : "BACKGROUND_ACTIVE";
  } else if (manuallyPaused) state = "PAUSED";
  else if (
    profile.miningLastStartedDay === today ||
    todayMined > 0 ||
    extensionMined > 0
  ) {
    state = "PAUSED";
  }

  const awayProgress = profile.awayMiningAdProgress ?? 0;
  const extensionProgress = profile.extensionAdProgress ?? 0;
  const unlockedToday = profile.extensionUnlockDay === today;
  const storedExtensionEndsAt = profile.miningExtensionEndsAt ?? null;
  const extensionExpiredToday = Boolean(
    !extensionLive &&
      storedExtensionEndsAt !== null &&
      storedExtensionEndsAt <= now &&
      (unlockedToday || dayKey(storedExtensionEndsAt) === today),
  );
  const awayExpired = Boolean(
    profile.awayMiningExpiresAt !== undefined &&
      profile.awayMiningExpiresAt <= now,
  );
  const capReachedAt =
    dayRow?.capReachedAt ??
    (alreadyMined >= config.dailyLimitNex ? (dayRow?.updatedAt ?? null) : null);

  return {
    status,
    state,
    rateNexPerHour: speed.total,
    todayMinedNex: todayMined,
    todayTotalNex: roundNex(todayMined + extensionMined),
    extensionMinedNex: extensionMined,
    todayLimitNex: config.dailyLimitNex,
    remainingTodayNex: remaining,
    projectedAccrualNex: pendingNex,
    resetAt: nextUtcMidnight(now),
    lastSettledAt: balance.lastSettledAt,
    lastHeartbeatAt: profile.miningSessionHeartbeatAt ?? null,
    uncollectedMs: pendingMs,
    capReachedAt,
    sessionActive,
    manuallyPaused,
    backgroundSessionPending,
    awayMiningActive: awayEntitled,
    awayMiningEntitled: awayEntitled,
    awayMiningExpiresAt: profile.awayMiningExpiresAt ?? null,
    awayMiningExpired: awayExpired,
    awayMiningHours: config.awayMiningHours,
    extensionActive: extensionLive,
    extensionUnlocked,
    extensionStartable: extensionUnlocked,
    extensionUnlockedAt: profile.extensionUnlockedAt ?? null,
    extensionStartedAt:
      extensionLive || extensionExpiredToday
        ? (profile.miningExtensionStartedAt ?? null)
        : null,
    extensionEndsAt:
      extensionLive || extensionExpiredToday ? storedExtensionEndsAt : null,
    extensionRemainingMs: extension ? extension.endsAt - now : 0,
    extensionExpiredToday,
    ads: {
      // A server-authenticated provider postback is required before progress
      // is applied. Without the shared secret the app must fail closed rather
      // than trusting a client-supplied "valued" result.
      providerReady: Boolean(process.env.MONETAG_POSTBACK_SECRET),
      away: {
        required: AWAY_ADS_REQUIRED,
        completed: awayProgress,
        active: awayEntitled,
        sessionActive: backgroundSessionActive,
        unlockedAt: profile.awayMiningUnlockedAt ?? null,
        expiresAt: profile.awayMiningExpiresAt ?? null,
        expired: awayExpired,
      },
      extension: {
        required: EXTENSION_ADS_REQUIRED,
        completed: extensionProgress,
        active: extensionLive,
        eligible:
          remaining <= 0 &&
          !extensionLive &&
          !unlockedToday &&
          !extensionUnlocked,
        unlocked: extensionUnlocked,
        startable: extensionUnlocked,
        endsAt: extension?.endsAt ?? null,
        unlockedToday,
        expiredToday: extensionExpiredToday,
      },
      pending:
        pendingChallenge &&
        pendingChallenge.purpose !== "task" &&
        pendingChallenge.expiresAt > now
          ? {
              id: String(pendingChallenge._id),
              purpose: pendingChallenge.purpose,
              expiresAt: pendingChallenge.expiresAt,
            }
          : null,
    },
  };
}

/**
 * Materialises elapsed mining into confirmed balance. This is the only place
 * mining rewards become balance, and it always uses server timestamps, the
 * configured rate and the per-day cap.
 */
export async function settleMining(
  ctx: MutationCtx,
  profile: Doc<"profiles">,
  balance: Doc<"balances">,
  config: AppConfigShape,
  speed: SpeedModel,
) {
  const now = Date.now();
  if (!config.miningEnabled || profile.restricted || speed.total <= 0) {
    return {
      creditedNex: 0,
      status: profile.restricted ? ("restricted" as const) : ("paused" as const),
    };
  }
  if (profile.miningPausedAt) {
    return { creditedNex: 0, status: "paused" as const };
  }
  if (miningSessionActive(profile, now)) {
    return await creditMiningSession(ctx, profile, balance, config, speed, now);
  }

  let creditedNex = 0;
  // Settle an expired background entitlement too: the user is entitled to the
  // portion of the absence that fell before its server expiry.
  if (
    profile.awayMiningExpiresAt !== undefined &&
    (profile.miningSessionStartedAt !== undefined ||
      profile.awayMiningStartedAt !== undefined)
  ) {
    const away = await settleAwayMining(
      ctx,
      profile,
      balance,
      config,
      speed,
      now,
    );
    creditedNex = away.creditedNex;
    profile = (await ctx.db.get(profile._id))!;
    balance = (await ctx.db.get(balance._id))!;
  }
  if (profile.miningExtensionStartedAt && profile.miningExtensionEndsAt) {
    const extension = await settleExtensionGap(
      ctx,
      profile,
      balance,
      config,
      speed,
      now,
    );
    creditedNex = roundNex(creditedNex + extension.creditedNex);
  }
  return {
    creditedNex,
    status: creditedNex > 0 ? ("active" as const) : ("paused" as const),
  };
}

/** Starts a fresh presence-tracked session, first settling any valid away gap. */
export async function startMiningSession(
  ctx: MutationCtx,
  profile: Doc<"profiles">,
  balance: Doc<"balances">,
  config: AppConfigShape,
  speed: SpeedModel,
) {
  const now = Date.now();
  if (!config.miningEnabled) {
    return { creditedNex: 0, status: "paused" as const, extensionReady: false };
  }
  if (profile.restricted) {
    return {
      creditedNex: 0,
      status: "restricted" as const,
      extensionReady: false,
    };
  }
  if (miningSessionActive(profile, now)) {
    const result = await creditMiningSession(
      ctx,
      profile,
      balance,
      config,
      speed,
      now,
    );
    return { ...result, extensionReady: extensionGranted(profile) };
  }

  let creditedNex = 0;
  if (
    profile.awayMiningExpiresAt !== undefined &&
    (profile.miningSessionStartedAt !== undefined ||
      profile.awayMiningStartedAt !== undefined)
  ) {
    const away = await settleAwayMining(
      ctx,
      profile,
      balance,
      config,
      speed,
      now,
    );
    creditedNex = away.creditedNex;
    profile = (await ctx.db.get(profile._id))!;
    balance = (await ctx.db.get(balance._id))!;
  }
  if (
    !profile.miningPausedAt &&
    profile.miningExtensionStartedAt &&
    profile.miningExtensionEndsAt
  ) {
    const extension = await settleExtensionGap(
      ctx,
      profile,
      balance,
      config,
      speed,
      now,
    );
    creditedNex = roundNex(creditedNex + extension.creditedNex);
    profile = (await ctx.db.get(profile._id))!;
    balance = (await ctx.db.get(balance._id))!;
  }

  const dayRow = await getMiningDay(ctx, profile.userId, dayKey(now));
  const normalRemaining = Math.max(
    0,
    config.dailyLimitNex - normalMinedFromRow(dayRow),
  );
  if (normalRemaining <= 0 && !extensionWindow(profile, now)) {
    await ctx.db.patch(profile._id, {
      miningSessionStartedAt: undefined,
      miningSessionHeartbeatAt: undefined,
      awayMiningStartedAt: undefined,
    });
    return {
      creditedNex,
      status: "limit" as const,
      extensionReady: extensionGranted(profile),
    };
  }

  await ctx.db.patch(profile._id, {
    miningSessionStartedAt: now,
    miningSessionHeartbeatAt: now,
    miningSessionCreditedAt: now,
    miningPausedAt: undefined,
    miningLastStartedDay: dayKey(now),
    awayMiningStartedAt: undefined,
    firstMiningStartedAt: profile.firstMiningStartedAt ?? now,
    lastActiveAt: now,
  });
  return { creditedNex, status: "active" as const, extensionReady: false };
}

/** Keeps the session alive and credits only the elapsed presence window. */
export async function heartbeatMiningSession(
  ctx: MutationCtx,
  profile: Doc<"profiles">,
  balance: Doc<"balances">,
  config: AppConfigShape,
  speed: SpeedModel,
) {
  const now = Date.now();
  // A heartbeat is presence, never authorization. It may keep an existing
  // session alive, but it must never create one after a daily reset, a manual
  // Stop, or an ordinary close without background mining.
  if (profile.miningPausedAt) {
    await ctx.db.patch(profile._id, { lastActiveAt: now });
    return { creditedNex: 0, status: "paused" as const };
  }
  if (miningSessionActive(profile, now)) {
    await ctx.db.patch(profile._id, {
      lastActiveAt: now,
      firstMiningStartedAt: profile.firstMiningStartedAt ?? now,
    });
    if (!config.miningEnabled || profile.restricted || speed.total <= 0) {
      return {
        creditedNex: 0,
        status: profile.restricted
          ? ("restricted" as const)
          : ("paused" as const),
      };
    }
    return await creditMiningSession(ctx, profile, balance, config, speed, now);
  }

  const hadBackgroundSession = Boolean(
    profile.awayMiningExpiresAt !== undefined &&
      (profile.awayMiningStartedAt !== undefined ||
        profile.miningSessionStartedAt !== undefined),
  );
  const canResumeBackground = Boolean(
    hadBackgroundSession && awayMiningActive(profile, now),
  );
  const extensionLive = Boolean(extensionWindow(profile, now));
  if (!hadBackgroundSession && !extensionLive) {
    await ctx.db.patch(profile._id, { lastActiveAt: now });
    return { creditedNex: 0, status: "paused" as const };
  }

  const settled = await settleMining(
    ctx,
    profile,
    balance,
    config,
    speed,
  );
  const fresh = (await ctx.db.get(profile._id))!;
  if (profile.miningPausedAt) {
    return settled;
  }
  const canResumeExtension = Boolean(extensionWindow(fresh, now));
  if (!canResumeBackground && !canResumeExtension) {
    await ctx.db.patch(profile._id, {
      lastActiveAt: now,
      miningSessionStartedAt: undefined,
      miningSessionHeartbeatAt: undefined,
      awayMiningStartedAt: undefined,
    });
    return settled;
  }

  await ctx.db.patch(profile._id, {
    miningSessionStartedAt: now,
    miningSessionHeartbeatAt: now,
    miningSessionCreditedAt: now,
    miningLastStartedDay: dayKey(now),
    awayMiningStartedAt: undefined,
    lastActiveAt: now,
    firstMiningStartedAt: fresh.firstMiningStartedAt ?? now,
  });
  return {
    creditedNex: settled.creditedNex,
    status: "active" as const,
  };
}

/** Stops presence credit; away permission keeps the last credit timestamp. */
export async function stopMiningSession(
  ctx: MutationCtx,
  profile: Doc<"profiles">,
  balance: Doc<"balances">,
  config: AppConfigShape,
  speed: SpeedModel,
) {
  const now = Date.now();
  const wasActive = miningSessionActive(profile, now);
  const result = wasActive
    ? await creditMiningSession(ctx, profile, balance, config, speed, now)
    : { creditedNex: 0, status: "paused" as const };
  // Background continuation is only valid for a session that was actually
  // running, and never after a manual pause.
  const continueInBackground = Boolean(
    wasActive && !profile.miningPausedAt && awayMiningActive(profile, now),
  );
  await ctx.db.patch(profile._id, {
    miningSessionStartedAt: undefined,
    miningSessionHeartbeatAt: undefined,
    miningSessionCreditedAt: wasActive ? now : profile.miningSessionCreditedAt,
    awayMiningStartedAt: continueInBackground ? now : undefined,
  });
  return result;
}

/** Explicit Stop: blocks background and heartbeat auto-resume until Start. */
export async function pauseMiningSession(
  ctx: MutationCtx,
  profile: Doc<"profiles">,
  balance: Doc<"balances">,
  config: AppConfigShape,
  speed: SpeedModel,
) {
  const now = Date.now();
  const result = miningSessionActive(profile, now)
    ? await creditMiningSession(ctx, profile, balance, config, speed, now)
    : { creditedNex: 0, status: "paused" as const };
  await ctx.db.patch(profile._id, {
    miningSessionStartedAt: undefined,
    miningSessionHeartbeatAt: undefined,
    miningSessionCreditedAt: now,
    miningPausedAt: now,
    awayMiningStartedAt: undefined,
  });
  return result;
}

/**
 * Starts a granted five-hour extension. The grant alone never starts mining;
 * this explicit action starts both the extension clock and the presence window.
 */
export async function startExtraMiningSession(
  ctx: MutationCtx,
  profile: Doc<"profiles">,
  balance: Doc<"balances">,
  config: AppConfigShape,
  speed: SpeedModel,
) {
  const now = Date.now();
  if (!config.miningEnabled) {
    return { started: false as const, reason: "disabled" as const };
  }
  if (profile.restricted) {
    return { started: false as const, reason: "restricted" as const };
  }
  const live = extensionWindow(profile, now);
  if (live) {
    return {
      started: true as const,
      alreadyActive: true as const,
      endsAt: live.endsAt,
      creditedNex: 0,
    };
  }
  if (!extensionGranted(profile)) {
    return { started: false as const, reason: "not_unlocked" as const };
  }

  let creditedNex = 0;
  if (miningSessionActive(profile, now)) {
    const settled = await creditMiningSession(
      ctx,
      profile,
      balance,
      config,
      speed,
      now,
    );
    creditedNex = settled.creditedNex;
    profile = (await ctx.db.get(profile._id))!;
  }

  const endsAt = now + config.extensionHours * 3_600_000;
  let sessionId = profile.activeExtensionSessionId;
  const existing = sessionId ? await ctx.db.get(sessionId) : null;
  if (!existing || existing.status === "expired") {
    sessionId = await ctx.db.insert("miningExtensionSessions", {
      userId: profile.userId,
      day: dayKey(now),
      adsCompleted: EXTENSION_ADS_REQUIRED,
      normalMinedAtUnlockNex: config.dailyLimitNex,
      extensionHours: config.extensionHours,
      grantedAt: profile.extensionUnlockedAt ?? now,
      startedAt: now,
      endsAt,
      minedNex: 0,
      status: "active",
      createdAt: profile.extensionUnlockedAt ?? now,
    });
  } else {
    await ctx.db.patch(existing._id, {
      status: "active",
      startedAt: now,
      endsAt,
    });
  }

  await ctx.db.patch(profile._id, {
    activeExtensionSessionId: sessionId,
    miningExtensionStartedAt: now,
    miningExtensionEndsAt: endsAt,
    miningSessionStartedAt: now,
    miningSessionHeartbeatAt: now,
    miningSessionCreditedAt: now,
    miningPausedAt: undefined,
    miningLastStartedDay: dayKey(now),
    awayMiningStartedAt: undefined,
    firstMiningStartedAt: profile.firstMiningStartedAt ?? now,
    lastActiveAt: now,
  });
  return {
    started: true as const,
    alreadyActive: false as const,
    endsAt,
    creditedNex,
  };
}
// ---------------------------------------------------------------------------
// Notifications + audit
// ---------------------------------------------------------------------------

export async function notifyUser(
  ctx: MutationCtx,
  profile: Doc<"profiles">,
  kind: "task" | "mining" | "referral" | "level" | "wallet" | "announcement",
  title: string,
  body: string,
) {
  await ctx.db.insert("notifications", {
    userId: profile.userId,
    kind,
    title,
    body,
    createdAt: Date.now(),
  });

  const wantsTelegram =
    (kind === "task" && profile.notifyTasks) ||
    (kind === "mining" && profile.notifyMining) ||
    (kind === "wallet" && profile.notifyWallet) ||
    (kind === "referral" && profile.notifyTasks) ||
    (kind === "level" && profile.notifyTasks) ||
    (kind === "announcement" && profile.notifyAnnouncements);

  if (wantsTelegram && profile.telegramId) {
    await ctx.scheduler.runAfter(0, internal.telegram.push, {
      chatId: profile.telegramId,
      text: `NEXPOOL · ${title}\n${body}`,
    });
  }
}

/**
 * Resolves the verified Telegram id for a signed-in auth user. The profile is
 * the primary source; the auth account table is the fallback so admin access
 * works even before the profile sync has run.
 */
export async function resolveTelegramId(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  profile: Doc<"profiles"> | null,
): Promise<string | null> {
  if (profile?.telegramId) return profile.telegramId;
  const account = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) =>
      q.eq("userId", userId).eq("provider", "telegram"),
    )
    .first();
  return account?.providerAccountId ?? null;
}

export type AdminAccess = {
  signedIn: boolean;
  isAdmin: boolean;
  telegramId: string | null;
  allowlistConfigured: boolean;
  source: "env_telegram" | "role" | "owner" | null;
  reason: string | null;
  userId: Id<"users"> | null;
  label: string;
};

/**
 * Server-side administrator resolution. The Telegram allowlist is re-read from
 * the environment on every call and compared as a string against the verified
 * Telegram identity, so admin access survives refresh, a new session and a new
 * device without creating a new admin account or trusting the browser.
 */
export async function resolveAdminAccess(
  ctx: QueryCtx | MutationCtx,
): Promise<AdminAccess> {
  const userId = await getAuthUserId(ctx);
  const allowlist = telegramAdminIds();
  if (!userId) {
    return {
      signedIn: false,
      isAdmin: false,
      telegramId: null,
      allowlistConfigured: allowlist.length > 0,
      source: null,
      reason: "Operator sign-in required.",
      userId: null,
      label: "signed-out",
    };
  }

  const [user, profile, config] = await Promise.all([
    ctx.db.get(userId),
    ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first(),
    loadConfig(ctx),
  ]);
  const telegramId = await resolveTelegramId(ctx, userId, profile);
  const isOwner = config.ownerUserId === userId;
  const isEnvAdmin = isTelegramAdmin(telegramId);

  // A configured Telegram allowlist is authoritative: a stored role or owner
  // grant must never quietly add an administrator the operator did not list.
  // With no allowlist, the explicit server-side owner bootstrap still works.
  const isAdmin = isEnvAdmin || (allowlist.length === 0 && isOwner);
  const source: AdminAccess["source"] = isEnvAdmin
    ? "env_telegram"
    : isAdmin && isOwner
      ? "owner"
      : null;

  let reason: string | null = null;
  if (!isAdmin) {
    reason =
      allowlist.length > 0
        ? `This verified Telegram account is not in TELEGRAM_ADMIN_IDS. Current id: ${telegramId ?? "not linked"}.`
        : "Administrator access is not configured. Set TELEGRAM_ADMIN_IDS on the backend to your Telegram id.";
  }

  return {
    signedIn: true,
    isAdmin,
    telegramId,
    allowlistConfigured: allowlist.length > 0,
    source: isAdmin ? source : null,
    reason,
    userId,
    label:
      telegramId ? `telegram:${telegramId}` : (user?.email ?? user?.name ?? String(userId)),
  };
}

export async function requireAdmin(ctx: MutationCtx | QueryCtx) {
  const access = await resolveAdminAccess(ctx);
  if (!access.isAdmin || !access.userId) {
    throw new Error(access.reason ?? "Operator authorization required.");
  }
  return {
    userId: access.userId,
    label: access.label,
    telegramId: access.telegramId,
    source: access.source,
  };
}

export async function audit(
  ctx: MutationCtx,
  actor: { userId?: Id<"users"> | string; label: string },
  action: string,
  detail: string,
) {
  await ctx.db.insert("auditLogs", {
    actorId: actor.userId ? String(actor.userId) : undefined,
    actorLabel: actor.label,
    action,
    detail,
    createdAt: Date.now(),
  });
}
