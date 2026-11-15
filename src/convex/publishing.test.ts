/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./**/*.ts",
  "!./**/*.test.ts",
  "!./**/*.spec.ts",
]);

async function seed(t: ReturnType<typeof convexTest>, options?: {
  miningNex?: number;
}) {
  const now = Date.now();
  const miningNex = options?.miningNex ?? 0.000002;
  const ids = await t.run(async (ctx) => {
    await ctx.db.insert("appConfig", {
      key: "default",
      baseRateNexPerHour: 0.0000005,
      dailyLimitNex: 0.000006,
      nexUsdRate: 2.5,
      tonUsdRate: 5.2,
      minWithdrawNex: 1,
      qualifiedReferralTarget: 10,
      referralTaskTarget: 3,
      referralBonusNexPerHour: 0.02,
      referralBonusCap: 10,
      treasuryAvailableUsd: 0,
      miningEnabled: true,
      miningEnabledAt: now,
      awayMiningHours: 24,
      extensionHours: 5,
      adRewardNex: 0.0000005,
      miningEconomyVersion: 2,
      withdrawalsEnabled: false,
      updatedAt: now,
    });
    const userId = await ctx.db.insert("users", { name: "Automation Test" });
    await ctx.db.insert("profiles", {
      userId,
      nexId: "NXP-AUTO01",
      displayName: "Automation Test",
      referralCode: "AUTOCODE",
      language: "en",
      notifyTasks: true,
      notifyMining: true,
      notifyWallet: true,
      notifyAnnouncements: true,
      restricted: false,
      complianceCleared: true,
      createdAt: now,
    });
    if (miningNex > 0) {
      await ctx.db.insert("ledger", {
        userId,
        kind: "mining",
        amountNex: miningNex,
        memo: "test settlement",
        refId: "test:mining:1",
        createdAt: now,
      });
    }
    return { userId };
  });
  return ids;
}

async function seedAutomation(
  t: ReturnType<typeof convexTest>,
  templateKey: string,
) {
  return await t.run(async (ctx) =>
    await ctx.db.insert("telegramAutomations", {
      templateKey,
      enabled: true,
      destinationIds: ["-1001234567890"],
      frequency: "daily",
      hourUtc: 18,
      minuteUtc: 0,
      requireApproval: true,
      rotationIndex: 0,
      nextRunAt: Date.now(),
      createdBy: "test-operator",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

test("an automation publishes real confirmed numbers, never placeholders", async () => {
  const t = convexTest(schema, modules);
  await seed(t, { miningNex: 0.000002 });
  const id = await seedAutomation(t, "daily_top_earners");

  const result = (await t.action(internal.publishing.runAutomation, {
    id,
    slot: 1_700_000_000_000,
  })) as { status: string };

  expect(result.status).toBe("queued");
  const posts = await t.run(async (ctx) => await ctx.db.query("telegramPosts").collect());
  expect(posts).toHaveLength(1);
  expect(posts[0].text).toContain("Automation Test");
  expect(posts[0].text).toContain("0.000002000 NEX");
  expect(posts[0].templateKey).toBe("daily_top_earners");
});

test("the same scheduled slot can never publish twice", async () => {
  const t = convexTest(schema, modules);
  await seed(t);
  const id = await seedAutomation(t, "daily_top_earners");

  await t.action(internal.publishing.runAutomation, {
    id,
    slot: 1_700_000_000_000,
  });
  await t.action(internal.publishing.runAutomation, {
    id,
    slot: 1_700_000_000_000,
  });

  const posts = await t.run(async (ctx) => await ctx.db.query("telegramPosts").collect());
  expect(posts).toHaveLength(1);

  // A genuinely new slot still publishes.
  await t.action(internal.publishing.runAutomation, {
    id,
    slot: 1_700_086_400_000,
  });
  const after = await t.run(async (ctx) => await ctx.db.query("telegramPosts").collect());
  expect(after).toHaveLength(2);
});

test("a template with no confirmed data says so instead of inventing ranks", async () => {
  const t = convexTest(schema, modules);
  await seed(t, { miningNex: 0 });
  const id = await seedAutomation(t, "daily_top_earners");

  await t.action(internal.publishing.runAutomation, {
    id,
    slot: 1_700_000_000_000,
  });

  const posts = await t.run(async (ctx) => await ctx.db.query("telegramPosts").collect());
  expect(posts).toHaveLength(1);
  expect(posts[0].text).toContain("No confirmed earnings have been recorded yet today.");
  expect(posts[0].text).not.toContain("0.000000000 NEX");
});

test("a paused automation publishes nothing", async () => {
  const t = convexTest(schema, modules);
  await seed(t);
  const id = await seedAutomation(t, "daily_top_earners");
  await t.run(async (ctx) => {
    await ctx.db.patch(id, { enabled: false });
  });

  const result = (await t.action(internal.publishing.runAutomation, {
    id,
    slot: 1_700_000_000_000,
  })) as { status: string };

  expect(result.status).toBe("skipped");
  const posts = await t.run(async (ctx) => await ctx.db.query("telegramPosts").collect());
  expect(posts).toHaveLength(0);
});
