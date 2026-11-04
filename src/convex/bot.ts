import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { audit, computeSpeed, dayKey, loadConfig, roundNex } from "./engine";
import {
  MIN_DEPOSIT_TON,
  isValidTonAddress,
  treasuryAddress,
} from "./payments";
import { telegramWebhookSecret } from "./telegramWebhook";

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

/* ------------------------------------------------------------------ */
/* User commands — same accounts and ledger as the mini app           */
/* ------------------------------------------------------------------ */

const USER_COMMANDS = new Set([
  "/start",
  "/app",
  "/balance",
  "/mining",
  "/tasks",
  "/referral",
  "/wallet",
  "/deposit",
  "/withdraw",
  "/history",
  "/help",
  "/terms",
  "/support",
]);

function normalizeCommand(raw: string) {
  return (
    raw
      .trim()
      .toLowerCase()
      .replace(/@\w+/, "")
      .split(/\s+/)[0] ?? ""
  );
}

type UserAccount = {
  displayName: string;
  username: string | undefined;
  nexId: string;
  referralCode: string;
  walletAddress: string | undefined;
  restricted: boolean;
  availableNex: number;
  reservedNex: number;
  lifetimeMinedNex: number;
  lifetimeTaskNex: number;
  minWithdrawUsd: number;
  miningEnabled: boolean;
  speed: { base: number; taskBonus: number; referralBonus: number; total: number };
  todayNex: number;
  dailyCapNex: number;
  tasks: { available: number; pending: number; completed: number };
  referrals: { total: number; qualified: number; target: number; taskTarget: number };
  pendingWithdrawalNex: number;
  withdrawalsEnabled: boolean;
  treasuryAvailableUsd: number;
  ledger: { kind: string; amountNex: number; memo: string }[];
};

/** Loads everything a bot command needs for the Telegram chat's account. */
async function userSnapshot(
  ctx: MutationCtx,
  chatId: string,
): Promise<UserAccount | null> {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_telegramId", (q) => q.eq("telegramId", chatId))
    .first();
  if (!profile) return null;
  const balance = await ctx.db
    .query("balances")
    .withIndex("by_user", (q) => q.eq("userId", profile.userId))
    .first();
  if (!balance) return null;

  const config = await loadConfig(ctx);
  const speed = await computeSpeed(ctx, profile, config);

  const now = Date.now();
  const miningDay = await ctx.db
    .query("miningDays")
    .withIndex("by_user_day", (q) =>
      q.eq("userId", profile.userId).eq("day", dayKey(now)),
    )
    .first();

  const tasks = (await ctx.db.query("tasks").collect()).filter(
    (task) => task.status === "active" && (!task.expiresAt || task.expiresAt > now),
  );
  const completions = await ctx.db
    .query("taskCompletions")
    .withIndex("by_user", (q) => q.eq("userId", profile.userId))
    .collect();
  const verified = new Set(
    completions
      .filter((row) => row.status === "verified")
      .map((row) => String(row.taskId)),
  );
  const completionByTask = new Map(
    completions.map((row) => [String(row.taskId), row]),
  );

  const referred = await ctx.db
    .query("profiles")
    .withIndex("by_referredBy", (q) => q.eq("referredBy", profile._id))
    .collect();
  const qualification = await Promise.all(
    referred.map(async (referral) => {
      const rows = await ctx.db
        .query("taskCompletions")
        .withIndex("by_user", (q) => q.eq("userId", referral.userId))
        .collect();
      const distinct = new Set(
        rows
          .filter((row) => row.status === "verified")
          .map((row) => String(row.taskId)),
      );
      return distinct.size >= config.referralTaskTarget;
    }),
  );
  const qualified = qualification.filter(Boolean).length;

  const ledger = await ctx.db
    .query("ledger")
    .withIndex("by_user_createdAt", (q) => q.eq("userId", profile.userId))
    .order("desc")
    .take(5);

  const withdrawals = await ctx.db
    .query("withdrawals")
    .withIndex("by_user_requestedAt", (q) => q.eq("userId", profile.userId))
    .order("desc")
    .take(10);

  return {
    displayName: profile.displayName,
    username: profile.username,
    nexId: profile.nexId,
    referralCode: profile.referralCode,
    walletAddress: profile.walletAddress,
    restricted: profile.restricted,
    availableNex: roundNex(balance.availableNex),
    reservedNex: roundNex(balance.reservedNex),
    lifetimeMinedNex: roundNex(balance.lifetimeMinedNex),
    lifetimeTaskNex: roundNex(balance.lifetimeTaskNex),
    minWithdrawUsd: roundNex(config.minWithdrawNex * config.nexUsdRate),
    miningEnabled: config.miningEnabled,
    speed: {
      base: speed.base,
      taskBonus: speed.taskBonus,
      referralBonus: speed.referralBonus,
      total: speed.total,
    },
    todayNex: roundNex(miningDay?.minedNex ?? 0),
    dailyCapNex: config.dailyLimitNex,
    tasks: {
      available: tasks.filter(
        (task) => completionByTask.get(String(task._id))?.status !== "verified",
      ).length,
      pending: completions.filter(
        (row) => row.status === "pending" || row.status === "unavailable",
      ).length,
      completed: verified.size,
    },
    referrals: {
      total: referred.length,
      qualified,
      target: config.qualifiedReferralTarget,
      taskTarget: config.referralTaskTarget,
    },
    pendingWithdrawalNex: roundNex(
      withdrawals
        .filter(
          (row) => row.status === "requested" || row.status === "reviewing",
        )
        .reduce((sum, row) => sum + row.nexAmount, 0),
    ),
    withdrawalsEnabled: config.withdrawalsEnabled,
    treasuryAvailableUsd: config.treasuryAvailableUsd,
    ledger: ledger.map((row) => ({
      kind: row.kind,
      amountNex: row.amountNex,
      memo: row.memo,
    })),
  };
}

function buildUserReply(
  chatId: string | undefined,
  account: UserAccount | null,
  raw: string,
  appUrl: string,
): { text: string; openApp: boolean } {
  const command = normalizeCommand(raw);
  const appButton =
    Boolean(chatId && appUrl) &&
    USER_COMMANDS.has(command) &&
    command !== "/help" &&
    command !== "/terms";
  const referralLink =
    account && chatId
      ? `https://t.me/${(process.env.TELEGRAM_BOT_USERNAME ?? "nexpool_desk_bot").replace(/^@/, "")}?start=${account.referralCode}`
      : null;

  if (!account) {
    return {
      text: [
        "NEXPOOL 🛠️",
        "",
        "Anything here can only be answered from your NEXPOOL account.",
        "The account itself is created inside the mini app from your verified Telegram identity — this bot never invents balances or rewards.",
        "",
        "Tap Open NEXPOOL App to create your account, mine, complete verified tasks and invite friends.",
      ].join("\n"),
      openApp: true,
    };
  }

  const head = `NEXPOOL · ${command.slice(1).toUpperCase()}`;
  let body: string;
  let extra: string[] = [];

  switch (command) {
    case "/start":
      body = [
        `Welcome to NEXPOOL! 👋`,
        `Account ${account.nexId} is live with the same ledger as this bot.`,
        `Available: ${account.availableNex} NEX · speed ${account.speed.total} NEX/h.`,
        "Mine, complete verified tasks and invite friends — rewards post to your ledger once the backend confirms them.",
      ].join("\n");
      extra = ["Open the mini app for the full dashboard."];
      break;
    case "/app":
      body = "NEXPOOL opens here 👇";
      break;
    case "/balance":
      body = [
        head,
        `Available ${account.availableNex} NEX`,
        `Reserved ${account.reservedNex} NEX`,
        `Lifetime mined ${account.lifetimeMinedNex} NEX · tasks ${account.lifetimeTaskNex} NEX`,
        "Reference value only — redemption depends on the funding pool.",
      ].join("\n");
      break;
    case "/mining":
      body = account.miningEnabled
        ? [
            head,
            `Today ${account.todayNex} / ${roundNex(account.dailyCapNex)} NEX`,
            `Speed ${account.speed.total} NEX/h (base ${account.speed.base} · tasks +${account.speed.taskBonus} · referrals +${account.speed.referralBonus})`,
            account.todayNex >= account.dailyCapNex
              ? "Daily cap reached — accrual resumes at 00:00 UTC."
              : "Open the app to start or check your session.",
          ].join("\n")
        : [
            head,
            "Mining is paused by the operator. Balances are safe; no NEX accrues while paused.",
          ].join("\n");
      break;
    case "/tasks":
      body = [
        head,
        `Available ${account.tasks.available} · in review ${account.tasks.pending} · completed ${account.tasks.completed}`,
        "Rewards settle only after backend verification — a button click never counts.",
      ].join("\n");
      break;
    case "/referral":
      body = [
        head,
        `Qualified ${account.referrals.qualified} / ${account.referrals.target}`,
        `Each referral must complete ${account.referrals.taskTarget} verified tasks to count.`,
        referralLink ? `Link: ${referralLink}` : "Open the app to get your link.",
      ].join("\n");
      break;
    case "/wallet":
      body = [
        head,
        `Available ${account.availableNex} NEX · reserved ${account.reservedNex} NEX`,
        `Pending payouts ${account.pendingWithdrawalNex} NEX`,
        account.walletAddress
          ? `Destination ${account.walletAddress.slice(0, 6)}…${account.walletAddress.slice(-6)} (TON)`
          : "No TON wallet linked yet — connect one in the app.",
      ].join("\n");
      break;
    case "/deposit": {
      const address = treasuryAddress();
      body =
        address && isValidTonAddress(address)
          ? [
              head,
              "Buy NEX with TON from Telegram Wallet.",
              `Treasury ${address.slice(0, 6)}…${address.slice(-6)} · TON mainnet`,
              `Minimum ${MIN_DEPOSIT_TON} TON per deposit.`,
              "Open the app to lock a quote and get your payment reference. The TON transfer must include that reference.",
              "NEX is credited automatically after the backend verifies the transfer on-chain.",
            ].join("\n")
          : [
              head,
              "Deposits are offline until the operator configures the TON treasury wallet.",
              "Open the app for the current deposit status.",
            ].join("\n");
      break;
    }
    case "/withdraw": {
      const liquidityOk = account.treasuryAvailableUsd >= account.minWithdrawUsd;
      body = [
        head,
        account.withdrawalsEnabled ? "Withdrawal desk: open" : "Withdrawals paused by the operator",
        `Available ${account.availableNex} NEX · reserved ${account.reservedNex} NEX`,
        account.walletAddress
          ? "Destination linked ✓"
          : "No destination wallet linked ✗",
        liquidityOk
          ? "Payout liquidity reported ✓"
          : "Payout liquidity below the minimum ✗ — conversion waits until the pool is funded.",
        "Full eligibility checklist lives in the app.",
      ].join("\n");
      break;
    }
    case "/history":
      body = [
        head,
        ...account.ledger.map(
          (row) =>
            `${row.amountNex >= 0 ? "+" : "-"}${Math.abs(row.amountNex)} NEX · ${row.memo}`,
        ),
        "Full ledger in the app (Wallet → History).",
      ].join("\n");
      break;
    case "/help":
      body = [
        "NEXPOOL · USER COMMANDS",
        "/balance  available, reserved, lifetime NEX",
        "/mining   today's accrual, speed, daily cap",
        "/tasks    available and in-review tasks",
        "/referral your invite link and qualification",
        "/wallet   balances, payouts, destination wallet",
        "/deposit  buy NEX with TON",
        "/withdraw eligibility snapshot",
        "/history  recent ledger entries",
        "/terms    rules summary",
        "/support  reach the operator",
        "/app      open the mini app",
      ].join("\n");
      break;
    case "/terms":
      body = [
        "NEXPOOL · RULES",
        "1. Rewards are backend-verified only; nothing is simulated.",
        `2. Daily mining cap ${roundNex(account.dailyCapNex)} NEX at server time.`,
        `3. A referral counts after ${account.referrals.taskTarget} verified tasks; withdrawals need ${account.referrals.target} qualified referrals.`,
        "4. NEX converts at the published reference rate while the reward pool is funded.",
        "5. Fraud, self-referrals and duplicates are rejected by the engine, not by chat moderators.",
        "6. Operators can pause mining, tasks and payouts; paused services accrue nothing.",
      ].join("\n");
      break;
    case "/support":
      body = [
        "NEXPOOL · SUPPORT",
        "Reply to this chat — messages are logged and reviewed by the operator desk.",
        "Account issues: open the app → Profile → Report a problem (writes to the audit trail).",
      ].join("\n");
      break;
    default:
      body = `Unknown command. Send /help for the NEXPOOL command list.`;
  }

  return {
    text: extra.length > 0 ? `${body}\n\n${extra[0]}` : body,
    openApp: appButton,
  };
}

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

/**
 * Called by the Telegram webhook after the request is authenticated.
 * User-facing commands read the same accounts and ledger the mini app uses;
 * desk commands remain available for the operator console.
 */
export const handleIncoming = internalMutation({
  args: {
    text: v.string(),
    chatId: v.optional(v.string()),
    source: v.optional(v.union(v.literal("telegram"), v.literal("console"))),
  },
  handler: async (ctx, args) => {
    let reply: string;
    let openApp = false;
    // Telegram chats only ever reach user-facing replies. Desk commands are
    // answered by the operator console (runConsoleCommand), never by the bot,
    // so pool and revenue internals are not exposed to arbitrary chats.
    if (args.chatId) {
      const user = await userSnapshot(ctx, args.chatId);
      const built = buildUserReply(
        args.chatId,
        user,
        args.text,
        process.env.MINI_APP_URL ??
          process.env.APP_ORIGIN ??
          process.env.SITE_URL ??
          process.env.CONVEX_SITE_URL ??
          "",
      );
      reply = built.text;
      openApp = built.openApp;
    } else {
      const snapshot = await poolSnapshot(ctx);
      reply = buildReply(snapshot, args.text);
    }

    await logExchange(ctx, {
      text: args.text,
      reply,
      source: args.source ?? "telegram",
      chatId: args.chatId,
    });
    return { text: reply, openApp };
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
      secretRequired: Boolean(process.env.TELEGRAM_BOT_TOKEN),
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
 * Points Telegram at this deployment's webhook with a secret derived from the
 * bot token, so commands actually reach the engine without a separate secret.
 * Run it from the operator console; re-running is idempotent on Telegram's side.
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
    const secret = await telegramWebhookSecret();
    if (!secret) {
      throw new Error(
        "Could not derive a webhook secret from TELEGRAM_BOT_TOKEN.",
      );
    }
    const body: Record<string, unknown> = {
      url,
      allowed_updates: ["message", "edited_message"],
      drop_pending_updates: false,
      secret_token: secret,
    };

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
      detail: "derived secret token attached",
    });
    return { url, secretRequired: true };
  },
});
