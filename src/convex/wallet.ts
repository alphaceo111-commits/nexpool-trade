import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import {
  audit,
  computeSpeed,
  getViewer,
  listReferralRows,
  loadConfig,
  notifyUser,
  requireProfile,
  roundNex,
} from "./engine";

const TON_ADDRESS = /^(EQ|UQ|kQ|0Q)[A-Za-z0-9_-]{46}$|^-?\d+:[0-9a-fA-F]{64}$/;

function normaliseAddress(raw: string) {
  return raw.trim();
}

/** Link a wallet address supplied by a completed TON Connect session. */
export const connectWallet = mutation({
  args: {
    address: v.string(),
    network: v.string(),
    app: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx);
    if (profile.restricted) {
      throw new Error("Restricted accounts cannot link a payout wallet.");
    }
    const pending = await ctx.db
      .query("withdrawals")
      .withIndex("by_user_requestedAt", (q) => q.eq("userId", profile.userId))
      .order("desc")
      .take(10);
    if (
      pending.some(
        (row) => row.status === "requested" || row.status === "reviewing",
      )
    ) {
      throw new Error(
        "The payout destination is locked while a withdrawal is under review.",
      );
    }
    const address = normaliseAddress(args.address);
    if (!TON_ADDRESS.test(address)) {
      throw new Error("That is not a valid TON address.");
    }
    const network = args.network.trim();
    if (!["mainnet", "-239", "ton-mainnet"].includes(network)) {
      throw new Error(
        `Unsupported network "${network || "unknown"}". Payouts settle on TON mainnet only.`,
      );
    }

    await ctx.db.patch(profile._id, {
      walletAddress: address,
      walletNetwork: "mainnet",
      walletApp: args.app?.slice(0, 60),
      walletConnectedAt: Date.now(),
    });
    await notifyUser(
      ctx,
      profile,
      "wallet",
      "Payout wallet linked",
      `Destination ${address.slice(0, 6)}…${address.slice(-4)} linked from TON Connect. Payouts still require operator review.`,
    );
    return { connected: true, address };
  },
});

/**
 * Independently checks the recorded TON transaction hash against the public
 * chain indexer. Never changes payout status: it records what the chain says.
 */
export const verifyChain = internalAction({
  args: { withdrawalId: v.id("withdrawals") },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.wallet.withdrawalContext, {
      withdrawalId: args.withdrawalId,
    });
    if (!context?.txHash) return;
    try {
      const response = await fetch(
        `https://tonapi.io/v2/blockchain/transactions/${encodeURIComponent(context.txHash)}`,
        { headers: { accept: "application/json" } },
      );
      if (!response.ok) {
        await ctx.runMutation(internal.wallet.setChainVerification, {
          withdrawalId: args.withdrawalId,
          note: `Independent TON lookup returned HTTP ${response.status}. The hash is recorded but not chain-verified.`,
        });
        return;
      }
      const payload = (await response.json()) as {
        hash?: string;
        success?: boolean;
      };
      if (!payload.hash) {
        await ctx.runMutation(internal.wallet.setChainVerification, {
          withdrawalId: args.withdrawalId,
          note: "TON indexer did not return a transaction for this hash. Verify manually before relying on it.",
        });
        return;
      }
      await ctx.runMutation(internal.wallet.setChainVerification, {
        withdrawalId: args.withdrawalId,
        verifiedAt: Date.now(),
        confirmed: payload.success !== false,
        note:
          payload.success === false
            ? "Transaction exists on TON mainnet but the indexer reports a reverted execution."
            : "Transaction independently found on TON mainnet (tonapi.io).",
      });
    } catch (error) {
      console.error("TON chain verification failed", error);
      await ctx.runMutation(internal.wallet.setChainVerification, {
        withdrawalId: args.withdrawalId,
        note: "Independent TON lookup was unreachable. The hash is recorded but unverified.",
      });
    }
  },
});

export const withdrawalContext = internalQuery({
  args: { withdrawalId: v.id("withdrawals") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.withdrawalId);
    if (!row) return null;
    return { txHash: row.txHash ?? null, status: row.status };
  },
});

export const setChainVerification = internalMutation({
  args: {
    withdrawalId: v.id("withdrawals"),
    verifiedAt: v.optional(v.number()),
    confirmed: v.optional(v.boolean()),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.withdrawalId);
    if (!row) return;
    const firstConfirmation =
      Boolean(args.verifiedAt && args.confirmed) && !row.chainVerifiedAt;
    await ctx.db.patch(row._id, {
      chainVerifiedAt: args.verifiedAt,
      chainVerificationNote: args.note,
    });

    if (firstConfirmation && row.status === "paid") {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", row.userId))
        .first();
      if (profile) {
        await notifyUser(
          ctx,
          profile,
          "wallet",
          "Withdrawal completed",
          `${row.tonAmount} TON payout was independently found on TON mainnet. Transaction ${(row.txHash ?? "").slice(0, 12)}… is chain-verified.`,
        );
      }
    }
  },
});

export const disconnectWallet = mutation({
  args: {},
  handler: async (ctx) => {
    const { profile } = await requireProfile(ctx);
    const pending = await ctx.db
      .query("withdrawals")
      .withIndex("by_user_requestedAt", (q) => q.eq("userId", profile.userId))
      .order("desc")
      .take(10);
    if (
      pending.some(
        (row) => row.status === "requested" || row.status === "reviewing",
      )
    ) {
      throw new Error(
        "A withdrawal is under review. The destination is locked until it settles.",
      );
    }
    await ctx.db.patch(profile._id, {
      walletAddress: undefined,
      walletNetwork: undefined,
      walletApp: undefined,
      walletConnectedAt: undefined,
    });
    return { connected: false };
  },
});

/** Server-side eligibility. Mirrors the rules the request mutation enforces. */
export const eligibility = query({
  args: {},
  handler: async (ctx) => {
    const { profile, balance } = await getViewer(ctx);
    if (!profile || !balance) return null;
    const config = await loadConfig(ctx);
    const referrals = await listReferralRows(ctx, profile._id, config);
    const qualified = referrals.filter((row) => row.qualified).length;
    const availableUsd = roundNex(balance.availableNex * config.nexUsdRate);
    const checks = {
      balance: balance.availableNex >= config.minWithdrawNex,
      referrals: qualified >= config.qualifiedReferralTarget,
      wallet: Boolean(profile.walletAddress),
      liquidity: config.treasuryAvailableUsd >= availableUsd,
      compliance: profile.complianceCleared && !profile.restricted,
      service: config.withdrawalsEnabled,
    };
    return {
      checks,
      eligible: Object.values(checks).every(Boolean),
      availableNex: balance.availableNex,
      reservedNex: balance.reservedNex,
      qualified,
      target: config.qualifiedReferralTarget,
      treasuryAvailableUsd: config.treasuryAvailableUsd,
      availableUsd,
      minWithdrawNex: config.minWithdrawNex,
      nexUsdRate: config.nexUsdRate,
      tonUsdRate: config.tonUsdRate,
      estimatedTon:
        config.tonUsdRate > 0
          ? roundNex((balance.availableNex * config.nexUsdRate) / config.tonUsdRate)
          : 0,
      walletAddress: profile.walletAddress,
      restricted: profile.restricted,
      restrictionReason: profile.restrictionReason,
    };
  },
});

/**
 * Request a payout. The backend re-checks every rule, reserves the NEX and
 * creates a reviewable queue item. It never marks a payout confirmed.
 */
export const requestWithdrawal = mutation({
  args: { nexAmount: v.number() },
  handler: async (ctx, args) => {
    const { profile, balance } = await requireProfile(ctx);
    const config = await loadConfig(ctx);

    if (!config.withdrawalsEnabled) {
      throw new Error("Withdrawals are paused by the operator.");
    }
    if (profile.restricted) {
      throw new Error(
        profile.restrictionReason || "This account is restricted.",
      );
    }
    if (!profile.complianceCleared) {
      throw new Error("Compliance review is not complete for this account.");
    }
    if (!profile.walletAddress) {
      throw new Error("Connect a TON payout wallet first.");
    }
    if (!Number.isFinite(args.nexAmount)) {
      throw new Error("Enter a valid NEX amount.");
    }
    const amount = roundNex(args.nexAmount);
    if (amount < config.minWithdrawNex) {
      throw new Error(`Minimum withdrawal is ${config.minWithdrawNex} NEX.`);
    }
    if (amount > balance.availableNex) {
      throw new Error("Amount exceeds your available NEX.");
    }

    const speed = await computeSpeed(ctx, profile, config);
    if (speed.qualifiedReferralCount < config.qualifiedReferralTarget) {
      throw new Error(
        `${config.qualifiedReferralTarget} qualified referrals are required. You have ${speed.qualifiedReferralCount}.`,
      );
    }

    const usdValue = roundNex(amount * config.nexUsdRate);
    if (config.treasuryAvailableUsd < usdValue) {
      throw new Error(
        "The reward pool does not currently cover this payout. Try a smaller amount or wait for treasury reconciliation.",
      );
    }
    if (config.tonUsdRate <= 0) {
      throw new Error("TON reference rate is not configured.");
    }

    const pending = await ctx.db
      .query("withdrawals")
      .withIndex("by_user_requestedAt", (q) => q.eq("userId", profile.userId))
      .order("desc")
      .take(10);
    if (
      pending.some(
        (row) => row.status === "requested" || row.status === "reviewing",
      )
    ) {
      throw new Error("You already have a withdrawal under review.");
    }

    const tonAmount = roundNex(usdValue / config.tonUsdRate);
    if (tonAmount <= 0) {
      throw new Error("Payout amount rounds to zero TON. Increase the amount.");
    }

    const now = Date.now();
    const withdrawalId = await ctx.db.insert("withdrawals", {
      userId: profile.userId,
      nexAmount: amount,
      usdValue,
      nexUsdRate: config.nexUsdRate,
      tonAmount,
      tonUsdRate: config.tonUsdRate,
      destination: profile.walletAddress,
      network: "ton-mainnet",
      status: "requested",
      requestedAt: now,
    });

    await ctx.db.patch(balance._id, {
      availableNex: roundNex(balance.availableNex - amount),
      reservedNex: roundNex(balance.reservedNex + amount),
      updatedAt: now,
    });
    await ctx.db.insert("ledger", {
      userId: profile.userId,
      kind: "withdrawal",
      amountNex: -amount,
      memo: `Withdrawal requested · ${tonAmount} TON`,
      refId: String(withdrawalId),
      createdAt: now,
    });
    await notifyUser(
      ctx,
      profile,
      "wallet",
      "Withdrawal submitted",
      `${amount} NEX (${usdValue.toFixed(2)} USD) reserved for review. Status is "Requested" until the operator confirms an on-chain transfer.`,
    );
    await audit(
      ctx,
      { userId: profile.userId, label: profile.nexId },
      "withdrawal.request",
      `${profile.nexId} requested ${amount} NEX -> ${tonAmount} TON (${profile.walletAddress}).`,
    );

    return {
      withdrawalId,
      status: "requested" as const,
      nexAmount: amount,
      tonAmount,
      usdValue,
    };
  },
});
