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
      // Verified-ad entitlements. Durations are operator controlled; the ad
      // counts themselves are fixed by the product rules.
      awayMiningHours: v.optional(v.number()),
      extensionHours: v.optional(v.number()),
      // One-time patch marker for the verified-ad economy.
      miningEconomyVersion: v.optional(v.number()),
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
      // Lifetime XP from verified activities; levels can never skip a claim.
      xp: v.optional(v.number()),
      // Presence-tracked mining session. Accrual only runs while the Mini App
      // is open and heartbeating; leaving the app stops the session.
      miningSessionStartedAt: v.optional(v.number()),
      miningSessionHeartbeatAt: v.optional(v.number()),
      miningSessionCreditedAt: v.optional(v.number()),
      // Start of the current away-mining window after the app was closed.
      awayMiningStartedAt: v.optional(v.number()),
      // Independently tracked verified-ad progress. The counters reset only
      // when their own entitlement is granted.
      awayMiningAdProgress: v.optional(v.number()),
      awayMiningUnlockedAt: v.optional(v.number()),
      awayMiningExpiresAt: v.optional(v.number()),
      extensionAdProgress: v.optional(v.number()),
      extensionUnlockedAt: v.optional(v.number()),
      miningExtensionStartedAt: v.optional(v.number()),
      miningExtensionEndsAt: v.optional(v.number()),
      extensionUnlockDay: v.optional(v.string()),
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

    // Settled mining per UTC day. `minedNex` is the combined total; the two
    // buckets are tracked separately so the normal cap can never consume the
    // five-hour extension earnings.
    miningDays: defineTable({
      userId: v.id("users"),
      day: v.string(),
      minedNex: v.number(),
      normalMinedNex: v.optional(v.number()),
      extensionMinedNex: v.optional(v.number()),
      updatedAt: v.number(),
    }).index("by_user_day", ["userId", "day"]),

    // Materialised mining settlements (history + audit of rate used).
    miningEntries: defineTable({
      userId: v.id("users"),
      day: v.string(),
      amountNex: v.number(),
      normalNex: v.optional(v.number()),
      extensionNex: v.optional(v.number()),
      rateNexPerHour: v.number(),
      fromTs: v.number(),
      toTs: v.number(),
      createdAt: v.number(),
    })
      .index("by_user_createdAt", ["userId", "createdAt"])
      .index("by_user_day", ["userId", "day"]),

    // One server-issued ad challenge per requested verified view. A provider
    // reward callback completes the oldest pending challenge for the account;
    // a click or the mere opening of an ad can never complete one.
    miningAdChallenges: defineTable({
      userId: v.id("users"),
      purpose: v.union(v.literal("away"), v.literal("extension")),
      provider: v.string(),
      status: v.union(
        v.literal("pending"),
        v.literal("completed"),
        v.literal("expired"),
      ),
      createdAt: v.number(),
      expiresAt: v.number(),
      completedAt: v.optional(v.number()),
      providerEvent: v.optional(v.string()),
      providerReference: v.optional(v.string()),
      // Monetag's SDK result is the completion signal. The postback is an
      // optional second source for monetization/audit evidence.
      clientCompletedAt: v.optional(v.number()),
      clientRewardEventType: v.optional(v.string()),
      clientEstimatedPriceUsd: v.optional(v.number()),
      postbackValuedAt: v.optional(v.number()),
      postbackRewardEventType: v.optional(v.string()),
      postbackEstimatedPriceUsd: v.optional(v.number()),
    })
      .index("by_user_status_createdAt", ["userId", "status", "createdAt"])
      .index("by_createdAt", ["createdAt"]),

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
        v.literal("level"),
        v.literal("adjustment"),
      ),
      amountNex: v.number(),
      memo: v.string(),
      refId: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_user_createdAt", ["userId", "createdAt"])
      .index("by_createdAt", ["createdAt"])
      .index("by_user_refId", ["userId", "refId"]),

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
      // Campaign stays hidden until the user has claimed this level.
      minLevel: v.optional(v.number()),
      // XP credited only after the backend verifies the completion.
      xpReward: v.optional(v.number()),
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
        v.literal("level"),
        v.literal("announcement"),
      ),
      title: v.string(),
      body: v.string(),
      readAt: v.optional(v.number()),
      createdAt: v.number(),
    }).index("by_user_createdAt", ["userId", "createdAt"]),

    // Level ladder. Editable by the operator; XP thresholds must stay rising.
    levels: defineTable({
      level: v.number(),
      name: v.string(),
      xpRequired: v.number(),
      rewardNex: v.number(),
      speedBonusNexPerHour: v.number(),
      updatedAt: v.number(),
    }).index("by_level", ["level"]),

    // One row per level a user has claimed. Unique by construction.
    levelClaims: defineTable({
      userId: v.id("users"),
      level: v.number(),
      rewardNex: v.number(),
      speedBonusNexPerHour: v.number(),
      xpAtClaim: v.number(),
      claimedAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_level", ["userId", "level"]),

    // Append-only XP history so every point traces back to a verified action.
    xpEvents: defineTable({
      userId: v.id("users"),
      amountXp: v.number(),
      source: v.string(),
      refId: v.optional(v.string()),
      memo: v.string(),
      createdAt: v.number(),
    }).index("by_user_createdAt", ["userId", "createdAt"]),

    // Telegram Control Center: connected groups/channels and their real
    // Telegram-reported permissions. Never assume a bot can publish.
    telegramDestinations: defineTable({
      chatId: v.string(),
      title: v.string(),
      username: v.optional(v.string()),
      type: v.union(
        v.literal("group"),
        v.literal("supergroup"),
        v.literal("channel"),
      ),
      status: v.union(v.literal("connected"), v.literal("error")),
      botStatus: v.string(),
      isAdmin: v.boolean(),
      memberCount: v.optional(v.number()),
      permissions: v.object({
        canPostMessages: v.boolean(),
        canEditMessages: v.boolean(),
        canDeleteMessages: v.boolean(),
        canChangeInfo: v.boolean(),
        canInviteUsers: v.boolean(),
        canPinMessages: v.boolean(),
        canRestrictMembers: v.boolean(),
        canPromoteMembers: v.boolean(),
        canManageTopics: v.boolean(),
      }),
      lastError: v.optional(v.string()),
      lastCheckedAt: v.number(),
      addedBy: v.string(),
      createdAt: v.number(),
    })
      .index("by_chatId", ["chatId"])
      .index("by_type", ["type"]),

    // One row per composed post. Status is explicit so retries cannot double-send.
    telegramPosts: defineTable({
      title: v.string(),
      text: v.string(),
      parseMode: v.union(
        v.literal("HTML"),
        v.literal("MarkdownV2"),
        v.literal("none"),
      ),
      destinationIds: v.array(v.string()),
      status: v.union(
        v.literal("draft"),
        v.literal("scheduled"),
        v.literal("processing"),
        v.literal("published"),
        v.literal("partially_published"),
        v.literal("failed"),
        v.literal("cancelled"),
      ),
      scheduledAt: v.optional(v.number()),
      idempotencyKey: v.string(),
      createdBy: v.string(),
      createdAt: v.number(),
      updatedAt: v.number(),
      lastError: v.optional(v.string()),
    })
      .index("by_status", ["status"])
      .index("by_scheduledAt", ["scheduledAt"])
      .index("by_createdAt", ["createdAt"])
      .index("by_idempotencyKey", ["idempotencyKey"]),

    // Delivery state is tracked separately for every destination.
    telegramDeliveries: defineTable({
      postId: v.id("telegramPosts"),
      chatId: v.string(),
      destinationTitle: v.string(),
      status: v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("sent"),
        v.literal("failed"),
      ),
      telegramMessageId: v.optional(v.number()),
      error: v.optional(v.string()),
      attempts: v.number(),
      sentAt: v.optional(v.number()),
      createdAt: v.number(),
    })
      .index("by_postId", ["postId"])
      .index("by_chatId", ["chatId"])
      .index("by_status", ["status"]),

    // Server-side media metadata. Files live in Convex storage, never the client.
    telegramMedia: defineTable({
      storageId: v.string(),
      name: v.string(),
      mimeType: v.string(),
      size: v.number(),
      kind: v.union(
        v.literal("image"),
        v.literal("video"),
        v.literal("document"),
        v.literal("audio"),
        v.literal("animation"),
      ),
      caption: v.optional(v.string()),
      folder: v.string(),
      uploadedBy: v.string(),
      createdAt: v.number(),
    })
      .index("by_createdAt", ["createdAt"])
      .index("by_folder", ["folder"]),

    // Editable command menu. Sync writes the same rows to Telegram.
    telegramCommands: defineTable({
      command: v.string(),
      description: v.string(),
      scope: v.string(),
      visible: v.boolean(),
      updatedAt: v.number(),
    })
      .index("by_command", ["command"])
      .index("by_scope", ["scope"]),

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
