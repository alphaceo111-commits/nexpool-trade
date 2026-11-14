import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { notifyUser, requireProfile, roundNex } from "./engine";
import { DEFAULT_TASK_XP, awardXp, claimedLevel } from "./levels";
import { syncReferralProgress } from "./referralEngine";

/** Stage a task for verification. A click alone never pays out. */
export const submit = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx);
    if (profile.restricted) {
      throw new Error("Account restricted. Contact support before completing tasks.");
    }
    const task = await ctx.db.get(args.taskId);
    if (!task || task.status !== "active") {
      throw new Error("This task is no longer available.");
    }
    if (task.expiresAt && task.expiresAt <= Date.now()) {
      throw new Error("This task has expired.");
    }
    if (task.minLevel) {
      const level = await claimedLevel(ctx, profile.userId);
      if (level < task.minLevel) {
        throw new Error(`This campaign unlocks at level ${task.minLevel}.`);
      }
    }

    const existing = await ctx.db
      .query("taskCompletions")
      .withIndex("by_user_task", (q) =>
        q.eq("userId", profile.userId).eq("taskId", args.taskId),
      )
      .first();
    if (existing?.status === "verified") {
      throw new Error("You already completed this task.");
    }

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "pending",
        submittedAt: now,
        note:
          "Submitted for verification. Rewards are credited only after confirmation.",
      });
    } else {
      await ctx.db.insert("taskCompletions", {
        userId: profile.userId,
        taskId: args.taskId,
        status: "pending",
        startedAt: now,
        submittedAt: now,
        rewardNex: task.rewardNex,
        speedBonusNexPerHour: task.speedBonusNexPerHour,
        note:
          "Submitted for verification. Rewards are credited only after confirmation.",
      });
    }
    return { status: "pending" as const };
  },
});

/** Read-only context for the verification action. */
export const verificationContext = internalQuery({
  args: { taskId: v.id("tasks"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    const completion = await ctx.db
      .query("taskCompletions")
      .withIndex("by_user_task", (q) =>
        q.eq("userId", args.userId).eq("taskId", args.taskId),
      )
      .first();
    const level = await claimedLevel(ctx, args.userId);
    return { task, profile, completion, level };
  },
});

export const markCompletion = internalMutation({
  args: {
    completionId: v.id("taskCompletions"),
    status: v.union(
      v.literal("pending"),
      v.literal("rejected"),
      v.literal("unavailable"),
    ),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.completionId, {
      status: args.status,
      note: args.note,
      submittedAt: Date.now(),
    });
  },
});

/**
 * Verified completion -> confirmed NEX + mining-speed bonus. Idempotent: the
 * completion status is re-checked inside the transaction.
 */
export async function grantTaskRewardForCompletion(
  ctx: MutationCtx,
  args: {
    completionId: Id<"taskCompletions">;
    verifiedBy: string;
    note: string;
  },
) {
  const completion = await ctx.db.get(args.completionId);
    if (!completion) throw new Error("Completion not found.");
    if (completion.status === "verified") {
      return { granted: false, reason: "already-verified" as const };
    }

    const task = await ctx.db.get(completion.taskId);
    if (!task) throw new Error("Task not found.");

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", completion.userId))
      .first();
    if (!profile) throw new Error("Profile not found.");

    const balance = await ctx.db
      .query("balances")
      .withIndex("by_user", (q) => q.eq("userId", completion.userId))
      .first();
    if (!balance) throw new Error("Balance not found.");

    const now = Date.now();
    const reward = roundNex(completion.rewardNex);

    await ctx.db.patch(profile._id, { lastActiveAt: now });
    await ctx.db.patch(completion._id, {
      status: "verified",
      verifiedAt: now,
      verifiedBy: args.verifiedBy,
      note: args.note,
    });

    if (reward > 0) {
      await ctx.db.patch(balance._id, {
        availableNex: roundNex(balance.availableNex + reward),
        lifetimeTaskNex: roundNex(balance.lifetimeTaskNex + reward),
        updatedAt: now,
      });
      await ctx.db.insert("ledger", {
        userId: completion.userId,
        kind: "task",
        amountNex: reward,
        memo: `Task reward · ${task.title}`,
        refId: String(task._id),
        createdAt: now,
      });
    }

    // XP is only ever minted here, after the backend has verified the task.
    const xpAward = await awardXp(ctx, {
      userId: completion.userId,
      profile,
      amountXp: task.xpReward ?? DEFAULT_TASK_XP,
      source: "task",
      refId: String(task._id),
      memo: `Task verified · ${task.title}`,
    });

    const speedNote =
      completion.speedBonusNexPerHour > 0
        ? ` Mining speed +${completion.speedBonusNexPerHour} NEX/h is now active.`
        : "";
    await notifyUser(
      ctx,
      profile,
      "task",
      "Task verified",
      `${task.title} confirmed by ${args.verifiedBy}.${reward > 0 ? ` ${reward} NEX credited.` : ""} +${Math.round(task.xpReward ?? DEFAULT_TASK_XP)} XP.${speedNote}`,
    );

    // This is the referral state machine's only trigger. A verified task moves
    // the invitee Pending -> In Progress -> Qualified and notifies the inviter
    // once per transition; duplicate task rows cannot count twice.
    const updatedProfile = (await ctx.db.get(profile._id))!;
    await syncReferralProgress(ctx, updatedProfile);

    return { granted: true, rewardNex: reward, xp: xpAward.xp };
}

export const grantTaskReward = internalMutation({
  args: {
    completionId: v.id("taskCompletions"),
    verifiedBy: v.string(),
    note: v.string(),
  },
  handler: async (ctx, args) =>
    await grantTaskRewardForCompletion(ctx, args),
});

const TELEGRAM_MEMBER_STATES = new Set([
  "creator",
  "administrator",
  "member",
]);

async function telegramMembership(target: string, telegramId: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return {
      ok: false as const,
      unavailable: "TELEGRAM_BOT_TOKEN is not configured on the backend. Verification cannot be requested yet.",
    };
  }
  const chatId = target.startsWith("@") ? target : `@${target}`;
  const url = `https://api.telegram.org/bot${token}/getChatMember?chat_id=${encodeURIComponent(chatId)}&user_id=${encodeURIComponent(telegramId)}`;
  try {
    const response = await fetch(url, { method: "GET" });
    const payload = (await response.json()) as {
      ok: boolean;
      description?: string;
      result?: { status?: string };
    };
    if (!payload.ok || !payload.result?.status) {
      return {
        ok: false as const,
        unavailable: payload.description
          ? `Telegram rejected the membership check: ${payload.description}`
          : "Telegram could not confirm membership. The NEXPOOL bot must be an admin in the sponsor chat.",
      };
    }
    return {
      ok: true as const,
      member: TELEGRAM_MEMBER_STATES.has(payload.result.status),
      status: payload.result.status,
    };
  } catch {
    return {
      ok: false as const,
      unavailable: "Telegram verification service is unreachable. Try again shortly.",
    };
  }
}

async function adProviderVerification(userId: string, placement: string) {
  const url = process.env.AD_PROVIDER_VERIFY_URL;
  const key = process.env.AD_PROVIDER_API_KEY;
  if (!url || !key) {
    return {
      ok: false as const,
      unavailable:
        "No advertising verification provider is configured. Advertiser rewards stay unavailable until a provider is connected.",
    };
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ user_id: userId, placement, event: "complete" }),
    });
    const payload = (await response.json()) as {
      verified?: boolean;
      reference?: string;
    };
    return {
      ok: true as const,
      member: Boolean(payload.verified),
      status: payload.reference ?? "provider-response",
    };
  } catch {
    return {
      ok: false as const,
      unavailable: "Advertising provider is unreachable. No reward was issued.",
    };
  }
}

/**
 * Server-side verification. Never trusts the client: it re-reads the task and
 * the user's Telegram identity, calls the real provider, and only then grants.
 */
export const verifyTask = action({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args): Promise<{
    status: "verified" | "rejected" | "pending" | "unavailable";
    message: string;
    rewardNex?: number;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to verify tasks.");

    const context = await ctx.runQuery(internal.tasks.verificationContext, {
      taskId: args.taskId,
      userId,
    });
    if (!context.task || !context.profile) {
      return { status: "unavailable", message: "Task or account not found." };
    }
    const { task, profile } = context;
    if (task.status !== "active" || (task.expiresAt && task.expiresAt <= Date.now())) {
      return { status: "unavailable", message: "This task is no longer available." };
    }
    if (profile.restricted) {
      return {
        status: "unavailable",
        message: "Account restricted. Contact support.",
      };
    }
    if (task.minLevel && context.level < task.minLevel) {
      return {
        status: "unavailable",
        message: `This campaign unlocks at level ${task.minLevel}.`,
      };
    }

    let completionId = context.completion?._id;
    if (context.completion?.status === "verified") {
      return { status: "verified", message: "Already verified." };
    }
    if (!completionId) {
      completionId = await ctx.runMutation(internal.tasks.createCompletion, {
        taskId: args.taskId,
        userId,
      });
    }

    if (
      task.verification === "telegram_channel" ||
      task.verification === "telegram_group"
    ) {
      if (!task.target) {
        await ctx.runMutation(internal.tasks.markCompletion, {
          completionId,
          status: "unavailable",
          note: "Sponsor chat target is missing. No reward was issued.",
        });
        return {
          status: "unavailable",
          message: "Sponsor chat is not configured. No reward was issued.",
        };
      }
      if (!profile.telegramId) {
        await ctx.runMutation(internal.tasks.markCompletion, {
          completionId,
          status: "unavailable",
          note: "Link your Telegram account before verification.",
        });
        return {
          status: "unavailable",
          message: "Link your Telegram account first, then verify again.",
        };
      }
      const result = await telegramMembership(task.target, profile.telegramId);
      if (!result.ok) {
        await ctx.runMutation(internal.tasks.markCompletion, {
          completionId,
          status: "unavailable",
          note: result.unavailable,
        });
        return { status: "unavailable", message: result.unavailable };
      }
      if (!result.member) {
        await ctx.runMutation(internal.tasks.markCompletion, {
          completionId,
          status: "rejected",
          note: `Telegram reports status "${result.status}". Join the sponsor chat and verify again.`,
        });
        return {
          status: "rejected",
          message: "Membership not confirmed by Telegram. Join the sponsor chat, then verify again.",
        };
      }
      const granted = await ctx.runMutation(internal.tasks.grantTaskReward, {
        completionId,
        verifiedBy: "telegram-api",
        note: `Membership confirmed by Telegram (${result.status}).`,
      });
      return {
        status: "verified",
        message: granted.granted
          ? "Membership confirmed. Reward credited."
          : "Already verified.",
        rewardNex: granted.rewardNex ?? 0,
      };
    }

    if (task.verification === "provider_ad") {
      const result = await adProviderVerification(
        String(userId),
        task.target ?? String(task._id),
      );
      if (!result.ok) {
        await ctx.runMutation(internal.tasks.markCompletion, {
          completionId,
          status: "unavailable",
          note: result.unavailable,
        });
        return { status: "unavailable", message: result.unavailable };
      }
      if (!result.member) {
        await ctx.runMutation(internal.tasks.markCompletion, {
          completionId,
          status: "pending",
          note: "Provider has not reported a completed view yet.",
        });
        return {
          status: "pending",
          message: "The advertising provider has not confirmed this completion yet.",
        };
      }
      const granted = await ctx.runMutation(internal.tasks.grantTaskReward, {
        completionId,
        verifiedBy: "ad-provider",
        note: `Provider reference ${result.status}.`,
      });
      return {
        status: "verified",
        message: "Ad completion confirmed by the provider. Reward credited.",
        rewardNex: granted.rewardNex ?? 0,
      };
    }

    if (task.verification === "in_app_ad") {
      // A client timer is never proof. In-app ad rewards settle exclusively via
      // the secret-authenticated Monetag postback challenge in miningAds.
      await ctx.runMutation(internal.tasks.markCompletion, {
        completionId,
        status: "unavailable",
        note: "Awaiting a secret-authenticated Monetag provider postback.",
      });
      return {
        status: "unavailable",
        message:
          "This campaign is verified by Monetag's server postback. Open the rewarded view from the task card; a client timer cannot release the reward.",
      };
    }

    const note =
      task.verification === "telegram_bot"
        ? "Sponsor bot has no verification API. An operator must confirm the start event."
        : task.verification === "social"
          ? "Social tasks need operator confirmation of the public action."
          : "Submitted for operator review.";

    await ctx.runMutation(internal.tasks.markCompletion, {
      completionId,
      status: "pending",
      note,
    });
    return { status: "pending", message: note };
  },
});

/** Creates a completion row for a verification action that has no prior submit. */
export async function createCompletionForTask(
  ctx: MutationCtx,
  args: { taskId: Id<"tasks">; userId: Id<"users"> },
) {
  const task = await ctx.db.get(args.taskId);
  if (!task) throw new Error("Task not found.");
  const existing = await ctx.db
    .query("taskCompletions")
    .withIndex("by_user_task", (q) =>
      q.eq("userId", args.userId).eq("taskId", args.taskId),
    )
    .first();
  if (existing) return existing._id;
  return await ctx.db.insert("taskCompletions", {
    userId: args.userId,
    taskId: args.taskId,
    status: "pending",
    startedAt: Date.now(),
    rewardNex: task.rewardNex,
    speedBonusNexPerHour: task.speedBonusNexPerHour,
  });
}

export const createCompletion = internalMutation({
  args: { taskId: v.id("tasks"), userId: v.id("users") },
  handler: async (ctx, args) => await createCompletionForTask(ctx, args),
});
