/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts", "!./**/*.spec.ts"]);
const SECRET = "test-postback-secret";

beforeEach(() => {
  process.env.MONETAG_POSTBACK_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.MONETAG_POSTBACK_SECRET;
});

async function seed(t: ReturnType<typeof convexTest>, options?: {
  telegramId?: string;
  purpose?: "away" | "extension";
  rewardNex?: number;
}) {
  const now = Date.now();
  const purpose = options?.purpose ?? "away";
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Postback Test",
    });
    const profileId = await ctx.db.insert("profiles", {
      userId,
      nexId: "NXP-TEST01",
      displayName: "Postback Test",
      telegramId: options?.telegramId,
      referralCode: "TESTCODE",
      language: "en",
      notifyTasks: true,
      notifyMining: true,
      notifyWallet: true,
      notifyAnnouncements: true,
      restricted: false,
      complianceCleared: true,
      createdAt: now,
    });
    const balanceId = await ctx.db.insert("balances", {
      userId,
      availableNex: 0,
      reservedNex: 0,
      lifetimeMinedNex: 0,
      lifetimeTaskNex: 0,
      lifetimeAdNex: 0,
      lastSettledAt: now,
      updatedAt: now,
    });
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
      adRewardNex: options?.rewardNex ?? 0.0000005,
      miningEconomyVersion: 2,
      withdrawalsEnabled: false,
      updatedAt: now,
    });
    const challengeId = await ctx.db.insert("miningAdChallenges", {
      userId,
      purpose,
      provider: "monetag",
      status: "pending",
      createdAt: now,
      expiresAt: now + 15 * 60_000,
    });
    return { userId, profileId, balanceId, challengeId };
  });
  return { ...ids, ymid: String(ids.challengeId) };
}

async function postback(
  t: ReturnType<typeof convexTest>,
  ymid: string,
  overrides: Partial<{
    telegramId: string;
    eventType: string;
    rewardEventType: string;
    estimatedPriceUsd: number;
  }> = {},
) {
  return await t.mutation(internal.miningAds.recordMonetagPostback, {
    ymid,
    telegramId: overrides.telegramId,
    eventType: overrides.eventType ?? "impression",
    rewardEventType: overrides.rewardEventType ?? "valued",
    estimatedPriceUsd: overrides.estimatedPriceUsd ?? 0.001,
  });
}

test("valid valued postback credits the configured NEX reward exactly once", async () => {
  const t = convexTest(schema, modules);
  const { profileId, balanceId, challengeId, ymid } = await seed(t, {
    telegramId: "123456",
  });

  const result = await postback(t, ymid, {
    telegramId: "123456",
    estimatedPriceUsd: 0.0042,
  });
  expect(result).toMatchObject({
    recorded: true,
    valued: true,
    applied: true,
    rewardNex: 0.0000005,
    rewardCredited: true,
  });

  await t.run(async (ctx) => {
    const balance = await ctx.db.get(balanceId);
    const profile = await ctx.db.get(profileId);
    const challenge = await ctx.db.get(challengeId);
    const ledger = await ctx.db.query("ledger").collect();
    expect(balance?.availableNex).toBe(0.0000005);
    expect(balance?.lifetimeAdNex).toBe(0.0000005);
    expect(profile?.awayMiningAdProgress).toBe(1);
    expect(challenge?.status).toBe("completed");
    expect(challenge?.rewardNex).toBe(0.0000005);
    expect(challenge?.rewardCreditedAt).toBeTypeOf("number");
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      kind: "ad",
      amountNex: 0.0000005,
      refId: `monetag:${challengeId}`,
    });
  });
});

test("invalid ymid, telegram identity, event type and reward event are rejected without credit", async () => {
  const t = convexTest(schema, modules);
  const { balanceId, challengeId, ymid } = await seed(t, {
    telegramId: "123456",
  });

  expect(await postback(t, "not-a-convex-id")).toMatchObject({
    recorded: false,
  });
  expect(
    await postback(t, ymid, {
      telegramId: "999999",
    }),
  ).toMatchObject({ recorded: false });
  expect(
    await postback(t, ymid, {
      eventType: "click",
    }),
  ).toMatchObject({ recorded: false });
  expect(
    await postback(t, ymid, {
      rewardEventType: "unknown",
    }),
  ).toMatchObject({ recorded: false });

  await t.run(async (ctx) => {
    const balance = await ctx.db.get(balanceId);
    const challenge = await ctx.db.get(challengeId);
    expect(balance?.availableNex).toBe(0);
    expect(balance?.lifetimeAdNex).toBe(0);
    expect(challenge?.status).toBe("pending");
    expect(await ctx.db.query("ledger").collect()).toHaveLength(0);
  });
});

test("a non-valued postback is recorded but never credits NEX", async () => {
  const t = convexTest(schema, modules);
  const { balanceId, challengeId, ymid } = await seed(t, {
    telegramId: "123456",
  });

  const result = await postback(t, ymid, {
    telegramId: "123456",
    rewardEventType: "non_valued",
  });
  expect(result).toMatchObject({ recorded: true, valued: false });

  await t.run(async (ctx) => {
    const balance = await ctx.db.get(balanceId);
    const challenge = await ctx.db.get(challengeId);
    expect(balance?.availableNex).toBe(0);
    expect(challenge?.status).toBe("pending");
    expect(challenge?.postbackRewardEventType).toBe("non_valued");
    expect(await ctx.db.query("ledger").collect()).toHaveLength(0);
  });
});

test("duplicate and replayed postbacks cannot credit twice", async () => {
  const t = convexTest(schema, modules);
  const { balanceId, challengeId, ymid } = await seed(t, {
    telegramId: "123456",
  });

  const first = await postback(t, ymid, { telegramId: "123456" });
  const replay = await postback(t, ymid, { telegramId: "123456" });
  const replayedAgain = await postback(t, ymid, { telegramId: "123456" });

  expect(first).toMatchObject({ applied: true, rewardNex: 0.0000005 });
  expect(replay).toMatchObject({
    applied: false,
    duplicate: true,
    rewardNex: 0.0000005,
  });
  expect(replayedAgain).toMatchObject({
    applied: false,
    duplicate: true,
    rewardNex: 0.0000005,
  });

  await t.run(async (ctx) => {
    const balance = await ctx.db.get(balanceId);
    const challenge = await ctx.db.get(challengeId);
    const ledger = await ctx.db.query("ledger").collect();
    expect(balance?.availableNex).toBe(0.0000005);
    expect(balance?.lifetimeAdNex).toBe(0.0000005);
    expect(challenge?.status).toBe("completed");
    expect(ledger).toHaveLength(1);
  });
});

test("a task-linked valued postback credits the existing task reward path once", async () => {
  const t = convexTest(schema, modules);
  const { userId, profileId, balanceId } = await seed(t, {
    telegramId: "123456",
  });
  const now = Date.now();
  const ids = await t.run(async (ctx) => {
    const taskId = await ctx.db.insert("tasks", {
      title: "Verified sponsor view",
      sponsor: "Monetag test",
      category: "advertisement",
      description: "Watch a verified rewarded view.",
      instructions: ["Open the ad and finish it."],
      rewardNex: 0.000002,
      speedBonusNexPerHour: 0,
      verification: "in_app_ad",
      minViewSeconds: 15,
      verificationNote: "Credited only after the provider postback.",
      status: "active",
      createdAt: now,
      createdBy: "vitest",
    });
    const challengeId = await ctx.db.insert("miningAdChallenges", {
      userId,
      purpose: "task",
      taskId,
      provider: "monetag",
      status: "pending",
      createdAt: now,
      expiresAt: now + 15 * 60_000,
    });
    return { taskId, challengeId };
  });

  const result = await postback(t, String(ids.challengeId), {
    telegramId: "123456",
    estimatedPriceUsd: 0.003,
  });
  expect(result).toMatchObject({
    recorded: true,
    valued: true,
    applied: true,
    granted: true,
    rewardNex: 0.000002,
    rewardCredited: true,
  });

  await t.run(async (ctx) => {
    const completion = await ctx.db
      .query("taskCompletions")
      .withIndex("by_user_task", (q) =>
        q.eq("userId", userId).eq("taskId", ids.taskId),
      )
      .first();
    const balance = await ctx.db.get(balanceId);
    const profile = await ctx.db.get(profileId);
    const ledger = await ctx.db.query("ledger").collect();
    expect(completion?.status).toBe("verified");
    expect(completion?.verifiedBy).toBe("monetag-postback");
    expect(balance?.availableNex).toBe(0.000002);
    expect(balance?.lifetimeTaskNex).toBe(0.000002);
    expect(profile?.lastActiveAt).toBeTypeOf("number");
    expect(ledger.filter((row) => row.kind === "task")).toHaveLength(1);
  });

  const replay = await postback(t, String(ids.challengeId), {
    telegramId: "123456",
  });
  expect(replay).toMatchObject({ applied: false, duplicate: true });
  await t.run(async (ctx) => {
    const balance = await ctx.db.get(balanceId);
    expect(balance?.availableNex).toBe(0.000002);
  });
});

test("the HTTP endpoint fails closed when the server secret is not configured", async () => {
  const t = convexTest(schema, modules);
  const { ymid } = await seed(t, { telegramId: "123456" });
  delete process.env.MONETAG_POSTBACK_SECRET;

  const response = await t.fetch(
    `/monetag/postback?ymid=${ymid}&event_type=impression&reward_event_type=valued&secret=anything`,
  );
  expect(response.status).toBe(503);
});

test("HTTP endpoint authenticates the secret and rejects malformed parameters", async () => {
  const t = convexTest(schema, modules);
  const { ymid } = await seed(t, { telegramId: "123456" });

  const unauthorized = await t.fetch(
    `/monetag/postback?ymid=${ymid}&reward_event_type=valued&event_type=impression&secret=wrong`,
  );
  expect(unauthorized.status).toBe(403);

  const missingReward = await t.fetch(
    `/monetag/postback?ymid=${ymid}&event_type=impression&secret=${SECRET}`,
  );
  expect(missingReward.status).toBe(400);

  const click = await t.fetch(
    `/monetag/postback?ymid=${ymid}&event_type=click&reward_event_type=valued&secret=${SECRET}`,
  );
  expect(click.status).toBe(400);

  const valid = await t.fetch(
    `/monetag/postback?ymid=${ymid}&telegram_id=123456&event_type=impression&reward_event_type=valued&estimated_price=0.001&secret=${SECRET}`,
  );
  expect(valid.status).toBe(200);
  await expect(valid.json()).resolves.toMatchObject({
    ok: true,
    recorded: true,
    applied: true,
    rewardNex: 0.0000005,
  });

  const replay = await t.fetch(
    `/monetag/postback?ymid=${ymid}&telegram_id=123456&event_type=impression&reward_event_type=valued&secret=${SECRET}`,
  );
  expect(replay.status).toBe(200);
  await expect(replay.json()).resolves.toMatchObject({
    ok: true,
    duplicate: true,
    applied: false,
  });
});
