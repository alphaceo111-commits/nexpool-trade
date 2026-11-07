import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  AWAY_ADS_REQUIRED,
  EXTENSION_ADS_REQUIRED,
  dayKey,
  loadConfig,
  notifyUser,
  requireProfile,
} from "./engine";

/**
 * A challenge is only a request to show an ad. It is never a reward: the
 * Adsgram Reward URL is the only caller allowed to complete it, and that URL is
 * sent by the provider after a rewarded view finishes.
 */
const AD_CHALLENGE_TTL_MS = 15 * 60_000;

async function pendingChallenge(ctx: MutationCtx, userId: Id<"users">) {
  return await ctx.db
    .query("miningAdChallenges")
    .withIndex("by_user_status_createdAt", (q) =>
      q.eq("userId", userId).eq("status", "pending"),
    )
    .order("asc")
    .first();
}

/**
 * Issues a short-lived, purpose-specific ad challenge. The client never
 * receives a reward for opening it; it only receives permission to show the
 * provider's rewarded format.
 */
export const requestAd = mutation({
  args: {
    purpose: v.union(v.literal("away"), v.literal("extension")),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx);
    const config = await loadConfig(ctx);
    const now = Date.now();
    const today = dayKey(now);

    if (!config.miningEnabled) {
      throw new Error("Mining is paused by the operator.");
    }
    if (profile.restricted) {
      throw new Error("This account is restricted. No ad rewards can be issued.");
    }
    if (!profile.telegramId) {
      throw new Error(
        "Open NEXPOOL inside Telegram so the advertising provider can verify your view.",
      );
    }
    if (!process.env.ADSGRAM_REWARD_SECRET) {
      throw new Error(
        "Rewarded ads are not configured by the operator yet. No ad was opened.",
      );
    }

    const pending = await pendingChallenge(ctx, profile.userId);
    if (pending && pending.expiresAt > now) {
      if (pending.purpose === args.purpose) {
        return {
          challengeId: pending._id,
          purpose: pending.purpose,
          required:
            pending.purpose === "away"
              ? AWAY_ADS_REQUIRED
              : EXTENSION_ADS_REQUIRED,
          progress:
            pending.purpose === "away"
              ? profile.awayMiningAdProgress ?? 0
              : profile.extensionAdProgress ?? 0,
          expiresAt: pending.expiresAt,
        };
      }
      throw new Error("Finish the open verified ad before starting another.");
    }
    if (pending) {
      await ctx.db.patch(pending._id, { status: "expired" });
    }

    const dayRow = await ctx.db
      .query("miningDays")
      .withIndex("by_user_day", (q) =>
        q.eq("userId", profile.userId).eq("day", today),
      )
      .first();
    const normalMined = dayRow?.normalMinedNex ?? dayRow?.minedNex ?? 0;
    const extensionActive = (profile.miningExtensionEndsAt ?? 0) > now;
    const unlockedToday = profile.extensionUnlockDay === today;

    let progress = 0;
    let required = AWAY_ADS_REQUIRED;
    if (args.purpose === "away") {
      if ((profile.awayMiningExpiresAt ?? 0) > now) {
        throw new Error("Away mining is already active for this account.");
      }
      progress = profile.awayMiningAdProgress ?? 0;
      required = AWAY_ADS_REQUIRED;
    } else {
      if (normalMined < config.dailyLimitNex) {
        throw new Error("Reach today's normal mining cap before unlocking the extension.");
      }
      if (extensionActive) {
        throw new Error("The five-hour extension is already active.");
      }
      if (unlockedToday) {
        throw new Error("The five-hour extension has already been unlocked today.");
      }
      progress = profile.extensionAdProgress ?? 0;
      required = EXTENSION_ADS_REQUIRED;
    }

    const expiresAt = now + AD_CHALLENGE_TTL_MS;
    const challengeId = await ctx.db.insert("miningAdChallenges", {
      userId: profile.userId,
      purpose: args.purpose,
      provider: "adsgram",
      status: "pending",
      createdAt: now,
      expiresAt,
    });

    return { challengeId, purpose: args.purpose, required, progress, expiresAt };
  },
});

/**
 * Provider-only completion. The HTTP endpoint validates the secret before
 * calling this mutation. A challenge is consumed exactly once, regardless of
 * how many times the provider retries its callback.
 */
export const completeFromProvider = internalMutation({
  args: {
    telegramId: v.string(),
    provider: v.string(),
    providerEvent: v.optional(v.string()),
    providerReference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", args.telegramId))
      .first();
    if (!profile) return { recorded: false as const };

    const now = Date.now();
    const challenge = await pendingChallenge(ctx, profile.userId);
    if (!challenge || challenge.status !== "pending") {
      return { recorded: false as const };
    }
    if (challenge.expiresAt <= now) {
      await ctx.db.patch(challenge._id, { status: "expired" });
      return { recorded: false as const };
    }
    if (challenge.provider !== args.provider) {
      return { recorded: false as const };
    }

    // Consume the challenge before applying the entitlement. A retry then
    // finds no pending challenge and can never double-credit.
    await ctx.db.patch(challenge._id, {
      status: "completed",
      completedAt: now,
      providerEvent: args.providerEvent,
      providerReference: args.providerReference,
    });

    const config = await loadConfig(ctx);
    const today = dayKey(now);

    if (challenge.purpose === "away") {
      if ((profile.awayMiningExpiresAt ?? 0) > now) {
        return { recorded: true as const, granted: false as const, progress: 0 };
      }
      const next = (profile.awayMiningAdProgress ?? 0) + 1;
      if (next >= AWAY_ADS_REQUIRED) {
        const expiresAt = now + config.awayMiningHours * 3_600_000;
        await ctx.db.patch(profile._id, {
          awayMiningAdProgress: 0,
          awayMiningUnlockedAt: now,
          awayMiningExpiresAt: expiresAt,
        });
        await notifyUser(
          ctx,
          profile,
          "mining",
          "Away mining unlocked",
          `You completed ${AWAY_ADS_REQUIRED} verified ads. Normal mining will continue while you are away until ${new Date(expiresAt).toISOString()} — check the Mining screen for the exact server expiry.`,
        );
        return {
          recorded: true as const,
          granted: true as const,
          purpose: "away" as const,
          progress: 0,
        };
      }
      await ctx.db.patch(profile._id, { awayMiningAdProgress: next });
      return {
        recorded: true as const,
        granted: false as const,
        purpose: "away" as const,
        progress: next,
      };
    }

    const dayRow = await ctx.db
      .query("miningDays")
      .withIndex("by_user_day", (q) =>
        q.eq("userId", profile.userId).eq("day", today),
      )
      .first();
    const normalMined = dayRow?.normalMinedNex ?? dayRow?.minedNex ?? 0;
    const extensionActive = (profile.miningExtensionEndsAt ?? 0) > now;
    if (
      normalMined < config.dailyLimitNex ||
      extensionActive ||
      profile.extensionUnlockDay === today
    ) {
      return { recorded: true as const, granted: false as const, progress: 0 };
    }

    const next = (profile.extensionAdProgress ?? 0) + 1;
    if (next >= EXTENSION_ADS_REQUIRED) {
      const endsAt = now + config.extensionHours * 3_600_000;
      await ctx.db.patch(profile._id, {
        extensionAdProgress: 0,
        extensionUnlockedAt: now,
        miningExtensionStartedAt: now,
        miningExtensionEndsAt: endsAt,
        extensionUnlockDay: today,
      });
      await notifyUser(
        ctx,
        profile,
        "mining",
        `${config.extensionHours}-hour extension unlocked`,
        `You completed ${EXTENSION_ADS_REQUIRED} verified ads. Extension mining is live until ${new Date(endsAt).toISOString()}. Earnings are recorded separately from the normal daily cap.`,
      );
      return {
        recorded: true as const,
        granted: true as const,
        purpose: "extension" as const,
        progress: 0,
        endsAt,
      };
    }
    await ctx.db.patch(profile._id, { extensionAdProgress: next });
    return {
      recorded: true as const,
      granted: false as const,
      purpose: "extension" as const,
      progress: next,
    };
  },
});
