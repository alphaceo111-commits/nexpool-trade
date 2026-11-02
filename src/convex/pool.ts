import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { coinValidator, workerStatusValidator } from "./schema";

const SETTINGS_KEY = "default";

/** Deterministic pseudo-random generator so the demo book seeds identically. */
function makeRng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function hex(rng: () => number, length: number) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += Math.floor(rng() * 16).toString(16);
  }
  return out;
}

async function requireOwner(ctx: MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Sign in to operate the pool.");
  }
  return userId;
}

async function readSettings(ctx: QueryCtx | MutationCtx) {
  return await ctx.db
    .query("poolSettings")
    .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
    .first();
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const overview = query({
  args: {},
  handler: async (ctx) => {
    const workers = await ctx.db.query("workers").collect();
    const daily = await ctx.db
      .query("dailyStats")
      .withIndex("by_day")
      .order("desc")
      .take(30);
    const samples = await ctx.db
      .query("hashrateSamples")
      .withIndex("by_ts")
      .order("desc")
      .take(96);
    const blocks = await ctx.db
      .query("blocks")
      .withIndex("by_foundAt")
      .order("desc")
      .take(40);
    const events = await ctx.db
      .query("events")
      .withIndex("by_ts")
      .order("desc")
      .take(12);
    const payouts = await ctx.db.query("payouts").collect();
    const settings = await readSettings(ctx);

    const onlineWorkers = workers.filter((w) => w.status === "online");
    const totalHashrateTh = workers
      .filter((w) => w.status !== "offline")
      .reduce((sum, w) => sum + w.hashrateTh, 0);
    const rejectAvg =
      onlineWorkers.length > 0
        ? onlineWorkers.reduce((sum, w) => sum + w.rejectRate, 0) /
          onlineWorkers.length
        : 0;

    const coinTotals = new Map<string, number>();
    for (const worker of workers) {
      if (worker.status === "offline") continue;
      coinTotals.set(worker.coin, (coinTotals.get(worker.coin) ?? 0) + worker.hashrateTh);
    }
    const coinMix = [...coinTotals.entries()]
      .map(([coin, hashrateTh]) => ({
        coin,
        hashratePth: hashrateTh / 1000,
        share: totalHashrateTh > 0 ? (hashrateTh / totalHashrateTh) * 100 : 0,
      }))
      .sort((a, b) => b.hashratePth - a.hashratePth);

    const fee30 = daily.reduce((sum, d) => sum + d.feeUsd, 0);
    const gross30 = daily.reduce((sum, d) => sum + d.grossUsd, 0);
    const blocks30 = daily.reduce((sum, d) => sum + d.blocks, 0);
    const pending = payouts.filter((p) => p.status === "pending");
    const paid30 = payouts.filter(
      (p) => p.status === "paid" && (p.paidAt ?? 0) > Date.now() - 30 * 864e5,
    );

    return {
      hashratePth: totalHashrateTh / 1000,
      minersOnline: onlineWorkers.length,
      minersTotal: workers.length,
      blockFinderCount: blocks.length,
      uptime: workers.length > 0 ? (onlineWorkers.length / workers.length) * 100 : 0,
      rejectAvg,
      fee30,
      gross30,
      blocks30,
      margin: gross30 > 0 ? (fee30 / gross30) * 100 : 0,
      pendingPayoutUsd: pending.reduce((sum, p) => sum + p.amountUsd, 0),
      pendingPayoutCount: pending.length,
      paid30Usd: paid30.reduce((sum, p) => sum + p.amountUsd, 0),
      feePercent: settings?.feePercent ?? 1,
      payoutThresholdUsd: settings?.payoutThresholdUsd ?? 250,
      payoutInterval: settings?.payoutInterval ?? "Every 6 hours",
      series: [...daily].reverse().map((d) => ({
        day: d.day,
        feeUsd: Math.round(d.feeUsd),
        grossUsd: Math.round(d.grossUsd),
        hashratePth: d.hashrateAvgPth,
        blocks: d.blocks,
      })),
      samples: [...samples].reverse().map((s) => ({
        ts: s.ts,
        hashratePth: s.hashratePth,
        miners: s.miners,
      })),
      coinMix,
      recentBlocks: blocks.slice(0, 6),
      events,
    };
  },
});

export const workers = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("workers").collect();
    return rows.sort((a, b) => b.hashrateTh - a.hashrateTh);
  },
});

export const payouts = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("payouts")
      .withIndex("by_requestedAt")
      .order("desc")
      .take(60);
    const pending = rows.filter((p) => p.status === "pending");
    const paid = rows.filter((p) => p.status === "paid");
    return {
      rows,
      pendingUsd: pending.reduce((s, p) => s + p.amountUsd, 0),
      pendingCount: pending.length,
      paidUsd: paid.reduce((s, p) => s + p.amountUsd, 0),
      paidCount: paid.length,
    };
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const seedDemo = mutation({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);

    const existing = await ctx.db.query("poolSettings").first();
    if (existing) return { seeded: false };

    const now = Date.now();
    const rng = makeRng(20261102);

    // --- business settings -------------------------------------------------
    await ctx.db.insert("poolSettings", {
      key: SETTINGS_KEY,
      feePercent: 1,
      payoutThresholdUsd: 250,
      payoutInterval: "Every 6 hours",
      updatedAt: now,
    });

    await ctx.db.insert("botSettings", {
      key: SETTINGS_KEY,
      enabled: true,
      alertOnBlock: true,
      alertOnWorkerOffline: true,
      hashrateFloorPth: 300,
    });

    // --- workers -----------------------------------------------------------
    const workerSeeds: {
      name: string;
      coin: "BTC" | "LTC" | "KAS" | "ETC";
      hashrateTh: number;
      status: "online" | "degraded" | "offline";
      rejectRate: number;
      region: string;
    }[] = [
      { name: "farm-tex-04", coin: "BTC", hashrateTh: 74000, status: "degraded", rejectRate: 1.86, region: "us-east" },
      { name: "rig-ost-01", coin: "BTC", hashrateTh: 62000, status: "online", rejectRate: 0.31, region: "eu-central" },
      { name: "rig-ost-02", coin: "BTC", hashrateTh: 58000, status: "online", rejectRate: 0.28, region: "eu-central" },
      { name: "rig-aus-03", coin: "BTC", hashrateTh: 41000, status: "online", rejectRate: 0.44, region: "ap-south" },
      { name: "kas-calgary-01", coin: "KAS", hashrateTh: 38000, status: "online", rejectRate: 0.22, region: "ca-west" },
      { name: "kas-calgary-02", coin: "KAS", hashrateTh: 34000, status: "online", rejectRate: 0.25, region: "ca-west" },
      { name: "ltc-reyk-01", coin: "LTC", hashrateTh: 22000, status: "online", rejectRate: 0.33, region: "eu-north" },
      { name: "ltc-reyk-02", coin: "LTC", hashrateTh: 19500, status: "online", rejectRate: 0.29, region: "eu-north" },
      { name: "etc-sing-01", coin: "ETC", hashrateTh: 15000, status: "offline", rejectRate: 0, region: "ap-southeast" },
    ];

    for (const worker of workerSeeds) {
      await ctx.db.insert("workers", {
        ...worker,
        lastSeen:
          worker.status === "offline" ? now - 1000 * 60 * 47 : now - Math.floor(rng() * 90_000),
      });
    }

    // --- 30 days of pool economics ----------------------------------------
    const feePercent = 1;
    const days: string[] = [];
    for (let i = 29; i >= 0; i -= 1) {
      const date = new Date(now - i * 864e5);
      days.push(date.toISOString().slice(0, 10));
    }

    const dailyFee: number[] = [];
    for (let i = 0; i < days.length; i += 1) {
      const wave = Math.sin((i / 29) * Math.PI * 1.7) * 18;
      const hashratePth = Math.round((322 + wave + rng() * 12) * 10) / 10;
      const grossUsd = Math.round(hashratePth * 112 * (0.94 + rng() * 0.16));
      const feeUsd = Math.round(grossUsd * (feePercent / 100) * 100) / 100;
      dailyFee.push(feeUsd);
      await ctx.db.insert("dailyStats", {
        day: days[i],
        hashrateAvgPth: hashratePth,
        grossUsd,
        feeUsd,
        blocks: 1 + Math.floor(rng() * 4),
        miners: 7 + Math.floor(rng() * 3),
      });
    }

    // --- intraday hashrate telemetry --------------------------------------
    for (let i = 96; i >= 0; i -= 1) {
      const ts = now - i * 15 * 60 * 1000;
      await ctx.db.insert("hashrateSamples", {
        ts,
        hashratePth: Math.round((341 + Math.sin(i / 7) * 9 + rng() * 6) * 10) / 10,
        miners: i % 19 === 0 ? 8 : 9,
      });
    }

    // --- blocks ------------------------------------------------------------
    const blockSeeds = [
      { coin: "BTC" as const, hoursAgo: 5, height: 873_412, reward: 3.125, price: 94_120, finder: "farm-tex-04", status: "confirmed" as const },
      { coin: "KAS" as const, hoursAgo: 11, height: 41_882_010, reward: 84.2, price: 0.118, finder: "kas-calgary-01", status: "confirmed" as const },
      { coin: "LTC" as const, hoursAgo: 19, height: 2_914_662, reward: 6.25, price: 84.2, finder: "ltc-reyk-01", status: "confirmed" as const },
      { coin: "KAS" as const, hoursAgo: 27, height: 41_877_440, reward: 79.6, price: 0.118, finder: "kas-calgary-02", status: "confirmed" as const },
      { coin: "ETC" as const, hoursAgo: 38, height: 21_884_019, reward: 2.56, price: 24.6, finder: "etc-sing-01", status: "confirmed" as const },
      { coin: "LTC" as const, hoursAgo: 52, height: 2_914_511, reward: 6.25, price: 84.2, finder: "ltc-reyk-02", status: "confirmed" as const },
      { coin: "KAS" as const, hoursAgo: 66, height: 41_869_004, reward: 88.1, price: 0.118, finder: "kas-calgary-01", status: "confirmed" as const },
      { coin: "BTC" as const, hoursAgo: 74, height: 873_188, reward: 3.125, price: 93_400, finder: "rig-ost-02", status: "confirmed" as const },
    ];

    for (const block of blockSeeds) {
      const usdValue = Math.round(block.reward * block.price * 100) / 100;
      await ctx.db.insert("blocks", {
        coin: block.coin,
        height: block.height,
        reward: block.reward,
        usdValue,
        feeUsd: Math.round(usdValue * (feePercent / 100) * 100) / 100,
        finder: block.finder,
        foundAt: now - block.hoursAgo * 3600_000,
        status: block.status,
      });
      await ctx.db.insert("events", {
        kind: "block",
        message: `${block.coin} block ${block.height.toLocaleString()} found by ${block.finder} · $${usdValue.toLocaleString()}`,
        severity: "success",
        ts: now - block.hoursAgo * 3600_000,
      });
    }

    // --- payout ledger -----------------------------------------------------
    const miners = [
      "northwind.farm",
      "polar.hash",
      "atlas-rigs",
      "vulcan.01",
      "sierra-mining",
      "kestrel.eu",
      "delta-works",
      "redshift.btc",
    ];
    const coins = ["BTC", "LTC", "KAS", "ETC"] as const;

    for (let i = 0; i < 14; i += 1) {
      const isPaid = i > 3;
      const requestedAt = now - (i * 9 + 2) * 3600_000;
      const amountUsd = Math.round((180 + rng() * 2200) * 100) / 100;
      const coin = coins[Math.floor(rng() * coins.length)];
      const price = coin === "BTC" ? 94_120 : coin === "LTC" ? 84.2 : coin === "KAS" ? 0.118 : 24.6;
      await ctx.db.insert("payouts", {
        miner: miners[i % miners.length],
        coin,
        amountCoin: Math.round((amountUsd / price) * 1e6) / 1e6,
        amountUsd,
        status: isPaid ? "paid" : "pending",
        requestedAt,
        paidAt: isPaid ? requestedAt + 22 * 60_000 : undefined,
        txHash: isPaid ? `0x${hex(rng, 40)}` : undefined,
      });
    }

    // --- activity feed -----------------------------------------------------
    await ctx.db.insert("events", {
      kind: "worker",
      message: "etc-sing-01 stopped submitting shares — 47m without a ping",
      severity: "warn",
      ts: now - 47 * 60_000,
    });
    await ctx.db.insert("events", {
      kind: "payout",
      message: "Settlement batch #4821 broadcast · 4 payouts queued",
      severity: "info",
      ts: now - 92 * 60_000,
    });
    await ctx.db.insert("events", {
      kind: "bot",
      message: "Telegram bot delivered daily desk report to owner chat",
      severity: "info",
      ts: now - 5 * 3600_000,
    });
    await ctx.db.insert("events", {
      kind: "config",
      message: "Pool fee confirmed at 1.00% · payout floor $250",
      severity: "info",
      ts: now - 26 * 3600_000,
    });

    // --- bot transcript ----------------------------------------------------
    await ctx.db.insert("botMessages", {
      source: "telegram",
      direction: "inbound",
      text: "/stats",
      chatId: "owner-desk",
      ts: now - 6 * 3600_000,
    });
    await ctx.db.insert("botMessages", {
      source: "telegram",
      direction: "outbound",
      text: "NEXPOOL · DESK SNAPSHOT\nHashrate 348.6 PH/s (8/9 active)\n30d fee revenue $11,482\n30d blocks 61 · fee 1.00%\nPending payouts $3,141 across 4 miners",
      chatId: "owner-desk",
      ts: now - 6 * 3600_000 + 900,
    });

    return { seeded: true };
  },
});

export const addWorker = mutation({
  args: {
    name: v.string(),
    coin: coinValidator,
    hashrateTh: v.number(),
    region: v.string(),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const name = args.name.trim().toLowerCase().replace(/\s+/g, "-");
    if (!name) throw new Error("Worker name is required.");
    if (args.hashrateTh <= 0) throw new Error("Hashrate must be greater than zero.");

    const duplicate = await ctx.db
      .query("workers")
      .filter((q) => q.eq(q.field("name"), name))
      .first();
    if (duplicate) throw new Error(`Worker "${name}" already exists.`);

    await ctx.db.insert("workers", {
      name,
      coin: args.coin,
      hashrateTh: args.hashrateTh,
      status: "online",
      rejectRate: 0,
      region: args.region.trim() || "custom",
      lastSeen: Date.now(),
    });
    await ctx.db.insert("events", {
      kind: "worker",
      message: `Worker ${name} joined the pool · ${args.coin} · ${(args.hashrateTh / 1000).toFixed(1)} PH/s`,
      severity: "success",
      ts: Date.now(),
    });
  },
});

export const setWorkerStatus = mutation({
  args: {
    workerId: v.id("workers"),
    status: workerStatusValidator,
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const worker = await ctx.db.get(args.workerId);
    if (!worker) throw new Error("Worker not found.");
    await ctx.db.patch(args.workerId, { status: args.status, lastSeen: Date.now() });
    await ctx.db.insert("events", {
      kind: "worker",
      message: `${worker.name} set to ${args.status.toUpperCase()} by owner`,
      severity: args.status === "offline" ? "warn" : "info",
      ts: Date.now(),
    });
  },
});

export const markPayoutPaid = mutation({
  args: { payoutId: v.id("payouts") },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const payout = await ctx.db.get(args.payoutId);
    if (!payout) throw new Error("Payout not found.");
    if (payout.status === "paid") return;
    const rng = makeRng(Date.now() % 4294967296);
    await ctx.db.patch(args.payoutId, {
      status: "paid",
      paidAt: Date.now(),
      txHash: `0x${hex(rng, 40)}`,
    });
    await ctx.db.insert("events", {
      kind: "payout",
      message: `Paid $${payout.amountUsd.toLocaleString()} to ${payout.miner} · ${payout.coin}`,
      severity: "success",
      ts: Date.now(),
    });
  },
});

export const updateEconomics = mutation({
  args: {
    feePercent: v.number(),
    payoutThresholdUsd: v.number(),
    payoutInterval: v.string(),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    if (args.feePercent < 0.1 || args.feePercent > 5) {
      throw new Error("Fee must stay between 0.1% and 5%.");
    }
    if (args.payoutThresholdUsd < 10) {
      throw new Error("Payout floor must be at least $10.");
    }
    const settings = await readSettings(ctx);
    const patch = {
      feePercent: args.feePercent,
      payoutThresholdUsd: args.payoutThresholdUsd,
      payoutInterval: args.payoutInterval,
      updatedAt: Date.now(),
    };
    if (settings) {
      await ctx.db.patch(settings._id, patch);
    } else {
      await ctx.db.insert("poolSettings", { key: SETTINGS_KEY, ...patch });
    }
    await ctx.db.insert("events", {
      kind: "config",
      message: `Pool economics updated · ${args.feePercent.toFixed(2)}% fee · $${args.payoutThresholdUsd} floor`,
      severity: "info",
      ts: Date.now(),
    });
  },
});
