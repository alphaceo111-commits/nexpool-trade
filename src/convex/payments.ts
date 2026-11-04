import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import {
  CONFIG_KEY,
  audit,
  getViewer,
  loadConfig,
  notifyUser,
  requireProfile,
  roundNex,
} from "./engine";

/**
 * Real TON deposits, paid from the user's Telegram Wallet through TON Connect.
 *
 * Flow: the backend creates a deposit intent with a locked quote and a unique
 * memo. The client signs one transfer to the operator treasury with that memo.
 * NEX is credited only after the transfer is found on-chain by the backend's
 * TON indexer lookup (or the reconciliation cron). Nothing is credited from
 * client claims.
 */

const TON_NANO = 1_000_000_000;
export const MIN_DEPOSIT_TON = 1;
export const MAX_DEPOSIT_TON = 500;
const QUOTE_TTL_MS = 30 * 60_000;
const MATCH_WINDOW_MS = 72 * 60 * 60_000;
const OPEN_INTENT_LIMIT = 3;
const MEMO_PREFIX = "NP-";
const MEMO_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TX_LOOKUP_LIMIT = 100;

export function treasuryAddress(): string | null {
  const value = (
    process.env.TON_TREASURY_ADDRESS ??
    process.env.TON_DEPOSIT_ADDRESS ??
    ""
  ).trim();
  return value || null;
}

/** Mainnet friendly (EQ/UQ) or raw workchain address. */
export function isValidTonAddress(address: string) {
  if (/^[EU]Q[A-Za-z0-9_-]{46}$/.test(address)) return true;
  return /^-?\d+:[0-9a-fA-F]{64}$/.test(address);
}

function tonApiBase() {
  return (process.env.TONAPI_BASE_URL ?? "https://tonapi.io").replace(/\/$/, "");
}

function quoteNex(tonAmount: number, tonUsdRate: number, nexUsdRate: number) {
  if (nexUsdRate <= 0 || tonUsdRate <= 0) {
    throw new Error("Deposit pricing is not configured by the operator.");
  }
  return roundNex((tonAmount * tonUsdRate) / nexUsdRate);
}

function randomMemo() {
  let out = "";
  for (let i = 0; i < 8; i += 1) {
    out += MEMO_ALPHABET[Math.floor(Math.random() * MEMO_ALPHABET.length)];
  }
  return `${MEMO_PREFIX}${out}`;
}

async function uniqueMemo(ctx: MutationCtx) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const memo = randomMemo();
    const existing = await ctx.db
      .query("deposits")
      .withIndex("by_memo", (q) => q.eq("memo", memo))
      .first();
    if (!existing) return memo;
  }
  throw new Error("Could not allocate a deposit reference. Try again.");
}

function intentView(row: {
  _id: Id<"deposits">;
  memo: string;
  address: string;
  tonAmount: number;
  nanoAmount: string;
  quotedNex: number;
  expiresAt: number;
}) {
  return {
    id: row._id,
    memo: row.memo,
    address: row.address,
    tonAmount: row.tonAmount,
    nanoAmount: row.nanoAmount,
    quotedNex: row.quotedNex,
    expiresAt: row.expiresAt,
  };
}

/** Deposit capability, rates, recent intents and linked payout wallet. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    const { userId, profile, balance } = await getViewer(ctx);
    if (!userId || !profile || !balance) return null;

    const config = await loadConfig(ctx);
    const address = treasuryAddress();
    const validAddress = Boolean(address && isValidTonAddress(address));
    const priced = config.nexUsdRate > 0 && config.tonUsdRate > 0;
    const enabled = Boolean(validAddress && priced);
    const now = Date.now();

    const rows = await ctx.db
      .query("deposits")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", profile.userId))
      .order("desc")
      .take(12);

    return {
      enabled,
      reason: !address
        ? "TON deposits are offline: the NEXPOOL treasury wallet has not been configured by the operator yet."
        : !validAddress
          ? "TON deposits are offline: the configured treasury wallet is not a valid TON mainnet address."
          : !priced
            ? "TON deposits are offline: the operator has not set the TON and NEX reference rates."
            : null,
      address: validAddress ? address : null,
      network: "TON mainnet",
      minTon: MIN_DEPOSIT_TON,
      maxTon: MAX_DEPOSIT_TON,
      nexPerTon: priced ? roundNex(config.tonUsdRate / config.nexUsdRate) : 0,
      reference: {
        nexUsdRate: config.nexUsdRate,
        tonUsdRate: config.tonUsdRate,
      },
      wallet: {
        connected: Boolean(profile.walletAddress),
        address: profile.walletAddress,
        network: profile.walletNetwork,
        app: profile.walletApp,
        connectedAt: profile.walletConnectedAt,
      },
      reservedNex: roundNex(balance.reservedNex),
      serverNow: now,
      deposits: rows.map((row) => ({
        ...intentView(row),
        status: row.status,
        receivedTon: row.receivedTon,
        creditedNex: row.creditedNex,
        txHash: row.txHash,
        createdAt: row.createdAt,
        paidAt: row.paidAt,
        note: row.note,
        expired: row.status === "pending" && now > row.expiresAt,
      })),
      sources: [
        { kind: "mining", label: "Mining accrual" },
        { kind: "task", label: "Verified task rewards" },
        { kind: "referral", label: "Referral bonuses" },
      ],
    };
  },
});

/** Locks a quote and returns the exact address, amount and memo to pay. */
export const createDeposit = mutation({
  args: { tonAmount: v.number() },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx);
    const address = treasuryAddress();
    if (!address || !isValidTonAddress(address)) {
      throw new Error(
        "Deposits are offline: the operator has not configured a valid TON treasury address.",
      );
    }
    const config = await loadConfig(ctx);
    const tonAmount = Math.round((Number.isFinite(args.tonAmount) ? args.tonAmount : 0) * 100) / 100;
    if (tonAmount < MIN_DEPOSIT_TON) {
      throw new Error(`The minimum deposit is ${MIN_DEPOSIT_TON} TON.`);
    }
    if (tonAmount > MAX_DEPOSIT_TON) {
      throw new Error(`The maximum single deposit is ${MAX_DEPOSIT_TON} TON.`);
    }
    const quotedNex = quoteNex(tonAmount, config.tonUsdRate, config.nexUsdRate);

    const now = Date.now();
    const recent = await ctx.db
      .query("deposits")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", profile.userId))
      .order("desc")
      .take(12);

    const reusable = recent.find(
      (row) =>
        row.status === "pending" &&
        now < row.expiresAt &&
        row.address === address &&
        row.tonAmount === tonAmount,
    );
    if (reusable) return { ...intentView(reusable), reused: true };

    const open = recent.filter(
      (row) => row.status === "pending" && now < row.expiresAt,
    );
    if (open.length >= OPEN_INTENT_LIMIT) {
      throw new Error(
        `You already have ${OPEN_INTENT_LIMIT} open deposit quotes. Complete or wait for one to expire before creating another.`,
      );
    }

    const memo = await uniqueMemo(ctx);
    const id = await ctx.db.insert("deposits", {
      userId: profile.userId,
      nexId: profile.nexId,
      memo,
      address,
      tonAmount,
      nanoAmount: String(Math.round(tonAmount * TON_NANO)),
      quotedNex,
      nexUsdRate: config.nexUsdRate,
      tonUsdRate: config.tonUsdRate,
      status: "pending",
      createdAt: now,
      expiresAt: now + QUOTE_TTL_MS,
    });

    return {
      ...intentView({
        _id: id,
        memo,
        address,
        tonAmount,
        nanoAmount: String(Math.round(tonAmount * TON_NANO)),
        quotedNex,
        expiresAt: now + QUOTE_TTL_MS,
      }),
      reused: false,
    };
  },
});

type SettleResult = {
  status: "confirmed" | "failed";
  creditedNex: number;
};

type PendingDepositRow = {
  _id: Id<"deposits">;
  memo: string;
  address: string;
  createdAt: number;
};

type TonApiTransaction = {
  hash?: string;
  lt?: string;
  utime?: number;
  now?: number;
  success?: boolean;
  in_msg?: {
    hash?: string;
    value?: string | number;
    source?: { address?: string };
    decoded_body?: { text?: string } | null;
    message_content?: { decoded?: { text?: string } | null } | null;
  } | null;
};

async function fetchTreasuryTransactions(address: string) {
  const headers: Record<string, string> = { accept: "application/json" };
  const key = process.env.TON_API_KEY;
  if (key) headers.authorization = `Bearer ${key}`;
  const response = await fetch(
    `${tonApiBase()}/v2/blockchain/accounts/${encodeURIComponent(address)}/transactions?limit=${TX_LOOKUP_LIMIT}`,
    { headers },
  );
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("The TON indexer is rate-limited right now. Try again in a minute.");
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error("The TON indexer rejected the API key. Check TON_API_KEY.");
    }
    throw new Error(`The TON indexer responded with HTTP ${response.status}.`);
  }
  const body = (await response.json()) as {
    transactions?: TonApiTransaction[];
  };
  return Array.isArray(body.transactions) ? body.transactions : [];
}

function commentOf(tx: TonApiTransaction) {
  const message = tx.in_msg;
  if (!message) return "";
  const candidates = [
    message.decoded_body?.text,
    message.message_content?.decoded?.text,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

function findPayment(transactions: TonApiTransaction[], memo: string) {
  for (const tx of transactions) {
    if (tx.success === false) continue;
    if (!tx.in_msg || tx.in_msg.value === undefined) continue;
    if (commentOf(tx) !== memo) continue;
    const nano = Number(tx.in_msg.value);
    if (!Number.isFinite(nano) || nano <= 0) continue;
    const seconds = tx.utime ?? tx.now;
    return {
      txHash: tx.hash ?? tx.in_msg.hash ?? `unknown-${tx.lt ?? Date.now()}`,
      receivedTon: Number((nano / TON_NANO).toFixed(9)),
      paidAt:
        typeof seconds === "number" && seconds > 0
          ? seconds * 1000
          : Date.now(),
    };
  }
  return null;
}

/** Internal read used by the verifier action; ownership is checked there. */
export const getDeposit = internalQuery({
  args: { depositId: v.id("deposits") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.depositId);
  },
});

/**
 * Verifies one intent against the treasury's on-chain transactions. Safe to
 * call repeatedly: settlement is idempotent and guarded by the transaction hash.
 */
export const verifyDeposit = action({
  args: { depositId: v.id("deposits") },
  handler: async (
    ctx,
    args,
  ): Promise<{ status: "confirmed" | "pending" | "failed"; creditedNex: number }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to verify a deposit.");
    const deposit = await ctx.runQuery(internal.payments.getDeposit, {
      depositId: args.depositId,
    });
    if (!deposit) throw new Error("That deposit does not exist.");
    if (deposit.userId !== userId) {
      throw new Error("That deposit belongs to another NEXPOOL account.");
    }
    if (deposit.status === "confirmed") {
      return { status: "confirmed" as const, creditedNex: deposit.creditedNex ?? 0 };
    }
    if (deposit.status === "failed") {
      return { status: "failed" as const, creditedNex: 0 };
    }

    let transactions: TonApiTransaction[];
    try {
      transactions = await fetchTreasuryTransactions(deposit.address);
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? error.message
          : "Could not reach the TON indexer. Try again shortly.",
      );
    }

    const payment = findPayment(transactions, deposit.memo);
    if (!payment) {
      return { status: "pending" as const, creditedNex: 0 };
    }

    const settled = await ctx.runMutation(internal.payments.settleDeposit, {
      depositId: args.depositId,
      ...payment,
    });
    return { status: settled.status, creditedNex: settled.creditedNex };
  },
});

/**
 * Credits a verified payment exactly once. Called by the client verifier and by
 * the reconciliation cron, never with client-supplied amounts.
 */
export const settleDeposit = internalMutation({
  args: {
    depositId: v.id("deposits"),
    txHash: v.string(),
    receivedTon: v.number(),
    paidAt: v.number(),
  },
  handler: async (ctx, args): Promise<SettleResult> => {
    const deposit = await ctx.db.get(args.depositId);
    if (!deposit) throw new Error("Deposit intent not found.");
    if (deposit.status === "confirmed") {
      return { status: "confirmed" as const, creditedNex: deposit.creditedNex ?? 0 };
    }
    if (deposit.status !== "pending") {
      return { status: "failed" as const, creditedNex: 0 };
    }

    const duplicate = await ctx.db
      .query("deposits")
      .withIndex("by_txHash", (q) => q.eq("txHash", args.txHash))
      .first();
    if (duplicate && duplicate._id !== deposit._id) {
      return { status: "failed" as const, creditedNex: 0 };
    }

    const receivedTon = Math.max(0, Number(args.receivedTon.toFixed(9)));
    const creditedNex = roundNex(
      (receivedTon * deposit.tonUsdRate) / Math.max(deposit.nexUsdRate, 1e-9),
    );
    const now = Date.now();
    if (creditedNex <= 0) {
      await ctx.db.patch(deposit._id, {
        status: "failed",
        txHash: args.txHash,
        receivedTon,
        verifiedAt: now,
        note: "The on-chain amount was too small to credit.",
      });
      return { status: "failed" as const, creditedNex: 0 };
    }

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", deposit.userId))
      .first();
    const balance = await ctx.db
      .query("balances")
      .withIndex("by_user", (q) => q.eq("userId", deposit.userId))
      .first();
    if (!profile || !balance) {
      throw new Error("The depositing account is not ready.");
    }

    const mismatch =
      Math.abs(receivedTon - deposit.tonAmount) > deposit.tonAmount * 0.02;

    await ctx.db.patch(deposit._id, {
      status: "confirmed",
      txHash: args.txHash,
      receivedTon,
      creditedNex,
      paidAt: args.paidAt,
      verifiedAt: now,
      note: mismatch
        ? `Received ${receivedTon} TON against a ${deposit.tonAmount} TON quote. Credited at the locked rate.`
        : undefined,
    });

    await ctx.db.insert("ledger", {
      userId: deposit.userId,
      kind: "deposit",
      amountNex: creditedNex,
      memo: `TON deposit · ${receivedTon} TON`,
      refId: args.txHash,
      createdAt: now,
    });

    await ctx.db.patch(balance._id, {
      availableNex: roundNex(balance.availableNex + creditedNex),
      updatedAt: now,
    });

    // Real TON arrived, so the payout reserve grows by its USD value.
    const configRow = await ctx.db
      .query("appConfig")
      .withIndex("by_key", (q) => q.eq("key", CONFIG_KEY))
      .first();
    if (configRow) {
      await ctx.db.patch(configRow._id, {
        treasuryAvailableUsd:
          Math.round(
            (configRow.treasuryAvailableUsd + receivedTon * deposit.tonUsdRate) * 100,
          ) / 100,
        updatedAt: now,
      });
    }

    await notifyUser(
      ctx,
      profile,
      "wallet",
      "Deposit confirmed",
      `${receivedTon} TON received and verified on-chain. ${creditedNex} NEX was credited to your confirmed balance.`,
    );

    await audit(
      ctx,
      { userId: profile.userId, label: profile.nexId },
      "deposit.confirmed",
      `${receivedTon} TON → ${creditedNex} NEX · ${args.txHash}`,
    );

    return { status: "confirmed" as const, creditedNex };
  },
});

export const pendingDeposits = internalQuery({
  args: {},
  handler: async (ctx): Promise<PendingDepositRow[]> => {
    const now = Date.now();
    const rows = await ctx.db
      .query("deposits")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(200);
    return rows
      .filter((row) => now - row.createdAt < MATCH_WINDOW_MS)
      .map((row) => ({
        _id: row._id,
        memo: row.memo,
        address: row.address,
        createdAt: row.createdAt,
      }));
  },
});

/** Marks intents that were never paid so the UI and queue stay clean. */
export const expireStaleDeposits = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("deposits")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(200);
    let expired = 0;
    for (const row of rows) {
      if (now - row.createdAt <= MATCH_WINDOW_MS) continue;
      await ctx.db.patch(row._id, {
        status: "failed",
        verifiedAt: now,
        note: "The quote expired without a matching on-chain payment.",
      });
      expired += 1;
    }
    return { expired };
  },
});

/**
 * Reconciliation cron: one indexer read per treasury account, then settle any
 * pending memo found on-chain. This credits deposits even if the user closes
 * the mini app immediately after paying.
 */
export const reconcileDeposits = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ checked: number; settled: number; errors: number }> => {
    const pending: PendingDepositRow[] = await ctx.runQuery(
      internal.payments.pendingDeposits,
      {},
    );
    if (pending.length === 0) {
      await ctx.runMutation(internal.payments.expireStaleDeposits, {});
      return { checked: 0, settled: 0, errors: 0 };
    }

    const addresses = [...new Set(pending.map((row) => row.address))];
    let settled = 0;
    let errors = 0;

    for (const address of addresses) {
      let transactions: TonApiTransaction[];
      try {
        transactions = await fetchTreasuryTransactions(address);
      } catch (error) {
        console.error("Deposit reconciliation indexer error", error);
        errors += 1;
        continue;
      }
      for (const row of pending.filter((item) => item.address === address)) {
        const payment = findPayment(transactions, row.memo);
        if (!payment) continue;
        try {
          const result = await ctx.runMutation(
            internal.payments.settleDeposit,
            {
              depositId: row._id,
              ...payment,
            },
          );
          if (result.status === "confirmed") settled += 1;
        } catch (error) {
          console.error("Deposit settlement failed", error);
          errors += 1;
        }
      }
    }

    await ctx.runMutation(internal.payments.expireStaleDeposits, {});
    return { checked: pending.length, settled, errors };
  },
});
