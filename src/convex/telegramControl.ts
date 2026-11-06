import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { COMMAND_MENU } from "./bot";
import { requireAdmin } from "./engine";

const parseMode = v.union(
  v.literal("HTML"),
  v.literal("MarkdownV2"),
  v.literal("none"),
);

type TelegramChat = {
  id: number;
  title?: string;
  username?: string;
  type: "private" | "group" | "supergroup" | "channel";
};

type TelegramMember = {
  status: string;
  can_delete_messages?: boolean;
  can_change_info?: boolean;
  can_invite_users?: boolean;
  can_pin_messages?: boolean;
  can_restrict_members?: boolean;
  can_promote_members?: boolean;
  can_manage_topics?: boolean;
  can_post_messages?: boolean;
};

function botToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  return token;
}

async function tg<T>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(
    `https://api.telegram.org/bot${botToken()}/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
    },
  );
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; result?: T; description?: string }
    | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(
      payload?.description ?? `Telegram ${method} failed (HTTP ${response.status}).`,
    );
  }
  return payload.result as T;
}

async function operatorId(ctx: ActionCtx): Promise<string> {
  const result = (await ctx.runMutation(internal.admin.assertOperator, {})) as {
    userId: string;
  };
  return String(result.userId);
}

async function inspectDestination(chatId: string) {
  const me = await tg<{ id: number }>("getMe");
  const chat = await tg<TelegramChat>("getChat", { chat_id: chatId });
  if (!["group", "supergroup", "channel"].includes(chat.type)) {
    throw new Error("Only groups, supergroups and channels can be connected.");
  }
  const member = await tg<TelegramMember>("getChatMember", {
    chat_id: chatId,
    user_id: me.id,
  });
  let memberCount: number | undefined;
  try {
    memberCount = await tg<number>("getChatMemberCount", { chat_id: chatId });
  } catch {
    memberCount = undefined;
  }
  const isAdmin = member.status === "administrator";
  const canPostMessages =
    chat.type === "channel"
      ? Boolean(member.can_post_messages)
      : isAdmin || member.status === "member";
  return {
    chatId: String(chat.id),
    title: chat.title ?? String(chat.id),
    username: chat.username,
    type: chat.type as "group" | "supergroup" | "channel",
    botStatus: member.status,
    isAdmin,
    memberCount,
    permissions: {
      canPostMessages,
      canEditMessages: isAdmin,
      canDeleteMessages: Boolean(member.can_delete_messages),
      canChangeInfo: Boolean(member.can_change_info),
      canInviteUsers: Boolean(member.can_invite_users),
      canPinMessages: Boolean(member.can_pin_messages),
      canRestrictMembers: Boolean(member.can_restrict_members),
      canPromoteMembers: Boolean(member.can_promote_members),
      canManageTopics: Boolean(member.can_manage_topics),
    },
  };
}

export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const destinations = await ctx.db.query("telegramDestinations").collect();
    const posts = await ctx.db
      .query("telegramPosts")
      .withIndex("by_createdAt")
      .order("desc")
      .take(60);
    const deliveries = await ctx.db.query("telegramDeliveries").take(300);
    return {
      destinations,
      posts,
      deliveries: deliveries
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 120),
      counts: {
        destinations: destinations.length,
        groups: destinations.filter((row) => row.type !== "channel").length,
        channels: destinations.filter((row) => row.type === "channel").length,
        posts: posts.length,
        sent: deliveries.filter((row) => row.status === "sent").length,
        failed: deliveries.filter((row) => row.status === "failed").length,
        scheduled: posts.filter((row) => row.status === "scheduled").length,
        partial: posts.filter((row) => row.status === "partially_published")
          .length,
      },
    };
  },
});

export const botInfo = action({
  args: {},
  handler: async (ctx) => {
    await operatorId(ctx);
    const safe = async <T>(method: string, params: Record<string, unknown> = {}) => {
      try {
        return { ok: true as const, value: await tg<T>(method, params) };
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : "Telegram error.",
        };
      }
    };
    const [me, name, description, shortDescription, webhook] =
      await Promise.all([
        safe<{ id: number; username?: string; first_name: string }>("getMe"),
        safe<{ name: string }>("getMyName"),
        safe<{ description: string }>("getMyDescription"),
        safe<{ short_description: string }>("getMyShortDescription"),
        safe<{
          url?: string;
          pending_update_count?: number;
          last_error_message?: string;
        }>("getWebhookInfo"),
      ]);
    return { me, name, description, shortDescription, webhook };
  },
});

export const updateBotProfile = action({
  args: {
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    shortDescription: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await operatorId(ctx);
    if (
      args.name === undefined &&
      args.description === undefined &&
      args.shortDescription === undefined
    ) {
      throw new Error("Nothing to update.");
    }
    const updated: string[] = [];
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length < 1 || name.length > 64) {
        throw new Error("Bot name must be 1–64 characters.");
      }
      await tg("setMyName", { name });
      updated.push("name");
    }
    if (args.description !== undefined) {
      if (args.description.length > 512) {
        throw new Error("Description must be at most 512 characters.");
      }
      await tg("setMyDescription", { description: args.description });
      updated.push("description");
    }
    if (args.shortDescription !== undefined) {
      if (args.shortDescription.length > 120) {
        throw new Error("Short description must be at most 120 characters.");
      }
      await tg("setMyShortDescription", {
        short_description: args.shortDescription,
      });
      updated.push("short_description");
    }
    await ctx.runMutation(internal.telegramControl.audit, {
      actorId: actor,
      action: "telegram.profile.update",
      detail: `Telegram confirmed profile fields: ${updated.join(", ")}`,
    });
    return { updated };
  },
});

export const getCommands = action({
  args: {},
  handler: async (ctx) => {
    await operatorId(ctx);
    return await tg<Array<{ command: string; description: string }>>(
      "getMyCommands",
    );
  },
});

export const publishCommands = action({
  args: {
    commands: v.array(
      v.object({
        command: v.string(),
        description: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const actor = await operatorId(ctx);
    if (args.commands.length === 0 || args.commands.length > 100) {
      throw new Error("Telegram accepts 1–100 commands.");
    }
    const seen = new Set<string>();
    const commands = args.commands.map((row) => {
      const command = row.command.trim().replace(/^\//, "").toLowerCase();
      if (!/^[a-z0-9_]{1,32}$/.test(command)) {
        throw new Error(`Invalid command: ${row.command}`);
      }
      if (seen.has(command)) throw new Error(`Duplicate command: /${command}`);
      seen.add(command);
      const description = row.description.trim();
      if (!description || description.length > 256) {
        throw new Error(`Description for /${command} must be 1–256 characters.`);
      }
      return { command, description };
    });
    await tg("setMyCommands", { commands });
    await ctx.runMutation(internal.telegramControl.replaceCommands, {
      commands,
    });
    await ctx.runMutation(internal.telegramControl.audit, {
      actorId: actor,
      action: "telegram.commands.publish",
      detail: `${commands.length} commands published to Telegram.`,
    });
    return { commands: commands.length };
  },
});

/** Seeds the editor with the command menu already answered by the bot. */
export const defaultCommands = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("telegramCommands").collect();
    return rows.length > 0
      ? rows
          .filter((row) => row.visible)
          .sort((a, b) => a.command.localeCompare(b.command))
          .map((row) => ({
            command: row.command,
            description: row.description,
          }))
      : COMMAND_MENU.map((row) => ({
          command: row.command,
          description: row.description,
        }));
  },
});

export const listDestinations = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("telegramDestinations").collect();
  },
});

export const addDestination = action({
  args: { chatId: v.string() },
  handler: async (ctx, args) => {
    const actor = await operatorId(ctx);
    const chatId = args.chatId.trim();
    if (!chatId) throw new Error("A Telegram chat id or @username is required.");
    const info = await inspectDestination(chatId);
    const existing = await ctx.runQuery(
      internal.telegramControl.findDestination,
      { chatId: info.chatId },
    );
    await ctx.runMutation(internal.telegramControl.upsertDestination, {
      ...info,
      addedBy: actor,
      createdAt: existing?.createdAt ?? Date.now(),
    });
    await ctx.runMutation(internal.telegramControl.audit, {
      actorId: actor,
      action: "telegram.destination.add",
      detail: `${info.title} (${info.type}) · bot ${info.botStatus}`,
    });
    return info;
  },
});

export const checkDestination = action({
  args: { chatId: v.string() },
  handler: async (ctx, args) => {
    const actor = await operatorId(ctx);
    const existing = await ctx.runQuery(
      internal.telegramControl.findDestination,
      { chatId: args.chatId },
    );
    if (!existing) throw new Error("Connect this destination first.");
    try {
      const info = await inspectDestination(args.chatId);
      await ctx.runMutation(internal.telegramControl.upsertDestination, {
        ...info,
        addedBy: existing.addedBy,
        createdAt: existing.createdAt,
      });
      await ctx.runMutation(internal.telegramControl.audit, {
        actorId: actor,
        action: "telegram.destination.check",
        detail: `${info.title} · bot ${info.botStatus}`,
      });
      return { ok: true, info };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Telegram check failed.";
      await ctx.runMutation(internal.telegramControl.markDestinationError, {
        chatId: args.chatId,
        error: message,
      });
      return { ok: false, error: message };
    }
  },
});

export const removeDestination = mutation({
  args: { chatId: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const row = await ctx.db
      .query("telegramDestinations")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .first();
    if (!row) return { removed: false };
    await ctx.db.delete(row._id);
    await ctx.db.insert("auditLogs", {
      actorId: String(userId),
      actorLabel: String(userId),
      action: "telegram.destination.remove",
      detail: `${row.title} disconnected from Control Center.`,
      createdAt: Date.now(),
    });
    return { removed: true };
  },
});

export const publishPost = action({
  args: {
    title: v.string(),
    text: v.string(),
    parseMode,
    chatIds: v.array(v.string()),
    scheduledAt: v.optional(v.number()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await operatorId(ctx);
    const title = args.title.trim() || "Telegram post";
    const text = args.text.trim();
    if (text.length < 1 || text.length > 4096) {
      throw new Error("Post text must be 1–4,096 characters.");
    }
    const chatIds = [...new Set(args.chatIds.map((id) => id.trim()))].filter(
      Boolean,
    );
    if (chatIds.length === 0 || chatIds.length > 20) {
      throw new Error("Select 1–20 destinations.");
    }
    const connected = await ctx.runQuery(
      internal.telegramControl.getDestinations,
      { chatIds },
    );
    const connectedByChat = new Map(
      connected.map((row) => [row.chatId, row]),
    );
    for (const id of chatIds) {
      const destination = connectedByChat.get(id);
      if (!destination) {
        throw new Error(`Destination ${id} is not connected.`);
      }
      if (!destination.permissions.canPostMessages) {
        throw new Error(
          `${destination.title} does not grant the bot permission to post.`,
        );
      }
    }
    const scheduledAt =
      args.scheduledAt && args.scheduledAt > Date.now() + 1_000
        ? args.scheduledAt
        : undefined;
    const postId = (await ctx.runMutation(
      internal.telegramControl.createPost,
      {
        title,
        text,
        parseMode: args.parseMode,
        destinationIds: chatIds,
        scheduledAt,
        idempotencyKey:
          args.idempotencyKey?.trim() ||
          `control:${actor}:${Date.now()}:${crypto.randomUUID()}`,
        createdBy: actor,
      },
    )) as Id<"telegramPosts">;
    if (scheduledAt) {
      await ctx.scheduler.runAt(
        scheduledAt,
        internal.telegramControl.deliverPost,
        { postId },
      );
      await ctx.runMutation(internal.telegramControl.audit, {
        actorId: actor,
        action: "telegram.post.schedule",
        detail: `${title} · ${chatIds.length} destinations · ${new Date(scheduledAt).toISOString()}`,
      });
      return { postId, status: "scheduled" as const };
    }
    await runDelivery(ctx, postId);
    return { postId, status: "processing" as const };
  },
});

async function runDelivery(
  ctx: ActionCtx,
  postId: Id<"telegramPosts">,
) {
  const post = await ctx.runQuery(internal.telegramControl.getPost, { postId });
  if (!post) return;
  if (
    post.status === "processing" ||
    post.status === "published" ||
    post.status === "partially_published" ||
    post.status === "cancelled"
  ) {
    return;
  }
  const claimed = await ctx.runMutation(
    internal.telegramControl.markPostProcessing,
    { postId },
  );
  if (!claimed) return;
  const destinations = await ctx.runQuery(
    internal.telegramControl.getDestinations,
    { chatIds: post.destinationIds },
  );
  const byChat = new Map(destinations.map((row) => [row.chatId, row]));
  for (const chatId of post.destinationIds) {
    const destination = byChat.get(chatId);
    const begin = await ctx.runMutation(
      internal.telegramControl.beginDelivery,
      {
        postId,
        chatId,
        destinationTitle: destination?.title ?? chatId,
      },
    );
    if (begin.skip) continue;
    if (!destination) {
      await ctx.runMutation(internal.telegramControl.finishDelivery, {
        deliveryId: begin.deliveryId,
        status: "failed",
        error: "Destination is no longer connected.",
      });
      continue;
    }
    if (!destination.permissions.canPostMessages) {
      await ctx.runMutation(internal.telegramControl.finishDelivery, {
        deliveryId: begin.deliveryId,
        status: "failed",
        error: "Bot lacks the can_post_messages permission.",
      });
      continue;
    }
    try {
      const message = await tg<{ message_id: number }>("sendMessage", {
        chat_id: chatId,
        text: post.text,
        ...(post.parseMode === "none" ? {} : { parse_mode: post.parseMode }),
        disable_web_page_preview: true,
      });
      await ctx.runMutation(internal.telegramControl.finishDelivery, {
        deliveryId: begin.deliveryId,
        status: "sent",
        telegramMessageId: message.message_id,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Telegram send failed.";
      await ctx.runMutation(internal.telegramControl.finishDelivery, {
        deliveryId: begin.deliveryId,
        status: "failed",
        error: message,
      });
    }
  }
  await ctx.runMutation(internal.telegramControl.finalizePost, { postId });
}

export const deliverPost = internalAction({
  args: { postId: v.id("telegramPosts") },
  handler: async (ctx, args) => {
    await runDelivery(ctx, args.postId);
  },
});

export const listPosts = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("telegramPosts")
      .withIndex("by_createdAt")
      .order("desc")
      .take(80);
  },
});

export const listDeliveries = query({
  args: { postId: v.optional(v.id("telegramPosts")) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.postId) {
      return await ctx.db
        .query("telegramDeliveries")
        .withIndex("by_postId", (q) => q.eq("postId", args.postId!))
        .collect();
    }
    return (await ctx.db.query("telegramDeliveries").take(300))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 120);
  },
});

export const findDestination = internalQuery({
  args: { chatId: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("telegramDestinations")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .first(),
});

export const getDestinations = internalQuery({
  args: { chatIds: v.array(v.string()) },
  handler: async (ctx, args): Promise<Doc<"telegramDestinations">[]> => {
    const rows = await Promise.all(
      args.chatIds.map((chatId) =>
        ctx.db
          .query("telegramDestinations")
          .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
          .first(),
      ),
    );
    return rows.filter(
      (row): row is Doc<"telegramDestinations"> => row !== null,
    );
  },
});

export const getPost = internalQuery({
  args: { postId: v.id("telegramPosts") },
  handler: async (ctx, args): Promise<Doc<"telegramPosts"> | null> =>
    await ctx.db.get(args.postId),
});

export const createPost = internalMutation({
  args: {
    title: v.string(),
    text: v.string(),
    parseMode,
    destinationIds: v.array(v.string()),
    scheduledAt: v.optional(v.number()),
    idempotencyKey: v.string(),
    createdBy: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"telegramPosts">> => {
    const existing = await ctx.db
      .query("telegramPosts")
      .withIndex("by_idempotencyKey", (q) =>
        q.eq("idempotencyKey", args.idempotencyKey),
      )
      .first();
    if (existing) return existing._id;
    const now = Date.now();
    return await ctx.db.insert("telegramPosts", {
      title: args.title,
      text: args.text,
      parseMode: args.parseMode,
      destinationIds: args.destinationIds,
      status: args.scheduledAt ? "scheduled" : "draft",
      scheduledAt: args.scheduledAt,
      idempotencyKey: args.idempotencyKey,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const beginDelivery = internalMutation({
  args: {
    postId: v.id("telegramPosts"),
    chatId: v.string(),
    destinationTitle: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("telegramDeliveries")
      .withIndex("by_postId", (q) => q.eq("postId", args.postId))
      .collect();
    const existing = rows.find((row) => row.chatId === args.chatId);
    if (existing) {
      if (existing.status === "sent") return { skip: true as const };
      await ctx.db.patch(existing._id, {
        status: "processing",
        attempts: existing.attempts + 1,
        error: undefined,
      });
      return { skip: false as const, deliveryId: existing._id };
    }
    const deliveryId = await ctx.db.insert("telegramDeliveries", {
      postId: args.postId,
      chatId: args.chatId,
      destinationTitle: args.destinationTitle,
      status: "processing",
      attempts: 1,
      createdAt: Date.now(),
    });
    return { skip: false as const, deliveryId };
  },
});

export const finishDelivery = internalMutation({
  args: {
    deliveryId: v.id("telegramDeliveries"),
    status: v.union(v.literal("sent"), v.literal("failed")),
    telegramMessageId: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.deliveryId, {
      status: args.status,
      telegramMessageId: args.telegramMessageId,
      error: args.error,
      sentAt: args.status === "sent" ? Date.now() : undefined,
    });
  },
});

export const markPostProcessing = internalMutation({
  args: { postId: v.id("telegramPosts") },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (
      !post ||
      post.status === "processing" ||
      post.status === "published" ||
      post.status === "partially_published" ||
      post.status === "cancelled"
    ) {
      return false;
    }
    await ctx.db.patch(args.postId, {
      status: "processing",
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const finalizePost = internalMutation({
  args: { postId: v.id("telegramPosts") },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post) return;
    const deliveries = await ctx.db
      .query("telegramDeliveries")
      .withIndex("by_postId", (q) => q.eq("postId", args.postId))
      .collect();
    const sent = deliveries.filter((row) => row.status === "sent").length;
    const failed = deliveries.filter((row) => row.status === "failed").length;
    const status =
      sent === deliveries.length && sent > 0
        ? "published"
        : sent > 0
          ? "partially_published"
          : "failed";
    await ctx.db.patch(args.postId, {
      status,
      updatedAt: Date.now(),
      lastError:
        failed > 0
          ? deliveries.find((row) => row.status === "failed")?.error
          : undefined,
    });
  },
});

export const upsertDestination = internalMutation({
  args: {
    chatId: v.string(),
    title: v.string(),
    username: v.optional(v.string()),
    type: v.union(
      v.literal("group"),
      v.literal("supergroup"),
      v.literal("channel"),
    ),
    botStatus: v.string(),
    isAdmin: v.boolean(),
    memberCount: v.optional(v.number()),
    permissions: v.object({
      canPostMessages: v.boolean(),
      canEditMessages: v.boolean(),
      canDeleteMessages: v.boolean(),
      canChangeInfo: v.boolean(),
      canInviteUsers: v.boolean(),
      canPinMessages: v.boolean(),
      canRestrictMembers: v.boolean(),
      canPromoteMembers: v.boolean(),
      canManageTopics: v.boolean(),
    }),
    addedBy: v.string(),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("telegramDestinations")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .first();
    const row = {
      ...args,
      status: "connected" as const,
      lastError: undefined,
      lastCheckedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, row);
      return existing._id;
    }
    return await ctx.db.insert("telegramDestinations", row);
  },
});

export const markDestinationError = internalMutation({
  args: { chatId: v.string(), error: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("telegramDestinations")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .first();
    if (!row) return;
    await ctx.db.patch(row._id, {
      status: "error",
      lastError: args.error,
      lastCheckedAt: Date.now(),
    });
  },
});

export const replaceCommands = internalMutation({
  args: {
    commands: v.array(
      v.object({ command: v.string(), description: v.string() }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("telegramCommands").collect();
    await Promise.all(existing.map((row) => ctx.db.delete(row._id)));
    const now = Date.now();
    for (const command of args.commands) {
      await ctx.db.insert("telegramCommands", {
        ...command,
        scope: "default",
        visible: true,
        updatedAt: now,
      });
    }
  },
});

export const audit = internalMutation({
  args: {
    actorId: v.string(),
    action: v.string(),
    detail: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLogs", {
      actorId: args.actorId,
      actorLabel: args.actorId,
      action: args.action,
      detail: args.detail,
      createdAt: Date.now(),
    });
  },
});
