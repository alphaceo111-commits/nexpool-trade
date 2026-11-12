import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalAction,
  internalMutation,
} from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { telegramAdminIds, verifyTelegramInitData } from "./auth/telegram";
import { ensureAccount } from "./engine";
import { attachReferral, syncReferralProgress } from "./referralEngine";

async function claimTelegramIdentity(
  ctx: MutationCtx,
  telegramId: string,
  profile: { _id: Id<"profiles">; userId: Id<"users"> },
  now: number,
) {
  const claim = await ctx.db
    .query("telegramIdentities")
    .withIndex("by_telegramId", (q) => q.eq("telegramId", telegramId))
    .first();
  if (claim) {
    if (claim.profileId !== profile._id || claim.userId !== profile.userId) {
      throw new Error(
        "This Telegram account is already linked to a different NEXPOOL account. Account recovery is required.",
      );
    }
    await ctx.db.patch(claim._id, {
      verifiedAt: now,
      updatedAt: now,
    });
    return claim;
  }
  const claimId = await ctx.db.insert("telegramIdentities", {
    telegramId,
    userId: profile.userId,
    profileId: profile._id,
    verifiedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  return (await ctx.db.get(claimId))!;
}

/**
 * Resolves the canonical NEXPOOL user for a verified Telegram numeric ID
 * before Convex Auth creates anything. This runs inside the auth provider's
 * action through an internal mutation, so both the auth account and the
 * NEXPOOL profile are reconciled atomically.
 */
export const resolveTelegramSignIn = internalMutation({
  args: {
    telegramId: v.string(),
    isAdmin: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const claim = await ctx.db
      .query("telegramIdentities")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", args.telegramId))
      .first();
    const profiles = await ctx.db
      .query("profiles")
      .withIndex("by_telegramId", (q) =>
        q.eq("telegramId", args.telegramId),
      )
      .collect();

    const authAccount = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "telegram").eq("providerAccountId", args.telegramId),
      )
      .first();

    // A legacy profile can share the Telegram id with the profile created by
    // Telegram auth. Signing in must still work so the operator can reach the
    // recovery desk; the authenticated profile is the one that owns the
    // authAccounts row, never an unverified legacy claim.
    const conflictRecovery = profiles.length > 1;
    let profile = profiles[0] ?? null;
    if (conflictRecovery) {
      if (!authAccount) {
        throw new Error(
          "Multiple NEXPOOL accounts claim this Telegram identity and none owns the Telegram auth account. Account recovery must be run by the operator.",
        );
      }
      const ownedProfiles = profiles.filter(
        (candidate) => candidate.userId === authAccount.userId,
      );
      if (ownedProfiles.length !== 1) {
        throw new Error(
          "Multiple NEXPOOL profiles belong to this Telegram auth user. Account recovery must be run by the operator.",
        );
      }
      profile = ownedProfiles[0];
      if (claim && !profiles.some((row) => row._id === claim.profileId)) {
        throw new Error(
          "The canonical Telegram registry points at a third profile. Account recovery must be run by the operator.",
        );
      }
    } else if (!profile && claim) {
      const claimedProfile = await ctx.db.get(claim.profileId);
      if (!claimedProfile) {
        throw new Error(
          "The canonical Telegram claim points at a missing profile. Account recovery is required.",
        );
      }
      profile = claimedProfile;
    }
    if (
      !conflictRecovery &&
      claim &&
      profile &&
      claim.profileId !== profile._id
    ) {
      throw new Error(
        "The Telegram identity registry conflicts with this profile. Account recovery is required.",
      );
    }
    if (
      !conflictRecovery &&
      claim &&
      authAccount &&
      claim.userId !== authAccount.userId
    ) {
      throw new Error(
        "The Telegram identity registry conflicts with the auth account. Account recovery is required.",
      );
    }

    if (profile) {
      if (authAccount && authAccount.userId !== profile.userId) {
        throw new Error(
          "This Telegram account is attached to a different NEXPOOL user. Account recovery is required.",
        );
      }
      if (!profile.telegramVerifiedAt && !authAccount) {
        throw new Error(
          "This profile's Telegram identity was never verified. Account recovery is required.",
        );
      }
      if (!authAccount) {
        await ctx.db.insert("authAccounts", {
          userId: profile.userId,
          provider: "telegram",
          providerAccountId: args.telegramId,
        });
      }
      const user = await ctx.db.get(profile.userId);
      if (!user) {
        throw new Error(
          "This NEXPOOL profile has no auth user. Account recovery is required.",
        );
      }
      if (user.isAnonymous) {
        await ctx.db.patch(user._id, { isAnonymous: false });
      }
      if (args.isAdmin && user?.role !== "admin") {
        await ctx.db.patch(profile.userId, { role: "admin" });
      }
      if (!claim || claim.profileId === profile._id) {
        await claimTelegramIdentity(ctx, args.telegramId, profile, now);
      }
      if (!profile.telegramId || !profile.telegramVerifiedAt) {
        await ctx.db.patch(profile._id, {
          telegramId: args.telegramId,
          telegramVerifiedAt: now,
        });
      }
      return {
        userId: profile.userId,
        linkedLegacy: !authAccount,
        conflict: conflictRecovery,
      };
    }

    if (authAccount) {
      const user = await ctx.db.get(authAccount.userId);
      if (!user) {
        throw new Error(
          "The Telegram auth account has no user row. Account recovery is required.",
        );
      }
      if (user.isAnonymous) {
        await ctx.db.patch(user._id, { isAnonymous: false });
      }
      if (args.isAdmin && user?.role !== "admin") {
        await ctx.db.patch(authAccount.userId, { role: "admin" });
      }
      return { userId: authAccount.userId, linkedLegacy: false };
    }

    return { userId: null, linkedLegacy: false };
  },
});

/**
 * Links the Telegram identity to the signed-in account. Sign-in itself happens
 * through the `telegram` auth provider; this action keeps the NEXPOOL profile
 * (display name, handle, avatar, chat id for notifications) in sync.
 */
export const linkTelegram = action({
  args: { initData: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    linked: boolean;
    reason?: string;
    telegramId?: string;
    startParam?: string;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { linked: false, reason: "Sign in first." };

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return {
        linked: false,
        reason:
          "TELEGRAM_BOT_TOKEN is not configured on the backend, so Telegram initData cannot be validated.",
      };
    }

    const check = await verifyTelegramInitData(args.initData, token);
    if (!check.ok) return { linked: false, reason: check.reason };

    const { identity } = check;
    const result = await ctx.runMutation(internal.telegram.attachIdentity, {
      telegramId: identity.telegramId,
      firstName: identity.firstName,
      lastName: identity.lastName,
      username: identity.username,
      photoUrl: identity.photoUrl,
      startParam: identity.startParam,
    });
    return {
      linked: true,
      telegramId: result.telegramId,
      startParam: identity.startParam,
    };
  },
});

export const attachIdentity = internalMutation({
  args: {
    telegramId: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    username: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
    startParam: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in first.");

    // Check conflicts BEFORE ensureAccount creates a profile. Otherwise a
    // stale Telegram sign-in could leave an empty orphan profile behind even
    // though the identity belongs to a different canonical account.
    const existingByTelegram = await ctx.db
      .query("profiles")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", args.telegramId))
      .first();
    const currentProfile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const linkedAccount = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "telegram").eq("providerAccountId", args.telegramId),
      )
      .first();
    const identityClaim = await ctx.db
      .query("telegramIdentities")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", args.telegramId))
      .first();
    const authOwnsTelegram = linkedAccount?.userId === userId;
    const conflictOwner = Boolean(
      authOwnsTelegram &&
        ((existingByTelegram && existingByTelegram.userId !== userId) ||
          (identityClaim && identityClaim.userId !== userId)),
    );

    if (
      existingByTelegram &&
      existingByTelegram.userId !== userId &&
      !conflictOwner
    ) {
      throw new Error(
        "This Telegram account is already linked to another NEXPOOL account. Use account recovery instead of creating a new account.",
      );
    }
    if (
      currentProfile?.telegramId &&
      currentProfile.telegramId !== args.telegramId
    ) {
      throw new Error(
        "This NEXPOOL account is already linked to a different Telegram ID. Contact the operator to repair the identity.",
      );
    }
    if (
      identityClaim &&
      identityClaim.userId !== userId &&
      !conflictOwner
    ) {
      throw new Error(
        "This Telegram account has a canonical claim on a different NEXPOOL user. Account recovery is required.",
      );
    }

    let { profile } = await ensureAccount(ctx);

    const duplicate = await ctx.db
      .query("profiles")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", args.telegramId))
      .first();
    if (
      duplicate &&
      duplicate._id !== profile._id &&
      !conflictOwner
    ) {
      throw new Error(
        "This Telegram account is already linked to another NEXPOOL account. Use account recovery instead of creating a new account.",
      );
    }

    // An anonymous browser session that later opens inside Telegram should keep
    // its NEX ID. Attach the verified Telegram auth account to the current
    // user before the client switches sessions; Convex Auth then resolves the
    // same user instead of creating a second NEXPOOL account.
    if (linkedAccount && linkedAccount.userId !== profile.userId) {
      throw new Error(
        "This Telegram account is already attached to another NEXPOOL user.",
      );
    }
    if (!linkedAccount) {
      await ctx.db.insert("authAccounts", {
        userId: profile.userId,
        provider: "telegram",
        providerAccountId: args.telegramId,
      });
    }
    if (!identityClaim || identityClaim.userId === userId) {
      await claimTelegramIdentity(ctx, args.telegramId, profile, Date.now());
    }
    const authUser = await ctx.db.get(profile.userId);
    if (authUser?.isAnonymous) {
      await ctx.db.patch(profile.userId, { isAnonymous: false });
    }

    const displayName =
      [args.firstName, args.lastName].filter(Boolean).join(" ").trim() ||
      profile.displayName;

    await ctx.db.patch(profile._id, {
      telegramId: args.telegramId,
      telegramVerifiedAt: Date.now(),
      displayName: displayName.slice(0, 40),
      username: args.username?.slice(0, 32) ?? profile.username,
      photoUrl: args.photoUrl ?? profile.photoUrl,
      lastActiveAt: Date.now(),
    });
    profile = (await ctx.db.get(profile._id))!;

    // The start_param is Telegram's signed Mini App launch payload. Binding it
    // here covers every launch path, including one where the profile already
    // existed (a duplicate /start or a later reopen).
    if (args.startParam) {
      await attachReferral(ctx, {
        code: args.startParam,
        inviteeProfile: profile,
        inviteeTelegramId: args.telegramId,
        inviteeName: displayName,
        inviteeUsername: args.username,
        inviteePhotoUrl: args.photoUrl,
        source: "mini_app",
      });
      profile = (await ctx.db.get(profile._id))!;
    }
    // Reconcile even without a start_param so a record created by the bot is
    // linked to this profile by verified Telegram id on any later reopen.
    await syncReferralProgress(ctx, profile);

    // The provider sets this at account creation too, but existing accounts
    // created before the allowlist was configured must be promoted here. This
    // is server-side only; a Telegram username is never treated as a role.
    if (telegramAdminIds().includes(args.telegramId)) {
      const user = await ctx.db.get(profile.userId);
      if (user?.role !== "admin") {
        await ctx.db.patch(profile.userId, { role: "admin" });
      }
    }

    return { telegramId: args.telegramId };
  },
});

/** Best-effort Telegram delivery. Financial state is always read in-app. */
export const push = internalAction({
  args: { chatId: v.string(), text: v.string() },
  handler: async (_ctx, args) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return { delivered: false, reason: "not-configured" };
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: args.chatId,
            text: args.text.slice(0, 4000),
            disable_web_page_preview: true,
          }),
        },
      );
      if (!response.ok) {
        console.error("Telegram push rejected", await response.text());
        return { delivered: false, reason: "api-error" };
      }
      return { delivered: true };
    } catch (error) {
      console.error("Telegram push failed", error);
      return { delivered: false, reason: "network-error" };
    }
  },
});
