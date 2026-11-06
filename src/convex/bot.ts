import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { action, internalMutation, mutation, query } from "./_generated/server";
import {
  audit,
  computeSpeed,
  dayKey,
  loadConfig,
  notifyUser,
  roundNex,
} from "./engine";
import { loadLevels } from "./levels";
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

/** Telegram command menu. User commands only; admin commands are hidden. */
export const COMMAND_MENU = [
  { command: "start", description: "Welcome to NEXPOOL" },
  { command: "app", description: "Open Mini App" },
  { command: "balance", description: "Check NEX balance" },
  { command: "mining", description: "Mining status" },
  { command: "level", description: "Your mining level" },
  { command: "tasks", description: "Available tasks" },
  { command: "missions", description: "Available missions" },
  { command: "referral", description: "Referral dashboard" },
  { command: "wallet", description: "Wallet information" },
  { command: "deposit", description: "Deposit NEX" },
  { command: "withdraw", description: "Withdraw NEX" },
  { command: "history", description: "Transaction history" },
  { command: "profile", description: "Your profile" },
  { command: "leaderboard", description: "Top miners" },
  { command: "achievements", description: "Your achievements" },
  { command: "bonus", description: "Available bonuses" },
  { command: "support", description: "Contact support" },
  { command: "terms", description: "Terms and conditions" },
  { command: "help", description: "Command guide" },
] as const;

const USER_COMMANDS = new Set([
  ...COMMAND_MENU.map((entry) => `/${entry.command}`),
  "/invite",
  "/notifications",
]);

const ADMIN_COMMANDS = new Set([
  "/admin",
  "/stats",
  "/users",
  "/broadcast",
  "/campaigns",
  "/levels",
  "/miningsettings",
  "/withdrawals",
  "/botstatus",
]);

const APP_BUTTONS: Record<string, { label: string; path: string }> = {
  "/start": { label: "Open NEXPOOL App", path: "/app" },
  "/app": { label: "Open Mini App", path: "/app" },
  "/balance": { label: "Open wallet", path: "/app/wallet" },
  "/mining": { label: "Open mining", path: "/app/mining" },
  "/level": { label: "Open progression", path: "/app/levels" },
  "/tasks": { label: "View all tasks", path: "/app/tasks" },
  "/missions": { label: "View missions", path: "/app/tasks" },
  "/referral": { label: "Invite friends", path: "/app/referrals" },
  "/invite": { label: "Invite friends", path: "/app/referrals" },
  "/wallet": { label: "Open wallet", path: "/app/wallet" },
  "/deposit": { label: "Open deposit page", path: "/app/deposit" },
  "/withdraw": { label: "Check eligibility", path: "/app/withdraw" },
  "/history": { label: "View full history", path: "/app/history" },
  "/profile": { label: "Open profile", path: "/app/profile" },
  "/leaderboard": { label: "Open app", path: "/app" },
  "/achievements": { label: "Open profile", path: "/app/profile" },
  "/bonus": { label: "Open progression", path: "/app/levels" },
  "/notifications": { label: "Notification settings", path: "/app/notifications" },
  "/support": { label: "Open profile", path: "/app/profile" },
};

const formatNex = (value: number) =>
  roundNex(Number.isFinite(value) ? value : 0).toFixed(9);
const formatNexSigned = (value: number) =>
  `${value < 0 ? "-" : "+"}${formatNex(Math.abs(value))}`;
const formatDate = (ts: number) => new Date(ts).toISOString().slice(0, 10);
const formatDateTime = (ts: number) =>
  new Date(ts).toISOString().slice(0, 16).replace("T", " ");
const check = (ok: boolean) => (ok ? "✓" : "✗");

function shortAddress(address: string | undefined) {
  if (!address) return "not linked";
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function normalizeCommand(raw: string) {
  return (
    raw
      .trim()
      .toLowerCase()
      .replace(/@\w+/, "")
      .split(/\s+/)[0] ?? ""
  );
}

type TaskRow = {
  title: string;
  rewardNex: number;
  speedBonusNexPerHour: number;
  category: string;
  status: "available" | "pending" | "verified" | "rejected" | "unavailable";
};

type UserAccount = {
  displayName: string;
  username: string | undefined;
  nexId: string;
  referralCode: string;
  walletAddress: string | undefined;
  restricted: boolean;
  createdAt: number;
  xp: number;
  hasReferrer: boolean;
  complianceCleared: boolean;
  isAdmin: boolean;
  notify: {
    tasks: boolean;
    mining: boolean;
    wallet: boolean;
    announcements: boolean;
  };
  level: {
    highestClaimed: number;
    currentName: string;
    claimedCount: number;
    next: {
      level: number;
      name: string;
      xpRequired: number;
      rewardNex: number;
      claimable: boolean;
      xpMissing: number;
    } | null;
    progressPct: number;
  };
  taskRows: TaskRow[];
  availableNex: number;
  reservedNex: number;
  lifetimeMinedNex: number;
  lifetimeTaskNex: number;
  minWithdrawUsd: number;
  minWithdrawNex: number;
  nexUsdRate: number;
  miningEnabled: boolean;
  speed: {
    base: number;
    taskBonus: number;
    referralBonus: number;
    levelBonus: number;
    total: number;
  };
  todayNex: number;
  dailyCapNex: number;
  tasks: { available: number; pending: number; completed: number };
  referrals: { total: number; qualified: number; target: number; taskTarget: number };
  pendingWithdrawalNex: number;
  withdrawalsEnabled: boolean;
  treasuryAvailableUsd: number;
  ledger: { kind: string; amountNex: number; memo: string; createdAt: number }[];
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
  const levels = await loadLevels(ctx);
  const claims = await ctx.db
    .query("levelClaims")
    .withIndex("by_user", (q) => q.eq("userId", profile.userId))
    .collect();
  const highestClaimed = claims.reduce(
    (max, claim) => Math.max(max, claim.level),
    0,
  );

  const now = Date.now();
  const miningDay = await ctx.db
    .query("miningDays")
    .withIndex("by_user_day", (q) =>
      q.eq("userId", profile.userId).eq("day", dayKey(now)),
    )
    .first();

  const tasks = (await ctx.db.query("tasks").collect()).filter(
    (task) =>
      task.status === "active" &&
      (!task.expiresAt || task.expiresAt > now) &&
      (!task.minLevel || highestClaimed >= task.minLevel),
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
  const taskRows: TaskRow[] = tasks.map((task) => {
    const completion = completionByTask.get(String(task._id));
    return {
      title: task.title,
      rewardNex: roundNex(task.rewardNex),
      speedBonusNexPerHour: roundNex(task.speedBonusNexPerHour),
      category: task.category,
      status: completion?.status ?? "available",
    };
  });

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

  const user = await ctx.db.get(profile.userId);
  const isAdmin =
    config.ownerUserId === profile.userId || user?.role === "admin";

  const xp = profile.xp ?? 0;
  const nextLevel = levels.find((row) => row.level === highestClaimed + 1) ?? null;
  const floorXp =
    levels.find((row) => row.level === highestClaimed)?.xpRequired ?? 0;
  const progressPct = nextLevel
    ? Math.min(
        100,
        Math.max(
          0,
          Math.round(
            ((xp - floorXp) /
              Math.max(1, nextLevel.xpRequired - floorXp)) *
              100,
          ),
        ),
      )
    : 100;

  return {
    displayName: profile.displayName,
    username: profile.username,
    nexId: profile.nexId,
    referralCode: profile.referralCode,
    walletAddress: profile.walletAddress,
    restricted: profile.restricted,
    createdAt: profile.createdAt,
    xp,
    hasReferrer: Boolean(profile.referredBy),
    complianceCleared: profile.complianceCleared,
    isAdmin,
    notify: {
      tasks: profile.notifyTasks,
      mining: profile.notifyMining,
      wallet: profile.notifyWallet,
      announcements: profile.notifyAnnouncements,
    },
    level: {
      highestClaimed,
      currentName:
        levels.find((row) => row.level === highestClaimed)?.name ?? "Unranked",
      claimedCount: claims.length,
      next: nextLevel
        ? {
            level: nextLevel.level,
            name: nextLevel.name,
            xpRequired: nextLevel.xpRequired,
            rewardNex: roundNex(nextLevel.rewardNex),
            claimable: xp >= nextLevel.xpRequired,
            xpMissing: Math.max(0, nextLevel.xpRequired - xp),
          }
        : null,
      progressPct,
    },
    taskRows,
    availableNex: roundNex(balance.availableNex),
    reservedNex: roundNex(balance.reservedNex),
    lifetimeMinedNex: roundNex(balance.lifetimeMinedNex),
    lifetimeTaskNex: roundNex(balance.lifetimeTaskNex),
    minWithdrawUsd: roundNex(config.minWithdrawNex * config.nexUsdRate),
    minWithdrawNex: config.minWithdrawNex,
    nexUsdRate: config.nexUsdRate,
    miningEnabled: config.miningEnabled,
    speed: {
      base: speed.base,
      taskBonus: speed.taskBonus,
      referralBonus: speed.referralBonus,
      levelBonus: speed.levelBonus,
      total: speed.total,
    },
    todayNex: roundNex(miningDay?.minedNex ?? 0),
    dailyCapNex: config.dailyLimitNex,
    tasks: {
      available: tasks.filter((task) => {
        const status = completionByTask.get(String(task._id))?.status;
        return !status || status === "rejected";
      }).length,
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
      createdAt: row.createdAt,
    })),
  };
}

function taskStatusLabel(status: TaskRow["status"]) {
  switch (status) {
    case "verified":
      return "completed";
    case "pending":
    case "unavailable":
      return "in review";
    case "rejected":
      return "retry available";
    default:
      return "available";
  }
}

function taskLines(rows: TaskRow[], limit = 8) {
  if (rows.length === 0) return ["No active campaigns right now."];
  return rows.slice(0, limit).map((row, index) =>
    `${index + 1}. ${row.title} — ${formatNex(row.rewardNex)} NEX · +${formatNex(row.speedBonusNexPerHour)} NEX/h · ${taskStatusLabel(row.status)}`,
  );
}

function buildUserReply(
  account: UserAccount | null,
  raw: string,
  inviteCode?: string,
): { text: string; button?: { label: string; path: string } } {
  const command = normalizeCommand(raw);
  const button = USER_COMMANDS.has(command) ? APP_BUTTONS[command] : undefined;
  const referralLink = account
    ? `https://t.me/${(process.env.TELEGRAM_BOT_USERNAME ?? "NEXPOOLBOT").replace(/^@/, "")}?start=${account.referralCode}`
    : null;

  if (!account) {
    if (command === "/start") {
      return {
        text: [
          "Welcome to NEXPOOL! 👋",
          "",
          "Your journey starts here.",
          "",
          "⛏️ Mine NEX slowly, complete verified tasks, level up, and invite friends.",
          "🏆 Unlock rewards as you progress.",
          "",
          "Your NEXPOOL account is created inside the mini app from your verified Telegram identity. No balance or reward is invented here.",
          inviteCode
            ? `Invite code ${inviteCode} is attached to this start — open the app to bind it to your new account.`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
        button: { label: "OPEN NEXPOOL APP", path: "/app" },
      };
    }
    return {
      text: [
        "NEXPOOL",
        "",
        "This command can only be answered from a NEXPOOL account.",
        "Open the mini app to create your account from your verified Telegram identity — no balance or reward is invented here.",
      ].join("\n"),
      button: { label: "OPEN NEXPOOL APP", path: "/app" },
    };
  }

  let body: string;
  const extra: string[] = [];

  switch (command) {
    case "/start":
      body = [
        "Welcome to NEXPOOL! 👋",
        "",
        "Your journey starts here.",
        "",
        "⛏️ Mine NEX slowly, complete verified tasks, level up, and invite friends.",
        "🏆 Unlock rewards as you progress.",
        "",
        `Account: ${account.nexId}`,
        `Available: ${formatNex(account.availableNex)} NEX`,
        `Mining speed: ${formatNex(account.speed.total)} NEX/h`,
        `Level: ${account.level.highestClaimed} — ${account.level.currentName} · ${account.xp} XP`,
        "",
        "Every reward is credited by the backend after verification — this bot never invents a balance.",
      ].join("\n");
      if (inviteCode) {
        extra.push(
          account.hasReferrer
            ? `This account already has a referrer, so invite code ${inviteCode} was not applied.`
            : `Invite code ${inviteCode} is attached to this start — open the app to bind it to your account.`,
        );
      }
      break;
    case "/app":
      body = [
        "Open your NEXPOOL dashboard to manage your account.",
        "",
        "Mining, tasks, levels, referrals, deposits and withdrawals all read the same Convex ledger as this bot.",
      ].join("\n");
      break;
    case "/balance":
      body = [
        "💰 YOUR NEXPOOL BALANCE",
        "",
        `Available: ${formatNex(account.availableNex)} NEX`,
        `Reserved: ${formatNex(account.reservedNex)} NEX`,
        `Pending payouts: ${formatNex(account.pendingWithdrawalNex)} NEX`,
        "",
        `Lifetime mined: ${formatNex(account.lifetimeMinedNex)} NEX`,
        `Lifetime task rewards: ${formatNex(account.lifetimeTaskNex)} NEX`,
        "",
        "Reference value: subject to redemption terms and pool funding.",
        "Use /wallet for withdrawal eligibility.",
      ].join("\n");
      break;
    case "/mining": {
      const capReached = account.todayNex >= account.dailyCapNex;
      const status = account.restricted
        ? "🔴 ACCOUNT RESTRICTED"
        : !account.miningEnabled
          ? "🔴 PAUSED BY OPERATOR"
          : capReached
            ? "🟡 DAILY CAP REACHED"
            : "🟢 ACTIVE";
      body = [
        "⛏️ NEXPOOL MINING",
        "",
        `Status: ${status}`,
        `Level: ${account.level.highestClaimed} — ${account.level.currentName}`,
        "",
        "Mining speed:",
        `${formatNex(account.speed.total)} NEX / hour`,
        `(base ${formatNex(account.speed.base)} · tasks +${formatNex(account.speed.taskBonus)} · referrals +${formatNex(account.speed.referralBonus)} · levels +${formatNex(account.speed.levelBonus)})`,
        "",
        "Earned today:",
        `${formatNex(account.todayNex)} / ${formatNex(account.dailyCapNex)} NEX`,
        "",
        account.restricted
          ? "This account is restricted. No NEX accrues until support clears it."
          : !account.miningEnabled
            ? "The operator paused mining. Balances are safe; no NEX accrues while paused."
            : capReached
              ? "Daily cap reached — accrual resumes at 00:00 UTC."
              : "Accrual is continuous and server-timed. There is no start/stop session to manage.",
      ].join("\n");
      break;
    }
    case "/tasks":
    case "/missions":
      body = [
        command === "/missions" ? "🎯 NEXPOOL MISSIONS" : "🎯 NEXPOOL TASKS",
        "",
        `Available ${account.tasks.available} · in review ${account.tasks.pending} · completed ${account.tasks.completed}`,
        "",
        command === "/missions" ? "Active campaigns:" : "Available verified campaigns:",
        ...taskLines(account.taskRows),
        "",
        command === "/missions"
          ? "Campaigns pay once per verified completion; there is no separate daily reset."
          : "Complete tasks to earn rewards and XP. Rewards settle only after backend verification — a button click never counts.",
      ].join("\n");
      break;
    case "/referral":
    case "/invite":
      body = [
        "👥 YOUR REFERRALS",
        "",
        `Total invited: ${account.referrals.total}`,
        `Qualified: ${account.referrals.qualified}`,
        `Pending qualification: ${Math.max(0, account.referrals.total - account.referrals.qualified)}`,
        "",
        `Each referral must complete ${account.referrals.taskTarget} distinct verified tasks.`,
        "",
        "Your referral link:",
        referralLink ?? "Open the app to get your link.",
      ].join("\n");
      break;
    case "/wallet": {
      const minMet = account.availableNex >= account.minWithdrawNex;
      const referralsMet = account.referrals.qualified >= account.referrals.target;
      const walletMet = Boolean(account.walletAddress);
      const complianceMet = account.complianceCleared && !account.restricted;
      const liquidityMet = account.treasuryAvailableUsd >= account.minWithdrawUsd;
      body = [
        "💎 NEXPOOL WALLET",
        "",
        `Available: ${formatNex(account.availableNex)} NEX`,
        `Reserved: ${formatNex(account.reservedNex)} NEX`,
        `Pending payouts: ${formatNex(account.pendingWithdrawalNex)} NEX`,
        "",
        `Minimum withdrawal: ${formatNex(account.minWithdrawNex)} NEX`,
        "Withdrawal requirements:",
        `${check(minMet)} At least ${formatNex(account.minWithdrawNex)} NEX available`,
        `${check(referralsMet)} At least ${account.referrals.target} qualified referrals (${account.referrals.qualified}/${account.referrals.target})`,
        `• Each referral completes ${account.referrals.taskTarget} verified tasks`,
        `${check(walletMet)} TON payout wallet linked`,
        `${check(complianceMet)} Compliance review cleared`,
        `${check(account.withdrawalsEnabled)} Payout desk open`,
        `${check(liquidityMet)} Pool covers the minimum payout`,
        "",
        `Destination: ${shortAddress(account.walletAddress)}`,
      ].join("\n");
      break;
    }
    case "/deposit": {
      const address = treasuryAddress();
      body =
        address && isValidTonAddress(address)
          ? [
              "💳 DEPOSIT",
              "",
              "Buy NEX with TON from a TON Connect wallet.",
              `Treasury: ${shortAddress(address)} · TON mainnet`,
              `Minimum ${MIN_DEPOSIT_TON} TON per deposit.`,
              "",
              "Open the app to lock a quote and get your payment reference. The TON transfer must include that reference.",
              "NEX is credited only after independent on-chain verification.",
            ].join("\n")
          : [
              "💳 DEPOSIT",
              "",
              "Deposits are offline until the operator configures the TON treasury wallet.",
              "Open the app for the current deposit status.",
            ].join("\n");
      break;
    }
    case "/withdraw": {
      const minMet = account.availableNex >= account.minWithdrawNex;
      const referralsMet = account.referrals.qualified >= account.referrals.target;
      const walletMet = Boolean(account.walletAddress);
      const complianceMet = account.complianceCleared && !account.restricted;
      const liquidityMet = account.treasuryAvailableUsd >= account.minWithdrawUsd;
      body = [
        "💸 WITHDRAWAL",
        "",
        account.withdrawalsEnabled
          ? "Withdrawal desk: open"
          : "Withdrawal desk: paused by the operator",
        `Available: ${formatNex(account.availableNex)} NEX · reserved ${formatNex(account.reservedNex)} NEX`,
        "",
        "Before requesting a withdrawal:",
        `${check(minMet)} Minimum ${formatNex(account.minWithdrawNex)} NEX available`,
        `${check(referralsMet)} ${account.referrals.target} qualified referrals (${account.referrals.qualified}/${account.referrals.target})`,
        `• Each referral completes ${account.referrals.taskTarget} verified tasks`,
        `${check(walletMet)} TON payout wallet linked`,
        `${check(complianceMet)} Compliance review cleared`,
        `${check(liquidityMet)} Pool covers the minimum payout`,
        "",
        "Requests are reserved for manual review. This bot cannot approve or accelerate a payout.",
      ].join("\n");
      break;
    }
    case "/history":
      body = [
        "📜 ACCOUNT HISTORY",
        "",
        ...(account.ledger.length === 0
          ? ["No settled ledger entries yet."]
          : account.ledger.map(
              (row) =>
                `${formatDateTime(row.createdAt)} · ${formatNexSigned(row.amountNex)} NEX · ${row.memo}`,
            )),
        "",
        "Only settled ledger entries are shown. Pending claims are not history.",
      ].join("\n");
      break;
    case "/level":
      body = [
        "🏆 YOUR MINING LEVEL",
        "",
        account.level.highestClaimed > 0
          ? `Level ${account.level.highestClaimed} — ${account.level.currentName.toUpperCase()}`
          : "Current rank: Unranked (Level 0)",
        `XP: ${account.xp}${account.level.next ? ` / ${account.level.next.xpRequired}` : ""}`,
        `Progress: ${account.level.progressPct}%`,
        `Claimed levels: ${account.level.claimedCount} / 10`,
        "",
        account.level.next
          ? [
              "Next level:",
              `Level ${account.level.next.level} — ${account.level.next.name.toUpperCase()}`,
              `${account.level.next.xpMissing > 0 ? `${account.level.next.xpMissing} XP to go` : "XP requirement met"}`,
              "Completion reward:",
              `${formatNex(account.level.next.rewardNex)} NEX`,
              "",
              account.level.next.claimable
                ? "🎉 This level is ready to claim. Open the progression screen — the backend credits the reward only when you claim it."
                : "Keep completing verified activities!",
            ].join("\n")
          : "Maximum level reached. Keep mining with the bonuses you have unlocked.",
      ].join("\n");
      break;
    case "/profile":
      body = [
        "👤 NEXPOOL PROFILE",
        "",
        `Name: ${account.displayName}`,
        `NEX ID: ${account.nexId}`,
        `Telegram: ${account.username ? `@${account.username}` : "linked · handle not set"}`,
        `Joined: ${formatDate(account.createdAt)}`,
        "",
        `Level: ${account.level.highestClaimed} — ${account.level.currentName}`,
        `XP: ${account.xp}`,
        `Mining speed: ${formatNex(account.speed.total)} NEX/h`,
        `Available: ${formatNex(account.availableNex)} NEX`,
        "",
        `Referrals: ${account.referrals.total} invited · ${account.referrals.qualified} qualified`,
        `Tasks: ${account.tasks.completed} verified · ${account.tasks.pending} in review`,
        `TON wallet: ${shortAddress(account.walletAddress)}`,
        "",
        `Notifications — tasks: ${account.notify.tasks ? "on" : "off"} · mining: ${account.notify.mining ? "on" : "off"} · wallet: ${account.notify.wallet ? "on" : "off"} · announcements: ${account.notify.announcements ? "on" : "off"}`,
      ].join("\n");
      break;
    case "/achievements": {
      const earned: string[] = [];
      if (account.tasks.completed >= 1) earned.push("🏅 First verified task");
      if (account.tasks.completed >= 5) earned.push("🏅 Task runner · 5 verified tasks");
      if (account.tasks.completed >= 10) earned.push("🏅 Campaign veteran · 10 verified tasks");
      if (account.referrals.total >= 1) earned.push("👥 First referral joined");
      if (account.referrals.qualified >= 3) earned.push("👥 Team builder · 3 qualified referrals");
      if (account.referrals.qualified >= 10) earned.push("👥 Network · 10 qualified referrals");
      if (account.level.highestClaimed >= 2) earned.push("🏆 Level 2 claimed");
      if (account.level.highestClaimed >= 5) earned.push("🏆 Level 5 claimed");
      if (account.level.highestClaimed >= 10) earned.push("🏆 Level 10 claimed");
      if (account.xp >= 1000) earned.push("⚡ 1,000 XP earned");
      body = [
        "🏅 YOUR ACHIEVEMENTS",
        "",
        ...(earned.length > 0
          ? earned
          : ["No milestones earned yet. Verified tasks, qualified referrals and claimed levels unlock them."]),
        "",
        "Badges are derived from verified backend activity — no cosmetic claim can mint one.",
      ].join("\n");
      break;
    }
    case "/bonus":
      body = [
        "🎁 AVAILABLE BONUSES",
        "",
        "Mining-speed bonuses currently active:",
        `• Verified tasks: +${formatNex(account.speed.taskBonus)} NEX/h`,
        `• Qualified referrals: +${formatNex(account.speed.referralBonus)} NEX/h (${account.referrals.qualified} qualified)`,
        `• Claimed levels: +${formatNex(account.speed.levelBonus)} NEX/h`,
        `• Total speed: ${formatNex(account.speed.total)} NEX/h`,
        "",
        account.level.next?.claimable
          ? `Claimable level reward: ${formatNex(account.level.next.rewardNex)} NEX — claim it in Progression. It is not credited until the backend records the claim.`
          : "No unclaimed level reward is available yet.",
        "No daily login or random bonus is configured.",
      ].join("\n");
      break;
    case "/notifications":
      body = [
        "🔔 NOTIFICATION PREFERENCES",
        "",
        `Task and level updates: ${account.notify.tasks ? "ON" : "OFF"}`,
        `Mining updates: ${account.notify.mining ? "ON" : "OFF"}`,
        `Wallet updates: ${account.notify.wallet ? "ON" : "OFF"}`,
        `Announcements: ${account.notify.announcements ? "ON" : "OFF"}`,
        "",
        "Change these in the mini app under Profile → Notifications.",
        "The bot only sends events the backend has confirmed; preferences never change balances.",
      ].join("\n");
      break;
    case "/leaderboard":
      body = "Leaderboard rankings are computed from verified XP. Open the app for the live table.";
      break;
    case "/help": {
      const lines = [
        "NEXPOOL · COMMAND GUIDE",
        "",
        "ACCOUNT",
        "/start  welcome and account state",
        "/app  open the mini app",
        "/profile  level, XP, join date, preferences",
        "/balance  available, reserved, pending payouts",
        "/leaderboard  top accounts by verified XP",
        "",
        "MINING & PROGRESSION",
        "/mining  live rate, today's accrual, daily cap",
        "/level  XP progress and next reward",
        "/tasks  active campaigns and their status",
        "/missions  available campaigns",
        "/achievements  milestones earned",
        "/bonus  active speed bonuses and claimable rewards",
        "",
        "REFERRALS",
        "/referral  invite count and qualification",
        "/invite  your personal referral link",
        "",
        "WALLET",
        "/wallet  balances, requirements, destination",
        "/deposit  buy NEX with TON",
        "/withdraw  eligibility checklist",
        "/history  settled ledger entries",
        "",
        "OTHER",
        "/notifications  notification preferences",
        "/support  contact the operator",
        "/terms  rules and reward conditions",
      ];
      if (account.isAdmin) {
        lines.push(
          "",
          "OPERATOR",
          "/admin  operator dashboard",
          "/stats  platform statistics",
          "/users  recent accounts",
          "/campaigns  campaign overview",
          "/levels  level ladder",
          "/miningsettings  mining configuration",
          "/withdrawals  pending payout queue",
          "/broadcast  send an announcement",
          "/botstatus  bot and webhook health",
        );
      }
      body = lines.join("\n");
      break;
    }
    case "/terms":
      body = [
        "NEXPOOL · RULES",
        "1. Rewards are backend-verified only; nothing is simulated.",
        `2. Mining accrues continuously at the configured rate, capped at ${formatNex(account.dailyCapNex)} NEX per UTC day.`,
        `3. A referral counts after ${account.referrals.taskTarget} distinct verified tasks; withdrawals require ${account.referrals.target} qualified referrals.`,
        `4. NEX converts at the published reference rate ($${account.nexUsdRate.toFixed(2)} USD per NEX) while the reward pool is funded. It is not a guaranteed price.`,
        "5. Fraud, self-referrals, duplicates and unverified claims are rejected by the engine.",
        "6. Operators can pause mining, tasks and payouts; paused services accrue nothing.",
        "7. One account per verified Telegram identity. Wallet linking and payouts require compliance review.",
      ].join("\n");
      break;
    case "/support":
      body = [
        "NEXPOOL · SUPPORT",
        "",
        "Reply to this chat — messages are logged and reviewed by the operator desk.",
        "Account issues: open the app → Profile → Report a problem (writes to the audit trail).",
        "Never send seed phrases or private keys to anyone, including support.",
      ].join("\n");
      break;
    default:
      body = "Unknown command. Send /help for the NEXPOOL command list.";
  }

  return {
    text: extra.length > 0 ? `${body}\n\n${extra.join("\n")}` : body,
    button,
  };
}

async function buildLeaderboardReply(
  ctx: MutationCtx,
  account: UserAccount,
): Promise<{ text: string; button?: { label: string; path: string } }> {
  const profiles = await ctx.db.query("profiles").take(500);
  const ranked = profiles
    .map((profile) => ({ profile, xp: profile.xp ?? 0 }))
    .sort(
      (a, b) => b.xp - a.xp || a.profile.createdAt - b.profile.createdAt,
    );
  const top = ranked.slice(0, 10);
  const myRank = ranked.findIndex(
    (row) => row.profile.nexId === account.nexId,
  ) + 1;

  return {
    text: [
      "🏆 NEXPOOL LEADERBOARD",
      "",
      "Ranked by verified XP — only backend-confirmed activity counts.",
      "",
      ...(top.length === 0
        ? ["No ranked accounts yet."]
        : top.map(
            (row, index) =>
              `${index + 1}. ${truncate(row.profile.displayName, 24)} · ${row.xp.toLocaleString("en-US")} XP`,
          )),
      "",
      myRank > 0
        ? `Your rank: #${myRank} · ${account.xp.toLocaleString("en-US")} XP`
        : "Complete verified tasks and qualify referrals to enter the ranking.",
    ].join("\n"),
    button: { label: "Open app", path: "/app" },
  };
}

async function buildAdminHome(
  ctx: MutationCtx,
): Promise<{ text: string; button?: { label: string; path: string } }> {
  const [profiles, tasks, completions, withdrawals] = await Promise.all([
    ctx.db.query("profiles").take(500),
    ctx.db.query("tasks").take(500),
    ctx.db.query("taskCompletions").take(500),
    ctx.db.query("withdrawals").take(500),
  ]);
  const pendingReviews = completions.filter(
    (row) => row.status === "pending" || row.status === "unavailable",
  ).length;
  const pendingPayouts = withdrawals.filter(
    (row) => row.status === "requested" || row.status === "reviewing",
  );
  return {
    text: [
      "NEXPOOL · ADMIN DASHBOARD",
      "",
      `Accounts: ${profiles.length} · Telegram linked ${profiles.filter((row) => row.telegramId).length}`,
      `Active campaigns: ${tasks.filter((row) => row.status === "active").length}`,
      `Task reviews waiting: ${pendingReviews}`,
      `Withdrawals waiting: ${pendingPayouts.length} · ${formatNex(pendingPayouts.reduce((sum, row) => sum + row.nexAmount, 0))} NEX`,
      "",
      "Financial actions stay in the admin console where they are permission-checked and audited.",
      "Send /help for the full operator command list.",
    ].join("\n"),
    button: { label: "Open admin console", path: "/admin" },
  };
}

async function buildAdminStats(
  ctx: MutationCtx,
): Promise<{ text: string; button?: { label: string; path: string } }> {
  const [profiles, balances, tasks, completions, withdrawals, config] =
    await Promise.all([
      ctx.db.query("profiles").take(500),
      ctx.db.query("balances").take(500),
      ctx.db.query("tasks").take(500),
      ctx.db.query("taskCompletions").take(500),
      ctx.db.query("withdrawals").take(500),
      loadConfig(ctx),
    ]);
  const available = balances.reduce((sum, row) => sum + row.availableNex, 0);
  const reserved = balances.reduce((sum, row) => sum + row.reservedNex, 0);
  const pendingPayouts = withdrawals.filter(
    (row) => row.status === "requested" || row.status === "reviewing",
  );
  const pendingReviews = completions.filter(
    (row) => row.status === "pending" || row.status === "unavailable",
  ).length;
  return {
    text: [
      "NEXPOOL · PLATFORM STATS",
      "",
      `Accounts: ${profiles.length}`,
      `Telegram linked: ${profiles.filter((row) => row.telegramId).length}`,
      `Restricted: ${profiles.filter((row) => row.restricted).length}`,
      "",
      `Available: ${formatNex(available)} NEX`,
      `Reserved: ${formatNex(reserved)} NEX`,
      `Pending payouts: ${pendingPayouts.length} · ${formatNex(pendingPayouts.reduce((sum, row) => sum + row.nexAmount, 0))} NEX`,
      "",
      `Active campaigns: ${tasks.filter((row) => row.status === "active").length}`,
      `Task reviews waiting: ${pendingReviews}`,
      `Verified tasks: ${completions.filter((row) => row.status === "verified").length}`,
      "",
      `Mining: ${config.miningEnabled ? "enabled" : "paused"} · withdrawals: ${config.withdrawalsEnabled ? "open" : "paused"}`,
      `Treasury reported: $${config.treasuryAvailableUsd.toFixed(2)}`,
    ].join("\n"),
    button: { label: "Open admin console", path: "/admin" },
  };
}

async function buildAdminUsers(
  ctx: MutationCtx,
): Promise<{ text: string; button?: { label: string; path: string } }> {
  const profiles = await ctx.db.query("profiles").take(500);
  const recent = [...profiles]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 10);
  const lines: string[] = [];
  for (const profile of recent) {
    const [balance, completions] = await Promise.all([
      ctx.db
        .query("balances")
        .withIndex("by_user", (q) => q.eq("userId", profile.userId))
        .first(),
      ctx.db
        .query("taskCompletions")
        .withIndex("by_user", (q) => q.eq("userId", profile.userId))
        .take(500),
    ]);
    lines.push(
      `• ${profile.nexId} · ${truncate(profile.displayName, 20)} · ${formatNex(balance?.availableNex ?? 0)} NEX · ${completions.filter((row) => row.status === "verified").length} tasks${profile.restricted ? " · RESTRICTED" : ""}`,
    );
  }
  return {
    text: [
      "NEXPOOL · RECENT ACCOUNTS",
      "",
      ...(lines.length > 0 ? lines : ["No accounts yet."]),
      "",
      `${profiles.length} accounts total · ${profiles.filter((row) => row.telegramId).length} Telegram linked`,
      "Use the admin console for account actions.",
    ].join("\n"),
    button: { label: "Open admin console", path: "/admin" },
  };
}

async function buildAdminCampaigns(
  ctx: MutationCtx,
): Promise<{ text: string; button?: { label: string; path: string } }> {
  const [tasks, completions] = await Promise.all([
    ctx.db.query("tasks").take(500),
    ctx.db.query("taskCompletions").take(500),
  ]);
  const recent = [...tasks]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 10);
  const lines = recent.map((task) => {
    const verified = completions.filter(
      (row) => row.taskId === task._id && row.status === "verified",
    ).length;
    const pending = completions.filter(
      (row) =>
        row.taskId === task._id &&
        (row.status === "pending" || row.status === "unavailable"),
    ).length;
    return `• [${task.status}] ${truncate(task.title, 38)} · ${formatNex(task.rewardNex)} NEX · verified ${verified} · pending ${pending}`;
  });
  return {
    text: [
      "NEXPOOL · CAMPAIGNS",
      "",
      `Active ${tasks.filter((row) => row.status === "active").length} · paused ${tasks.filter((row) => row.status === "paused").length} · archived ${tasks.filter((row) => row.status === "archived").length}`,
      "",
      ...(lines.length > 0 ? lines : ["No campaigns yet."]),
      "",
      "Campaign creation and verification stay in the admin console.",
    ].join("\n"),
    button: { label: "Open admin console", path: "/admin" },
  };
}

async function buildAdminLevels(
  ctx: MutationCtx,
): Promise<{ text: string; button?: { label: string; path: string } }> {
  const levels = await loadLevels(ctx);
  return {
    text: [
      "NEXPOOL · LEVEL LADDER",
      "",
      ...levels.map(
        (row) =>
          `L${row.level} ${row.name} · ${row.xpRequired.toLocaleString("en-US")} XP · ${formatNex(row.rewardNex)} NEX · +${formatNex(row.speedBonusNexPerHour)} NEX/h`,
      ),
      "",
      "Edits are validated and audited in the admin console.",
    ].join("\n"),
    button: { label: "Open admin console", path: "/admin" },
  };
}

async function buildAdminMiningSettings(
  ctx: MutationCtx,
): Promise<{ text: string; button?: { label: string; path: string } }> {
  const config = await loadConfig(ctx);
  return {
    text: [
      "NEXPOOL · MINING SETTINGS",
      "",
      `Mining: ${config.miningEnabled ? "enabled" : "paused"}`,
      `Base rate: ${formatNex(config.baseRateNexPerHour)} NEX/h`,
      `Daily cap: ${formatNex(config.dailyLimitNex)} NEX / UTC day`,
      `Referral bonus: ${formatNex(config.referralBonusNexPerHour)} NEX/h · cap ${config.referralBonusCap}`,
      `Referral requirement: ${config.referralTaskTarget} tasks · ${config.qualifiedReferralTarget} qualified`,
      "",
      `NEX reference: $${config.nexUsdRate.toFixed(2)} · TON reference: $${config.tonUsdRate.toFixed(2)}`,
      `Minimum withdrawal: ${formatNex(config.minWithdrawNex)} NEX`,
      `Withdrawals: ${config.withdrawalsEnabled ? "open" : "paused"}`,
      `Treasury reported: $${config.treasuryAvailableUsd.toFixed(2)}`,
      `Bot token: ${process.env.TELEGRAM_BOT_TOKEN ? "configured" : "missing"}`,
      "",
      "Change these in the admin console. Every edit is audited.",
    ].join("\n"),
    button: { label: "Open admin console", path: "/admin" },
  };
}

async function buildAdminWithdrawals(
  ctx: MutationCtx,
): Promise<{ text: string; button?: { label: string; path: string } }> {
  const withdrawals = await ctx.db.query("withdrawals").take(500);
  const pending = withdrawals.filter(
    (row) => row.status === "requested" || row.status === "reviewing",
  );
  const lines: string[] = [];
  for (const row of pending.slice(0, 10)) {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", row.userId))
      .first();
    lines.push(
      `• ${profile?.nexId ?? "unknown"} · ${formatNex(row.nexAmount)} NEX → ${row.tonAmount} TON · ${row.destination.slice(0, 6)}…${row.destination.slice(-4)} · ${row.status}`,
    );
  }
  const paid = withdrawals.filter((row) => row.status === "paid");
  return {
    text: [
      "NEXPOOL · WITHDRAWAL QUEUE",
      "",
      `Pending: ${pending.length} · ${formatNex(pending.reduce((sum, row) => sum + row.nexAmount, 0))} NEX`,
      `Paid all time: ${paid.length} · ${formatNex(paid.reduce((sum, row) => sum + row.nexAmount, 0))} NEX`,
      "",
      ...(lines.length > 0 ? lines : ["No withdrawal requests waiting."]),
      "",
      "Review, pay or reject in the admin console. A payout requires a confirmed on-chain hash and is audited.",
    ].join("\n"),
    button: { label: "Open admin console", path: "/admin" },
  };
}

async function buildAdminBotStatus(
  ctx: MutationCtx,
): Promise<{ text: string; button?: { label: string; path: string } }> {
  const [messages, settings, profiles] = await Promise.all([
    ctx.db
      .query("botMessages")
      .withIndex("by_ts")
      .order("desc")
      .take(10),
    ctx.db
      .query("botSettings")
      .withIndex("by_key", (q) => q.eq("key", BOT_KEY))
      .first(),
    ctx.db.query("profiles").take(500),
  ]);
  const inbound = messages.find((row) => row.direction === "inbound");
  const outbound = messages.find((row) => row.direction === "outbound");
  const siteUrl = process.env.CONVEX_SITE_URL ?? "(not set)";
  return {
    text: [
      "NEXPOOL · BOT STATUS",
      "",
      `Bot token: ${process.env.TELEGRAM_BOT_TOKEN ? "configured" : "missing"}`,
      `Webhook: ${siteUrl}/telegram/webhook`,
      `Command menu: ${COMMAND_MENU.length} user commands`,
      `Desk alerts: ${settings?.enabled ? "enabled" : "disabled"}`,
      `Accounts: ${profiles.length} · Telegram linked ${profiles.filter((row) => row.telegramId).length}`,
      "",
      inbound ? `Last inbound: ${formatDateTime(inbound.ts)}` : "No inbound messages recorded.",
      outbound ? `Last outbound: ${formatDateTime(outbound.ts)}` : "No outbound messages recorded.",
      "",
      "Health data is read from the same Convex deployment as the mini app.",
    ].join("\n"),
    button: { label: "Open bot console", path: "/admin/bot" },
  };
}

async function buildAdminBroadcast(
  ctx: MutationCtx,
  raw: string,
  account: UserAccount,
): Promise<{ text: string; button?: { label: string; path: string } }> {
  const payload = raw
    .trim()
    .replace(/^\/broadcast(?:@\w+)?\s*/i, "")
    .trim();
  const separator = payload.indexOf("|");
  const title = separator >= 0 ? payload.slice(0, separator).trim() : "";
  const body = separator >= 0 ? payload.slice(separator + 1).trim() : "";
  if (title.length < 3 || title.length > 60 || body.length < 5) {
    return {
      text: [
        "NEXPOOL · BROADCAST",
        "",
        "Usage:",
        "/broadcast Title | Message body",
        "",
        "The title must be 3–60 characters and the body at least 5 characters.",
        "Messages are queued for every account and respect each user's announcement preference.",
      ].join("\n"),
      button: { label: "Open admin console", path: "/admin" },
    };
  }
  if (body.length > 3000) {
    return {
      text: "Broadcast body is too long. Keep it under 3,000 characters.",
      button: { label: "Open admin console", path: "/admin" },
    };
  }

  const profiles = await ctx.db.query("profiles").take(500);
  for (const profile of profiles) {
    await notifyUser(ctx, profile, "announcement", title, body);
  }
  await audit(
    ctx,
    { label: `telegram:${account.nexId}` },
    "announcement.broadcast",
    `${title} · queued for ${profiles.length} accounts via Telegram admin`,
  );
  return {
    text: [
      "NEXPOOL · BROADCAST QUEUED",
      "",
      `Title: ${title}`,
      `Queued for: ${profiles.length} accounts`,
      "",
      "Delivery is asynchronous and respects each account's announcement preference. This confirms a queue write, not per-chat delivery.",
    ].join("\n"),
    button: { label: "Open admin console", path: "/admin" },
  };
}

async function buildAdminReply(
  ctx: MutationCtx,
  command: string,
  raw: string,
  account: UserAccount,
): Promise<{ text: string; button?: { label: string; path: string } }> {
  if (!account.isAdmin) {
    return {
      text: "Operator authorization required. This command is restricted to NEXPOOL administrators.",
    };
  }
  switch (command) {
    case "/admin":
      return await buildAdminHome(ctx);
    case "/stats":
      return await buildAdminStats(ctx);
    case "/users":
      return await buildAdminUsers(ctx);
    case "/campaigns":
      return await buildAdminCampaigns(ctx);
    case "/levels":
      return await buildAdminLevels(ctx);
    case "/miningsettings":
      return await buildAdminMiningSettings(ctx);
    case "/withdrawals":
      return await buildAdminWithdrawals(ctx);
    case "/botstatus":
      return await buildAdminBotStatus(ctx);
    case "/broadcast":
      return await buildAdminBroadcast(ctx, raw, account);
    default:
      return { text: "Unknown operator command. Send /help for the command list." };
  }
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
    let button: { label: string; path: string } | undefined;
    let referralCode: string | undefined;
    // Telegram chats only ever reach user-facing replies. Desk commands are
    // answered by the operator console (runConsoleCommand), never by the bot,
    // so pool and revenue internals are not exposed to arbitrary chats.
    if (args.chatId) {
      // `https://t.me/<bot>?start=CODE` delivers a /start payload. Only a code
      // that belongs to a real profile is forwarded to the mini app button.
      const startPayload = /^\/start(?:@\w+)?\s+(\S+)$/i.exec(args.text.trim());
      const candidate = startPayload?.[1]?.trim().toUpperCase();
      if (candidate && /^[A-Z2-9]{6,12}$/.test(candidate)) {
        const inviter = await ctx.db
          .query("profiles")
          .withIndex("by_referralCode", (q) => q.eq("referralCode", candidate))
          .first();
        if (inviter) referralCode = candidate;
      }

      const user = await userSnapshot(ctx, args.chatId);
      const command = normalizeCommand(args.text);
      if (user && ADMIN_COMMANDS.has(command)) {
        const built = await buildAdminReply(ctx, command, args.text, user);
        reply = built.text;
        button = built.button;
      } else if (user && command === "/leaderboard") {
        const built = await buildLeaderboardReply(ctx, user);
        reply = built.text;
        button = built.button;
      } else if (ADMIN_COMMANDS.has(command)) {
        reply =
          "Operator authorization required. This command is restricted to NEXPOOL administrators.";
      } else {
        const built = buildUserReply(user, args.text, referralCode);
        reply = built.text;
        button = built.button;
      }
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
    return { text: reply, button, referralCode };
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
      botUsername: process.env.TELEGRAM_BOT_USERNAME ?? "@NEXPOOLBOT",
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

    // Keep Telegram's `/` menu in sync with the commands this bot answers.
    const menuResponse = await fetch(
      `https://api.telegram.org/bot${token}/setMyCommands`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commands: COMMAND_MENU }),
      },
    );
    const menuPayload = (await menuResponse.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
    };
    const menuSynced = menuResponse.ok && menuPayload.ok;

    await ctx.runMutation(internal.bot.recordWebhookRegistration, {
      url,
      detail: menuSynced
        ? `derived secret token attached · ${COMMAND_MENU.length} commands synced`
        : `derived secret token attached · command menu rejected: ${menuPayload.description ?? `HTTP ${menuResponse.status}`}`,
    });
    return {
      url,
      secretRequired: true,
      commandsSynced: menuSynced,
      commands: COMMAND_MENU.length,
    };
  },
});
