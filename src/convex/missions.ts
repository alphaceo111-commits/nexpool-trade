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
      verification: "manual",
      target: "https://www.tiktok.com/@muhammad_the_developer",
      verificationNote:
        "Operator review of the follow on TikTok. No reward is credited from the click alone.",
      status: "active",
      createdAt: now,
      createdBy: "nexpool-seed",
    });

    await ctx.db.insert("tasks", {
      title: "Watch the sponsored signal spot",
      sponsor: "NEXPOOL sponsor desk",
      category: "advertisement",
      description:
        "Watch a sponsored spot in full. The backend times the view, so closing it early earns nothing.",
      instructions: [
        "Start the spot from this screen and keep it open.",
        "The claim button unlocks only after the full view time.",
        "One claim per account; the reward is credited by the backend, not the click.",
      ],
      rewardNex: 0.25,
      speedBonusNexPerHour: 0.02,
      verification: "in_app_ad",
      minViewSeconds: 15,
      verificationNote:
        "The server measures the view from the moment you start the spot. Views below the minimum length are refused.",
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
