import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getViewer, requireProfile } from "./engine";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { userId, profile } = await getViewer(ctx);
    if (!userId || !profile) return null;
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(100);
    return {
      unread: rows.filter((row) => !row.readAt).length,
      rows: rows.map((row) => ({
        id: row._id,
        kind: row.kind,
        title: row.title,
        body: row.body,
        read: Boolean(row.readAt),
        createdAt: row.createdAt,
      })),
    };
  },
});

export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const { profile } = await requireProfile(ctx);
    const row = await ctx.db.get(args.notificationId);
    if (!row) throw new Error("Notification not found.");
    if (row.userId !== profile.userId) {
      throw new Error("That notification does not belong to this account.");
    }
    if (!row.readAt) await ctx.db.patch(row._id, { readAt: Date.now() });
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const { profile } = await requireProfile(ctx);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", profile.userId))
      .order("desc")
      .take(200);
    const now = Date.now();
    const unread = rows.filter((row) => !row.readAt);
    for (const row of unread) {
      await ctx.db.patch(row._id, { readAt: now });
    }
    return { updated: unread.length };
  },
});
