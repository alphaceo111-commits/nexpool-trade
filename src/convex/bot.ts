import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { audit } from "./engine";

const BOT_KEY = "default";
const UNITS = { BTC: "BTC", LTC: "LTC", KAS: "KAS", ETC: "ETC" } as const;

const usd = (value: number) =>
  `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

async function poolSnapshot(ctx: QueryCtx | MutationCtx) {
  const workers = await ctx.db.query("workers").collect();
  const daily = await ctx.db
    .query("dailyStats")
    .withIndex("by_day")
    .order("desc")
    .take(30);
  const payouts = await ctx.db.query("payouts").collect();
  const blocks = await ctx.db
    .query("blocks")
    .withIndex("by_foundAt")
    .order("desc")
    .take(8);
  const settings = await ctx.db
    .query("poolSettings")
    .withIndex("by_key", (q) => q.eq("key", BOT_KEY))
    .first();

  const active = workers.filter((w) => w.status !== "offline");
  const hashratePth =
    active.reduce((sum, w) => sum + w.hashrateTh, 0) / 1000;
  const fee30 = daily.reduce((sum, d) => sum + d.feeUsd, 0);
  const blocks30 = daily.reduce((sum, d) => sum + d.blocks, 0);
  const pending = payouts.filter((p) => p.status === "pending");
  const degraded = workers.filter((w) => w.status === "degraded");
  const offline = workers.filter((w) => w.status === "offline");

  return {
    workers,
    active,
    degraded,
    offline,
    hashratePth,
    fee30,
    blocks30,
    pending,
    blocks,
    feePercent: settings?.feePercent ?? 1,
    payoutThresholdUsd: settings?.payoutThresholdUsd ?? 250,
    mined30: daily.reduce((sum, d) => sum + d.grossUsd, 0),
  };
}

type Snapshot = Awaited<ReturnType<typeof poolSnapshot>>;

function buildStatsReply(s: Snapshot) {
  return [
    "NEXPOOL · DESK SNAPSHOT",
    `Hashrate   ${s.hashratePth.toFixed(1)} PH/s`,
    `Workers    ${s.active.length}/${s.workers.length} active`,
    `Fee 30d    ${usd(s.fee30)} · ${s.feePercent.toFixed(2)}%`,
    `Blocks 30d ${s.blocks30}`,
    `Pending    ${usd(s.pending.reduce((t, p) => t + p.amountUsd, 0))} across ${s.pending.length} miners`,
  ].join("\n");
}

function buildWorkerReply(s: Snapshot) {
  const lines = s.workers
    .slice()
    .sort((a, b) => b.hashrateTh - a.hashrateTh)
    .map(
      (w) =>
        `${w.status === "online" ? "●" : w.status === "degraded" ? "◐" : "○"} ${w.name.padEnd(16)} ${UNITS[w.coin].padEnd(4)} ${(w.hashrateTh / 1000).toFixed(1)} PH/s  rej ${w.rejectRate.toFixed(2)}%`,
    );
  return [
    "NEXPOOL · WORKER FLEET",
    ...lines,
    `${s.active.length} active · ${s.degraded.length} degraded · ${s.offline.length} offline`,
  ].join("\n");
}

function buildRevenueReply(s: Snapshot) {
  const margin = s.mined30 > 0 ? (s.fee30 / s.mined30) * 100 : 0;
  return [
    "NEXPOOL · BUSINESS MODEL",
    `30d gross mined   ${usd(s.mined30)}`,
    `30d fee revenue   ${usd(s.fee30)} (${margin.toFixed(2)}% take)`,
    `Published fee     ${s.feePercent.toFixed(2)}%`,
    `Payout floor      ${usd(s.payoutThresholdUsd)}`,
    `Run-rate / month  ${usd(s.fee30)}`,
  ].join("\n");
}

function buildBlocksReply(s: Snapshot) {
  if (s.blocks.length === 0) return "NEXPOOL · no blocks recorded yet.";
  const lines = s.blocks.slice(0, 5).map((b) => {
    const when = new Date(b.foundAt).toISOString().slice(5, 16).replace("T", " ");
    return `${when}  ${b.coin.padEnd(4)} ${b.height.toLocaleString()}  ${usd(b.usdValue)}  ${b.finder}`;
  });
  return ["NEXPOOL · RECENT BLOCKS", ...lines].join("\n");
}

function buildPayoutReply(s: Snapshot) {
  if (s.pending.length === 0) {
    return `NEXPOOL · PAYOUTS\nNo pending payouts. Floor is ${usd(s.payoutThresholdUsd)}.`;
  }
  const lines = s.pending
    .slice(0, 6)
    .map((p) => `${p.miner.padEnd(16)} ${usd(p.amountUsd).padEnd(9)} ${p.coin}`);
  return [
    `NEXPOOL · PAYOUT QUEUE (${s.pending.length})`,
    ...lines,
    `Total ${usd(s.pending.reduce((t, p) => t + p.amountUsd, 0))} · floor ${usd(s.payoutThresholdUsd)}`,
  ].join("\n");
}

function buildAlertsReply(s: Snapshot) {
  const notes: string[] = [];
  if (s.offline.length > 0) {
    notes.push(`OFFLINE ${s.offline.map((w) => w.name).join(", ")}`);
  }
  if (s.degraded.length > 0) {
    notes.push(`DEGRADED ${s.degraded.map((w) => w.name).join(", ")} (reject ${s.degraded.map((w) => `${w.rejectRate.toFixed(2)}%`).join(", ")})`);
  }
  if (s.fee30 === 0) notes.push("No fee revenue booked in the last 30 days.");
  if (notes.length === 0) notes.push("All workers nominal. No alerts open.");
  return ["NEXPOOL · ALERTS", ...notes.map((n) => `• ${n}`)].join("\n");
}

const HELP = [
  "NEXPOOL · COMMANDS",
  "/stats    hashrate, fee revenue, pending payouts",
  "/workers  fleet status and reject rates",
  "/revenue  business model snapshot",
  "/blocks   most recent blocks found",
  "/payouts  pending payout queue",
  "/alerts   open worker / risk alerts",
  "/help     this message",
].join("\n");

function buildReply(s: Snapshot, raw: string) {
  const command = raw.trim().toLowerCase().replace(/@\w+/, "").split(/\s+/)[0];
  switch (command) {
    case "/stats":
    case "stats":
    case "status":
      return buildStatsReply(s);
    case "/workers":
    case "workers":
      return buildWorkerReply(s);
    case "/revenue":
    case "revenue":
      return buildRevenueReply(s);
    case "/blocks":
    case "blocks":
      return buildBlocksReply(s);
    case "/payouts":
    case "payouts":
      return buildPayoutReply(s);
    case "/alerts":
    case "alerts":
      return buildAlertsReply(s);
    case "/help":
    case "help":
    case "/start":
      return HELP;
    default:
      return `NEXPOOL · unknown command "${command || "(empty)"}".\nSend /help for the desk command list.`;
  }
}

async function logExchange(
  ctx: MutationCtx,
  args: {
    text: string;
    reply: string;
    source: "telegram" | "console";
    chatId?: string;
  },
) {
  const ts = Date.now();
  await ctx.db.insert("botMessages", {
    source: args.source,
    direction: "inbound",
    text: args.text,
    chatId: args.chatId,
    ts,
  });
  await ctx.db.insert("botMessages", {
    source: args.source,
    direction: "outbound",
    text: args.reply,
    chatId: args.chatId,
    ts: ts + 1,
  });
}

/** Called by the Telegram webhook after the request is authenticated. */
export const handleIncoming = internalMutation({
  args: {
    text: v.string(),
    chatId: v.optional(v.string()),
    source: v.optional(v.union(v.literal("telegram"), v.literal("console"))),
  },
  handler: async (ctx, args) => {
    const snapshot = await poolSnapshot(ctx);
    const reply = buildReply(snapshot, args.text);
    await logExchange(ctx, {
      text: args.text,
      reply,
      source: args.source ?? "telegram",
      chatId: args.chatId,
    });
    return reply;
  },
});

/** Runs the same command engine from the owner console — no bot token needed. */
export const runConsoleCommand = mutation({
  args: { text: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to run bot commands.");
    const text = args.text.trim();
    if (!text) throw new Error("Type a command first.");
    const snapshot = await poolSnapshot(ctx);
    const reply = buildReply(snapshot, text);
    await logExchange(ctx, { text, reply, source: "console" });
    return reply;
  },
});

export const overview = query({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db
      .query("botSettings")
      .withIndex("by_key", (q) => q.eq("key", BOT_KEY))
      .first();
    const messages = await ctx.db
      .query("botMessages")
      .withIndex("by_ts")
      .order("desc")
      .take(30);
    const siteUrl = process.env.CONVEX_SITE_URL ?? "";

    return {
      settings: {
        enabled: settings?.enabled ?? false,
        alertOnBlock: settings?.alertOnBlock ?? true,
        alertOnWorkerOffline: settings?.alertOnWorkerOffline ?? true,
        hashrateFloorPth: settings?.hashrateFloorPth ?? 300,
        chatId: settings?.chatId ?? "",
      },
      configured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      botUsername: process.env.TELEGRAM_BOT_USERNAME ?? "@nexpool_desk_bot",
      webhookUrl: siteUrl ? `${siteUrl}/telegram/webhook` : "",
      secretRequired: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
      messages: [...messages].reverse(),
    };
  },
});

export const updateSettings = mutation({
  args: {
    enabled: v.boolean(),
    alertOnBlock: v.boolean(),
    alertOnWorkerOffline: v.boolean(),
    hashrateFloorPth: v.number(),
    chatId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to configure the bot.");

    const existing = await ctx.db
      .query("botSettings")
      .withIndex("by_key", (q) => q.eq("key", BOT_KEY))
      .first();

    const patch = {
      enabled: args.enabled,
      alertOnBlock: args.alertOnBlock,
      alertOnWorkerOffline: args.alertOnWorkerOffline,
      hashrateFloorPth: args.hashrateFloorPth,
      chatId: args.chatId.trim() || undefined,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("botSettings", { key: BOT_KEY, ...patch });
    }

    await ctx.db.insert("events", {
      kind: "bot",
      message: args.enabled
        ? "Telegram desk bot enabled · alerts armed"
        : "Telegram desk bot disabled by owner",
      severity: args.enabled ? "success" : "warn",
      ts: Date.now(),
    });
  },
});

export const recordWebhookRegistration = internalMutation({
  args: { url: v.string(), detail: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId) {
      const user = await ctx.db.get(userId);
      await audit(
        ctx,
        { userId, label: user?.email ?? user?.name ?? String(userId) },
        "bot.webhook.registered",
        `${args.url} — ${args.detail}`,
      );
    }
    await ctx.db.insert("events", {
      kind: "bot",
      message: `Telegram webhook registered · ${args.detail}`,
      severity: "success",
      ts: Date.now(),
    });
  },
});

/**
 * Points Telegram at this deployment's webhook with the configured secret, so
 * bot commands and verification callbacks actually reach the engine. Run it
 * once from the operator console; re-running is idempotent on Telegram's side.
 */
export const registerWebhook = action({
  args: {},
  handler: async (ctx) => {
    await ctx.runMutation(internal.admin.assertOperator, {});

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error(
        "TELEGRAM_BOT_TOKEN is not configured on the backend, so the webhook cannot be registered.",
      );
    }
    const siteUrl = process.env.CONVEX_SITE_URL;
    if (!siteUrl) {
      throw new Error("CONVEX_SITE_URL is not configured on the backend.");
    }

    const url = `${siteUrl}/telegram/webhook`;
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const body: Record<string, unknown> = {
      url,
      allowed_updates: ["message", "edited_message"],
      drop_pending_updates: false,
    };
    if (secret) body.secret_token = secret;

    const response = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
    };

    if (!response.ok || !payload.ok) {
      const detail =
        payload.description ?? `Telegram rejected setWebhook (HTTP ${response.status}).`;
      throw new Error(detail);
    }

    await ctx.runMutation(internal.bot.recordWebhookRegistration, {
      url,
      detail: secret ? "secret token attached" : "no secret token configured",
    });
    return { url, secretRequired: Boolean(secret) };
  },
});
