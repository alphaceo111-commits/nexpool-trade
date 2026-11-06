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
    const { profile } = await ensureAccount(ctx, {
      referralCode: args.startParam,
    });

    const duplicate = await ctx.db
      .query("profiles")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", args.telegramId))
      .first();
    if (duplicate && duplicate._id !== profile._id) {
      throw new Error(
        "This Telegram account is already linked to another NEXPOOL account.",
      );
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
    });

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
