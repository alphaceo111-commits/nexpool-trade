import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getViewer, loadConfig, requireProfile, roundNex } from "./engine";
import {
  attachReferral,
  listReferralDesk,
  normalizeReferralCode,
} from "./referralEngine";

/**
 * Attach a referral code to an existing account. The first valid attribution
 * wins; self-referrals, unknown codes and a second inviter are rejected.
 */
export const applyCode = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx);
    const code = normalizeReferralCode(args.code);
    if (!code) throw new Error("Enter a valid referral code.");

    const result = await attachReferral(ctx, {
      code,
      inviteeProfile: profile,
      inviteeTelegramId: profile.telegramId,
      source: "mini_app",
    });

    if (!result.attached) {
      switch (result.reason) {
        case "unknown-code":
          throw new Error("That referral code does not exist.");
        case "self":
          throw new Error("You cannot refer yourself.");
        case "already-attributed":
        case "already-referred":
          throw new Error("This account already has a referrer.");
        case "loop":
          throw new Error("This invitation would create a referral loop.");
        default:
          throw new Error("That referral code could not be applied.");
      }
    }

    // `attachReferral` already wrote the single join notification for this
    // record; a second one here would double-notify the inviter.
    return { attached: true, status: result.record?.status ?? "pending" };
  },
});

const countByStatus = (
  rows: Awaited<ReturnType<typeof listReferralDesk>>,
  status: string,
) => rows.filter((row) => row.status === status).length;

/** Referral desk: permanent records plus live task progress. */
export const summary = query({
  args: {},
  handler: async (ctx) => {
    const { profile } = await getViewer(ctx);
    if (!profile) return null;
    const config = await loadConfig(ctx);
    const rows = await listReferralDesk(ctx, profile._id, config);
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
      pending: countByStatus(rows, "pending"),
      inProgress: countByStatus(rows, "in_progress"),
      rejected: countByStatus(rows, "rejected"),
      incomplete: rows.length - qualified.length,
      target: config.qualifiedReferralTarget,
      taskTarget: config.referralTaskTarget,
      bonusPerReferral: roundNex(config.referralBonusNexPerHour),
      bonusCap: config.referralBonusCap,
      bonusNexPerHour: roundNex(
        Math.min(qualified.length, config.referralBonusCap) *
          config.referralBonusNexPerHour,
      ),
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
