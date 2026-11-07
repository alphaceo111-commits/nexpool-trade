import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  AWAY_ADS_REQUIRED,
  EXTENSION_ADS_REQUIRED,
  dayKey,
  loadConfig,
  notifyUser,
  requireProfile,
} from "./engine";

/**
 * A challenge is only permission to show one ad. It never pays by itself.
 *
 * Monetag's rewarded-interstitial promise resolves after the ad is closed and
 * Monetag has confirmed the event; `reward_event_type === "valued"` is the
 * payout signal. The optional postback is recorded for audit, but it fires at
 * impression time and therefore can never be the sole completion proof.
 */
const AD_CHALLENGE_TTL_MS = 15 * 60_000;
const PROVIDER = "monetag" as const;

type AdPurpose = "away" | "extension";

type AdCompletionResult =
  | { recorded: false; granted: false; progress: 0 }
  | {
      recorded: true;
      granted: boolean;
      purpose: AdPurpose;
      progress: number;
      endsAt?: number;
    };

async function pendingChallenge(ctx: MutationCtx, userId: Id<"users">) {
  return await ctx.db
    .query("miningAdChallenges")
    .withIndex("by_user_status_createdAt", (q) =>
      q.eq("userId", userId).eq("status", "pending"),
    )
    .order("asc")
    .first();
}

function requiredAds(purpose: AdPurpose) {
  return purpose === "away" ? AWAY_ADS_REQUIRED : EXTENSION_ADS_REQUIRED;
}

function adProgress(profile: Doc<"profiles">, purpose: AdPurpose) {
  return purpose === "away"
    ? profile.awayMiningAdProgress ?? 0
    : profile.extensionAdProgress ?? 0;
}

function cleanPrice(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

/**
 * Consumes a challenge exactly once and applies the independent away or
 * extension entitlement. All eligibility is re-read at the moment of reward.
 */
async function applyAdCompletion(
  ctx: MutationCtx,
  profile: Doc<"profiles">,
  challenge: Doc<"miningAdChallenges">,
  now: number,
): Promise<AdCompletionResult> {
  if (challenge.status !== "pending") {
    return { recorded: false, granted: false, progress: 0 };
  }
  if (challenge.expiresAt <= now) {
    await ctx.db.patch(challenge._id, { status: "expired" });
    return { recorded: false, granted: false, progress: 0 };
  }

  await ctx.db.patch(challenge._id, {
    status: "completed",
    completedAt: now,
    providerEvent: challenge.postbackValuedAt
      ? "monetag-sdk+postback"
      : "monetag-sdk",
    providerReference: String(challenge._id),
  });

  const config = await loadConfig(ctx);
  const today = dayKey(now);

  if (challenge.purpose === "away") {
    if ((profile.awayMiningExpiresAt ?? 0) > now) {
      return {
        recorded: true,
        granted: false,
        purpose: "away",
        progress: 0,
      };
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
        `You completed ${AWAY_ADS_REQUIRED} verified Monetag ads. Normal mining will continue while you are away until ${new Date(expiresAt).toISOString()} — check the Mining screen for the exact server expiry.`,
      );
      return {
        recorded: true,
        granted: true,
        purpose: "away",
        progress: 0,
      };
    }
    await ctx.db.patch(profile._id, { awayMiningAdProgress: next });
    return {
      recorded: true,
      granted: false,
      purpose: "away",
      progress: next,
    };
  }

  const dayRow = await ctx.db
    .query("miningDays")
    .withIndex("by_user_day", (q) => q.eq("userId", profile.userId).eq("day", today))
    .first();
  const normalMined = dayRow?.normalMinedNex ?? dayRow?.minedNex ?? 0;
  const extensionActive = (profile.miningExtensionEndsAt ?? 0) > now;
  if (
    normalMined < config.dailyLimitNex ||
    extensionActive ||
    profile.extensionUnlockDay === today
  ) {
    return {
      recorded: true,
      granted: false,
      purpose: "extension",
      progress: 0,
    };
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
      `You completed ${EXTENSION_ADS_REQUIRED} verified Monetag ads. Extension mining is live until ${new Date(endsAt).toISOString()}. Earnings are recorded separately from the normal daily cap.`,
    );
    return {
      recorded: true,
      granted: true,
      purpose: "extension",
      progress: 0,
      endsAt,
    };
  }
  await ctx.db.patch(profile._id, { extensionAdProgress: next });
  return {
    recorded: true,
    granted: false,
    purpose: "extension",
    progress: next,
  };
}

/**
 * Issues a short-lived, purpose-specific Monetag challenge. The client gets a
 * unique ymid to pass to the Monetag SDK; the provider confirmation is checked
 * server-side before any progress is applied.
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
        "Open NEXPOOL inside Telegram so Monetag can confirm your rewarded view.",
      );
    }

    const pending = await pendingChallenge(ctx, profile.userId);
    if (
      pending &&
      pending.provider === PROVIDER &&
      pending.expiresAt > now
    ) {
      if (pending.purpose === args.purpose) {
        return {
          challengeId: pending._id,
          ymid: String(pending._id),
          purpose: pending.purpose,
          required: requiredAds(pending.purpose),
          progress: adProgress(profile, pending.purpose),
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

    if (args.purpose === "away") {
      if ((profile.awayMiningExpiresAt ?? 0) > now) {
        throw new Error("Away mining is already active for this account.");
      }
    } else {
      if (normalMined < config.dailyLimitNex) {
        throw new Error(
          "Reach today's normal mining cap before unlocking the extension.",
        );
      }
      if (extensionActive) {
        throw new Error("The five-hour extension is already active.");
      }
      if (unlockedToday) {
        throw new Error(
          "The five-hour extension has already been unlocked today.",
        );
      }
    }

    const expiresAt = now + AD_CHALLENGE_TTL_MS;
    const challengeId = await ctx.db.insert("miningAdChallenges", {
      userId: profile.userId,
      purpose: args.purpose,
      provider: PROVIDER,
      status: "pending",
      createdAt: now,
      expiresAt,
    });

    return {
      challengeId,
      ymid: String(challengeId),
      purpose: args.purpose,
      required: requiredAds(args.purpose),
      progress: adProgress(profile, args.purpose),
      expiresAt,
    };
  },
});

/**
 * Called only after the Monetag SDK resolves with a confirmed rewarded view.
 * The challenge must belong to the signed-in user and be unconsumed. The
 * client's result is the provider's backend-confirmed completion callback,
 * not a click or an ad start.
 */
export const confirmFromClient = mutation({
  args: {
    challengeId: v.id("miningAdChallenges"),
    ymid: v.string(),
    rewardEventType: v.string(),
    eventType: v.optional(v.string()),
    estimatedPriceUsd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx);
    const challenge = await ctx.db.get(args.challengeId);
    if (!challenge || challenge.userId !== profile.userId) {
      throw new Error("This ad challenge does not belong to your account.");
    }
    if (challenge.provider !== PROVIDER) {
      throw new Error("This ad challenge is no longer valid.");
    }
    if (String(challenge._id) !== args.ymid) {
      throw new Error("The provider reference does not match this challenge.");
    }
    if (challenge.status === "completed") {
      return { status: "already" as const };
    }
    if (challenge.status !== "pending") {
      throw new Error("This ad challenge has expired. Request a new ad.");
    }
    const now = Date.now();
    if (challenge.expiresAt <= now) {
      await ctx.db.patch(challenge._id, { status: "expired" });
      throw new Error("This ad challenge has expired. Request a new ad.");
    }

    if (args.rewardEventType !== "valued") {
      return {
        status: "rejected" as const,
        message:
          "Monetag did not confirm a paid reward for this view. No progress was added.",
      };
    }
    if (args.eventType === "click") {
      return {
        status: "rejected" as const,
        message:
          "Monetag reported a click, not a completed rewarded view. No progress was added.",
      };
    }
    if (challenge.postbackRewardEventType === "non_valued") {
      return {
        status: "rejected" as const,
        message:
          "Monetag marked this event as non-valued. No progress was added.",
      };
    }

    if (challenge.clientCompletedAt === undefined) {
      await ctx.db.patch(challenge._id, {
        clientCompletedAt: now,
        clientRewardEventType: args.rewardEventType,
        clientEstimatedPriceUsd: cleanPrice(args.estimatedPriceUsd),
      });
    }

    const result = await applyAdCompletion(ctx, profile, challenge, now);
    if (!result.recorded) {
      return { status: "already" as const };
    }
    return {
      status: result.granted ? ("granted" as const) : ("recorded" as const),
      granted: result.granted,
      purpose: result.purpose,
      progress: result.progress,
      endsAt: result.endsAt,
    };
  },
});

/**
 * Optional Monetag server postback. It arrives at impression time, so it is
 * deliberately recorded for audit and non-valued rejection only; it never
 * settles an entitlement by itself. The SDK completion callback does that.
 */
export const recordMonetagPostback = internalMutation({
  args: {
    ymid: v.string(),
    telegramId: v.optional(v.string()),
    eventType: v.string(),
    rewardEventType: v.string(),
    estimatedPriceUsd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const challengeId = ctx.db.normalizeId(
      "miningAdChallenges",
      args.ymid,
    );
    if (!challengeId) return { recorded: false as const };
    const challenge = await ctx.db.get(challengeId);
    if (!challenge || challenge.provider !== PROVIDER) {
      return { recorded: false as const };
    }

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", challenge.userId))
      .first();
    if (!profile) return { recorded: false as const };
    if (
      args.telegramId &&
      profile.telegramId &&
      args.telegramId !== profile.telegramId
    ) {
      return { recorded: false as const };
    }

    const now = Date.now();
    if (challenge.status === "expired") {
      return { recorded: false as const };
    }
    if (challenge.status === "pending" && challenge.expiresAt <= now) {
      await ctx.db.patch(challenge._id, { status: "expired" });
      return { recorded: false as const };
    }

    const valued = args.rewardEventType === "valued";
    const price = cleanPrice(args.estimatedPriceUsd);
    const patch: Partial<Doc<"miningAdChallenges">> = {
      providerEvent: args.eventType,
      providerReference: args.ymid,
    };
    if (valued) {
      patch.postbackValuedAt = challenge.postbackValuedAt ?? now;
      patch.postbackRewardEventType = "valued";
      patch.postbackEstimatedPriceUsd = Math.max(
        challenge.postbackEstimatedPriceUsd ?? 0,
        price ?? 0,
      );
    } else if (challenge.postbackValuedAt === undefined) {
      patch.postbackRewardEventType = "non_valued";
    }
    await ctx.db.patch(challenge._id, patch);

    return { recorded: true as const, valued };
  },
});
