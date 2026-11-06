import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { telegramWebhookSecret } from "./telegramWebhook";

const http = httpRouter();

auth.addHttpRoutes(http);

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
      message?: { text?: string; chat?: { id?: number | string } };
      edited_message?: { text?: string; chat?: { id?: number | string } };
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

    const reply = await ctx.runMutation(internal.bot.handleIncoming, {
      text,
      chatId,
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
    let buttonUrl = appUrl;
    if (appUrl && reply.referralCode) {
      try {
        const url = new URL(appUrl);
        url.searchParams.set("ref", reply.referralCode);
        buttonUrl = url.toString();
      } catch {
        buttonUrl = appUrl;
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
        if (reply.openApp && buttonUrl) {
          payload.reply_markup = {
            inline_keyboard: [
              [{ text: "Open NEXPOOL App", web_app: { url: buttonUrl } }],
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
