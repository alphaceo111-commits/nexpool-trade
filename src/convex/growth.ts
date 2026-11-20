import { query } from "./_generated/server";
import { requireAdmin } from "./engine";

/**
 * Growth analytics read directly from NEXPOOL's existing records.
 *
 * Nothing here is estimated, sampled or extrapolated: every figure is counted
 * from profiles/referrals as they exist. Two definitions are deliberately
 * conservative:
 *  - "active" uses `lastActiveAt`, which the backend only moves on a real
 *    backend event (bootstrap, heartbeat, verified task, verified ad), so
 *    refreshing the UI cannot inflate it.
 *  - retention is a proxy: a user counts as retained at Dn when they were seen
 *    at least n days after registering. It is not a session-level cohort
 *    model, and the UI labels it as such.
 */
const DAY = 86_400_000;

function utcDay(ts: number) {
  return new Date(ts).toISOString().slice(0, 10);
}

function rate(part: number, whole: number) {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const profiles = await ctx.db.query("profiles").collect();
    const referrals = await ctx.db.query("referrals").collect();

    const seenSince = (ms: number) =>
      profiles.filter(
        (row) => row.lastActiveAt !== undefined && row.lastActiveAt >= now - ms,
      ).length;

    const activated = profiles.filter((row) => row.firstMiningStartedAt);
    const telegramVerified = profiles.filter((row) => row.telegramId);
    const miniAppOpened = profiles.filter((row) => row.miniAppOpenedAt);

    const newUsers = Array.from({ length: 14 }, (_, index) => {
      const start = now - (13 - index) * DAY;
      const end = start + DAY;
      const created = profiles.filter(
        (row) => row.createdAt >= start && row.createdAt < end,
      );
      return {
        day: utcDay(start),
        registered: created.length,
        activated: created.filter((row) => row.firstMiningStartedAt).length,
      };
    });

    const retention = [1, 7, 30].map((days) => {
      const cutoff = now - days * DAY;
      const eligible = profiles.filter((row) => row.createdAt <= cutoff);
      const retained = eligible.filter(
        (row) =>
          row.lastActiveAt !== undefined &&
          row.lastActiveAt >= row.createdAt + days * DAY,
      );
      return {
        days,
        eligible: eligible.length,
        retained: retained.length,
        rate: rate(retained.length, eligible.length),
      };
    });

    const churned = profiles.filter(
      (row) =>
        row.createdAt <= now - 30 * DAY &&
        (row.lastActiveAt === undefined || row.lastActiveAt < now - 30 * DAY),
    );

    const byInviter = new Map<string, number>();
    for (const row of referrals) {
      byInviter.set(
        String(row.inviterProfileId),
        (byInviter.get(String(row.inviterProfileId)) ?? 0) + 1,
      );
    }
    const profileById = new Map(profiles.map((row) => [String(row._id), row]));
    const topInviters = [...byInviter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([profileId, invitations]) => {
        const profile = profileById.get(profileId);
        return {
          nexId: profile?.nexId ?? "unknown",
          displayName: profile?.displayName ?? "Removed account",
          invitations,
          qualified: referrals.filter(
            (row) =>
              String(row.inviterProfileId) === profileId &&
              row.status === "qualified",
          ).length,
        };
      });

    const qualified = referrals.filter((row) => row.status === "qualified");

    // Acquisition split: an account that arrived through a referral is
    // attributed to that invite path; everything else is organic (bot direct,
    // channel/group link) until campaign identifiers are added.
    const referredProfiles = profiles.filter((row) => row.referredBy);
    const organicProfiles = profiles.filter((row) => !row.referredBy);

    return {
      generatedAt: now,
      totals: {
        registered: profiles.length,
        telegramVerified: telegramVerified.length,
        miniAppOpened: miniAppOpened.length,
        activated: activated.length,
        notActivated: profiles.length - activated.length,
        activationRate: rate(activated.length, profiles.length),
      },
      activity: {
        dau: seenSince(DAY),
        wau: seenSince(7 * DAY),
        mau: seenSince(30 * DAY),
        activeMiners: activated.filter(
          (row) =>
            row.lastActiveAt !== undefined && row.lastActiveAt >= now - 7 * DAY,
        ).length,
      },
      newUsers,
      retention,
      churn: {
        accounts: churned.length,
        rate: rate(churned.length, profiles.length),
      },
      referrals: {
        total: referrals.length,
        qualified: qualified.length,
        pending: referrals.filter((row) => row.status === "pending").length,
        inProgress: referrals.filter((row) => row.status === "in_progress")
          .length,
        rejected: referrals.filter((row) => row.status === "rejected").length,
        conversion: rate(qualified.length, referrals.length),
        bySource: (["bot_start", "mini_app", "legacy", "admin"] as const).map(
          (source) => {
            const rows = referrals.filter((row) => row.source === source);
            return {
              source,
              invitations: rows.length,
              qualified: rows.filter((row) => row.status === "qualified")
                .length,
            };
          },
        ),
        topInviters,
      },
      acquisition: {
        referred: referredProfiles.length,
        organic: organicProfiles.length,
        referredActivated: referredProfiles.filter(
          (row) => row.firstMiningStartedAt,
        ).length,
        organicActivated: organicProfiles.filter(
          (row) => row.firstMiningStartedAt,
        ).length,
      },
    };
  },
});
