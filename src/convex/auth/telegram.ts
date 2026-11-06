import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { createAccount } from "@convex-dev/auth/server";

export type TelegramIdentity = {
  telegramId: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
  startParam?: string;
};

export type TelegramCheck =
  | { ok: true; identity: TelegramIdentity }
  | { ok: false; reason: string };

function parseInitData(initData: string) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
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
  return {
    hash,
    dataCheckString,
    authDate,
    user,
    startParam: params.get("start_param") ?? undefined,
  };
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
 * Validates the Mini App initData Telegram hands to the client with the bot
 * token (HMAC-SHA256 per Telegram's documented scheme). The client can never
 * forge an identity: the signature, the user payload and a fresh auth_date are
 * all required.
 */
export async function verifyTelegramInitData(
  initData: string,
  token: string,
): Promise<TelegramCheck> {
  if (!initData) {
    return { ok: false, reason: "No Telegram session was provided." };
  }
  const parsed = parseInitData(initData);
  if (!parsed) return { ok: false, reason: "Malformed Telegram initData." };
  if (!parsed.authDate || Math.abs(Date.now() / 1000 - parsed.authDate) > 86_400) {
    return { ok: false, reason: "Telegram session expired. Reopen the mini app." };
  }
  if (!parsed.user?.id) {
    return { ok: false, reason: "Telegram user payload missing." };
  }

  try {
    const webAppData = new TextEncoder().encode("WebAppData");
    const secret = await hmacHex(webAppData, token);
    const secretBytes = new Uint8Array(
      secret.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)),
    );
    const computed = await hmacHex(secretBytes, parsed.dataCheckString);
    if (computed !== parsed.hash) {
      return { ok: false, reason: "Telegram signature did not validate." };
    }
  } catch (error) {
    console.error("Telegram signature error", error);
    return { ok: false, reason: "Could not validate the Telegram signature." };
  }

  return {
    ok: true,
    identity: {
      telegramId: String(parsed.user.id),
      firstName: parsed.user.first_name,
      lastName: parsed.user.last_name,
      username: parsed.user.username,
      photoUrl: parsed.user.photo_url,
      startParam: parsed.startParam,
    },
  };
}

export const TELEGRAM_PROVIDER_ID = "telegram";

/** Telegram ids the operator allowlisted for backend admin access. */
export function telegramAdminIds(): string[] {
  return (
    process.env.ADMIN_TELEGRAM_ID ??
    process.env.TELEGRAM_ADMIN_ID ??
    process.env.TELEGRAM_OWNER_ID ??
    ""
  )
    .split(/[\s,]+/)
    .filter(Boolean);
}

/**
 * Telegram is the only real sign-in for NEXPOOL. The authorizing identity is
 * the verified telegramId, so the same Telegram account always resolves to the
 * same NEXPOOL account across devices and app relaunches.
 */
export const telegramAuth = ConvexCredentials({
  id: TELEGRAM_PROVIDER_ID,
  authorize: async (credentials, ctx) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error(
        "Telegram sign-in is not configured: TELEGRAM_BOT_TOKEN is missing on the backend.",
      );
    }
    const initData =
      typeof credentials.initData === "string" ? credentials.initData : "";
    const check = await verifyTelegramInitData(initData, token);
    if (!check.ok) throw new Error(check.reason);

    const { identity } = check;
    const isOwner = telegramAdminIds().includes(identity.telegramId);
    const displayName =
      [identity.firstName, identity.lastName].filter(Boolean).join(" ").trim() ||
      identity.username ||
      "NEX miner";

    // Idempotent: an existing telegramId resolves to its existing user.
    const { user } = await createAccount(ctx, {
      provider: TELEGRAM_PROVIDER_ID,
      account: { id: identity.telegramId },
      profile: {
        name: displayName.slice(0, 60),
        ...(identity.photoUrl ? { image: identity.photoUrl } : {}),
        isAnonymous: false,
        role: isOwner ? "admin" : "user",
      },
    });
    return { userId: user._id };
  },
});
