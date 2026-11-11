import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { telegramWebhookSecret } from "./telegramWebhook";

const http = httpRouter();

auth.addHttpRoutes(http);

function sameSecret(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

/** Joins the configured app origin with a mini-app route without breaking a
 * deployment that is served under a subpath. */
function withAppPath(base: string, path: string | undefined) {
  if (!path) return base;
  try {
    const url = new URL(base);
    const current = url.pathname.replace(/\/+$/, "");
    if (current === "" || current === "/app" || current === "/index.html") {
      url.pathname = path;
    }
    return url.toString();
  } catch {
    return base;
  }
}

/** Health probe for the bot endpoint. */
http.route({
  path: "/telegram/webhook",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(
      JSON.stringify({ service: "nexpool-bot", status: "ready" }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }),
});

/**
 * Telegram webhook. Point the bot at this URL with setWebhook.
 * The secret header is derived from TELEGRAM_BOT_TOKEN so it is always a
 * Telegram-legal token and no extra secret has to be provisioned.
 */
http.route({
  path: "/telegram/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = await telegramWebhookSecret();
    if (
      !secret ||
      request.headers.get("x-telegram-bot-api-secret-token") !== secret
    ) {
      return new Response("unauthorized", { status: 401 });
    }

    let update: {
      message?: {
        text?: string;
        chat?: { id?: number | string; type?: string };
        from?: {
          id?: number | string;
          username?: string;
          first_name?: string;
        };
      };
      edited_message?: {
        text?: string;
        chat?: { id?: number | string; type?: string };
        from?: {
          id?: number | string;
          username?: string;
          first_name?: string;
        };
      };
    };
    try {
      update = await request.json();
    } catch {
      return new Response("bad request", { status: 400 });
    }

    const message = update.message ?? update.edited_message;
    const text = message?.text?.trim();
    if (!text) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const chatId =
      message?.chat?.id !== undefined ? String(message.chat.id) : undefined;
    // `from.id` is the permanent Telegram user identity. In a group, chat.id is
    // the group, so falling back to it would attribute a referral to the group.
    const telegramUserId =
      message?.from?.id !== undefined ? String(message.from.id) : undefined;

    const reply = await ctx.runMutation(internal.bot.handleIncoming, {
      text,
      chatId,
      telegramUserId,
      telegramUsername: message?.from?.username,
      telegramName: message?.from?.first_name,
      source: "telegram",
    });

    const configuredAppUrl =
      process.env.MINI_APP_URL ??
      process.env.APP_ORIGIN ??
      process.env.SITE_URL ??
      process.env.CONVEX_SITE_URL;
    // Telegram rejects the whole message if a web_app button has a non-HTTPS
    // URL, which would make the bot look silent. Only attach a valid button.
    const appUrl =
      configuredAppUrl && configuredAppUrl.startsWith("https://")
        ? configuredAppUrl
        : null;
    // A referral deep link carries its code into the mini app launch URL so
    // `app.ensure` binds the invite when the recipient opens the app.
    let buttonUrl =
      appUrl && reply.button ? withAppPath(appUrl, reply.button.path) : null;
    if (buttonUrl && reply.referralCode) {
      const base = buttonUrl;
      try {
        const url = new URL(base);
        url.searchParams.set("ref", reply.referralCode);
        buttonUrl = url.toString();
      } catch {
        buttonUrl = base;
      }
    }
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (token && chatId) {
      try {
        const payload: Record<string, unknown> = {
          chat_id: chatId,
          text: reply.text,
          disable_web_page_preview: true,
        };
        if (reply.button && buttonUrl) {
          payload.reply_markup = {
            inline_keyboard: [
              [{ text: reply.button.label, web_app: { url: buttonUrl } }],
            ],
          };
        }
        const send = () =>
          fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });
        let response = await send();
        if (!response.ok && payload.reply_markup) {
          // A rejected button must not swallow the actual reply.
          delete payload.reply_markup;
          response = await send();
        }
        if (!response.ok) {
          console.error(
            "Telegram sendMessage failed",
            response.status,
            await response.text(),
          );
        }
      } catch (error) {
        console.error("Telegram sendMessage failed", error);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }),
});

/**
 * Authoritative Monetag server postback. The shared secret authenticates the
 * request, the ymid ties it to one server-issued challenge, and only
 * reward_event_type=valued can settle progress. The frontend SDK callback is
 * never sufficient on its own.
 */
http.route({
  path: "/monetag/postback",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const expected = process.env.MONETAG_POSTBACK_SECRET;
    if (!expected) {
      return new Response("postback endpoint not configured", { status: 503 });
    }
    const url = new URL(request.url);
    const secret = url.searchParams.get("secret") ?? "";
    if (!secret || !sameSecret(secret, expected)) {
      return new Response("unauthorized", { status: 403 });
    }

    const ymid = url.searchParams.get("ymid") ?? "";
    const telegramId = url.searchParams.get("telegram_id") ?? "";
    const priceRaw = url.searchParams.get("estimated_price");
    const price = priceRaw === null ? undefined : Number(priceRaw);
    if (!ymid) {
      return new Response(JSON.stringify({ ok: true, recorded: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const result = await ctx.runMutation(
      internal.miningAds.recordMonetagPostback,
      {
        ymid,
        telegramId: /^\d+$/.test(telegramId) ? telegramId : undefined,
        eventType: url.searchParams.get("event_type") ?? "impression",
        rewardEventType:
          url.searchParams.get("reward_event_type") ?? "non_valued",
        estimatedPriceUsd:
          price !== undefined && Number.isFinite(price) ? price : undefined,
      },
    );
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }),
});

/** TON Connect manifest, served over HTTPS with the caller's app origin. */
http.route({
  path: "/tonconnect/manifest",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const referer = request.headers.get("referer");
    let refererOrigin: string | null = null;
    if (referer) {
      try {
        refererOrigin = new URL(referer).origin;
      } catch {
        refererOrigin = null;
      }
    }
    const configured = (() => {
      try {
        return new URL(
          process.env.MINI_APP_URL ??
            process.env.APP_ORIGIN ??
            process.env.SITE_URL ??
            "https://nexpool.app",
        ).origin;
      } catch {
        return "https://nexpool.app";
      }
    })();
    const origin =
      request.headers.get("origin") ?? refererOrigin ?? configured;
    const body = {
      url: origin,
      name: "NEXPOOL",
      iconUrl: `${origin}/icon-512.png`,
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=3600",
        "access-control-allow-origin": "*",
      },
    });
  }),
});

export default http;
