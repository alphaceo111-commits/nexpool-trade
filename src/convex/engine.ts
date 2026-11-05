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
  withdrawalsEnabled: boolean;
  ownerUserId?: Id<"users">;
};

/**
 * Backend defaults. The first signed-in account persists these into
 * `appConfig`; after that the owner edits them in the admin console.
 */
export const CONFIG_DEFAULTS: AppConfigShape = {
  // Launch rate: 0.000000500 NEX/hour, i.e. 500,000 nano-NEX per hour.
  baseRateNexPerHour: 0.0000005,
  // Matches the nano-NEX scale of the launch rate: 0.00005 NEX per UTC day.
  dailyLimitNex: 0.00005,
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

  return {
    base: config.baseRateNexPerHour,
    taskBonus: roundNex(taskBonus),
    referralBonus: roundNex(referralBonus),
    levelBonus: roundNex(levelBonus),
    claimedLevel,
    referralQualifiedCount: qualified.length,
    total: roundNex(
      config.baseRateNexPerHour + taskBonus + referralBonus + levelBonus,
    ),
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
    const alreadyMined = dayRow?.minedNex ?? 0;
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

export type MiningSnapshot = {
  status: "active" | "paused" | "limit" | "restricted";
  rateNexPerHour: number;
  todayMinedNex: number;
  todayLimitNex: number;
  remainingTodayNex: number;
  projectedAccrualNex: number;
  resetAt: number;
  lastSettledAt: number;
  uncollectedMs: number;
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
  const dayRow = await ctx.db
    .query("miningDays")
    .withIndex("by_user_day", (q) =>
      q.eq("userId", profile.userId).eq("day", today),
    )
    .first();
  const alreadyMined = dayRow?.minedNex ?? 0;

  const accrualFrom = Math.max(
    balance.lastSettledAt,
    config.miningEnabledAt || 0,
  );
  const paused = !config.miningEnabled || profile.restricted;
  const projection = paused
    ? { total: 0, slices: [] as AccrualSlice[] }
    : await projectAccrual(ctx, {
        userId: profile.userId,
        rateNexPerHour: speed.total,
        dailyLimitNex: config.dailyLimitNex,
        from: accrualFrom,
        to: now,
      });

  const todaySlice = projection.slices.find((slice) => slice.day === today);
  const todayProjected = alreadyMined + (todaySlice?.amountNex ?? 0);
  const todayMined = roundNex(Math.min(config.dailyLimitNex, todayProjected));
  const remaining = roundNex(
    Math.max(0, config.dailyLimitNex - todayMined),
  );

  let status: MiningSnapshot["status"] = "active";
  if (profile.restricted) status = "restricted";
  else if (!config.miningEnabled) status = "paused";
  else if (remaining <= 0) status = "limit";

  return {
    status,
    rateNexPerHour: speed.total,
    todayMinedNex: todayMined,
    todayLimitNex: config.dailyLimitNex,
    remainingTodayNex: remaining,
    projectedAccrualNex: projection.total,
    resetAt: nextUtcMidnight(now),
    lastSettledAt: balance.lastSettledAt,
    uncollectedMs: Math.max(0, now - accrualFrom),
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
  const accrualFrom = Math.max(
    balance.lastSettledAt,
    config.miningEnabledAt || 0,
  );

  if (!config.miningEnabled || profile.restricted || speed.total <= 0) {
    await ctx.db.patch(balance._id, { lastSettledAt: now, updatedAt: now });
    return { creditedNex: 0, status: profile.restricted ? "restricted" : "paused" };
  }

  const projection = await projectAccrual(ctx, {
    userId: profile.userId,
    rateNexPerHour: speed.total,
    dailyLimitNex: config.dailyLimitNex,
    from: accrualFrom,
    to: now,
  });

  if (projection.total <= 0) {
    // At launch rates a few seconds of accrual is less than one nano-NEX.
    // Leave lastSettledAt untouched so the residual carries into the next
    // settlement instead of being rounded away on every refresh.
    const today = dayKey(now);
    const dayRow = await ctx.db
      .query("miningDays")
      .withIndex("by_user_day", (q) =>
        q.eq("userId", profile.userId).eq("day", today),
      )
      .first();
    const reachedLimit = (dayRow?.minedNex ?? 0) >= config.dailyLimitNex;
    return { creditedNex: 0, status: reachedLimit ? "limit" : "active" };
  }

  for (const slice of projection.slices) {
    if (slice.amountNex <= 0) continue;
    const existing = await ctx.db
      .query("miningDays")
      .withIndex("by_user_day", (q) =>
        q.eq("userId", profile.userId).eq("day", slice.day),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        minedNex: roundNex(existing.minedNex + slice.amountNex),
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("miningDays", {
        userId: profile.userId,
        day: slice.day,
        minedNex: slice.amountNex,
        updatedAt: now,
      });
    }
    const entry = await ctx.db
      .query("miningEntries")
      .withIndex("by_user_day", (q) =>
        q.eq("userId", profile.userId).eq("day", slice.day),
      )
      .first();
    if (entry) {
      // One settled entry per UTC day keeps the history readable.
      await ctx.db.patch(entry._id, {
        amountNex: roundNex(entry.amountNex + slice.amountNex),
        rateNexPerHour: speed.total,
        toTs: now,
      });
    } else {
      await ctx.db.insert("miningEntries", {
        userId: profile.userId,
        day: slice.day,
        amountNex: slice.amountNex,
        rateNexPerHour: speed.total,
        fromTs: accrualFrom,
        toTs: now,
        createdAt: now,
      });
    }
  }

  const credit = projection.total;
  await ctx.db.insert("ledger", {
    userId: profile.userId,
    kind: "mining",
    amountNex: credit,
    memo: `Mining settlement · ${roundNex(speed.total)} NEX/h`,
    createdAt: now,
  });
  await ctx.db.patch(balance._id, {
    availableNex: roundNex(balance.availableNex + credit),
    lifetimeMinedNex: roundNex(balance.lifetimeMinedNex + credit),
    lastSettledAt: now,
    updatedAt: now,
  });

  const todayRow = await ctx.db
    .query("miningDays")
    .withIndex("by_user_day", (q) =>
      q.eq("userId", profile.userId).eq("day", dayKey(now)),
    )
    .first();
  const hitLimit = (todayRow?.minedNex ?? 0) >= config.dailyLimitNex;

  if (hitLimit && profile.notifyMining) {
    const existingLimitNote = await ctx.db
      .query("notifications")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", profile.userId))
      .order("desc")
      .take(30);
    const alreadyNotified = existingLimitNote.some(
      (note) =>
        note.kind === "mining" &&
        note.title === "Daily mining limit reached" &&
        dayKey(note.createdAt) === dayKey(now),
    );
    if (!alreadyNotified) {
      await notifyUser(
        ctx,
        profile,
        "mining",
        "Daily mining limit reached",
        `You mined your full ${config.dailyLimitNex} NEX for today. Accrual resumes at ${new Date(nextUtcMidnight(now)).toISOString().slice(11, 16)} UTC.`,
      );
    }
  }

  return { creditedNex: credit, status: hitLimit ? "limit" : "active" };
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
