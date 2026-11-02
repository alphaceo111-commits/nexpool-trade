import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  getViewer,
  listReferralRows,
  loadConfig,
  notifyUser,
  requireProfile,
} from "./engine";

/**
 * Attach a referral code to an existing account. Only fresh accounts can be
 * claimed, and chains that would create a loop are rejected.
 */
export const applyCode = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx);
    const code = args.code.trim().toUpperCase();
    if (!code) throw new Error("Enter a referral code.");

    if (profile.referredBy) {
      throw new Error("This account already has a referrer.");
    }
    if (Date.now() - profile.createdAt > 7 * 864e5) {
      throw new Error("Referral codes can only be applied within 7 days of signup.");
    }

    const referrer = await ctx.db
      .query("profiles")
      .withIndex("by_referralCode", (q) => q.eq("referralCode", code))
      .first();
    if (!referrer) throw new Error("That referral code does not exist.");
    if (referrer._id === profile._id) {
      throw new Error("You cannot refer yourself.");
    }
    if (referrer.referredBy === profile._id) {
      throw new Error("This referral would create a loop.");
    }

    await ctx.db.patch(profile._id, {
      referredBy: referrer._id,
      referredAt: Date.now(),
    });
    const config = await loadConfig(ctx);
    await notifyUser(
      ctx,
      referrer,
      "referral",
      "New referral joined",
      `${profile.displayName} linked your code. ${config.referralTaskTarget} verified tasks qualify them.`,
    );
    return { attached: true };
  },
});

/** Referral detail for the referrals screen, backed by live task counts. */
export const summary = query({
  args: {},
  handler: async (ctx) => {
    const { profile } = await getViewer(ctx);
    if (!profile) return null;
    const config = await loadConfig(ctx);
    const rows = await listReferralRows(ctx, profile._id, config);
    const qualified = rows.filter((row) => row.qualified);
    const referralLedger = await ctx.db
      .query("ledger")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", profile.userId))
      .order("desc")
      .take(50);

    return {
      code: profile.referralCode,
      rows,
      total: rows.length,
      qualified: qualified.length,
      incomplete: rows.length - qualified.length,
      target: config.qualifiedReferralTarget,
      taskTarget: config.referralTaskTarget,
      bonusPerReferral: config.referralBonusNexPerHour,
      bonusCap: config.referralBonusCap,
      bonusNexPerHour: qualified.length * config.referralBonusNexPerHour,
      rewards: referralLedger
        .filter((row) => row.kind === "referral")
        .map((row) => ({
          id: row._id,
          amountNex: row.amountNex,
          memo: row.memo,
          createdAt: row.createdAt,
        })),
    };
  },
});
