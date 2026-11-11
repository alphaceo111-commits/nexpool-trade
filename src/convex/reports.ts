import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { loadConfig, resolveAdminAccess, roundNex } from "./engine";
import { verifiedTaskCount } from "./referralEngine";

const DAY = 86_400_000;

function utcDayStart(ts: number) {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function dayKey(ts: number) {
  return new Date(ts).toISOString().slice(0, 10);
}

type Window = { from: number; to: number };

function inWindow(ts: number | undefined, window: Window) {
  return ts !== undefined && ts >= window.from && ts < window.to;
}

export const adminReports = query({
  args: {},
  handler: async (ctx) => {
    // A query must not throw for an ordinary signed-in user or the whole
    // reporting route would hit the error boundary before it can explain the
    // access rule. Returning null leaks no data and the page renders the
    // backend's denial reason from admin.access.
    const access = await resolveAdminAccess(ctx);
    if (!access.isAdmin) return null;
    const config = await loadConfig(ctx);
    const now = Date.now();
    const today = utcDayStart(now);
    const yesterday = today - DAY;
    const week = now - 7 * DAY;
    const month = now - 30 * DAY;
    const all: Window = { from: 0, to: now + 1 };

    const [
      profiles,
      balances,
      ledger,
      challenges,
      adEvents,
      referralRows,
      withdrawals,
      audits,
      completions,
      contacts,
      miningDays,
      extensionSessions,
    ] = await Promise.all([
      ctx.db.query("profiles").collect(),
      ctx.db.query("balances").collect(),
      ctx.db.query("ledger").collect(),
      ctx.db.query("miningAdChallenges").collect(),
      ctx.db.query("adVerificationEvents").collect(),
      ctx.db.query("referrals").collect(),
      ctx.db.query("withdrawals").collect(),
      ctx.db.query("auditLogs").withIndex("by_createdAt").order("desc").take(25),
      ctx.db.query("taskCompletions").collect(),
      ctx.db.query("telegramContacts").collect(),
      ctx.db.query("miningDays").collect(),
      ctx.db.query("miningExtensionSessions").collect(),
    ]);

    const profileById = new Map(profiles.map((p) => [String(p._id), p]));

    const sumLedger = (
      kinds: Array<Doc<"ledger">["kind"]>,
      window: Window,
      predicate?: (row: Doc<"ledger">) => boolean,
    ) =>
      roundNex(
        ledger.reduce((total, row) => {
          if (!kinds.includes(row.kind)) return total;
          if (!inWindow(row.createdAt, window)) return total;
          if (predicate && !predicate(row)) return total;
          return total + row.amountNex;
        }, 0),
      );

    // Earnings are confirmed positive ledger credits only. A reversal must not
    // silently reduce a historical total, and pending states never reach the
    // ledger at all.
    const confirmedEarnings = (
      kinds: Array<Doc<"ledger">["kind"]>,
      window: Window,
      predicate?: (row: Doc<"ledger">) => boolean,
    ) =>
      sumLedger(
        kinds,
        window,
        (row) => row.amountNex > 0 && (!predicate || predicate(row)),
      );

    const uniqueUsers = (rows: Array<{ userId: string; ts?: number }>, window: Window) =>
      new Set(
        rows
          .filter((row) => inWindow(row.ts, window))
          .map((row) => row.userId),
      ).size;

    const miningRows = ledger.filter((row) => row.kind === "mining");
    const normalMining = (window: Window) =>
      confirmedEarnings(["mining"], window, (row) =>
        (row.refId ?? row.memo).includes("normal"),
      );
    const extensionMining = (window: Window) =>
      confirmedEarnings(["mining"], window, (row) =>
        (row.refId ?? row.memo).includes("extension"),
      );

    // Presentation flags are not lifecycle counts. These markers are written
    // by the mining engine when the event actually happened.
    const minerIdsFromLedger = new Set(miningRows.map((row) => String(row.userId)));
    const startedMinerIds = new Set(
      profiles
        .filter(
          (profile) =>
            profile.firstMiningStartedAt !== undefined ||
            minerIdsFromLedger.has(String(profile.userId)),
        )
        .map((profile) => String(profile.userId)),
    );
    const startedToday = profiles.filter(
      (profile) => (profile.firstMiningStartedAt ?? 0) >= today,
    ).length;
    const capDayRows = miningDays.filter(
      (row) =>
        row.capReachedAt !== undefined ||
        (row.normalMinedNex ?? row.minedNex) >= config.dailyLimitNex,
    );
    const capUserIds = new Set(
      capDayRows.map((row) => String(row.userId)),
    );
    const capToday = capDayRows.filter(
      (row) =>
        (row.capReachedAt ?? row.updatedAt) >= today &&
        (row.capReachedAt ?? row.updatedAt) < now + 1,
    ).length;
    const activeExtensionSessions = extensionSessions.filter(
      (row) => row.endsAt > now,
    );
    const expiredExtensionSessions = extensionSessions.filter(
      (row) => row.endsAt <= now,
    );

    const miningReport = {
      todayNex: confirmedEarnings(["mining"], { from: today, to: now + 1 }),
      yesterdayNex: confirmedEarnings(["mining"], { from: yesterday, to: today }),
      weekNex: confirmedEarnings(["mining"], { from: week, to: now + 1 }),
      monthNex: confirmedEarnings(["mining"], { from: month, to: now + 1 }),
      allTimeNex: confirmedEarnings(["mining"], all),
      normal: {
        todayNex: normalMining({ from: today, to: now + 1 }),
        allTimeNex: normalMining(all),
      },
      extension: {
        todayNex: extensionMining({ from: today, to: now + 1 }),
        allTimeNex: extensionMining(all),
      },
      levelRewardsAllTimeNex: confirmedEarnings(["level"], all),
      usersMinedToday: uniqueUsers(
        miningRows.map((row) => ({ userId: String(row.userId), ts: row.createdAt })),
        { from: today, to: now + 1 },
      ),
      uniqueMinersAllTime: new Set(miningRows.map((row) => String(row.userId))).size,
      startedMiningUsers: startedMinerIds.size,
      startedMiningToday: startedToday,
      reachedCapUsers: capUserIds.size,
      capEventsToday: capToday,
      capEventsAllTime: capDayRows.length,
      extensionSessions: {
        granted: extensionSessions.length,
        users: new Set(extensionSessions.map((row) => String(row.userId))).size,
        active: activeExtensionSessions.length,
        expired: expiredExtensionSessions.length,
        minedNex: roundNex(
          extensionSessions.reduce((total, row) => total + row.minedNex, 0),
        ),
        expectedMaxNex: roundNex(
          extensionSessions.reduce(
            (total, row) =>
              total + config.baseRateNexPerHour * row.extensionHours,
            0,
          ),
        ),
      },
      confirmedEntries: miningRows.length,
      trend: Array.from({ length: 14 })
        .map((_, index) => {
          const start = today - (13 - index) * DAY;
          const end = start + DAY;
          return {
            day: dayKey(start),
            minedNex: confirmedEarnings(["mining"], { from: start, to: end }),
            miners: uniqueUsers(
              miningRows.map((row) => ({
                userId: String(row.userId),
                ts: row.createdAt,
              })),
              { from: start, to: end },
            ),
          };
        })
        .reverse(),
    };

    const activeToday = new Set<string>();
    const activeWeek = new Set<string>();
    const activeMonth = new Set<string>();
    const addActive = (userId: string, ts?: number) => {
      if (ts === undefined) return;
      if (ts >= today) activeToday.add(userId);
      if (ts >= week) activeWeek.add(userId);
      if (ts >= month) activeMonth.add(userId);
    };
    for (const profile of profiles) addActive(String(profile.userId), profile.lastActiveAt);
    for (const row of ledger) addActive(String(row.userId), row.createdAt);
    for (const row of completions) {
      if (row.status === "verified") addActive(String(row.userId), row.verifiedAt);
    }
    for (const row of challenges) addActive(String(row.userId), row.completedAt);

    const countProfiles = (from: number, to: number) =>
      profiles.filter((profile) => profile.createdAt >= from && profile.createdAt < to)
        .length;

    // Merge every known bot identity: the new contact log, linked profiles
    // (historical starts), and invited Telegram ids recorded before this log
    // existed. A person is counted once even if all three know them.
    const botIds = new Set<string>();
    for (const profile of profiles) {
      if (profile.telegramId) botIds.add(profile.telegramId);
    }
    for (const contact of contacts) botIds.add(contact.telegramId);
    for (const row of referralRows) {
      if (row.source === "bot_start") botIds.add(row.inviteeTelegramId);
    }

    const userReport = {
      newToday: countProfiles(today, now + 1),
      newYesterday: countProfiles(yesterday, today),
      newThisWeek: countProfiles(week, now + 1),
      newThisMonth: countProfiles(month, now + 1),
      total: profiles.length,
      activeToday: activeToday.size,
      activeThisWeek: activeWeek.size,
      activeThisMonth: activeMonth.size,
      botStarters: botIds.size,
      botContacts: contacts.length,
      miniAppUsers: profiles.filter(
        (profile) => profile.miniAppOpenedAt !== undefined,
      ).length,
      verifiedTelegram: profiles.filter(
        (profile) => Boolean(profile.telegramId) && Boolean(profile.telegramVerifiedAt),
      ).length,
      restricted: profiles.filter((profile) => profile.restricted).length,
      onlineNow: profiles.filter(
        (profile) =>
          (profile.miningSessionHeartbeatAt ?? 0) > now - 60_000,
      ).length,
      trend: Array.from({ length: 14 })
        .map((_, index) => {
          const start = today - (13 - index) * DAY;
          const end = start + DAY;
          return {
            day: dayKey(start),
            joined: countProfiles(start, end),
          };
        })
        .reverse(),
    };

    const completedAds = challenges.filter(
      (row) => row.status === "completed" && row.completedAt !== undefined,
    );
    const adWindow = (window: Window) =>
      completedAds.filter((row) => inWindow(row.completedAt, window));
    const outcomeCount = (outcome: Doc<"adVerificationEvents">["outcome"], window?: Window) =>
      adEvents.filter(
        (row) => row.outcome === outcome && (!window || inWindow(row.createdAt, window)),
      ).length;
    const providerCounts = new Map<string, number>();
    for (const row of completedAds) {
      providerCounts.set(row.provider, (providerCounts.get(row.provider) ?? 0) + 1);
    }

    const adReport = {
      today: adWindow({ from: today, to: now + 1 }).length,
      yesterday: adWindow({ from: yesterday, to: today }).length,
      allTime: completedAds.length,
      uniqueUsersToday: new Set(
        adWindow({ from: today, to: now + 1 }).map((row) => String(row.userId)),
      ).size,
      uniqueUsersAllTime: new Set(completedAds.map((row) => String(row.userId))).size,
      awayCompleted: completedAds.filter((row) => row.purpose === "away").length,
      extensionCompleted: completedAds.filter((row) => row.purpose === "extension").length,
      awayUnlocks: profiles.filter((profile) => profile.awayMiningUnlockedAt !== undefined)
        .length,
      extensionUnlocks: profiles.filter(
        (profile) => profile.extensionUnlockedAt !== undefined,
      ).length,
      awayUsers: new Set(
        completedAds
          .filter((row) => row.purpose === "away")
          .map((row) => String(row.userId)),
      ).size,
      extensionUsers: new Set(
        completedAds
          .filter((row) => row.purpose === "extension")
          .map((row) => String(row.userId)),
      ).size,
      failedAttempts: adEvents.filter((row) =>
        ["invalid", "expired", "unavailable"].includes(row.outcome),
      ).length,
      rejected: outcomeCount("rejected"),
      duplicates: outcomeCount("duplicate"),
      // Completed challenges are the authoritative, provider-verified
      // completions. The outcome log only starts at the deployment that
      // introduced it, so it cannot represent older verified ads.
      verifiedEvents: completedAds.length,
      byProvider: Array.from(providerCounts.entries()).map(([provider, count]) => ({
        provider,
        count,
      })),
    };

    // Legacy profile.referredBy rows count toward referral totals too, without
    // overwriting or hiding permanent records.
    const referralProfileIds = new Set(
      referralRows
        .map((row) => (row.inviteeProfileId ? String(row.inviteeProfileId) : null))
        .filter((id): id is string => Boolean(id)),
    );
    const legacyReferrals = profiles.filter(
      (profile) =>
        profile.referredBy && !referralProfileIds.has(String(profile._id)),
    );
    const totalReferrals = referralRows.length + legacyReferrals.length;
    const qualifiedRecords = referralRows.filter(
      (row) => row.status === "qualified" && row.qualifiedAt !== undefined,
    );
    // Legacy profile.referredBy rows have no status column, so derive it from
    // their confirmed distinct task count exactly like the live desk does.
    const legacyStatus = await Promise.all(
      legacyReferrals.map(async (profile) => {
        const count = await verifiedTaskCount(ctx, profile.userId);
        const qualified =
          count >= config.referralTaskTarget ||
          profile.referralQualifiedAt !== undefined;
        const status = qualified
          ? ("qualified" as const)
          : count > 0
            ? ("in_progress" as const)
            : ("pending" as const);
        return { profile, qualified, status };
      }),
    );
    const legacyQualified = legacyStatus.filter((row) => row.qualified);
    const totalQualified = qualifiedRecords.length + legacyQualified.length;
    const pending = referralRows.filter((row) => row.status === "pending").length;
    const inProgress = referralRows.filter(
      (row) => row.status === "in_progress",
    ).length;
    const rejected = referralRows.filter((row) => row.status === "rejected").length;
    const legacyPending = legacyStatus.filter((row) => row.status === "pending").length;
    const legacyInProgress = legacyStatus.filter(
      (row) => row.status === "in_progress",
    ).length;

    const inviterCounts = new Map<string, { count: number; qualified: number; name: string }>();
    const bumpInviter = (
      id: string,
      name: string,
      qualifiedIncrement: number,
    ) => {
      const entry = inviterCounts.get(id) ?? { count: 0, qualified: 0, name };
      entry.count += 1;
      entry.qualified += qualifiedIncrement;
      inviterCounts.set(id, entry);
    };
    for (const row of referralRows) {
      bumpInviter(
        String(row.inviterProfileId),
        profileById.get(String(row.inviterProfileId))?.displayName ?? row.inviterNexId,
        row.status === "qualified" ? 1 : 0,
      );
    }
    for (const row of legacyStatus) {
      const inviterId = String(row.profile.referredBy);
      bumpInviter(
        inviterId,
        profileById.get(inviterId)?.displayName ?? "NEXPOOL miner",
        row.qualified ? 1 : 0,
      );
    }
    const topInviters = Array.from(inviterCounts.entries())
      .map(([profileId, entry]) => ({
        profileId,
        displayName: entry.name,
        total: entry.count,
        qualified: entry.qualified,
        bonusNexPerHour: roundNex(
          Math.min(entry.qualified, config.referralBonusCap) *
            config.referralBonusNexPerHour,
        ),
      }))
      .sort((a, b) => b.qualified - a.qualified || b.total - a.total)
      .slice(0, 10);

    const referralReport = {
      newToday: referralRows.filter((row) => row.createdAt >= today).length,
      total: totalReferrals,
      pending: pending + legacyPending,
      inProgress: inProgress + legacyInProgress,
      qualifiedToday: qualifiedRecords.filter((row) => (row.qualifiedAt ?? 0) >= today)
        .length,
      totalQualified,
      rejected,
      conversionRate:
        totalReferrals > 0
          ? Math.round((totalQualified / totalReferrals) * 1000) / 10
          : 0,
      inviters: inviterCounts.size,
      topInviters,
      // This is an active mining-rate bonus, not a NEX credit. No referral
      // ledger entry is written for qualification.
      activeSpeedBonusNexPerHour: roundNex(
        Array.from(inviterCounts.values()).reduce(
          (total, entry) =>
            total +
            Math.min(entry.qualified, config.referralBonusCap) *
              config.referralBonusNexPerHour,
          0,
        ),
      ),
      referralBonusMechanism: "mining-speed" as const,
    };

    const available = roundNex(
      balances.reduce((total, row) => total + row.availableNex, 0),
    );
    const reserved = roundNex(
      balances.reduce((total, row) => total + row.reservedNex, 0),
    );
    const withdrawalSum = (statuses: Array<Doc<"withdrawals">["status"]>) =>
      roundNex(
        withdrawals
          .filter((row) => statuses.includes(row.status))
          .reduce((total, row) => total + row.nexAmount, 0),
      );

    const financialReport = {
      totalIssuedNex: roundNex(
        confirmedEarnings(["mining"], all) +
          confirmedEarnings(["task"], all) +
          confirmedEarnings(["referral"], all) +
          confirmedEarnings(["level"], all) +
          confirmedEarnings(["deposit"], all) +
          confirmedEarnings(["adjustment"], all),
      ),
      miningRewardsNex: confirmedEarnings(["mining"], all),
      taskRewardsNex: confirmedEarnings(["task"], all),
      referralRewardsNex: confirmedEarnings(["referral"], all),
      levelRewardsNex: confirmedEarnings(["level"], all),
      availableNex: available,
      reservedNex: reserved,
      lifetimeMinedNex: roundNex(
        balances.reduce((total, row) => total + row.lifetimeMinedNex, 0),
      ),
      lifetimeTaskNex: roundNex(
        balances.reduce((total, row) => total + row.lifetimeTaskNex, 0),
      ),
      withdrawalRequests: withdrawals.length,
      requestedNex: withdrawalSum(["requested", "reviewing"]),
      approvedNex: withdrawalSum(["paid"]),
      rejectedNex: withdrawalSum(["rejected", "failed"]),
      paidCount: withdrawals.filter((row) => row.status === "paid").length,
      treasuryAvailableUsd: config.treasuryAvailableUsd,
      nexUsdRate: config.nexUsdRate,
      liabilityUsd: roundNex((available + reserved) * config.nexUsdRate),
      referenceRateIsNotGuaranteed: true,
    };

    return {
      generatedAt: now,
      config: {
        miningEnabled: config.miningEnabled,
        withdrawalsEnabled: config.withdrawalsEnabled,
        dailyLimitNex: config.dailyLimitNex,
        baseRateNexPerHour: config.baseRateNexPerHour,
        adsProviderReady: Boolean(process.env.MONETAG_POSTBACK_SECRET),
      },
      mining: miningReport,
      users: userReport,
      ads: adReport,
      referrals: referralReport,
      financial: financialReport,
      audit: audits.map((row) => ({
        id: row._id,
        actor: row.actorLabel,
        action: row.action,
        detail: row.detail,
        createdAt: row.createdAt,
      })),
      totals: {
        profiles: profiles.length,
        balances: balances.length,
        ledgerRows: ledger.length,
        taskCompletions: completions.length,
      },
      // Kept for callers that need a display name for a userId.
      profileNames: Object.fromEntries(
        profiles.map((profile) => [String(profile.userId), profile.displayName]),
      ),
    };
  },
});

