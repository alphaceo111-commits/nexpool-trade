import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { claimedLevel } from "./levels";
import {
  createCompletionForTask,
  grantTaskRewardForCompletion,
} from "./tasks";
import {
  AWAY_ADS_REQUIRED,
  EXTENSION_ADS_REQUIRED,
  dayKey,
  loadConfig,
  notifyUser,
  requireProfile,
  roundNex,
} from "./engine";

/**
 * A challenge is only permission to show one ad. It never pays by itself.
 *
 * Monetag's server postback is the authoritative completion proof: it carries
 * the shared secret, the unique ymid and the provider's valued/non_valued
 * decision. The SDK result is used only for UI feedback and to ask the backend
 * to poll/confirm; a forged client call cannot move progress.
 */
const AD_CHALLENGE_TTL_MS = 15 * 60_000;
// Provider postbacks can be delayed by retries. A confirmed valued postback
// may still settle a challenge for two hours after the UI challenge expires.
const POSTBACK_GRACE_MS = 2 * 3_600_000;
const PROVIDER = "monetag" as const;

type AdPurpose = "away" | "extension" | "task";

type AdCompletionResult =
  | { recorded: false; granted: false; progress: 0 }
  | {
      recorded: true;
      granted: boolean;
      purpose: AdPurpose;
      progress: number;
      rewardNex: number;
      rewardCredited: boolean;
      endsAt?: number;
      unlocked?: boolean;
    };

/**
 * The unique ledger reference is the second idempotency rail after the
 * challenge status. Convex serializes mutations, and the `by_user_refId`
 * index makes it impossible for a replayed ymid to mint a second reward.
 */
async function creditVerifiedAdReward(
  ctx: MutationCtx,
  profile: Doc<"profiles">,
  challenge: Doc<"miningAdChallenges">,
  config: Awaited<ReturnType<typeof loadConfig>>,
  now: number,
) {
  const amount = roundNex(Math.max(0, config.adRewardNex));
  if (amount <= 0) return { amount: 0, credited: false };

  const refId = `monetag:${challenge._id}`;
  const existing = await ctx.db
    .query("ledger")
    .withIndex("by_user_refId", (q) =>
      q.eq("userId", profile.userId).eq("refId", refId),
    )
    .first();
  if (existing) {
    return { amount: existing.amountNex, credited: false };
  }

  const balance = await ctx.db
    .query("balances")
    .withIndex("by_user", (q) => q.eq("userId", profile.userId))
    .first();
  if (!balance) return { amount: 0, credited: false };

  await ctx.db.patch(balance._id, {
    availableNex: roundNex(balance.availableNex + amount),
    lifetimeAdNex: roundNex((balance.lifetimeAdNex ?? 0) + amount),
    updatedAt: now,
  });
  await ctx.db.insert("ledger", {
    userId: profile.userId,
    kind: "ad",
    amountNex: amount,
    memo: `Verified Monetag reward · ${
      challenge.purpose === "away" ? "background" : "extension"
    }`,
    refId,
    createdAt: now,
  });
  return { amount, credited: true };
}

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
  return purpose === "away"
    ? AWAY_ADS_REQUIRED
    : purpose === "extension"
      ? EXTENSION_ADS_REQUIRED
      : 1;
}

function adProgress(profile: Doc<"profiles">, purpose: AdPurpose) {
  return purpose === "away"
    ? profile.awayMiningAdProgress ?? 0
    : purpose === "extension"
      ? profile.extensionAdProgress ?? 0
      : 0;
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
  if (challenge.status !== "pending" && challenge.status !== "awaiting") {
    return { recorded: false, granted: false, progress: 0 };
  }
  const expiry = challenge.postbackValuedAt
    ? challenge.expiresAt + POSTBACK_GRACE_MS
    : challenge.expiresAt;
  if (expiry <= now) {
    await ctx.db.patch(challenge._id, { status: "expired" });
    return { recorded: false, granted: false, progress: 0 };
  }
  // Only a server-authenticated provider postback sets this field. It is the
  // sole proof accepted for a reward.
  if (challenge.postbackValuedAt === undefined) {
    return { recorded: false, granted: false, progress: 0 };
  }

  if (challenge.purpose === "task") {
    if (!challenge.taskId) {
      return { recorded: false, granted: false, progress: 0 };
    }
    const completionId = await createCompletionForTask(ctx, {
      taskId: challenge.taskId,
      userId: profile.userId,
    });
    const granted = await grantTaskRewardForCompletion(ctx, {
      completionId,
      verifiedBy: "monetag-postback",
      note: `Monetag valued postback confirmed for ymid ${challenge._id}.`,
    });
    const reward = "rewardNex" in granted ? (granted.rewardNex ?? 0) : 0;
    await ctx.db.patch(challenge._id, {
      status: "completed",
      completedAt: now,
      providerEvent: "monetag-postback",
      providerReference: String(challenge._id),
      grantedEntitlement: true,
      rewardNex: reward,
      rewardCreditedAt: now,
    });
    return {
      recorded: true,
      granted: true,
      purpose: "task",
      progress: 1,
      rewardNex: reward,
      rewardCredited: reward > 0,
    };
  }

  await ctx.db.patch(challenge._id, {
    status: "completed",
    completedAt: now,
    providerEvent: "monetag-postback",
    providerReference: String(challenge._id),
  });

  const config = await loadConfig(ctx);
  const reward = await creditVerifiedAdReward(
    ctx,
    profile,
    challenge,
    config,
    now,
  );
  const finish = async (result: AdCompletionResult) => {
    if (result.recorded) {
      await ctx.db.patch(challenge._id, {
        grantedEntitlement: result.granted,
        rewardNex: result.rewardNex,
        rewardCreditedAt: reward.credited ? now : challenge.rewardCreditedAt,
      });
    }
    return result;
  };

  const today = dayKey(now);

  if (challenge.purpose === "away") {
    if ((profile.awayMiningExpiresAt ?? 0) > now) {
      return await finish({
        recorded: true,
        granted: false,
        purpose: "away",
        progress: 0,
        rewardNex: reward.amount,
        rewardCredited: reward.credited,
      });
    }
    const next = (profile.awayMiningAdProgress ?? 0) + 1;
    if (next >= AWAY_ADS_REQUIRED) {
      const expiresAt = now + config.awayMiningHours * 3_600_000;
      await ctx.db.patch(profile._id, {
        awayMiningAdProgress: 0,
        awayMiningUnlockedAt: now,
        awayMiningExpiresAt: expiresAt,
        // The away clock starts when the app actually closes. Clearing any
        // stale marker prevents a previous absence from being replayed.
        awayMiningStartedAt: undefined,
      });
      await notifyUser(
        ctx,
        profile,
        "mining",
        "Background mining unlocked",
        `You completed ${AWAY_ADS_REQUIRED} verified Monetag ads. Normal mining will continue while you are away until ${new Date(expiresAt).toISOString()} — check the Mining screen for the exact server expiry.`,
      );
      return await finish({
        recorded: true,
        granted: true,
        purpose: "away",
        progress: 0,
        rewardNex: reward.amount,
        rewardCredited: reward.credited,
      });
    }
    await ctx.db.patch(profile._id, { awayMiningAdProgress: next });
    return await finish({
      recorded: true,
      granted: false,
      purpose: "away",
      progress: next,
      rewardNex: reward.amount,
      rewardCredited: reward.credited,
    });
  }

  const dayRow = await ctx.db
    .query("miningDays")
    .withIndex("by_user_day", (q) => q.eq("userId", profile.userId).eq("day", today))
    .first();
  const normalMined = dayRow?.normalMinedNex ?? dayRow?.minedNex ?? 0;
  const extensionActive = (profile.miningExtensionEndsAt ?? 0) > now;
  const alreadyGranted = Boolean(
    profile.extensionUnlockedAt &&
      !profile.miningExtensionStartedAt &&
      !profile.miningExtensionEndsAt,
  );
  if (
    normalMined < config.dailyLimitNex ||
    extensionActive ||
    alreadyGranted ||
    profile.extensionUnlockDay === today
  ) {
    return await finish({
      recorded: true,
      granted: false,
      purpose: "extension",
      progress: 0,
      rewardNex: reward.amount,
      rewardCredited: reward.credited,
    });
  }

  const next = (profile.extensionAdProgress ?? 0) + 1;
  if (next >= EXTENSION_ADS_REQUIRED) {
    // Record the grant only. The five-hour clock starts when the user presses
    // Start Extra Mining; completing the ads must never start mining.
    const sessionId = await ctx.db.insert("miningExtensionSessions", {
      userId: profile.userId,
      day: today,
      adsCompleted: EXTENSION_ADS_REQUIRED,
      normalMinedAtUnlockNex: roundNex(normalMined),
      extensionHours: config.extensionHours,
      grantedAt: now,
      minedNex: 0,
      status: "granted",
      createdAt: now,
    });
    await ctx.db.patch(profile._id, {
      extensionAdProgress: 0,
      extensionUnlockedAt: now,
      miningExtensionStartedAt: undefined,
      miningExtensionEndsAt: undefined,
      extensionUnlockDay: today,
      activeExtensionSessionId: sessionId,
    });
    await notifyUser(
      ctx,
      profile,
      "mining",
      `${config.extensionHours}-hour extension unlocked`,
      `You completed ${EXTENSION_ADS_REQUIRED} verified Monetag ads. The extra session is unlocked but has not started. Open the Earn tab and press Start Extra Mining when you are ready.`,
    );
    return await finish({
      recorded: true,
      granted: true,
      purpose: "extension",
      progress: 0,
      rewardNex: reward.amount,
      rewardCredited: reward.credited,
      unlocked: true,
    });
  }
  await ctx.db.patch(profile._id, { extensionAdProgress: next });
  return await finish({
    recorded: true,
    granted: false,
    purpose: "extension",
    progress: next,
    rewardNex: reward.amount,
    rewardCredited: reward.credited,
  });
}

/**
 * Issues a short-lived, purpose-specific Monetag challenge. The client gets a
 * unique ymid to pass to the Monetag SDK; the provider confirmation is checked
 * server-side before any progress is applied.
 */
export const requestAd = mutation({
  args: {
    purpose: v.union(
      v.literal("away"),
      v.literal("extension"),
      v.literal("task"),
    ),
    taskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx);
    const config = await loadConfig(ctx);
    const now = Date.now();
    const today = dayKey(now);

    if (!config.miningEnabled) {
      throw new Error("Mining is paused by the operator.");
    }
    if (!process.env.MONETAG_POSTBACK_SECRET) {
      throw new Error(
        "Verified ads are temporarily unavailable because the provider verification callback is not configured.",
      );
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
      if (
        pending.purpose === args.purpose &&
        (args.purpose !== "task" || pending.taskId === args.taskId)
      ) {
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

    if (args.purpose === "task") {
      if (!args.taskId) throw new Error("This ad task is missing its campaign.");
      const task = await ctx.db.get(args.taskId);
      if (!task || task.status !== "active") {
        throw new Error("This campaign is no longer available.");
      }
      if (task.expiresAt && task.expiresAt <= now) {
        throw new Error("This campaign has expired.");
      }
      if (task.verification !== "in_app_ad") {
        throw new Error("This campaign is not a verified rewarded-ad task.");
      }
      if (task.minLevel && (await claimedLevel(ctx, profile.userId)) < task.minLevel) {
        throw new Error("Reach the required claimed level before opening this campaign.");
      }
      const completion = await ctx.db
        .query("taskCompletions")
        .withIndex("by_user_task", (q) =>
          q.eq("userId", profile.userId).eq("taskId", args.taskId!),
        )
        .first();
      if (completion?.status === "verified") {
        throw new Error("You already completed this campaign.");
      }
      if (completion?.status === "pending") {
        throw new Error("This task is already awaiting review. Do not start another view.");
      }
      const expiresAt = now + AD_CHALLENGE_TTL_MS;
      const challengeId = await ctx.db.insert("miningAdChallenges", {
        userId: profile.userId,
        purpose: "task",
        taskId: args.taskId,
        provider: PROVIDER,
        status: "pending",
        createdAt: now,
        expiresAt,
      });
      return {
        challengeId,
        ymid: String(challengeId),
        purpose: "task" as const,
        required: 1,
        progress: 0,
        expiresAt,
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
    const unlockedToday = profile.extensionUnlockDay === today;
    const extensionGranted = Boolean(
      profile.extensionUnlockedAt &&
        !profile.miningExtensionStartedAt &&
        !profile.miningExtensionEndsAt,
    );

    if (args.purpose === "away") {
      if ((profile.awayMiningExpiresAt ?? 0) > now) {
        throw new Error("Background mining is already active for this account.");
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
      if (extensionGranted || unlockedToday) {
        throw new Error(
          "The five-hour extension is already unlocked. Press Start Extra Mining to use it.",
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
    // The public client callback never grants by itself. It records the SDK
    // result, then waits for the provider's secret-authenticated postback.
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
    const logOutcome = async (
      outcome:
        | "verified"
        | "duplicate"
        | "invalid"
        | "expired"
        | "rejected"
        | "unavailable",
      reason?: string,
    ) => {
      await ctx.db.insert("adVerificationEvents", {
        userId: profile.userId,
        purpose: challenge.purpose,
        provider: PROVIDER,
        outcome,
        reason,
        createdAt: Date.now(),
      });
    };
    const settled = (current: Doc<"profiles">) => {
      const granted = challenge.grantedEntitlement ?? false;
      return {
        status: granted ? ("granted" as const) : ("recorded" as const),
        granted,
        purpose: challenge.purpose,
        progress: adProgress(current, challenge.purpose),
        rewardNex: challenge.rewardNex ?? 0,
        endsAt:
          challenge.purpose === "extension"
            ? (current.miningExtensionEndsAt ?? undefined)
            : challenge.purpose === "away"
              ? (current.awayMiningExpiresAt ?? undefined)
              : undefined,
      };
    };
    const now = Date.now();

    if (challenge.status === "completed") {
      if (challenge.clientCompletedAt === undefined) {
        await ctx.db.patch(challenge._id, {
          clientCompletedAt: now,
          clientRewardEventType: args.rewardEventType,
          clientEstimatedPriceUsd: cleanPrice(args.estimatedPriceUsd),
        });
      }
      // Idempotent for the polling client: return the settled outcome without
      // ever applying the challenge a second time. This is a normal poll, not
      // a duplicate ad attempt, so it is not written to the rejection log.
      return settled(profile);
    }
    if (challenge.status === "rejected") {
      await logOutcome("duplicate", "Challenge was already rejected.");
      throw new Error("Monetag rejected this view. Request a new ad.");
    }
    if (challenge.status === "expired") {
      await logOutcome("expired", "Challenge had already expired.");
      throw new Error("This ad challenge has expired. Request a new ad.");
    }
    if (challenge.expiresAt <= now) {
      await ctx.db.patch(challenge._id, { status: "expired" });
      await logOutcome("expired", "Challenge expired before confirmation.");
      throw new Error("This ad challenge has expired. Request a new ad.");
    }

    if (args.rewardEventType !== "valued") {
      await ctx.db.patch(challenge._id, { status: "rejected" });
      await logOutcome(
        "rejected",
        `Provider reward_event_type=${args.rewardEventType}.`,
      );
      return {
        status: "rejected" as const,
        message:
          "Monetag did not confirm a paid reward for this view. No progress was added.",
      };
    }
    if (args.eventType === "click") {
      await ctx.db.patch(challenge._id, { status: "rejected" });
      await logOutcome("rejected", "Provider reported a click, not a view.");
      return {
        status: "rejected" as const,
        message:
          "Monetag reported a click, not a completed rewarded view. No progress was added.",
      };
    }
    if (challenge.clientCompletedAt === undefined) {
      await ctx.db.patch(challenge._id, {
        clientCompletedAt: now,
        clientRewardEventType: args.rewardEventType,
        clientEstimatedPriceUsd: cleanPrice(args.estimatedPriceUsd),
      });
    }

    if (challenge.postbackValuedAt === undefined) {
      if (challenge.status === "pending") {
        await ctx.db.patch(challenge._id, { status: "awaiting" });
      }
      return {
        status: "pending" as const,
        message:
          challenge.postbackRewardEventType === "non_valued"
            ? "Monetag marked this view as non-valued or has not sent a paid confirmation. No progress was added."
            : "Monetag has not sent its server confirmation yet. No progress was added; this view will count automatically if the provider confirms it.",
      };
    }

    const result = await applyAdCompletion(ctx, profile, challenge, now);
    if (!result.recorded) {
      await logOutcome("duplicate", "Completion was already applied.");
      return { status: "already" as const };
    }
    await logOutcome("verified", result.granted ? "Entitlement granted." : "Progress recorded.");
    return {
      status: result.granted ? ("granted" as const) : ("recorded" as const),
      granted: result.granted,
      purpose: result.purpose,
      progress: result.progress,
      rewardNex: result.rewardNex,
      endsAt: result.endsAt,
    };
  },
});

/**
 * Monetag server postback. This is the authoritative completion proof: the
 * request carries the shared secret, the unique ymid and the provider's own
 * valued/non_valued decision. A client can call confirmFromClient with any
 * payload it likes, but no progress is applied without this callback.
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
    const ymid = args.ymid.trim();
    if (!ymid || ymid.length > 128) return { recorded: false as const };
    const rewardEventType = args.rewardEventType.trim();
    if (rewardEventType !== "valued" && rewardEventType !== "non_valued") {
      return { recorded: false as const };
    }
    const eventType = args.eventType.trim().slice(0, 64) || "impression";
    // A click is never a completed rewarded view, even if a malformed provider
    // callback labels the price as valued.
    if (eventType === "click") return { recorded: false as const };

    const challengeId = ctx.db.normalizeId("miningAdChallenges", ymid);
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
      args.telegramId.trim() !== profile.telegramId
    ) {
      return { recorded: false as const };
    }

    const now = Date.now();
    if (challenge.status === "completed") {
      return {
        recorded: true as const,
        valued: challenge.postbackRewardEventType === "valued",
        applied: false as const,
        duplicate: true as const,
        granted: challenge.grantedEntitlement ?? false,
        rewardNex: challenge.rewardNex ?? 0,
        rewardCreditedAt: challenge.rewardCreditedAt,
      };
    }
    if (challenge.status === "expired" || challenge.status === "rejected") {
      return { recorded: false as const };
    }
    if (challenge.expiresAt + POSTBACK_GRACE_MS <= now) {
      await ctx.db.patch(challenge._id, { status: "expired" });
      return { recorded: false as const };
    }

    const valued = rewardEventType === "valued";
    const price = cleanPrice(args.estimatedPriceUsd);
    const patch: Partial<Doc<"miningAdChallenges">> = {
      providerEvent: eventType,
      providerReference: ymid,
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

    if (!valued) {
      return { recorded: true as const, valued: false as const };
    }

    // Re-read after the patch so applyAdCompletion sees the authenticated
    // postback timestamp in this same transaction.
    const verified = (await ctx.db.get(challenge._id))!;
    const result = await applyAdCompletion(ctx, profile, verified, now);
    if (result.recorded) {
      await ctx.db.insert("adVerificationEvents", {
        userId: profile.userId,
        purpose: challenge.purpose,
        provider: PROVIDER,
        outcome: "verified",
        reason: result.granted
          ? "Provider postback granted the entitlement."
          : "Provider postback recorded progress.",
        createdAt: now,
      });
    }

    return {
      recorded: true as const,
      valued: true as const,
      applied: result.recorded,
      granted: result.granted,
      rewardNex: result.recorded ? result.rewardNex : 0,
      rewardCredited: result.recorded ? result.rewardCredited : false,
    };
  },
});

/** Marks expired extension sessions after their server-enforced end time. */
export const finalizeExtensionSessions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("miningExtensionSessions")
      .withIndex("by_status_endsAt", (q) => q.eq("status", "active"))
      .collect();
    const expired = rows
      .filter((row) => row.endsAt !== undefined && row.endsAt <= now)
      .slice(0, 100);
    for (const row of expired) {
      await ctx.db.patch(row._id, {
        status: "expired",
        finalizedAt: row.endsAt,
      });
    }
    return { finalized: expired.length };
  },
});
