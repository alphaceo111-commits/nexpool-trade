import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalAction,
  internalMutation,
} from "./_generated/server";
import { telegramAdminIds, verifyTelegramInitData } from "./auth/telegram";
import { ensureAccount } from "./engine";
import { attachReferral, syncReferralProgress } from "./referralEngine";

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
    let { profile } = await ensureAccount(ctx);

    const duplicate = await ctx.db
      .query("profiles")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", args.telegramId))
      .first();
    if (duplicate && duplicate._id !== profile._id) {
      throw new Error(
        "This Telegram account is already linked to another NEXPOOL account.",
      );
    }

    // An anonymous browser session that later opens inside Telegram should keep
    // its NEX ID. Attach the verified Telegram auth account to the current
    // user before the client switches sessions; Convex Auth then resolves the
    // same user instead of creating a second NEXPOOL account.
    const linkedAccount = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "telegram").eq("providerAccountId", args.telegramId),
      )
      .first();
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
