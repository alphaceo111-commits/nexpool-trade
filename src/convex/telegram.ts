import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalAction,
  internalMutation,
} from "./_generated/server";
import { ensureAccount } from "./engine";

function parseInitData(initData: string) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([key, value]) => `${key}=${value}`).join("\n");
  const authDate = Number(params.get("auth_date") ?? 0);
  const rawUser = params.get("user");
  let user:
    | {
        id?: number;
        first_name?: string;
        last_name?: string;
        username?: string;
        photo_url?: string;
      }
    | undefined;
  if (rawUser) {
    try {
      user = JSON.parse(rawUser);
    } catch {
      user = undefined;
    }
  }
  return { hash, dataCheckString, authDate, user, startParam: params.get("start_param") };
}

async function importHmacKey(keyData: Uint8Array) {
  return crypto.subtle.importKey(
    "raw",
    keyData as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function hmacHex(keyData: Uint8Array, message: string) {
  const key = await importHmacKey(keyData);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Validates Telegram Mini App initData with the bot token (HMAC-SHA256 per
 * Telegram's documented scheme) and links the verified identity to the account.
 * Without a configured bot token it reports that honestly — it never guesses.
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
    if (!args.initData) {
      return { linked: false, reason: "No Telegram session was provided." };
    }

    const parsed = parseInitData(args.initData);
    if (!parsed) return { linked: false, reason: "Malformed Telegram initData." };
    if (
      !parsed.authDate ||
      Math.abs(Date.now() / 1000 - parsed.authDate) > 86_400
    ) {
      return { linked: false, reason: "Telegram session expired. Reopen the mini app." };
    }
    if (!parsed.user?.id) {
      return { linked: false, reason: "Telegram user payload missing." };
    }

    try {
      const webAppData = new TextEncoder().encode("WebAppData");
      const secret = await hmacHex(webAppData, token);
      const secretBytes = new Uint8Array(
        secret.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)),
      );
      const computed = await hmacHex(secretBytes, parsed.dataCheckString);
      if (computed !== parsed.hash) {
        return { linked: false, reason: "Telegram signature did not validate." };
      }
    } catch (error) {
      console.error("Telegram signature error", error);
      return { linked: false, reason: "Could not validate the Telegram signature." };
    }

    const telegramId = String(parsed.user.id);
    const result = await ctx.runMutation(internal.telegram.attachIdentity, {
      telegramId,
      firstName: parsed.user.first_name,
      lastName: parsed.user.last_name,
      username: parsed.user.username,
      photoUrl: parsed.user.photo_url,
      startParam: parsed.startParam ?? undefined,
    });
    return {
      linked: true,
      telegramId: result.telegramId,
      startParam: parsed.startParam ?? undefined,
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
