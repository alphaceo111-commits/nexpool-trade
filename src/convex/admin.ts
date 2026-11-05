import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  audit,
  CONFIG_DEFAULTS,
  CONFIG_KEY,
  loadConfig,
  notifyUser,
  requireAdmin,
  roundNex,
} from "./engine";

const taskCategory = v.union(
  v.literal("advertisement"),
  v.literal("join_channel"),
  v.literal("join_group"),
  v.literal("sponsor_bot"),
  v.literal("social"),
);

const verificationKind = v.union(
  v.literal("telegram_channel"),
  v.literal("telegram_group"),
  v.literal("telegram_bot"),
  v.literal("provider_ad"),
  v.literal("in_app_ad"),
  v.literal("social"),
  v.literal("manual"),
);

export const access = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { signedIn: false, isAdmin: false, canClaim: false };
    const config = await loadConfig(ctx);
    const user = await ctx.db.get(userId);
    const admins = (await ctx.db.query("users").collect()).filter(
      (row) => row.role === "admin",
    );
    const isAdmin = config.ownerUserId === userId || user?.role === "admin";
    return {
      signedIn: true,
      isAdmin: Boolean(isAdmin),
      canClaim: !isAdmin && !config.ownerUserId && admins.length === 0,
      email: user?.email ?? null,
      ownerConfigured: Boolean(config.ownerUserId),
    };
  },
});

/** One-time bootstrap: the first account becomes the operator. Audited. */
export const claimOwner = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in first.");
    const config = await loadConfig(ctx);
    if (config.ownerUserId) {
      throw new Error("An operator is already configured.");
    }
    const admins = (await ctx.db.query("users").collect()).filter(
      (row) => row.role === "admin",
    );
    if (admins.length > 0) {
      throw new Error("An operator is already configured.");
    }

    const now = Date.now();
    const row = await ctx.db
      .query("appConfig")
      .withIndex("by_key", (q) => q.eq("key", CONFIG_KEY))
      .first();
    if (row) {
      await ctx.db.patch(row._id, { ownerUserId: userId, updatedAt: now });
    } else {
      await ctx.db.insert("appConfig", {
        key: CONFIG_KEY,
        ...CONFIG_DEFAULTS,
        miningEnabledAt: now,
        ownerUserId: userId,
        updatedAt: now,
      });
    }
    await ctx.db.patch(userId, { role: "admin" });
    const user = await ctx.db.get(userId);
    await audit(
      ctx,
      { userId, label: user?.email ?? String(userId) },
      "operator.claim",
      "First operator claimed the NEXPOOL admin console.",
    );
    return { isAdmin: true };
  },
});

/**
 * Authorization probe for actions that cannot run requireAdmin directly
 * (they live outside this module). Throws unless the caller is the operator.
 */
export const assertOperator = internalMutation({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireAdmin(ctx);
    return { userId };
  },
});

export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const config = await loadConfig(ctx);
    const profiles = await ctx.db.query("profiles").collect();
    const balances = await ctx.db.query("balances").collect();
    const tasks = await ctx.db.query("tasks").collect();
    const completions = await ctx.db.query("taskCompletions").collect();
    const withdrawals = await ctx.db.query("withdrawals").collect();
    const audits = await ctx.db
      .query("auditLogs")
      .withIndex("by_createdAt")
      .order("desc")
      .take(8);

    const available = balances.reduce((sum, row) => sum + row.availableNex, 0);
    const reserved = balances.reduce((sum, row) => sum + row.reservedNex, 0);
    const pendingWithdrawals = withdrawals.filter(
      (row) => row.status === "requested" || row.status === "reviewing",
    );

    return {
      config: {
        ...config,
        ownerUserId: config.ownerUserId ? String(config.ownerUserId) : null,
      },
      levels: (await ctx.db.query("levels").collect())
        .sort((a, b) => a.level - b.level)
        .map((row) => ({
          level: row.level,
          name: row.name,
          xpRequired: row.xpRequired,
          rewardNex: row.rewardNex,
          speedBonusNexPerHour: row.speedBonusNexPerHour,
        })),
      service: {
        miningEnabled: config.miningEnabled,
        withdrawalsEnabled: config.withdrawalsEnabled,
        telegramBotConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
        webhookSecretConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
        adProviderConfigured: Boolean(
          process.env.AD_PROVIDER_VERIFY_URL && process.env.AD_PROVIDER_API_KEY,
        ),
      },
      counts: {
        users: profiles.length,
        restricted: profiles.filter((row) => row.restricted).length,
        complianceCleared: profiles.filter((row) => row.complianceCleared)
          .length,
        telegramLinked: profiles.filter((row) => row.telegramId).length,
        walletsLinked: profiles.filter((row) => row.walletAddress).length,
        activeTasks: tasks.filter((row) => row.status === "active").length,
        pendingReviews: completions.filter(
          (row) => row.status === "pending" || row.status === "unavailable",
        ).length,
        pendingWithdrawals: pendingWithdrawals.length,
        completedTasks: completions.filter((row) => row.status === "verified")
          .length,
      },
      treasury: {
        availableUsd: config.treasuryAvailableUsd,
        liabilityNex: roundNex(available + reserved),
        liabilityUsd: roundNex(
          (available + reserved) * config.nexUsdRate,
        ),
        reservedNex: roundNex(
          pendingWithdrawals.reduce((sum, row) => sum + row.nexAmount, 0),
        ),
        pendingPayoutUsd: roundNex(
          pendingWithdrawals.reduce((sum, row) => sum + row.usdValue, 0),
        ),
        coverage:
          config.treasuryAvailableUsd > 0
            ? Math.round(
                (config.treasuryAvailableUsd /
                  Math.max(0.01, (available + reserved) * config.nexUsdRate)) *
                  100,
              )
            : 0,
      },
      recentAudit: audits.map((row) => ({
        id: row._id,
        actor: row.actorLabel,
        action: row.action,
        detail: row.detail,
        createdAt: row.createdAt,
      })),
    };
  },
});

export const users = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const config = await loadConfig(ctx);
    const profiles = await ctx.db.query("profiles").collect();
    const out = [];
    for (const profile of profiles) {
      const balance = await ctx.db
        .query("balances")
        .withIndex("by_user", (q) => q.eq("userId", profile.userId))
        .first();
      const completions = await ctx.db
        .query("taskCompletions")
        .withIndex("by_user", (q) => q.eq("userId", profile.userId))
        .collect();
      const referrals = await ctx.db
        .query("profiles")
        .withIndex("by_referredBy", (q) => q.eq("referredBy", profile._id))
        .collect();
      const withdrawals = await ctx.db
        .query("withdrawals")
        .withIndex("by_user_requestedAt", (q) =>
          q.eq("userId", profile.userId),
        )
        .collect();
      const user = await ctx.db.get(profile.userId);
      const verified = completions.filter(
        (row) => row.status === "verified",
      ).length;
      const qualifiedReferrals = (
        await Promise.all(
          referrals.map(async (referral) => {
            const rows = await ctx.db
              .query("taskCompletions")
              .withIndex("by_user", (q) => q.eq("userId", referral.userId))
              .collect();
            return (
              new Set(
                rows
                  .filter((row) => row.status === "verified")
                  .map((row) => row.taskId),
              ).size >= config.referralTaskTarget
            );
          }),
        )
      ).filter(Boolean).length;

      out.push({
        profileId: profile._id,
        nexId: profile.nexId,
        displayName: profile.displayName,
        email: user?.email ?? null,
        telegramLinked: Boolean(profile.telegramId),
        walletAddress: profile.walletAddress ?? null,
        createdAt: profile.createdAt,
        restricted: profile.restricted,
        restrictionReason: profile.restrictionReason ?? null,
        complianceCleared: profile.complianceCleared,
        availableNex: roundNex(balance?.availableNex ?? 0),
        reservedNex: roundNex(balance?.reservedNex ?? 0),
        lifetimeMinedNex: roundNex(balance?.lifetimeMinedNex ?? 0),
        verifiedTasks: verified,
        referrals: referrals.length,
        qualifiedReferrals,
        withdrawals: withdrawals.length,
      });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const updateUser = mutation({
  args: {
    profileId: v.id("profiles"),
    restricted: v.optional(v.boolean()),
    restrictionReason: v.optional(v.string()),
    complianceCleared: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const profile = await ctx.db.get(args.profileId);
    if (!profile) throw new Error("Account not found.");
    const patch: Record<string, unknown> = {};
    if (args.restricted !== undefined) {
      patch.restricted = args.restricted;
      patch.restrictionReason = args.restricted
        ? args.restrictionReason?.trim() || "Restricted by operator."
        : undefined;
    }
    if (args.complianceCleared !== undefined) {
      patch.complianceCleared = args.complianceCleared;
    }
    if (Object.keys(patch).length === 0) return { updated: false };
    await ctx.db.patch(profile._id, patch);

    await notifyUser(
      ctx,
      profile,
      "wallet",
      args.restricted === true
        ? "Account restricted"
        : args.complianceCleared
          ? "Compliance review cleared"
          : "Account status updated",
      args.restricted === true
        ? (args.restrictionReason?.trim() || "Contact support for details.")
        : args.complianceCleared
          ? "Your account passed the operator compliance review."
          : "An operator updated your account status.",
    );
    await audit(
      ctx,
      actor,
      "user.update",
      `${profile.nexId}: ${JSON.stringify(patch)}`,
    );
    return { updated: true };
  },
});

export const updateConfig = mutation({
  args: {
    baseRateNexPerHour: v.number(),
    dailyLimitNex: v.number(),
    nexUsdRate: v.number(),
    tonUsdRate: v.number(),
    minWithdrawNex: v.number(),
    qualifiedReferralTarget: v.number(),
    referralTaskTarget: v.number(),
    referralBonusNexPerHour: v.number(),
    referralBonusCap: v.number(),
    treasuryAvailableUsd: v.number(),
    miningEnabled: v.boolean(),
    withdrawalsEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const config = await loadConfig(ctx);

    if (args.baseRateNexPerHour < 0 || args.baseRateNexPerHour > 50) {
      throw new Error("Base rate must be between 0 and 50 NEX/h.");
    }
    if (args.dailyLimitNex < 0.01 || args.dailyLimitNex > 1000) {
      throw new Error("Daily cap must be between 0.01 and 1,000 NEX.");
    }
    if (args.nexUsdRate < 0.01 || args.nexUsdRate > 1000) {
      throw new Error("NEX reference rate must be between $0.01 and $1,000.");
    }
    if (args.tonUsdRate < 0.01 || args.tonUsdRate > 100_000) {
      throw new Error("TON reference rate must be positive.");
    }
    if (args.minWithdrawNex < 0.01) throw new Error("Minimum withdrawal is too low.");
    if (
      !Number.isInteger(args.qualifiedReferralTarget) ||
      args.qualifiedReferralTarget < 0 ||
      args.qualifiedReferralTarget > 1000
    ) {
      throw new Error("Qualified referral target must be a whole number.");
    }
    if (
      !Number.isInteger(args.referralTaskTarget) ||
      args.referralTaskTarget < 1 ||
      args.referralTaskTarget > 100
    ) {
      throw new Error("Referral task target must be between 1 and 100.");
    }
    if (args.referralBonusNexPerHour < 0 || args.referralBonusNexPerHour > 10) {
      throw new Error("Referral speed bonus must be between 0 and 10 NEX/h.");
    }
    if (args.referralBonusCap < 0 || args.referralBonusCap > 1000) {
      throw new Error("Referral bonus cap is out of range.");
    }
    if (args.treasuryAvailableUsd < 0) {
      throw new Error("Treasury balance cannot be negative.");
    }

    const now = Date.now();
    const miningEnabledAt =
      args.miningEnabled && !config.miningEnabled ? now : config.miningEnabledAt;
    const patch = {
      ...args,
      miningEnabledAt,
      updatedAt: now,
      updatedBy: actor.label,
    };
    const row = await ctx.db
      .query("appConfig")
      .withIndex("by_key", (q) => q.eq("key", CONFIG_KEY))
      .first();
    if (row) {
      await ctx.db.patch(row._id, patch);
    } else {
      await ctx.db.insert("appConfig", {
        key: CONFIG_KEY,
        ...CONFIG_DEFAULTS,
        ...patch,
      });
    }

    if (args.miningEnabled && !config.miningEnabled) {
      const profiles = await ctx.db.query("profiles").take(500);
      for (const profile of profiles) {
        if (profile.notifyMining) {
          await notifyUser(
            ctx,
            profile,
            "mining",
            "Mining resumed",
            "The operator re-enabled the mining engine. Accrual continues from this moment.",
          );
        }
      }
    }
    if (args.withdrawalsEnabled && !config.withdrawalsEnabled) {
      const profiles = await ctx.db.query("profiles").take(500);
      for (const profile of profiles) {
        if (profile.notifyWallet) {
          await notifyUser(
            ctx,
            profile,
            "wallet",
            "Withdrawals opened",
            "The payout desk is accepting requests again. Eligibility rules still apply.",
          );
        }
      }
    }

    await audit(
      ctx,
      actor,
      "config.update",
      `rate ${args.baseRateNexPerHour} NEX/h · cap ${args.dailyLimitNex} · $${args.nexUsdRate}/NEX · treasury $${args.treasuryAvailableUsd} · mining ${args.miningEnabled} · withdrawals ${args.withdrawalsEnabled}`,
    );
    return { updated: true };
  },
});

const levelInput = v.object({
  level: v.number(),
  name: v.string(),
  xpRequired: v.number(),
  rewardNex: v.number(),
  speedBonusNexPerHour: v.number(),
});

/** Edits the ten-level ladder. Thresholds must rise and rewards stay finite. */
export const updateLevels = mutation({
  args: { levels: v.array(levelInput) },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    if (args.levels.length !== 10) {
      throw new Error("The ladder must contain exactly 10 levels.");
    }
    const sorted = [...args.levels].sort((a, b) => a.level - b.level);
    for (let index = 0; index < sorted.length; index += 1) {
      const row = sorted[index];
      if (row.level !== index + 1) {
        throw new Error("Levels must be numbered 1–10.");
      }
      if (row.name.trim().length < 2 || row.name.trim().length > 24) {
        throw new Error(`Level ${row.level} name must be 2–24 characters.`);
      }
      if (row.xpRequired < 1 || row.xpRequired > 10_000_000) {
        throw new Error(`Level ${row.level} XP target must be between 1 and 10,000,000.`);
      }
      if (index > 0 && row.xpRequired <= sorted[index - 1].xpRequired) {
        throw new Error("XP targets must be higher than the previous level.");
      }
      if (row.rewardNex < 0 || row.rewardNex > 100) {
        throw new Error(`Level ${row.level} reward must be between 0 and 100 NEX.`);
      }
      if (row.speedBonusNexPerHour < 0 || row.speedBonusNexPerHour > 10) {
        throw new Error(
          `Level ${row.level} speed bonus must be between 0 and 10 NEX/h.`,
        );
      }
    }

    const existing = await ctx.db.query("levels").collect();
    const byLevel = new Map(existing.map((row) => [row.level, row]));
    const now = Date.now();
    for (const row of sorted) {
      const payload = {
        level: row.level,
        name: row.name.trim(),
        xpRequired: Math.round(row.xpRequired),
        rewardNex: roundNex(row.rewardNex),
        speedBonusNexPerHour: roundNex(row.speedBonusNexPerHour),
        updatedAt: now,
      };
      const current = byLevel.get(row.level);
      if (current) {
        await ctx.db.patch(current._id, payload);
      } else {
        await ctx.db.insert("levels", payload);
      }
    }

    await audit(
      ctx,
      actor,
      "levels.update",
      sorted
        .map(
          (row) =>
            `L${row.level} ${row.name.trim()} ${Math.round(row.xpRequired)}xp → ${roundNex(row.rewardNex)} NEX +${roundNex(row.speedBonusNexPerHour)} NEX/h`,
        )
        .join(" · "),
    );
    return { updated: sorted.length };
  },
});

export const taskAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const tasks = await ctx.db.query("tasks").order("desc").collect();
    const completions = await ctx.db.query("taskCompletions").collect();
    const pendingRows = completions.filter(
      (row) => row.status === "pending" || row.status === "unavailable",
    );

    const taskRows = tasks.map((task) => ({
      id: task._id,
      title: task.title,
      sponsor: task.sponsor,
      category: task.category,
      verification: task.verification,
      target: task.target ?? null,
      rewardNex: task.rewardNex,
      speedBonusNexPerHour: task.speedBonusNexPerHour,
      status: task.status,
      expiresAt: task.expiresAt ?? null,
      createdAt: task.createdAt,
      verifiedCount: completions.filter(
        (row) => row.taskId === task._id && row.status === "verified",
      ).length,
      pendingCount: completions.filter(
        (row) =>
          row.taskId === task._id &&
          (row.status === "pending" || row.status === "unavailable"),
      ).length,
    }));

    const reviewRows = [];
    for (const row of pendingRows.slice(0, 50)) {
      const task = await ctx.db.get(row.taskId);
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", row.userId))
        .first();
      reviewRows.push({
        id: row._id,
        taskId: row.taskId,
        taskTitle: task?.title ?? "Deleted task",
        category: task?.category ?? "social",
        nexId: profile?.nexId ?? "unknown",
        displayName: profile?.displayName ?? "Unknown account",
        status: row.status,
        note: row.note ?? null,
        submittedAt: row.submittedAt ?? row.startedAt,
        rewardNex: row.rewardNex,
      });
    }

    return {
      tasks: taskRows,
      reviews: reviewRows,
      pendingTotal: pendingRows.length,
      configured: {
        telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
        adProvider: Boolean(
          process.env.AD_PROVIDER_VERIFY_URL && process.env.AD_PROVIDER_API_KEY,
        ),
      },
    };
  },
});

export const createTask = mutation({
  args: {
    title: v.string(),
    sponsor: v.string(),
    category: taskCategory,
    description: v.string(),
    instructions: v.array(v.string()),
    rewardNex: v.number(),
    speedBonusNexPerHour: v.number(),
    verification: verificationKind,
    target: v.optional(v.string()),
    verificationNote: v.string(),
    minViewSeconds: v.optional(v.number()),
    xpReward: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const title = args.title.trim();
    const sponsor = args.sponsor.trim();
    if (title.length < 3 || title.length > 90) {
      throw new Error("Task title must be 3–90 characters.");
    }
    if (sponsor.length < 2 || sponsor.length > 60) {
      throw new Error("Sponsor name must be 2–60 characters.");
    }
    if (args.rewardNex < 0 || args.rewardNex > 1000) {
      throw new Error("Reward must be between 0 and 1,000 NEX.");
    }
    if (args.speedBonusNexPerHour < 0 || args.speedBonusNexPerHour > 10) {
      throw new Error("Speed bonus must be between 0 and 10 NEX/h.");
    }
    if (args.rewardNex <= 0 && args.speedBonusNexPerHour <= 0) {
      throw new Error("A task needs a NEX reward or a mining-speed bonus.");
    }
    const instructions = args.instructions
      .map((line) => line.trim())
      .filter(Boolean);
    if (instructions.length === 0) {
      throw new Error("Add at least one instruction.");
    }
    if (
      (args.verification === "telegram_channel" ||
        args.verification === "telegram_group" ||
        args.verification === "provider_ad") &&
      !args.target?.trim()
    ) {
      throw new Error("Telegram chat or ad placement target is required.");
    }
    if (args.expiresAt !== undefined && args.expiresAt <= Date.now()) {
      throw new Error("Expiry must be in the future.");
    }
    if (
      args.minViewSeconds !== undefined &&
      (args.minViewSeconds < 5 || args.minViewSeconds > 300)
    ) {
      throw new Error("In-app view time must be between 5 and 300 seconds.");
    }
    if (
      args.xpReward !== undefined &&
      (args.xpReward < 0 || args.xpReward > 10_000)
    ) {
      throw new Error("Task XP must be between 0 and 10,000.");
    }

    const id = await ctx.db.insert("tasks", {
      title,
      sponsor,
      category: args.category,
      description: args.description.trim(),
      instructions,
      rewardNex: roundNex(args.rewardNex),
      speedBonusNexPerHour: roundNex(args.speedBonusNexPerHour),
      xpReward: args.xpReward !== undefined ? Math.round(args.xpReward) : undefined,
      verification: args.verification,
      target: args.target?.trim() || undefined,
      minViewSeconds:
        args.verification === "in_app_ad" ? args.minViewSeconds ?? 15 : undefined,
      verificationNote:
        args.verificationNote.trim() ||
        "Completion is checked on the server before any reward is credited.",
      status: "active",
      expiresAt: args.expiresAt,
      createdAt: Date.now(),
      createdBy: actor.label,
    });
    await audit(
      ctx,
      actor,
      "task.create",
      `${title} · ${args.category} · ${args.rewardNex} NEX · +${args.speedBonusNexPerHour} NEX/h`,
    );
    return { taskId: id };
  },
});

export const setTaskStatus = mutation({
  args: {
    taskId: v.id("tasks"),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("archived"),
    ),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found.");
    await ctx.db.patch(task._id, { status: args.status });
    await audit(
      ctx,
      actor,
      "task.status",
      `${task.title} -> ${args.status}`,
    );
    return { status: args.status };
  },
});

export const reviewTask = mutation({
  args: {
    completionId: v.id("taskCompletions"),
    decision: v.union(v.literal("verify"), v.literal("reject")),
    note: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ status: "rejected" } | { status: "verified"; rewardNex: number }> => {
    const actor = await requireAdmin(ctx);
    const completion = await ctx.db.get(args.completionId);
    if (!completion) throw new Error("Completion not found.");
    if (completion.status === "verified") {
      throw new Error("This completion is already verified.");
    }
    if (args.decision === "reject") {
      await ctx.db.patch(completion._id, {
        status: "rejected",
        note: args.note.trim() || "Rejected by operator review.",
        verifiedBy: actor.label,
        submittedAt: Date.now(),
      });
      await audit(
        ctx,
        actor,
        "task.reject",
        `Completion ${args.completionId} rejected.`,
      );
      return { status: "rejected" as const };
    }

    const result: { granted: boolean; rewardNex?: number } = await ctx.runMutation(
      internal.tasks.grantTaskReward,
      {
        completionId: args.completionId,
        verifiedBy: `operator:${actor.label}`,
        note: args.note.trim() || "Verified by operator review.",
      },
    );
    await audit(
      ctx,
      actor,
      "task.verify",
      `Completion ${args.completionId} verified · ${result.rewardNex ?? 0} NEX`,
    );
    return { status: "verified" as const, rewardNex: result.rewardNex ?? 0 };
  },
});

export const withdrawalsAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("withdrawals")
      .order("desc")
      .take(150);
    const out = [];
    for (const row of rows) {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", row.userId))
        .first();
      out.push({
        id: row._id,
        nexId: profile?.nexId ?? "unknown",
        displayName: profile?.displayName ?? "Unknown account",
        nexAmount: row.nexAmount,
        usdValue: row.usdValue,
        tonAmount: row.tonAmount,
        destination: row.destination,
        network: row.network,
        status: row.status,
        txHash: row.txHash ?? null,
        chainVerifiedAt: row.chainVerifiedAt ?? null,
        chainVerificationNote: row.chainVerificationNote ?? null,
        note: row.note ?? null,
        requestedAt: row.requestedAt,
        decidedAt: row.decidedAt ?? null,
      });
    }
    return {
      rows: out,
      pending: out.filter(
        (row) => row.status === "requested" || row.status === "reviewing",
      ).length,
      paidUsd: out
        .filter((row) => row.status === "paid")
        .reduce((sum, row) => sum + row.usdValue, 0),
    };
  },
});

export const decideWithdrawal = mutation({
  args: {
    withdrawalId: v.id("withdrawals"),
    action: v.union(
      v.literal("review"),
      v.literal("pay"),
      v.literal("reject"),
      v.literal("fail"),
    ),
    txHash: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const withdrawal = await ctx.db.get(args.withdrawalId);
    if (!withdrawal) throw new Error("Withdrawal not found.");
    if (["paid", "rejected", "failed"].includes(withdrawal.status)) {
      throw new Error("This withdrawal is already settled.");
    }
    const balance = await ctx.db
      .query("balances")
      .withIndex("by_user", (q) => q.eq("userId", withdrawal.userId))
      .first();
    if (!balance) throw new Error("Balance not found.");
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", withdrawal.userId))
      .first();
    if (!profile) throw new Error("Profile not found.");
    const now = Date.now();

    if (args.action === "review") {
      await ctx.db.patch(withdrawal._id, { status: "reviewing" });
      await notifyUser(
        ctx,
        profile,
        "wallet",
        "Withdrawal under review",
        `${withdrawal.nexAmount} NEX is being reviewed by the payout desk. No on-chain transfer has been confirmed yet.`,
      );
      await audit(
        ctx,
        actor,
        "withdrawal.review",
        `${profile.nexId} · ${withdrawal.nexAmount} NEX moved to review.`,
      );
      return { status: "reviewing" as const };
    }

    if (args.action === "pay") {
      const txHash = args.txHash?.trim() ?? "";
      if (!/^[A-Za-z0-9+/=_-]{20,128}$/.test(txHash)) {
        throw new Error("Enter the confirmed on-chain transaction hash.");
      }
      if (balance.reservedNex + 1e-9 < withdrawal.nexAmount) {
        throw new Error(
          "Reserved balance does not cover this payout. Reconcile the ledger before paying.",
        );
      }
      await ctx.db.patch(withdrawal._id, {
        status: "paid",
        txHash,
        chainVerifiedAt: undefined,
        chainVerificationNote:
          "Hash recorded. Waiting for the independent TON chain lookup.",
        note: args.note?.trim() || undefined,
        decidedAt: now,
        decidedBy: actor.label,
      });
      await ctx.scheduler.runAfter(0, internal.wallet.verifyChain, {
        withdrawalId: withdrawal._id,
      });
      await ctx.db.patch(balance._id, {
        reservedNex: roundNex(
          Math.max(0, balance.reservedNex - withdrawal.nexAmount),
        ),
        updatedAt: now,
      });
      await notifyUser(
        ctx,
        profile,
        "wallet",
        "Withdrawal confirmed",
        `${withdrawal.tonAmount} TON was broadcast to ${withdrawal.destination.slice(0, 8)}…${withdrawal.destination.slice(-6)}. Tx ${txHash.slice(0, 12)}…`,
      );
      await audit(
        ctx,
        actor,
        "withdrawal.pay",
        `${profile.nexId} paid ${withdrawal.nexAmount} NEX · tx ${txHash}`,
      );
      return { status: "paid" as const };
    }

    await ctx.db.patch(withdrawal._id, {
      status: args.action === "fail" ? "failed" : "rejected",
      note:
        args.note?.trim() ||
        (args.action === "fail"
          ? "Transfer failed. NEX returned to available balance."
          : "Rejected by the payout desk. NEX returned to available balance."),
      decidedAt: now,
      decidedBy: actor.label,
    });
    await ctx.db.patch(balance._id, {
      availableNex: roundNex(balance.availableNex + withdrawal.nexAmount),
      reservedNex: roundNex(
        Math.max(0, balance.reservedNex - withdrawal.nexAmount),
      ),
      updatedAt: now,
    });
    await ctx.db.insert("ledger", {
      userId: withdrawal.userId,
      kind: "refund",
      amountNex: withdrawal.nexAmount,
      memo: `Withdrawal ${args.action === "fail" ? "failed" : "rejected"} · NEX returned`,
      refId: String(withdrawal._id),
      createdAt: now,
    });
    await notifyUser(
      ctx,
      profile,
      "wallet",
      args.action === "fail" ? "Withdrawal failed" : "Withdrawal rejected",
      `${withdrawal.nexAmount} NEX was returned to your available balance. ${
        args.note?.trim() || "Contact support if you need the reason in writing."
      }`,
    );
    await audit(
      ctx,
      actor,
      `withdrawal.${args.action}`,
      `${profile.nexId} · ${withdrawal.nexAmount} NEX refunded.`,
    );
    return { status: args.action === "fail" ? ("failed" as const) : ("rejected" as const) };
  },
});

export const broadcast = mutation({
  args: { title: v.string(), body: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const title = args.title.trim();
    const body = args.body.trim();
    if (title.length < 3) throw new Error("Give the announcement a title.");
    if (body.length < 5) throw new Error("Announcement body is too short.");

    const profiles = await ctx.db.query("profiles").take(500);
    for (const profile of profiles) {
      await notifyUser(ctx, profile, "announcement", title, body);
    }
    await audit(
      ctx,
      actor,
      "announcement.broadcast",
      `${title} · ${profiles.length} recipients`,
    );
    return { recipients: profiles.length };
  },
});

export const auditLog = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("auditLogs")
      .withIndex("by_createdAt")
      .order("desc")
      .take(150);
    return rows.map((row) => ({
      id: row._id,
      actor: row.actorLabel,
      action: row.action,
      detail: row.detail,
      createdAt: row.createdAt,
    }));
  },
});
