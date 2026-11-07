import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

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
  miningEconomyVersion: number;
  withdrawalsEnabled: boolean;
  ownerUserId?: Id<"users">;
};

/** Verified-ad rules. The two entitlements are deliberately independent. */
export const AWAY_ADS_REQUIRED = 10;
export const EXTENSION_ADS_REQUIRED = 20;
export const AWAY_MINING_HOURS_DEFAULT = 24;
export const EXTENSION_HOURS_DEFAULT = 5;
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
        "Mining starts from the account creation timestamp. Complete 3 verified tasks per invited friend to unlock withdrawal eligibility.",
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
      lastSettledAt: now,
      updatedAt: now,
    });
    balance = (await ctx.db.get(balanceId))!;
  }

  const code = options.referralCode?.trim().toUpperCase();
  if (code && !profile.referredBy) {
    const referrer = await ctx.db
      .query("profiles")
      .withIndex("by_referralCode", (q) => q.eq("referralCode", code))
      .first();
    if (referrer && referrer._id !== profile._id) {
      const alreadyReferred =
        referrer.referredBy === profile._id ? true : false;
      if (!alreadyReferred) {
        await ctx.db.patch(profile._id, {
          referredBy: referrer._id,
          referredAt: now,
        });
        profile = (await ctx.db.get(profile._id))!;
        await ctx.db.insert("notifications", {
          userId: referrer.userId,
          kind: "referral",
          title: "New referral joined",
          body: `${profile.displayName} joined with your code. They need ${CONFIG_DEFAULTS.referralTaskTarget} verified tasks to qualify.`,
          createdAt: now,
        });
      }
    }
  }

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
  const startedAt =
    profile.miningExtensionStartedAt ?? profile.extensionUnlockedAt;
  const endsAt = profile.miningExtensionEndsAt;
  if (!startedAt || !endsAt || endsAt <= now || startedAt > now) return null;
  return { startedAt, endsAt };
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
    const extensionStart =
      profile.miningExtensionStartedAt ?? profile.extensionUnlockedAt;

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
      lastCreditedAt = sliceEnd;
    }
    cursor = sliceEnd;
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
    profile.awayMiningStartedAt === undefined
  ) {
    await ctx.db.patch(profile._id, { awayMiningStartedAt: undefined });
    return { creditedNex: 0, status: "paused" as const };
  }

  // Settle even if the permission window has already ended: the user is
  // entitled to the part of the absence that fell inside the window.
  const from = profile.awayMiningStartedAt;
  const to = Math.min(now, profile.awayMiningExpiresAt);
  if (to <= from) {
    await ctx.db.patch(profile._id, { awayMiningStartedAt: undefined });
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
  await ctx.db.patch(profile._id, { awayMiningStartedAt: undefined });
  return { creditedNex: result.creditedNex, status: result.status };
}

export type MiningSnapshot = {
  status: "active" | "paused" | "limit" | "restricted";
  rateNexPerHour: number;
  todayMinedNex: number;
  todayTotalNex: number;
  extensionMinedNex: number;
  todayLimitNex: number;
  remainingTodayNex: number;
  projectedAccrualNex: number;
  resetAt: number;
  lastSettledAt: number;
  uncollectedMs: number;
  sessionActive: boolean;
  awayMiningActive: boolean;
  awayMiningExpiresAt: number | null;
  awayMiningHours: number;
  extensionActive: boolean;
  extensionStartedAt: number | null;
  extensionEndsAt: number | null;
  extensionRemainingMs: number;
  ads: {
    providerReady: boolean;
    away: {
      required: number;
      completed: number;
      active: boolean;
      unlockedAt: number | null;
      expiresAt: number | null;
    };
    extension: {
      required: number;
      completed: number;
      active: boolean;
      eligible: boolean;
      endsAt: number | null;
      unlockedToday: boolean;
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
  const awayActive = awayMiningActive(profile, now);
  const extension = extensionWindow(profile, now);
  const extensionLive = Boolean(extension);
  const pendingMs = sessionActive
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
  const pendingNex = sessionActive
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
  else if (!sessionActive && !awayActive) status = "paused";

  const awayProgress = profile.awayMiningAdProgress ?? 0;
  const extensionProgress = profile.extensionAdProgress ?? 0;
  const unlockedToday = profile.extensionUnlockDay === today;

  return {
    status,
    rateNexPerHour: speed.total,
    todayMinedNex: todayMined,
    todayTotalNex: roundNex(todayMined + extensionMined),
    extensionMinedNex: extensionMined,
    todayLimitNex: config.dailyLimitNex,
    remainingTodayNex: remaining,
    projectedAccrualNex: pendingNex,
    resetAt: nextUtcMidnight(now),
    lastSettledAt: balance.lastSettledAt,
    uncollectedMs: pendingMs,
    sessionActive,
    awayMiningActive: awayActive,
    awayMiningExpiresAt: profile.awayMiningExpiresAt ?? null,
    awayMiningHours: config.awayMiningHours,
    extensionActive: extensionLive,
    extensionStartedAt: extension?.startedAt ?? null,
    extensionEndsAt: extension?.endsAt ?? null,
    extensionRemainingMs: extension ? extension.endsAt - now : 0,
    ads: {
      providerReady: Boolean(process.env.ADSGRAM_REWARD_SECRET),
      away: {
        required: AWAY_ADS_REQUIRED,
        completed: awayProgress,
        active: awayActive,
        unlockedAt: profile.awayMiningUnlockedAt ?? null,
        expiresAt: profile.awayMiningExpiresAt ?? null,
      },
      extension: {
        required: EXTENSION_ADS_REQUIRED,
        completed: extensionProgress,
        active: extensionLive,
        eligible: remaining <= 0 && !extensionLive && !unlockedToday,
        endsAt: extension?.endsAt ?? null,
        unlockedToday,
      },
      pending:
        pendingChallenge && pendingChallenge.expiresAt > now
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
  if (miningSessionActive(profile, now)) {
    return await creditMiningSession(ctx, profile, balance, config, speed, now);
  }
  if (awayMiningActive(profile, now)) {
    return await settleAwayMining(ctx, profile, balance, config, speed, now);
  }
  return { creditedNex: 0, status: "paused" as const };
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
    return { creditedNex: 0, status: "paused" as const };
  }
  if (profile.restricted) {
    return { creditedNex: 0, status: "restricted" as const };
  }
  if (miningSessionActive(profile, now)) {
    return await creditMiningSession(ctx, profile, balance, config, speed, now);
  }

  let creditedNex = 0;
  if (
    profile.awayMiningStartedAt !== undefined &&
    profile.awayMiningExpiresAt !== undefined
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
    // settleAwayMining patched the in-memory profile only in the database.
    profile = { ...profile, awayMiningStartedAt: undefined };
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
    return { creditedNex, status: "limit" as const };
  }

  await ctx.db.patch(profile._id, {
    miningSessionStartedAt: now,
    miningSessionHeartbeatAt: now,
    miningSessionCreditedAt: now,
    awayMiningStartedAt: undefined,
  });
  return { creditedNex, status: "active" as const };
}

/** Keeps the session alive and credits only the elapsed presence window. */
export async function heartbeatMiningSession(
  ctx: MutationCtx,
  profile: Doc<"profiles">,
  balance: Doc<"balances">,
  config: AppConfigShape,
  speed: SpeedModel,
) {
  if (!miningSessionActive(profile, Date.now())) {
    return await startMiningSession(ctx, profile, balance, config, speed);
  }
  const now = Date.now();
  if (!config.miningEnabled || profile.restricted || speed.total <= 0) {
    return {
      creditedNex: 0,
      status: profile.restricted ? ("restricted" as const) : ("paused" as const),
    };
  }
  return await creditMiningSession(ctx, profile, balance, config, speed, now);
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
  const result = miningSessionActive(profile, now)
    ? await creditMiningSession(ctx, profile, balance, config, speed, now)
    : { creditedNex: 0, status: "paused" as const };
  const awayActive = awayMiningActive(profile, now);
  await ctx.db.patch(profile._id, {
    miningSessionStartedAt: undefined,
    miningSessionHeartbeatAt: undefined,
    miningSessionCreditedAt: awayActive ? now : undefined,
    awayMiningStartedAt: awayActive ? now : undefined,
  });
  return result;
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

export async function requireAdmin(ctx: MutationCtx | QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Operator sign-in required.");
  const config = await loadConfig(ctx);
  const user = await ctx.db.get(userId);
  const isOwner = config.ownerUserId === userId;
  const isRoleAdmin = user?.role === "admin";
  if (!isOwner && !isRoleAdmin) {
    throw new Error("Operator authorization required.");
  }
  return { userId, label: user?.email ?? user?.name ?? String(userId) };
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
