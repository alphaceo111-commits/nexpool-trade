import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  computeSpeed,
  ensureAccount,
  listReferralRows,
  loadConfig,
  notifyUser,
  readMiningSnapshot,
  requireProfile,
  roundNex,
  settleMining,
} from "./engine";
import { getViewer } from "./engine";
import { seedLevels } from "./levels";
import { seedBotStartMissions, seedStarterMissions } from "./missions";

/** Idempotent account bootstrap: profile, balance, config and referral capture. */
export const ensure = mutation({
  args: {
    referralCode: v.optional(v.string()),
    displayName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { profile } = await ensureAccount(ctx, args);
    await seedStarterMissions(ctx);
    await seedBotStartMissions(ctx);
    await seedLevels(ctx);
    return { profileId: profile._id, nexId: profile.nexId };
  },
});

/** Everything the mini app needs, read from the backend on every render. */
export const snapshot = query({
  args: {},
  handler: async (ctx) => {
    const { userId, profile, balance } = await getViewer(ctx);
    if (!userId || !profile || !balance) return null;

    const config = await loadConfig(ctx);
    const speed = await computeSpeed(ctx, profile, config);
    const mining = await readMiningSnapshot(ctx, profile, balance, config, speed);
    const referrals = await listReferralRows(ctx, profile._id, config);
    const qualified = referrals.filter((row) => row.qualified);

    const tasks = await ctx.db.query("tasks").collect();
    const completions = await ctx.db
      .query("taskCompletions")
      .withIndex("by_user", (q) => q.eq("userId", profile.userId))
      .collect();
    const completionByTask = new Map(
      completions.map((completion) => [completion.taskId, completion]),
    );
    const now = Date.now();
    const liveTasks = tasks.filter(
      (task) =>
        task.status === "active" && (!task.expiresAt || task.expiresAt > now),
    );
    const taskMap = new Map(tasks.map((task) => [task._id, task]));
    const pendingSpeedLines = completions
      .filter(
        (completion) =>
          (completion.status === "pending" ||
            completion.status === "unavailable") &&
          completion.speedBonusNexPerHour > 0,
      )
      .map((completion) => {
        const task = taskMap.get(completion.taskId);
        return {
          completionId: completion._id,
          title: task?.title ?? "Sponsor task",
          sponsor: task?.sponsor ?? "NEXPOOL",
          bonusNexPerHour: completion.speedBonusNexPerHour,
          status: completion.status,
          submittedAt: completion.submittedAt ?? completion.startedAt,
        };
      });
    const completedTaskCount = completions.filter(
      (completion) => completion.status === "verified",
    ).length;
    const availableTaskCount = liveTasks.filter(
      (task) => completionByTask.get(task._id)?.status !== "verified",
    ).length;
    const pendingTaskCount = completions.filter(
      (completion) =>
        completion.status === "pending" || completion.status === "unavailable",
    ).length;

    const withdrawals = await ctx.db
      .query("withdrawals")
      .withIndex("by_user_requestedAt", (q) => q.eq("userId", profile.userId))
      .order("desc")
      .take(20);
    const pendingWithdrawals = withdrawals.filter(
      (row) => row.status === "requested" || row.status === "reviewing",
    );
    const pendingWithdrawalNex = roundNex(
      pendingWithdrawals.reduce((sum, row) => sum + row.nexAmount, 0),
    );

    const ledgerRows = await ctx.db
      .query("ledger")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", profile.userId))
      .order("desc")
      .take(24);
    const miningRows = await ctx.db
      .query("miningEntries")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", profile.userId))
      .order("desc")
      .take(16);
    const notificationRows = await ctx.db
      .query("notifications")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", profile.userId))
      .order("desc")
      .take(24);

    const minUsd = roundNex(config.minWithdrawNex * config.nexUsdRate);
    const treasuryCoversMinimum = config.treasuryAvailableUsd >= minUsd;
    const walletConnected = Boolean(profile.walletAddress);

    const requirements = [
      {
        key: "balance",
        label: "Balance requirement",
        met: balance.availableNex + balance.reservedNex >= config.minWithdrawNex,
        value: `${roundNex(balance.availableNex)} / ${config.minWithdrawNex} NEX available`,
        detail: `Withdrawals start at ${config.minWithdrawNex} NEX. Mining and verified task rewards count toward the balance.`,
      },
      {
        key: "referrals",
        label: "Qualified referrals",
        met: qualified.length >= config.qualifiedReferralTarget,
        value: `${qualified.length} / ${config.qualifiedReferralTarget} qualified`,
        detail: `Each referral must complete ${config.referralTaskTarget} verified tasks. Incomplete invitations never count.`,
      },
      {
        key: "wallet",
        label: "Destination wallet",
        met: walletConnected,
        value: walletConnected ? "TON wallet linked" : "No wallet linked",
        detail:
          "Connect a TON wallet address. Seed phrases and private keys are never requested.",
      },
      {
        key: "liquidity",
        label: "Payout liquidity",
        met: treasuryCoversMinimum,
        value: treasuryCoversMinimum
          ? `$${config.treasuryAvailableUsd.toFixed(2)} available`
          : `$${config.treasuryAvailableUsd.toFixed(2)} / $${minUsd.toFixed(2)} required`,
        detail:
          "NEX is redeemable only while the published reward pool is funded. The operator reconciles advertising and pool revenue before payouts.",
      },
      {
        key: "compliance",
        label: "Account and compliance checks",
        met: !profile.restricted && profile.complianceCleared,
        value: profile.restricted
          ? "Account restricted"
          : profile.complianceCleared
            ? "Cleared"
            : "Review pending",
        detail:
          profile.restricted && profile.restrictionReason
            ? profile.restrictionReason
            : "The operator completes the final compliance review before any payout is broadcast.",
      },
      {
        key: "service",
        label: "Withdrawal service",
        met: config.withdrawalsEnabled,
        value: config.withdrawalsEnabled ? "Open" : "Paused by operator",
        detail:
          "The operator can pause payouts while treasury or provider reconciliation is in progress.",
      },
    ];

    const eligible =
      requirements.every((requirement) => requirement.met) &&
      balance.availableNex >= config.minWithdrawNex;

    const user = await ctx.db.get(userId);
    const isAdmin =
      config.ownerUserId === userId || user?.role === "admin";

    return {
      serverNow: now,
      account: {
        nexId: profile.nexId,
        displayName: profile.displayName,
        username: profile.username,
        photoUrl: profile.photoUrl,
        createdAt: profile.createdAt,
        language: profile.language,
        referralCode: profile.referralCode,
        telegramLinked: Boolean(profile.telegramId),
        telegramId: profile.telegramId,
        walletAddress: profile.walletAddress,
        walletNetwork: profile.walletNetwork,
        walletApp: profile.walletApp,
        walletConnectedAt: profile.walletConnectedAt,
        restricted: profile.restricted,
        restrictionReason: profile.restrictionReason,
        complianceCleared: profile.complianceCleared,
        preferences: {
          notifyTasks: profile.notifyTasks,
          notifyMining: profile.notifyMining,
          notifyWallet: profile.notifyWallet,
          notifyAnnouncements: profile.notifyAnnouncements,
        },
        isAdmin,
      },
      balance: {
        availableNex: roundNex(balance.availableNex),
        reservedNex: roundNex(balance.reservedNex),
        totalNex: roundNex(balance.availableNex + balance.reservedNex),
        lifetimeMinedNex: roundNex(balance.lifetimeMinedNex),
        lifetimeTaskNex: roundNex(balance.lifetimeTaskNex),
        lastSettledAt: balance.lastSettledAt,
      },
      config: {
        baseRateNexPerHour: config.baseRateNexPerHour,
        dailyLimitNex: config.dailyLimitNex,
        nexUsdRate: config.nexUsdRate,
        tonUsdRate: config.tonUsdRate,
        minWithdrawNex: config.minWithdrawNex,
        qualifiedReferralTarget: config.qualifiedReferralTarget,
        referralTaskTarget: config.referralTaskTarget,
        referralBonusNexPerHour: config.referralBonusNexPerHour,
        referralBonusCap: config.referralBonusCap,
        treasuryAvailableUsd: config.treasuryAvailableUsd,
        miningEnabled: config.miningEnabled,
        withdrawalsEnabled: config.withdrawalsEnabled,
      },
      mining,
      speed: {
        base: speed.base,
        taskBonus: speed.taskBonus,
        referralBonus: speed.referralBonus,
        levelBonus: speed.levelBonus,
        claimedLevel: speed.claimedLevel,
        total: speed.total,
        taskLines: speed.taskLines,
        pendingLines: pendingSpeedLines,
        referralBonusCap: config.referralBonusCap,
        referralBonusPerHour: config.referralBonusNexPerHour,
      },
      tasks: {
        available: availableTaskCount,
        completed: completedTaskCount,
        pending: pendingTaskCount,
      },
      referrals: {
        total: referrals.length,
        qualified: qualified.length,
        incomplete: referrals.length - qualified.length,
        bonusNexPerHour: speed.referralBonus,
        target: config.qualifiedReferralTarget,
        taskTarget: config.referralTaskTarget,
        rows: referrals,
      },
      withdrawal: {
        eligible,
        requirements,
        pendingNex: pendingWithdrawalNex,
        reservedNex: roundNex(balance.reservedNex),
        minUsd,
        history: withdrawals.map((row) => ({
          id: row._id,
          nexAmount: row.nexAmount,
          usdValue: row.usdValue,
          tonAmount: row.tonAmount,
          destination: row.destination,
          network: row.network,
          status: row.status,
          txHash: row.txHash,
          chainVerifiedAt: row.chainVerifiedAt,
          chainVerificationNote: row.chainVerificationNote,
          note: row.note,
          requestedAt: row.requestedAt,
          decidedAt: row.decidedAt,
        })),
      },
      ledger: ledgerRows.map((row) => ({
        id: row._id,
        kind: row.kind,
        amountNex: row.amountNex,
        memo: row.memo,
        createdAt: row.createdAt,
      })),
      miningHistory: miningRows.map((row) => ({
        id: row._id,
        day: row.day,
        amountNex: row.amountNex,
        rateNexPerHour: row.rateNexPerHour,
        fromTs: row.fromTs,
        toTs: row.toTs,
        createdAt: row.createdAt,
      })),
      notifications: {
        unread: notificationRows.filter((row) => !row.readAt).length,
        rows: notificationRows.slice(0, 12).map((row) => ({
          id: row._id,
          kind: row.kind,
          title: row.title,
          body: row.body,
          read: Boolean(row.readAt),
          createdAt: row.createdAt,
        })),
      },
      taskCompletionMap: Object.fromEntries(
        completions.map((completion) => [
          completion.taskId,
          {
            status: completion.status,
            submittedAt: completion.submittedAt,
            verifiedAt: completion.verifiedAt,
            note: completion.note,
          },
        ]),
      ),
    };
  },
});

/** Server-authoritative settlement. Safe to call repeatedly. */
export const settleMiningNow = mutation({
  args: {},
  handler: async (ctx) => {
    const { profile, balance } = await requireProfile(ctx);
    const config = await loadConfig(ctx);
    const speed = await computeSpeed(ctx, profile, config);
    const result = await settleMining(ctx, profile, balance, config, speed);
    return result;
  },
});

export const updatePreferences = mutation({
  args: {
    displayName: v.optional(v.string()),
    language: v.optional(v.string()),
    notifyTasks: v.optional(v.boolean()),
    notifyMining: v.optional(v.boolean()),
    notifyWallet: v.optional(v.boolean()),
    notifyAnnouncements: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx);
    const patch: Record<string, unknown> = {};

    if (args.displayName !== undefined) {
      const name = args.displayName.trim();
      if (name.length < 2 || name.length > 40) {
        throw new Error("Display name must be 2–40 characters.");
      }
      patch.displayName = name;
    }
    if (args.language !== undefined) {
      if (!["en", "am"].includes(args.language)) {
        throw new Error("Unsupported language. English and Amharic are available.");
      }
      patch.language = args.language;
    }
    if (args.notifyTasks !== undefined) patch.notifyTasks = args.notifyTasks;
    if (args.notifyMining !== undefined) patch.notifyMining = args.notifyMining;
    if (args.notifyWallet !== undefined) patch.notifyWallet = args.notifyWallet;
    if (args.notifyAnnouncements !== undefined)
      patch.notifyAnnouncements = args.notifyAnnouncements;

    if (Object.keys(patch).length === 0) return { updated: false };
    await ctx.db.patch(profile._id, patch);
    return { updated: true };
  },
});

/** Support report, routed to the operator audit trail. */
export const reportProblem = mutation({
  args: { message: v.string(), topic: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx);
    const message = args.message.trim();
    if (message.length < 10) {
      throw new Error("Describe the problem in at least 10 characters.");
    }
    if (message.length > 2000) {
      throw new Error("Keep the report under 2,000 characters.");
    }
    await ctx.db.insert("auditLogs", {
      actorId: String(profile.userId),
      actorLabel: profile.nexId,
      action: "support.report",
      detail: `${args.topic ?? "general"} · ${message}`,
      createdAt: Date.now(),
    });
    await notifyUser(
      ctx,
      profile,
      "announcement",
      "Report received",
      "The operator desk received your report. Financial corrections are only made after backend review.",
    );
    return { received: true };
  },
});

/** Full transaction history for the authenticated account. */
export const history = query({
  args: {
    kind: v.optional(
      v.union(
        v.literal("mining"),
        v.literal("task"),
        v.literal("referral"),
        v.literal("withdrawal"),
        v.literal("deposit"),
        v.literal("refund"),
        v.literal("adjustment"),
      ),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, profile, balance } = await getViewer(ctx);
    if (!userId || !profile || !balance) return null;

    const limit = Math.min(Math.max(args.limit ?? 60, 20), 150);
    const rows = (await ctx.db
      .query("ledger")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", profile.userId))
      .order("desc")
      .take(400))
      .filter((row) => !args.kind || row.kind === args.kind)
      .slice(0, limit);

    const withdrawals = await ctx.db
      .query("withdrawals")
      .withIndex("by_user_requestedAt", (q) => q.eq("userId", profile.userId))
      .order("desc")
      .take(40);

    const config = await loadConfig(ctx);

    return {
      serverNow: Date.now(),
      rows: rows.map((row) => ({
        id: row._id,
        kind: row.kind,
        amountNex: row.amountNex,
        memo: row.memo,
        refId: row.refId,
        createdAt: row.createdAt,
      })),
      withdrawals: withdrawals.map((row) => ({
        id: row._id,
        nexAmount: row.nexAmount,
        usdValue: row.usdValue,
        tonAmount: row.tonAmount,
        destination: row.destination,
        network: row.network,
        status: row.status,
        txHash: row.txHash,
        requestedAt: row.requestedAt,
        decidedAt: row.decidedAt,
      })),
      lifetime: {
        minedNex: roundNex(balance.lifetimeMinedNex),
        taskNex: roundNex(balance.lifetimeTaskNex),
      },
      nexUsdRate: config.nexUsdRate,
    };
  },
});

/** Public campaigns for the task marketplace. */
export const taskFeed = query({
  args: {},
  handler: async (ctx) => {
    const { userId, profile } = await getViewer(ctx);
    if (!userId) return null;
    const now = Date.now();
    const tasks = await ctx.db
      .query("tasks")
      .order("desc")
      .collect();
    const completions = profile
      ? await ctx.db
          .query("taskCompletions")
          .withIndex("by_user", (q) => q.eq("userId", profile.userId))
          .collect()
      : [];
    const map = new Map(completions.map((row) => [row.taskId, row]));

    return tasks
      .filter((task) => task.status !== "archived")
      .map((task) => {
        const completion = map.get(task._id);
        const expired = Boolean(task.expiresAt && task.expiresAt <= now);
        return {
          id: task._id,
          title: task.title,
          sponsor: task.sponsor,
          category: task.category,
          description: task.description,
          instructions: task.instructions,
          rewardNex: task.rewardNex,
          speedBonusNexPerHour: task.speedBonusNexPerHour,
          verification: task.verification,
          target: task.target,
          minViewSeconds: task.minViewSeconds ?? null,
          xpReward: task.xpReward ?? 100,
          verificationNote: task.verificationNote,
          status: task.status,
          expired,
          expiresAt: task.expiresAt,
          createdAt: task.createdAt,
          completion: completion
            ? {
                status: completion.status,
                note: completion.note,
                submittedAt: completion.submittedAt,
                verifiedAt: completion.verifiedAt,
              }
            : null,
        };
      });
  },
});
