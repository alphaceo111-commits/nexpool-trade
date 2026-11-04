import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

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
 * Requires TELEGRAM_BOT_TOKEN in the Convex environment; optionally
 * TELEGRAM_WEBHOOK_SECRET to verify Telegram's secret header.
 */
http.route({
  path: "/telegram/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret && request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
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

    const appUrl =
      process.env.MINI_APP_URL ??
      process.env.APP_ORIGIN ??
      process.env.SITE_URL ??
      process.env.CONVEX_SITE_URL;
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (token && chatId) {
      try {
        const payload: Record<string, unknown> = {
          chat_id: chatId,
          text: reply.text,
          disable_web_page_preview: true,
        };
        if (reply.openApp && appUrl) {
          payload.reply_markup = {
            inline_keyboard: [
              [{ text: "Open NEXPOOL App", web_app: { url: appUrl } }],
            ],
          };
        }
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
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
      iconUrl: `${origin}/logo.svg`,
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
