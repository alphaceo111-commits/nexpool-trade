import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

export const coinValidator = v.union(
  v.literal("BTC"),
  v.literal("LTC"),
  v.literal("KAS"),
  v.literal("ETC"),
);

export const workerStatusValidator = v.union(
  v.literal("online"),
  v.literal("degraded"),
  v.literal("offline"),
);

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // ------------------------------------------------------------------
    // NEXPOOL pool operations
    // ------------------------------------------------------------------

    // A worker is one operator-controlled rig / farm endpoint pointed at the pool.
    workers: defineTable({
      name: v.string(),
      coin: coinValidator,
      hashrateTh: v.number(), // terahashes per second
      status: workerStatusValidator,
      rejectRate: v.number(), // percent, e.g. 0.42
      region: v.string(),
      lastSeen: v.number(),
    })
      .index("by_status", ["status"])
      .index("by_coin", ["coin"]),

    // One row per day of pool economics (last 30 days drive the charts).
    dailyStats: defineTable({
      day: v.string(), // YYYY-MM-DD
      hashrateAvgPth: v.number(), // petahashes per second
      grossUsd: v.number(),
      feeUsd: v.number(),
      blocks: v.number(),
      miners: v.number(),
    }).index("by_day", ["day"]),

    // Intraday hashrate telemetry (last 24h).
    hashrateSamples: defineTable({
      ts: v.number(),
      hashratePth: v.number(),
      miners: v.number(),
    }).index("by_ts", ["ts"]),

    // Blocks found by the pool.
    blocks: defineTable({
      coin: coinValidator,
      height: v.number(),
      reward: v.number(), // coin units
      usdValue: v.number(),
      feeUsd: v.number(), // operator fee captured on the block
      finder: v.string(),
      foundAt: v.number(),
      status: v.union(v.literal("confirmed"), v.literal("pending")),
    }).index("by_foundAt", ["foundAt"]),

    // Miner payout ledger.
    payouts: defineTable({
      miner: v.string(),
      coin: coinValidator,
      amountCoin: v.number(),
      amountUsd: v.number(),
      status: v.union(v.literal("paid"), v.literal("pending")),
      requestedAt: v.number(),
      paidAt: v.optional(v.number()),
      txHash: v.optional(v.string()),
    })
      .index("by_status", ["status"])
      .index("by_requestedAt", ["requestedAt"]),

    // Business model: what the pool charges and how it settles.
    poolSettings: defineTable({
      key: v.string(),
      feePercent: v.number(),
      payoutThresholdUsd: v.number(),
      payoutInterval: v.string(),
      updatedAt: v.number(),
    }).index("by_key", ["key"]),

    // Telegram bot configuration + alert thresholds.
    botSettings: defineTable({
      key: v.string(),
      enabled: v.boolean(),
      alertOnBlock: v.boolean(),
      alertOnWorkerOffline: v.boolean(),
      hashrateFloorPth: v.number(),
      chatId: v.optional(v.string()),
    }).index("by_key", ["key"]),

    // Every inbound command and outbound reply, from Telegram or the console.
    botMessages: defineTable({
      source: v.union(v.literal("telegram"), v.literal("console")),
      direction: v.union(v.literal("inbound"), v.literal("outbound")),
      text: v.string(),
      chatId: v.optional(v.string()),
      ts: v.number(),
    }).index("by_ts", ["ts"]),

    // ------------------------------------------------------------------
    // NEXPOOL rewards app (miner-facing mini app)
    // ------------------------------------------------------------------

    // Backend-controlled NEXPOOL economy. Single row keyed "default".
    appConfig: defineTable({
      key: v.string(),
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
      miningEnabledAt: v.number(),
      withdrawalsEnabled: v.boolean(),
      ownerUserId: v.optional(v.id("users")),
      // Set once the starter sponsor missions have been published.
      starterMissionsSeededAt: v.optional(v.number()),
      updatedAt: v.number(),
      updatedBy: v.optional(v.string()),
    }).index("by_key", ["key"]),

    // One NEXPOOL account per signed-in auth user.
    profiles: defineTable({
      userId: v.id("users"),
      nexId: v.string(),
      displayName: v.string(),
      username: v.optional(v.string()),
      photoUrl: v.optional(v.string()),
      telegramId: v.optional(v.string()),
      telegramVerifiedAt: v.optional(v.number()),
      referralCode: v.string(),
      referredBy: v.optional(v.id("profiles")),
      referredAt: v.optional(v.number()),
      referralQualifiedAt: v.optional(v.number()),
      language: v.string(),
      notifyTasks: v.boolean(),
      notifyMining: v.boolean(),
      notifyWallet: v.boolean(),
      notifyAnnouncements: v.boolean(),
      walletAddress: v.optional(v.string()),
      walletNetwork: v.optional(v.string()),
      walletApp: v.optional(v.string()),
      walletConnectedAt: v.optional(v.number()),
      restricted: v.boolean(),
      restrictionReason: v.optional(v.string()),
      complianceCleared: v.boolean(),
      createdAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_nexId", ["nexId"])
      .index("by_referralCode", ["referralCode"])
      .index("by_referredBy", ["referredBy"])
      .index("by_telegramId", ["telegramId"]),

    // Confirmed NEX balances. Only the backend writes here.
    balances: defineTable({
      userId: v.id("users"),
      availableNex: v.number(),
      reservedNex: v.number(),
      lifetimeMinedNex: v.number(),
      lifetimeTaskNex: v.number(),
      lastSettledAt: v.number(),
      updatedAt: v.number(),
    }).index("by_user", ["userId"]),

    // Settled mining per UTC day, used to enforce the server daily cap.
    miningDays: defineTable({
      userId: v.id("users"),
      day: v.string(),
      minedNex: v.number(),
      updatedAt: v.number(),
    }).index("by_user_day", ["userId", "day"]),

    // Materialised mining settlements (history + audit of rate used).
    miningEntries: defineTable({
      userId: v.id("users"),
      day: v.string(),
      amountNex: v.number(),
      rateNexPerHour: v.number(),
      fromTs: v.number(),
      toTs: v.number(),
      createdAt: v.number(),
    })
      .index("by_user_createdAt", ["userId", "createdAt"])
      .index("by_user_day", ["userId", "day"]),

    // Single source of truth for every NEX movement.
    ledger: defineTable({
      userId: v.id("users"),
      kind: v.union(
        v.literal("mining"),
        v.literal("task"),
        v.literal("referral"),
        v.literal("withdrawal"),
        v.literal("deposit"),
        v.literal("refund"),
        v.literal("adjustment"),
      ),
      amountNex: v.number(),
      memo: v.string(),
      refId: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_user_createdAt", ["userId", "createdAt"])
      .index("by_createdAt", ["createdAt"]),

    // Sponsor campaigns. Rewards only settle after verification.
    tasks: defineTable({
      title: v.string(),
      sponsor: v.string(),
      category: v.union(
        v.literal("advertisement"),
        v.literal("join_channel"),
        v.literal("join_group"),
        v.literal("sponsor_bot"),
        v.literal("social"),
      ),
      description: v.string(),
      instructions: v.array(v.string()),
      rewardNex: v.number(),
      speedBonusNexPerHour: v.number(),
      verification: v.union(
        v.literal("telegram_channel"),
        v.literal("telegram_group"),
        v.literal("telegram_bot"),
        v.literal("provider_ad"),
        v.literal("in_app_ad"),
        v.literal("social"),
        v.literal("manual"),
      ),
      target: v.optional(v.string()),
      // Minimum server-timed view length for in_app_ad campaigns.
      minViewSeconds: v.optional(v.number()),
      verificationNote: v.string(),
      status: v.union(
        v.literal("active"),
        v.literal("paused"),
        v.literal("archived"),
      ),
      expiresAt: v.optional(v.number()),
      createdAt: v.number(),
      createdBy: v.string(),
    })
      .index("by_status", ["status"])
      .index("by_createdAt", ["createdAt"]),

    // A user's progress on a task. No reward is granted on insert.
    taskCompletions: defineTable({
      userId: v.id("users"),
      taskId: v.id("tasks"),
      status: v.union(
        v.literal("pending"),
        v.literal("verified"),
        v.literal("rejected"),
        v.literal("unavailable"),
      ),
      startedAt: v.number(),
      submittedAt: v.optional(v.number()),
      verifiedAt: v.optional(v.number()),
      rewardNex: v.number(),
      speedBonusNexPerHour: v.number(),
      note: v.optional(v.string()),
      verifiedBy: v.optional(v.string()),
    })
      .index("by_user", ["userId"])
      .index("by_user_task", ["userId", "taskId"])
      .index("by_status", ["status"])
      .index("by_task", ["taskId"]),

    // Withdrawal requests. Balance is reserved on submit, settled by admin.
    withdrawals: defineTable({
      userId: v.id("users"),
      nexAmount: v.number(),
      usdValue: v.number(),
      nexUsdRate: v.number(),
      tonAmount: v.number(),
      tonUsdRate: v.number(),
      destination: v.string(),
      network: v.string(),
      status: v.union(
        v.literal("requested"),
        v.literal("reviewing"),
        v.literal("paid"),
        v.literal("rejected"),
        v.literal("failed"),
      ),
      txHash: v.optional(v.string()),
      chainVerifiedAt: v.optional(v.number()),
      chainVerificationNote: v.optional(v.string()),
      note: v.optional(v.string()),
      requestedAt: v.number(),
      decidedAt: v.optional(v.number()),
      decidedBy: v.optional(v.string()),
    })
      .index("by_user_requestedAt", ["userId", "requestedAt"])
      .index("by_status", ["status"])
      .index("by_requestedAt", ["requestedAt"]),

    // TON deposit intents. An intent locks a quote and a memo; NEX is only
    // credited after a matching on-chain payment is verified by the backend.
    deposits: defineTable({
      userId: v.id("users"),
      nexId: v.string(),
      memo: v.string(),
      address: v.string(),
      tonAmount: v.number(),
      nanoAmount: v.string(),
      quotedNex: v.number(),
      nexUsdRate: v.number(),
      tonUsdRate: v.number(),
      status: v.union(
        v.literal("pending"),
        v.literal("confirmed"),
        v.literal("failed"),
      ),
      txHash: v.optional(v.string()),
      receivedTon: v.optional(v.number()),
      creditedNex: v.optional(v.number()),
      paidAt: v.optional(v.number()),
      verifiedAt: v.optional(v.number()),
      note: v.optional(v.string()),
      createdAt: v.number(),
      expiresAt: v.number(),
    })
      .index("by_user_createdAt", ["userId", "createdAt"])
      .index("by_status", ["status"])
      .index("by_memo", ["memo"])
      .index("by_txHash", ["txHash"]),

    // In-app + Telegram notification feed (one row per recipient).
    notifications: defineTable({
      userId: v.id("users"),
      kind: v.union(
        v.literal("task"),
        v.literal("mining"),
        v.literal("referral"),
        v.literal("wallet"),
        v.literal("announcement"),
      ),
      title: v.string(),
      body: v.string(),
      readAt: v.optional(v.number()),
      createdAt: v.number(),
    }).index("by_user_createdAt", ["userId", "createdAt"]),

    // Operator audit trail for every privileged action.
    auditLogs: defineTable({
      actorId: v.optional(v.string()),
      actorLabel: v.string(),
      action: v.string(),
      detail: v.string(),
      createdAt: v.number(),
    }).index("by_createdAt", ["createdAt"]),

    // Operator activity feed.
    events: defineTable({
      kind: v.union(
        v.literal("block"),
        v.literal("payout"),
        v.literal("worker"),
        v.literal("bot"),
        v.literal("config"),
      ),
      message: v.string(),
      severity: v.union(v.literal("info"), v.literal("success"), v.literal("warn")),
      ts: v.number(),
    }).index("by_ts", ["ts"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
