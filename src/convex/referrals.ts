import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  audit,
  getViewer,
  loadConfig,
  requireProfile,
  roundNex,
} from "./engine";
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
        case "unverified-identity":
          throw new Error(
            "Link your Telegram account before applying an invite code.",
          );
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

/**
 * Operator recovery for invitations that were never attributed. The Telegram
 * webhook log is the only durable proof of the original payload: the bot stores
 * every inbound `/start CODE` together with the chat id, and for a private chat
 * that id is the verified Telegram user id. Recovery therefore never guesses an
 * inviter, never overwrites an existing attribution and never merges accounts.
 * Run with `dryRun: true` first; every applied record is written to the audit
 * log. Running it again is idempotent because attribution itself is.
 */
export const recoverFromBotLog = internalMutation({
  args: { dryRun: v.boolean(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 500, 1), 2000);
    const messages = await ctx.db
      .query("botMessages")
      .withIndex("by_ts")
      .order("desc")
      .take(limit);

    const candidates: Array<{
      telegramId: string;
      code: string;
      inviterProfileId: string;
      inviteeProfileId: string | null;
      result: "recovered" | "would-recover" | "skipped";
      reason?: string;
    }> = [];
    const seen = new Set<string>();

    for (const message of messages) {
      if (message.direction !== "inbound" || !message.chatId) continue;
      const payload = /^\/start(?:@\w+)?\s+(\S+)$/i.exec(message.text.trim());
      const code = normalizeReferralCode(payload?.[1]);
      const telegramId = message.chatId.trim();
      if (!code || !/^\d{3,20}$/.test(telegramId)) continue;
      const key = `${telegramId}:${code}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const inviter = await ctx.db
        .query("profiles")
        .withIndex("by_referralCode", (q) => q.eq("referralCode", code))
        .first();
      if (!inviter) continue;

      const inviteeProfile = await ctx.db
        .query("profiles")
        .withIndex("by_telegramId", (q) => q.eq("telegramId", telegramId))
        .first();
      const existing = await ctx.db
        .query("referrals")
        .withIndex("by_inviteeTelegramId", (q) =>
          q.eq("inviteeTelegramId", telegramId),
        )
        .first();
      const record = {
        telegramId,
        code,
        inviterProfileId: String(inviter._id),
        inviteeProfileId: inviteeProfile ? String(inviteeProfile._id) : null,
      };

      if (inviter.telegramId === telegramId) {
        candidates.push({ ...record, result: "skipped", reason: "self-referral" });
        continue;
      }
      if (existing || inviteeProfile?.referredBy) {
        candidates.push({ ...record, result: "skipped", reason: "already-attributed" });
        continue;
      }
      if (args.dryRun) {
        candidates.push({ ...record, result: "would-recover" });
        continue;
      }

      const applied = await attachReferral(ctx, {
        code,
        inviteeTelegramId: telegramId,
        inviteeProfile,
        inviteeName: inviteeProfile?.displayName,
        source: "legacy",
      });
      candidates.push({
        ...record,
        result: applied.attached ? "recovered" : "skipped",
        reason: applied.attached ? undefined : applied.reason,
      });
      await audit(
        ctx,
        { label: "referral-recovery" },
        "referral.recover",
        `telegram ${telegramId} → code ${code} · ${applied.attached ? "attributed" : `skipped: ${applied.reason}`}`,
      );
    }

    return {
      dryRun: args.dryRun,
      scanned: messages.length,
      recovered: candidates.filter((row) => row.result === "recovered").length,
      wouldRecover: candidates.filter((row) => row.result === "would-recover").length,
      candidates,
    };
  },
});

const countByStatus = (
  rows: Awaited<ReturnType<typeof listReferralDesk>>,
  status: string,
) => rows.filter((row) => row.status === status).length;

/** Referral desk: permanent records plus live task progress. */
/**
 * Records that the inviter opened an invitation action. Throttled per method so
 * a double tap does not inflate the number. This never creates, changes or
 * qualifies a referral.
 */
export const recordShareOpen = mutation({
  args: {
    method: v.union(v.literal("share_sheet"), v.literal("copy")),
  },
  handler: async (ctx, args) => {
    const { userId, profile } = await getViewer(ctx);
    if (!userId || !profile) throw new Error("Sign in first.");
    const now = Date.now();
    const recent = await ctx.db
      .query("referralShares")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(1);
    if (
      recent[0] &&
      recent[0].method === args.method &&
      now - recent[0].createdAt < 60_000
    ) {
      return { recorded: false as const };
    }
    await ctx.db.insert("referralShares", {
      userId,
      profileId: profile._id,
      code: profile.referralCode,
      method: args.method,
      createdAt: now,
    });
    return { recorded: true as const };
  },
});

export const summary = query({
  args: {},
  handler: async (ctx) => {
    const { profile } = await getViewer(ctx);
    if (!profile) return null;
    const config = await loadConfig(ctx);
    const rows = await listReferralDesk(ctx, profile._id, config);
    const qualified = rows.filter((row) => row.qualified);
    const shares = await ctx.db
      .query("referralShares")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", profile.userId))
      .order("desc")
      .collect();
    const referralLedger = await ctx.db
      .query("ledger")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", profile.userId))
      .order("desc")
      .take(50);

    // Rejected attributions are fraud records; they are never invitations.
    const rejected = countByStatus(rows, "rejected");

    return {
      code: profile.referralCode,
      rows,
      total: rows.length - rejected,
      qualified: qualified.length,
      pending: countByStatus(rows, "pending"),
      inProgress: countByStatus(rows, "in_progress"),
      rejected,
      incomplete: rows.length - rejected - qualified.length,
      target: config.qualifiedReferralTarget,
      taskTarget: config.referralTaskTarget,
      bonusPerReferral: roundNex(config.referralBonusNexPerHour),
      bonusCap: config.referralBonusCap,
      bonusNexPerHour: roundNex(
        Math.min(qualified.length, config.referralBonusCap) *
          config.referralBonusNexPerHour,
      ),
      // Opens of the share sheet / copy action. Not deliveries: Telegram does
      // not report who received a shared link.
      shares: {
        total: shares.length,
        lastAt: shares[0]?.createdAt ?? null,
      },
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
