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
