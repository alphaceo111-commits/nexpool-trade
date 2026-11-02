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
