/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts", "!./**/*.spec.ts"]);

const INVITE_CODE = "INVITE88";

async function seedConfig(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    const now = Date.now();
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
  });
}

async function seedUser(
  t: ReturnType<typeof convexTest>,
  options: {
    name: string;
    nexId: string;
    telegramId?: string;
    referralCode: string;
  },
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", { name: options.name });
    const profileId = await ctx.db.insert("profiles", {
      userId,
      nexId: options.nexId,
      displayName: options.name,
      telegramId: options.telegramId,
      referralCode: options.referralCode,
      language: "en",
      notifyTasks: true,
      notifyMining: true,
      notifyWallet: true,
      notifyAnnouncements: true,
      restricted: false,
      complianceCleared: true,
      createdAt: now,
    });
    await ctx.db.insert("balances", {
      userId,
      availableNex: 0,
      reservedNex: 0,
      lifetimeMinedNex: 0,
      lifetimeTaskNex: 0,
      lifetimeAdNex: 0,
      lastSettledAt: now,
      updatedAt: now,
    });
    return { userId, profileId };
  });
}

/** The Telegram bot webhook path: /start CODE. */
async function botStart(
  t: ReturnType<typeof convexTest>,
  args: { text: string; telegramUserId: string; telegramName?: string },
) {
  return await t.mutation(internal.bot.handleIncoming, {
    text: args.text,
    chatId: args.telegramUserId,
    telegramUserId: args.telegramUserId,
    telegramName: args.telegramName ?? "Invitee",
    source: "telegram",
  });
}

async function desk(t: ReturnType<typeof convexTest>, userId: string) {
  return await t
    .withIdentity({ subject: userId })
    .query(api.referrals.summary, {});
}

async function addVerifiedTasks(
  t: ReturnType<typeof convexTest>,
  userId: string,
  count: number,
) {
  await t.run(async (ctx) => {
    const now = Date.now();
    for (let index = 0; index < count; index += 1) {
      const taskId = await ctx.db.insert("tasks", {
        title: `Task ${index + 1}`,
        sponsor: "NEXPOOL",
        category: "social",
        description: "test task",
        instructions: ["do it"],
        rewardNex: 0.000001,
        speedBonusNexPerHour: 0,
        verification: "social",
        verificationNote: "test",
        status: "active",
        createdAt: now,
        createdBy: "test",
      });
      await ctx.db.insert("taskCompletions", {
        userId: userId as never,
        taskId,
        status: "verified",
        startedAt: now,
        verifiedAt: now,
        rewardNex: 0.000001,
        speedBonusNexPerHour: 0,
      });
    }
  });
}

test("bot /start CODE records the referral immediately, before any profile exists", async () => {
  const t = convexTest(schema, modules);
  await seedConfig(t);
  const inviter = await seedUser(t, {
    name: "Inviter",
    nexId: "NXP-INVITE",
    telegramId: "100001",
    referralCode: INVITE_CODE,
  });

  const reply = await botStart(t, {
    text: `/start ${INVITE_CODE}`,
    telegramUserId: "200002",
  });
  expect(reply.referralAttached).toBe(true);
  expect(reply.referralCode).toBe(INVITE_CODE);

  const records = await t.run(async (ctx) => await ctx.db.query("referrals").collect());
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    inviterProfileId: inviter.profileId,
    inviteeTelegramId: "200002",
    status: "pending",
    verifiedTaskCount: 0,
    source: "bot_start",
  });

  const summary = await desk(t, inviter.userId);
  expect(summary?.total).toBe(1);
  expect(summary?.pending).toBe(1);
  expect(summary?.rows[0]).toMatchObject({ status: "pending", qualified: false });
});

test("repeated /start with the same code is idempotent and never duplicates the record", async () => {
  const t = convexTest(schema, modules);
  await seedConfig(t);
  const inviter = await seedUser(t, {
    name: "Inviter",
    nexId: "NXP-INVITE",
    telegramId: "100001",
    referralCode: INVITE_CODE,
  });

  await botStart(t, { text: `/start ${INVITE_CODE}`, telegramUserId: "200003" });
  await botStart(t, { text: `/start ${INVITE_CODE}`, telegramUserId: "200003" });
  await botStart(t, { text: `/start@NEXPOOLBOT ${INVITE_CODE}`, telegramUserId: "200003" });

  const records = await t.run(async (ctx) => await ctx.db.query("referrals").collect());
  expect(records).toHaveLength(1);
  expect((await desk(t, inviter.userId))?.total).toBe(1);
  const notifications = await t.run(
    async (ctx) => await ctx.db.query("notifications").collect(),
  );
  expect(
    notifications.filter((row) => row.title === "New referral joined"),
  ).toHaveLength(1);
});

test("self-referral, unknown codes and malformed codes are rejected", async () => {
  const t = convexTest(schema, modules);
  await seedConfig(t);
  await seedUser(t, {
    name: "Inviter",
    nexId: "NXP-INVITE",
    telegramId: "100001",
    referralCode: INVITE_CODE,
  });

  expect(
    (await botStart(t, { text: `/start ${INVITE_CODE}`, telegramUserId: "100001" }))
      .referralAttached,
  ).toBe(false);
  expect(
    (await botStart(t, { text: "/start NOSUCHCODE", telegramUserId: "200004" }))
      .referralAttached,
  ).toBe(false);
  expect(
    (await botStart(t, { text: "/start ???", telegramUserId: "200004" })).referralAttached,
  ).toBe(false);

  expect(await t.run(async (ctx) => await ctx.db.query("referrals").collect())).toHaveLength(0);
});

test("a second inviter's link never reassigns an existing attribution", async () => {
  const t = convexTest(schema, modules);
  await seedConfig(t);
  const first = await seedUser(t, {
    name: "First",
    nexId: "NXP-FIRST",
    telegramId: "100001",
    referralCode: INVITE_CODE,
  });
  const second = await seedUser(t, {
    name: "Second",
    nexId: "NXP-SECOND",
    telegramId: "100002",
    referralCode: "OTHER999",
  });

  await botStart(t, { text: `/start ${INVITE_CODE}`, telegramUserId: "200005" });
  await botStart(t, { text: "/start OTHER999", telegramUserId: "200005" });

  const records = await t.run(async (ctx) => await ctx.db.query("referrals").collect());
  expect(records).toHaveLength(1);
  expect(records[0].inviterProfileId).toBe(first.profileId);
  expect((await desk(t, first.userId))?.total).toBe(1);
  expect((await desk(t, second.userId))?.total).toBe(0);
});

test("concurrent duplicate /start deliveries produce exactly one referral", async () => {
  const t = convexTest(schema, modules);
  await seedConfig(t);
  const inviter = await seedUser(t, {
    name: "Inviter",
    nexId: "NXP-INVITE",
    telegramId: "100001",
    referralCode: INVITE_CODE,
  });

  await Promise.all([
    botStart(t, { text: `/start ${INVITE_CODE}`, telegramUserId: "200006" }),
    botStart(t, { text: `/start ${INVITE_CODE}`, telegramUserId: "200006" }),
    botStart(t, { text: `/start ${INVITE_CODE}`, telegramUserId: "200006" }),
  ]);

  const records = await t.run(async (ctx) => await ctx.db.query("referrals").collect());
  expect(records).toHaveLength(1);
  expect((await desk(t, inviter.userId))?.total).toBe(1);
});

test("Mini App start_param attributes a brand-new Telegram user and links the profile", async () => {
  const t = convexTest(schema, modules);
  await seedConfig(t);
  const inviter = await seedUser(t, {
    name: "Inviter",
    nexId: "NXP-INVITE",
    telegramId: "100001",
    referralCode: INVITE_CODE,
  });
  const authUserId = await t.run(
    async (ctx) => await ctx.db.insert("users", { name: "Telegram Invitee" }),
  );

  await t
    .withIdentity({ subject: authUserId })
    .mutation(internal.telegram.attachIdentity, {
      telegramId: "200010",
      firstName: "Telegram",
      lastName: "Invitee",
      startParam: INVITE_CODE,
    });

  const records = await t.run(async (ctx) => await ctx.db.query("referrals").collect());
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    inviterProfileId: inviter.profileId,
    inviteeTelegramId: "200010",
    status: "pending",
    source: "mini_app",
  });
  const profile = await t.run(
    async (ctx) =>
      await ctx.db
        .query("profiles")
        .withIndex("by_telegramId", (q) => q.eq("telegramId", "200010"))
        .first(),
  );
  expect(profile?.referredBy).toBe(inviter.profileId);
  expect((await desk(t, inviter.userId))?.total).toBe(1);
});

test("Mini App start_param on an existing bot-only record links it without duplicating", async () => {
  const t = convexTest(schema, modules);
  await seedConfig(t);
  const inviter = await seedUser(t, {
    name: "Inviter",
    nexId: "NXP-INVITE",
    telegramId: "100001",
    referralCode: INVITE_CODE,
  });

  await botStart(t, { text: `/start ${INVITE_CODE}`, telegramUserId: "200011" });

  const authUserId = await t.run(
    async (ctx) => await ctx.db.insert("users", { name: "Telegram Invitee" }),
  );
  await t
    .withIdentity({ subject: authUserId })
    .mutation(internal.telegram.attachIdentity, {
      telegramId: "200011",
      firstName: "Telegram",
      startParam: INVITE_CODE,
    });

  const records = await t.run(async (ctx) => await ctx.db.query("referrals").collect());
  expect(records).toHaveLength(1);
  expect(records[0].inviteeProfileId).toBeTypeOf("string");
  expect((await desk(t, inviter.userId))?.total).toBe(1);
});

test("the bot's referral count includes a bot-only join", async () => {
  const t = convexTest(schema, modules);
  await seedConfig(t);
  await seedUser(t, {
    name: "Inviter",
    nexId: "NXP-INVITE",
    telegramId: "100001",
    referralCode: INVITE_CODE,
  });
  await botStart(t, { text: `/start ${INVITE_CODE}`, telegramUserId: "200012" });

  const reply = await botStart(t, {
    text: "/referral",
    telegramUserId: "100001",
  });
  expect(reply.text).toContain("Total invited: 1");
});

test("a Mini App launch before Telegram linking upgrades the record instead of duplicating it", async () => {
  const t = convexTest(schema, modules);
  await seedConfig(t);
  const inviter = await seedUser(t, {
    name: "Inviter",
    nexId: "NXP-INVITE",
    telegramId: "100001",
    referralCode: INVITE_CODE,
  });
  await botStart(t, { text: `/start ${INVITE_CODE}`, telegramUserId: "200013" });

  // The account exists but Telegram has not been linked onto the profile yet.
  const invitee = await seedUser(t, {
    name: "Invitee",
    nexId: "NXP-INVTEE",
    referralCode: "INVTEE99",
  });
  await t
    .withIdentity({ subject: invitee.userId })
    .mutation(api.app.ensure, { referralCode: INVITE_CODE });

  let records = await t.run(async (ctx) => await ctx.db.query("referrals").collect());
  expect(records).toHaveLength(1);

  await t
    .withIdentity({ subject: invitee.userId })
    .mutation(internal.telegram.attachIdentity, {
      telegramId: "200013",
      firstName: "Invitee",
    });

  records = await t.run(async (ctx) => await ctx.db.query("referrals").collect());
  expect(records).toHaveLength(1);
  expect(records[0].inviteeTelegramId).toBe("200013");
  expect(records[0].inviteeProfileId).toBe(invitee.profileId);
  expect((await desk(t, inviter.userId))?.total).toBe(1);
});

test("an existing bot user opening a referral Mini App link is attributed once", async () => {
  const t = convexTest(schema, modules);
  await seedConfig(t);
  const inviter = await seedUser(t, {
    name: "Inviter",
    nexId: "NXP-INVITE",
    telegramId: "100001",
    referralCode: INVITE_CODE,
  });
  const invitee = await seedUser(t, {
    name: "Existing Miner",
    nexId: "NXP-EXIST1",
    telegramId: "200015",
    referralCode: "EXIST999",
  });

  await t
    .withIdentity({ subject: invitee.userId })
    .mutation(api.app.ensure, { referralCode: INVITE_CODE });
  await t
    .withIdentity({ subject: invitee.userId })
    .mutation(api.app.ensure, { referralCode: INVITE_CODE });
  await t
    .withIdentity({ subject: invitee.userId })
    .mutation(api.app.ensure, { referralCode: INVITE_CODE });

  const records = await t.run(async (ctx) => await ctx.db.query("referrals").collect());
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    inviterProfileId: inviter.profileId,
    inviteeProfileId: invitee.profileId,
    inviteeTelegramId: "200015",
    status: "pending",
  });
  const profile = await t.run(async (ctx) => await ctx.db.get(invitee.profileId));
  expect(profile?.referredBy).toBe(inviter.profileId);
  const summary = await desk(t, inviter.userId);
  expect(summary?.total).toBe(1);
});

test("the in-app code form rejects self-referral and a second inviter", async () => {
  const t = convexTest(schema, modules);
  await seedConfig(t);
  await seedUser(t, {
    name: "Inviter",
    nexId: "NXP-INVITE",
    telegramId: "100001",
    referralCode: INVITE_CODE,
  });
  await seedUser(t, {
    name: "Other",
    nexId: "NXP-OTHER1",
    telegramId: "100003",
    referralCode: "ANOTHER8",
  });
  const invitee = await seedUser(t, {
    name: "Invitee",
    nexId: "NXP-INVTEE",
    telegramId: "200016",
    referralCode: "INVTEE99",
  });

  await expect(
    t
      .withIdentity({ subject: invitee.userId })
      .mutation(api.referrals.applyCode, { code: "INVTEE99" }),
  ).rejects.toThrow(/cannot refer yourself/i);
  await expect(
    t
      .withIdentity({ subject: invitee.userId })
      .mutation(api.referrals.applyCode, { code: "NOSUCHZ" }),
  ).rejects.toThrow(/does not exist/i);

  await t
    .withIdentity({ subject: invitee.userId })
    .mutation(api.referrals.applyCode, { code: INVITE_CODE });
  await expect(
    t
      .withIdentity({ subject: invitee.userId })
      .mutation(api.referrals.applyCode, { code: "ANOTHER8" }),
  ).rejects.toThrow(/already has a referrer/i);
});

test("missed referrals can be recovered only from a proven /start payload", async () => {
  const t = convexTest(schema, modules);
  await seedConfig(t);
  const inviter = await seedUser(t, {
    name: "Inviter",
    nexId: "NXP-INVITE",
    telegramId: "100001",
    referralCode: INVITE_CODE,
  });
  const invitee = await seedUser(t, {
    name: "Missed",
    nexId: "NXP-MISSED",
    telegramId: "200017",
    referralCode: "MISSED99",
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("botMessages", {
      source: "telegram",
      direction: "inbound",
      text: `/start ${INVITE_CODE}`,
      chatId: "200017",
      ts: Date.now(),
    });
  });

  const preview = await t.mutation(internal.referrals.recoverFromBotLog, {
    dryRun: true,
  });
  expect(preview.wouldRecover).toBe(1);
  expect(preview.candidates[0]).toMatchObject({
    telegramId: "200017",
    inviterProfileId: String(inviter.profileId),
    inviteeProfileId: String(invitee.profileId),
  });
  expect(await t.run(async (ctx) => await ctx.db.query("referrals").collect())).toHaveLength(0);

  const applied = await t.mutation(internal.referrals.recoverFromBotLog, {
    dryRun: false,
  });
  expect(applied.recovered).toBe(1);

  const again = await t.mutation(internal.referrals.recoverFromBotLog, {
    dryRun: false,
  });
  expect(again.recovered).toBe(0);

  const records = await t.run(async (ctx) => await ctx.db.query("referrals").collect());
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    inviteeTelegramId: "200017",
    inviteeProfileId: invitee.profileId,
    source: "legacy",
  });
  const profile = await t.run(async (ctx) => await ctx.db.get(invitee.profileId));
  expect(profile?.referredBy).toBe(inviter.profileId);
  expect((await desk(t, inviter.userId))?.total).toBe(1);
});

test("three distinct verified tasks move a referral from pending to qualified", async () => {
  const t = convexTest(schema, modules);
  await seedConfig(t);
  const inviter = await seedUser(t, {
    name: "Inviter",
    nexId: "NXP-INVITE",
    telegramId: "100001",
    referralCode: INVITE_CODE,
  });
  await botStart(t, { text: `/start ${INVITE_CODE}`, telegramUserId: "200007" });

  const invitee = await seedUser(t, {
    name: "Invitee",
    nexId: "NXP-INVTEE",
    telegramId: "200007",
    referralCode: "INVTEE99",
  });
  await addVerifiedTasks(t, invitee.userId, 3);

  await t
    .withIdentity({ subject: invitee.userId })
    .mutation(internal.telegram.attachIdentity, {
      telegramId: "200007",
      firstName: "Invitee",
    });

  const records = await t.run(async (ctx) => await ctx.db.query("referrals").collect());
  expect(records).toHaveLength(1);
  expect(records[0].verifiedTaskCount).toBe(3);
  expect(records[0].status).toBe("qualified");
  const summary = await desk(t, inviter.userId);
  expect(summary?.qualified).toBe(1);
});
