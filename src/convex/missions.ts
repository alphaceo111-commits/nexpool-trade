import type { MutationCtx } from "./_generated/server";
import { CONFIG_KEY } from "./engine";

/**
 * Publishes the operator's launch missions exactly once per deployment. The
 * flag lives in appConfig so an operator who archives a campaign does not get
 * it resurrected on the next app load. Every campaign still settles through the
 * normal server-side verification path — seeding never credits NEX.
 */
export async function seedStarterMissions(ctx: MutationCtx) {
  const config = await ctx.db
    .query("appConfig")
    .withIndex("by_key", (q) => q.eq("key", CONFIG_KEY))
    .first();
  if (config?.starterMissionsSeededAt) return;

  const now = Date.now();
  const anyTask = await ctx.db.query("tasks").first();

  if (!anyTask) {
    await ctx.db.insert("tasks", {
      title: "Follow @muhammad_the_developer on TikTok",
      sponsor: "TikTok",
      category: "social",
      description:
        "Follow the NEXPOOL founder on TikTok. The follow is checked by the operator desk, so a click alone pays nothing.",
      instructions: [
        "Open TikTok and follow @muhammad_the_developer.",
        "Keep the follow active — unfollowing voids the reward.",
        "Tap Submit for review. The operator desk confirms the follow, then NEX is credited.",
      ],
      rewardNex: 0.5,
      speedBonusNexPerHour: 0.05,
      xpReward: 150,
      verification: "manual",
      minLevel: 7,
      target: "https://www.tiktok.com/@muhammad_the_developer",
      verificationNote:
        "Operator review of the follow on TikTok. No reward is credited from the click alone.",
      status: "active",
      createdAt: now,
      createdBy: "nexpool-seed",
    });

    await ctx.db.insert("tasks", {
      title: "Watch a rewarded sponsor ad",
      sponsor: "NEXPOOL sponsor desk",
      category: "advertisement",
      description:
        "Watch one rewarded sponsor ad. Monetag must confirm a valued view with its authenticated server postback; closing early earns nothing.",
      instructions: [
        "Tap Watch verified ad — a full-screen sponsored ad opens.",
        "Watch it to the end. Closing early cancels the reward.",
        "Monetag sends its signed postback; the backend credits the task NEX once.",
      ],
      rewardNex: 0.25,
      speedBonusNexPerHour: 0.02,
      xpReward: 50,
      verification: "in_app_ad",
      minViewSeconds: 15,
      verificationNote:
        "The rewarded ad must finish and Monetag must send a secret-authenticated valued postback. A click, a client timer or an ad promise never credits NEX.",
      status: "active",
      createdAt: now,
      createdBy: "nexpool-seed",
    });
  }

  if (config) {
    await ctx.db.patch(config._id, {
      starterMissionsSeededAt: now,
      updatedAt: now,
      updatedBy: "nexpool-seed",
    });
  }
}

/** Sponsored bot-start campaigns. Idempotent by target link, so operators can
 * archive one without it coming back on the next app load. */
export async function seedBotStartMissions(ctx: MutationCtx) {
  const BOT_MISSIONS = [
    {
      title: "Start @ART_AIRDROP_BOT",
      sponsor: "ART Airdrop",
      target: "https://t.me/ART_AIRDROP_BOT?start=7154361039",
    },
    {
      title: "Start @MusicsHuntersbot",
      sponsor: "Music Hunters",
      target: "https://t.me/MusicsHuntersbot?start=_tgr_-z_X1ThjNGRk",
    },
  ];

  const now = Date.now();
  const existing = await ctx.db.query("tasks").collect();
  const knownTargets = new Set(existing.map((task) => task.target));

  for (const mission of BOT_MISSIONS) {
    if (knownTargets.has(mission.target)) continue;
    await ctx.db.insert("tasks", {
      title: mission.title,
      sponsor: mission.sponsor,
      category: "sponsor_bot",
      description: `Open ${mission.sponsor} through the sponsor link and press Start so the bot registers your account. The operator desk confirms the start before NEX and XP are credited.`,
      instructions: [
        `Open the sponsor link and press Start in ${mission.title.replace("Start ", "")}.`,
        "Keep the bot unblocked — a blocked or deleted chat voids the reward.",
        "Come back and tap Submit for review. The operator desk confirms the start.",
      ],
      rewardNex: 0.2,
      speedBonusNexPerHour: 0.02,
      xpReward: 120,
      verification: "manual",
      target: mission.target,
      verificationNote:
        "Bot starts are confirmed by the operator desk. The click alone credits nothing.",
      status: "active",
      createdAt: now,
      createdBy: "nexpool-seed",
    });
  }
}
