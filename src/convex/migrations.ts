import { internalMutation } from "./_generated/server";
import { CONFIG_DEFAULTS, CONFIG_KEY } from "./engine";
import { DEFAULT_TASK_XP, seedLevels } from "./levels";
import { seedBotStartMissions, seedStarterMissions } from "./missions";

/**
 * One-off operator migration: pushes the launch mining rate onto a deployment
 * whose appConfig row still carries the old default. Run once with
 * `bun convex run migrations:applyLaunchMiningRate`.
 */
/** Publishes the launch sponsor missions without waiting for an app load. */
export const publishStarterMissions = internalMutation({
  args: {},
  handler: async (ctx) => {
    await seedStarterMissions(ctx);
    const tasks = await ctx.db.query("tasks").collect();
    return { tasks: tasks.length, titles: tasks.map((task) => task.title) };
  },
});

/** Moves the seeded sponsored-view task onto the Monetag rewarded ad copy. */
export const applyMonetagAdTask = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tasks = await ctx.db.query("tasks").collect();
    const adTasks = tasks.filter((task) => task.verification === "in_app_ad");
    for (const task of adTasks) {
      await ctx.db.patch(task._id, {
        title: "Watch a rewarded sponsor ad",
        description:
          "Watch one rewarded sponsor ad. The ad network must complete the view and the backend must time it, so closing early earns nothing.",
        instructions: [
          "Tap Watch rewarded ad — a full-screen sponsored ad opens.",
          "Watch it to the end. Closing early cancels the reward.",
          "The claim unlocks after the server-timed minimum, then the backend credits NEX.",
        ],
        verificationNote:
          "The rewarded ad must finish and the server must measure the minimum view length. Neither the ad promise nor the click alone credits NEX.",
        minViewSeconds: task.minViewSeconds ?? 15,
      });
    }
    return { patched: adTasks.length };
  },
});

/** Hides the seeded TikTok follow campaign until the account claims level 7. */
export const applyTikTokLevelGate = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tasks = await ctx.db.query("tasks").collect();
    const tiktokTasks = tasks.filter(
      (task) =>
        task.target?.includes("tiktok.com") || /tiktok/i.test(task.title),
    );
    for (const task of tiktokTasks) {
      await ctx.db.patch(task._id, { minLevel: 7 });
    }
    return { patched: tiktokTasks.length, minLevel: 7 };
  },
});

/** Lowers the persisted UTC-day mining cap to the nano-NEX launch scale. */
export const applyDailyLimit = internalMutation({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("appConfig")
      .withIndex("by_key", (q) => q.eq("key", CONFIG_KEY))
      .first();
    if (!row) return { patched: false };
    await ctx.db.patch(row._id, {
      dailyLimitNex: CONFIG_DEFAULTS.dailyLimitNex,
      updatedAt: Date.now(),
      updatedBy: "nexpool-seed",
    });
    return {
      patched: true,
      previous: row.dailyLimitNex,
      dailyLimitNex: CONFIG_DEFAULTS.dailyLimitNex,
    };
  },
});

/** Seeds the ladder, the sponsored bot campaigns and any missing task XP. */
export const applyProgression = internalMutation({
  args: {},
  handler: async (ctx) => {
    await seedLevels(ctx);
    await seedBotStartMissions(ctx);

    let xpBackfilled = 0;
    const tasks = await ctx.db.query("tasks").collect();
    for (const task of tasks) {
      if (task.xpReward !== undefined) continue;
      await ctx.db.patch(task._id, { xpReward: DEFAULT_TASK_XP });
      xpBackfilled += 1;
    }

    const levels = await ctx.db.query("levels").collect();
    return {
      levels: levels.length,
      tasks: tasks.length,
      xpBackfilled,
    };
  },
});

export const applyLaunchMiningRate = internalMutation({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("appConfig")
      .withIndex("by_key", (q) => q.eq("key", CONFIG_KEY))
      .first();
    if (!row) return { patched: false, reason: "no config row yet" };
    await ctx.db.patch(row._id, {
      baseRateNexPerHour: CONFIG_DEFAULTS.baseRateNexPerHour,
      updatedAt: Date.now(),
      updatedBy: "launch-rate",
    });
    return {
      patched: true,
      previousRate: row.baseRateNexPerHour,
      baseRateNexPerHour: CONFIG_DEFAULTS.baseRateNexPerHour,
    };
  },
});
