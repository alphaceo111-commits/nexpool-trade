import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  audit,
  loadConfig,
  requireAdmin,
  resolveAdminAccess,
  roundNex,
} from "./engine";

const MAX_LEDGER_ROWS = 4_000;

function ledgerKey(row: Doc<"ledger">) {
  if (!row.refId) return null;
  return `${row.kind}:${row.refId}`;
}

function sumNex(rows: Array<{ amountNex: number }>) {
  return roundNex(rows.reduce((total, row) => total + row.amountNex, 0));
}

type DbCtx = QueryCtx | MutationCtx;

async function loadAccount(ctx: DbCtx, profile: Doc<"profiles">) {
  const [
    user,
    profilesForUser,
    authAccounts,
    balance,
    ledger,
    miningDays,
    miningEntries,
    challenges,
    adEvents,
    extensionSessions,
    completions,
    levelClaims,
    xpEvents,
    referralsAsInviter,
    referralsAsInvitee,
    referralsByTelegram,
    deposits,
    withdrawals,
    notifications,
    profilesByTelegram,
    claim,
  ] = await Promise.all([
    ctx.db.get(profile.userId),
    ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", profile.userId))
      .collect(),
    ctx.db.query("authAccounts").collect(),
    ctx.db
      .query("balances")
      .withIndex("by_user", (q) => q.eq("userId", profile.userId))
      .first(),
    ctx.db
      .query("ledger")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", profile.userId))
      .collect(),
    ctx.db
      .query("miningDays")
      .withIndex("by_user_day", (q) => q.eq("userId", profile.userId))
      .collect(),
    ctx.db
      .query("miningEntries")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", profile.userId))
      .collect(),
    ctx.db
      .query("miningAdChallenges")
      .withIndex("by_user_status_createdAt", (q) =>
        q.eq("userId", profile.userId),
      )
      .collect(),
    ctx.db
      .query("adVerificationEvents")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", profile.userId))
      .collect(),
    ctx.db
      .query("miningExtensionSessions")
      .withIndex("by_user_startedAt", (q) => q.eq("userId", profile.userId))
      .collect(),
    ctx.db
      .query("taskCompletions")
      .withIndex("by_user", (q) => q.eq("userId", profile.userId))
      .collect(),
    ctx.db
      .query("levelClaims")
      .withIndex("by_user", (q) => q.eq("userId", profile.userId))
      .collect(),
    ctx.db
      .query("xpEvents")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", profile.userId))
      .collect(),
    ctx.db
      .query("referrals")
      .withIndex("by_inviter_createdAt", (q) =>
        q.eq("inviterProfileId", profile._id),
      )
      .collect(),
    ctx.db
      .query("referrals")
      .withIndex("by_inviteeProfile", (q) =>
        q.eq("inviteeProfileId", profile._id),
      )
      .collect(),
    profile.telegramId
      ? ctx.db
          .query("referrals")
          .withIndex("by_inviteeTelegramId", (q) =>
            q.eq("inviteeTelegramId", profile.telegramId!),
          )
          .collect()
      : Promise.resolve([]),
    ctx.db
      .query("deposits")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", profile.userId))
      .collect(),
    ctx.db
      .query("withdrawals")
      .withIndex("by_user_requestedAt", (q) =>
        q.eq("userId", profile.userId),
      )
      .collect(),
    ctx.db
      .query("notifications")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", profile.userId))
      .collect(),
    profile.telegramId
      ? ctx.db
          .query("profiles")
          .withIndex("by_telegramId", (q) =>
            q.eq("telegramId", profile.telegramId!),
          )
          .collect()
      : Promise.resolve([]),
    profile.telegramId
      ? ctx.db
          .query("telegramIdentities")
          .withIndex("by_telegramId", (q) =>
            q.eq("telegramId", profile.telegramId!),
          )
          .first()
      : Promise.resolve(null),
  ]);

  return {
    profile,
    user,
    profilesForUser,
    authAccounts: authAccounts.filter(
      (row) => row.userId === profile.userId,
    ),
    balance,
    ledger,
    miningDays,
    miningEntries,
    challenges,
    adEvents,
    extensionSessions,
    completions,
    levelClaims,
    xpEvents,
    referralsAsInviter,
    referralsAsInvitee,
    referralsByTelegram,
    deposits,
    withdrawals,
    notifications,
    profilesByTelegram,
    claim,
  };
}

type AccountBundle = Awaited<ReturnType<typeof loadAccount>>;

function referralKeys(rows: Doc<"referrals">[]) {
  return new Set(
    rows.flatMap((row) => [
      row.inviteeProfileId ? `p:${row.inviteeProfileId}` : null,
      `t:${row.inviteeTelegramId}`,
    ]).filter((key): key is string => Boolean(key)),
  );
}

function xpKey(row: Doc<"xpEvents">) {
  return row.refId
    ? `${row.source}:${row.refId}`
    : `${row.source}:${row.createdAt}:${row.amountXp}`;
}

async function evaluate(
  ctx: DbCtx,
  primary: AccountBundle,
  duplicate: AccountBundle,
) {
  const config = await loadConfig(ctx);
  const telegramId = duplicate.profile.telegramId;
  const telegramAccount = telegramId
    ? await ctx.db
        .query("authAccounts")
        .withIndex("providerAndAccountId", (q) =>
          q.eq("provider", "telegram").eq("providerAccountId", telegramId),
        )
        .first()
    : null;
  const telegramOwner = telegramAccount
    ? await ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", telegramAccount.userId))
        .first()
    : null;

  const primaryLedgerKeys = new Set(
    primary.ledger
      .map(ledgerKey)
      .filter((key): key is string => Boolean(key)),
  );
  const transferableLedger = duplicate.ledger.filter((row) => {
    const key = ledgerKey(row);
    return !key || !primaryLedgerKeys.has(key);
  });
  const uniqueLedger = transferableLedger;
  const collidedLedger = duplicate.ledger.filter((row) => {
    const key = ledgerKey(row);
    return Boolean(key && primaryLedgerKeys.has(key));
  });
  const transferableNex = sumNex(transferableLedger);
  const transferableMiningNex = roundNex(
    transferableLedger
      .filter((row) => row.kind === "mining" && row.amountNex > 0)
      .reduce((total, row) => total + row.amountNex, 0),
  );
  const transferableTaskNex = roundNex(
    transferableLedger
      .filter((row) => row.kind === "task" && row.amountNex > 0)
      .reduce((total, row) => total + row.amountNex, 0),
  );

  const duplicateLedgerNet = sumNex(duplicate.ledger);
  const primaryTaskIds = new Set(primary.completions.map((row) => row.taskId));
  const primaryLevels = new Set(primary.levelClaims.map((row) => row.level));
  const primaryDays = new Set(primary.miningDays.map((row) => row.day));
  const primaryEntryKeys = new Set(
    primary.miningEntries.map(
      (row) => `${row.day}:${row.fromTs}:${row.toTs}:${row.amountNex}`,
    ),
  );
  const primaryXpKeys = new Set(primary.xpEvents.map(xpKey));
  const primaryInviteKeys = referralKeys(primary.referralsAsInviter);
  const primaryHasInvitee = primary.referralsAsInvitee.length > 0;

  const taskCollisions = duplicate.completions.filter((row) =>
    primaryTaskIds.has(row.taskId),
  ).length;
  const levelCollisions = duplicate.levelClaims.filter((row) =>
    primaryLevels.has(row.level),
  ).length;
  const miningDayCollisions = duplicate.miningDays.filter((row) =>
    primaryDays.has(row.day),
  ).length;
  const entryDayCollisions = duplicate.miningEntries.filter((row) =>
    primaryEntryKeys.has(
      `${row.day}:${row.fromTs}:${row.toTs}:${row.amountNex}`,
    ),
  ).length;
  const xpCollisions = duplicate.xpEvents.filter((row) =>
    primaryXpKeys.has(xpKey(row)),
  ).length;
  const referralCollisions = duplicate.referralsAsInviter.filter((row) =>
    primaryInviteKeys.has(
      row.inviteeProfileId
        ? `p:${row.inviteeProfileId}`
        : `t:${row.inviteeTelegramId}`,
    ),
  ).length;

  const pendingWithdrawals = duplicate.withdrawals.filter(
    (row) => row.status === "requested" || row.status === "reviewing",
  );
  const pendingDeposits = duplicate.deposits.filter(
    (row) => row.status === "pending" && row.expiresAt > Date.now(),
  );
  const otherTelegramProfiles = duplicate.profilesByTelegram.filter(
    (row) => row._id !== primary.profile._id && row._id !== duplicate.profile._id,
  );
  const otherAuthProviders = duplicate.authAccounts.filter(
    (row) => row.provider !== "telegram" && row.provider !== "anonymous",
  );
  const primaryTelegramAccounts = primary.authAccounts.filter(
    (row) => row.provider === "telegram",
  );

  const blockers: string[] = [];
  if (!primary.user) {
    blockers.push("The primary auth user row is missing.");
  }
  if (!duplicate.user) {
    blockers.push("The duplicate auth user row is missing.");
  }
  if (!primary.balance) {
    blockers.push("The primary has no balance record.");
  }
  if (primary.profilesForUser.length !== 1) {
    blockers.push("The primary auth user has more than one NEXPOOL profile.");
  }
  if (duplicate.profilesForUser.length !== 1) {
    blockers.push("The duplicate auth user has more than one NEXPOOL profile.");
  }
  if (primary.profile._id === duplicate.profile._id) {
    blockers.push("Primary and duplicate are the same profile.");
  }
  if (primary.profile.userId === duplicate.profile.userId) {
    blockers.push("Both profiles share the same auth user; use a data repair, not an account merge.");
  }
  if (!telegramId) {
    blockers.push("The duplicate has no verified Telegram numeric ID.");
  }
  if (!duplicate.profile.telegramVerifiedAt) {
    blockers.push("The duplicate's Telegram identity has no verification timestamp.");
  }
  if (!telegramAccount || telegramAccount.userId !== duplicate.profile.userId) {
    blockers.push("The duplicate's Telegram auth account does not belong to its auth user.");
  }
  if (primary.profile.telegramId && primary.profile.telegramId !== telegramId) {
    blockers.push("The primary is already linked to a different Telegram ID.");
  }
  if (primaryTelegramAccounts.some((row) => row.providerAccountId !== telegramId)) {
    blockers.push("The primary auth user already has a different Telegram auth account.");
  }
  if (otherTelegramProfiles.length > 0) {
    blockers.push("Another profile also claims this Telegram ID; recovery must be reviewed manually.");
  }
  if (duplicate.claim && duplicate.claim.profileId !== primary.profile._id && duplicate.claim.profileId !== duplicate.profile._id) {
    blockers.push("The canonical Telegram registry points at a third profile.");
  }
  if (pendingWithdrawals.length > 0 || (duplicate.balance?.reservedNex ?? 0) > 0) {
    blockers.push("The duplicate has a pending or reserved withdrawal.");
  }
  if (pendingDeposits.length > 0) {
    blockers.push("The duplicate has an unexpired pending TON deposit.");
  }
  if (otherAuthProviders.length > 0) {
    blockers.push("The duplicate has non-Telegram auth providers that require manual review.");
  }
  if (config.ownerUserId === duplicate.profile.userId) {
    blockers.push("The duplicate is the configured operator owner.");
  }
  if (duplicate.ledger.length > MAX_LEDGER_ROWS) {
    blockers.push("The duplicate has too many ledger rows for one atomic merge.");
  }
  const duplicateAvailable = roundNex(duplicate.balance?.availableNex ?? 0);
  if (Math.abs(duplicateAvailable - duplicateLedgerNet) > 0.01) {
    blockers.push(
      `The duplicate available balance (${duplicateAvailable} NEX) does not reconcile to its ledger (${duplicateLedgerNet} NEX). Inspect before merging.`,
    );
  }

  return {
    config,
    telegramId,
    telegramAccount,
    telegramOwner,
    primaryLedgerKeys,
    transferableLedger,
    collidedLedger,
    transferableNex,
    transferableMiningNex,
    transferableTaskNex,
    uniqueLedger,
    taskCollisions,
    levelCollisions,
    miningDayCollisions,
    entryDayCollisions,
    xpCollisions,
    referralCollisions,
    pendingWithdrawals,
    pendingDeposits,
    otherTelegramProfiles,
    otherAuthProviders,
    blockers,
    primaryTaskIds,
    primaryLevels,
    primaryDays,
    primaryEntryKeys,
    primaryXpKeys,
    primaryInviteKeys,
    primaryHasInvitee,
  };
}

function summarize(bundle: AccountBundle) {
  const verified = bundle.completions.filter(
    (row) => row.status === "verified",
  );
  return {
    profileId: bundle.profile._id,
    userId: bundle.profile.userId,
    nexId: bundle.profile.nexId,
    displayName: bundle.profile.displayName,
    username: bundle.profile.username ?? null,
    telegramLinked: Boolean(bundle.profile.telegramId),
    telegramVerifiedAt: bundle.profile.telegramVerifiedAt ?? null,
    createdAt: bundle.profile.createdAt,
    walletAddress: bundle.profile.walletAddress ?? null,
    walletNetwork: bundle.profile.walletNetwork ?? null,
    referralCode: bundle.profile.referralCode,
    referredBy: bundle.profile.referredBy ?? null,
    xp: bundle.profile.xp ?? 0,
    user: bundle.user
      ? {
          exists: true,
          isAnonymous: Boolean(bundle.user.isAnonymous),
          role: bundle.user.role ?? null,
          email: bundle.user.email ?? null,
        }
      : { exists: false, isAnonymous: false, role: null, email: null },
    authProviders: bundle.authAccounts.map((row) => row.provider),
    balance: {
      availableNex: roundNex(bundle.balance?.availableNex ?? 0),
      reservedNex: roundNex(bundle.balance?.reservedNex ?? 0),
      lifetimeMinedNex: roundNex(bundle.balance?.lifetimeMinedNex ?? 0),
      lifetimeTaskNex: roundNex(bundle.balance?.lifetimeTaskNex ?? 0),
    },
    ledgerCount: bundle.ledger.length,
    ledgerNetNex: sumNex(bundle.ledger),
    miningDayCount: bundle.miningDays.length,
    miningEntryCount: bundle.miningEntries.length,
    verifiedTaskCount: new Set(verified.map((row) => row.taskId)).size,
    claimedLevel: bundle.levelClaims.reduce(
      (max, row) => Math.max(max, row.level),
      0,
    ),
    xpEventCount: bundle.xpEvents.length,
    referralsInvited: bundle.referralsAsInviter.length,
    referralsQualified: bundle.referralsAsInviter.filter(
      (row) => row.status === "qualified",
    ).length,
    deposits: bundle.deposits.length,
    withdrawals: bundle.withdrawals.length,
    withdrawalStatuses: bundle.withdrawals.reduce<Record<string, number>>(
      (counts, row) => {
        counts[row.status] = (counts[row.status] ?? 0) + 1;
        return counts;
      },
      {},
    ),
    activeExtension: Boolean(
      bundle.profile.miningExtensionEndsAt &&
        bundle.profile.miningExtensionEndsAt > Date.now(),
    ),
    awayMiningActive: Boolean(
      bundle.profile.awayMiningExpiresAt &&
        bundle.profile.awayMiningExpiresAt > Date.now(),
    ),
  };
}

/** Read-only forensic preview. Never mutates either account. */
export const recoveryPreview = query({
  args: {
    primaryNexId: v.string(),
    duplicateNexId: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await resolveAdminAccess(ctx);
    if (!access.isAdmin) return null;

    const primaryProfile = await ctx.db
      .query("profiles")
      .withIndex("by_nexId", (q) => q.eq("nexId", args.primaryNexId.trim()))
      .first();
    const duplicateProfile = await ctx.db
      .query("profiles")
      .withIndex("by_nexId", (q) => q.eq("nexId", args.duplicateNexId.trim()))
      .first();

    if (!primaryProfile || !duplicateProfile) {
      return {
        ok: false as const,
        missing: [
          ...(primaryProfile ? [] : [args.primaryNexId]),
          ...(duplicateProfile ? [] : [args.duplicateNexId]),
        ],
        primary: null,
        duplicate: null,
        identity: null,
        reconciliation: null,
        blockers: ["Both NEX IDs must exist before recovery can be previewed."],
        mergeReady: false as const,
      };
    }

    const [primary, duplicate] = await Promise.all([
      loadAccount(ctx, primaryProfile),
      loadAccount(ctx, duplicateProfile),
    ]);
    const evaluation = await evaluate(ctx, primary, duplicate);
    const telegramOwnerProfile = evaluation.telegramOwner
      ? await ctx.db
          .query("profiles")
          .withIndex("by_user", (q) =>
            q.eq("userId", evaluation.telegramOwner!.userId),
          )
          .first()
      : null;

    return {
      ok: true as const,
      missing: [] as string[],
      primary: summarize(primary),
      duplicate: summarize(duplicate),
      identity: {
        duplicateHasTelegram: Boolean(duplicate.profile.telegramId),
        duplicateVerified: Boolean(duplicate.profile.telegramVerifiedAt),
        telegramAuthAccountMatches: Boolean(
          evaluation.telegramAccount &&
            evaluation.telegramAccount.userId === duplicate.profile.userId,
        ),
        telegramOwnerNexId: telegramOwnerProfile?.nexId ?? null,
        canonicalClaimProfileId: duplicate.claim?.profileId ?? null,
        otherProfilesClaimingTelegram: evaluation.otherTelegramProfiles.length,
        authProviders: duplicate.authAccounts.map((row) => row.provider),
      },
      reconciliation: {
        ledgerRows: duplicate.ledger.length,
        uniqueLedgerRows: evaluation.uniqueLedger.length,
        collidedLedgerRows: evaluation.collidedLedger.length,
        transferableNex: evaluation.transferableNex,
        transferableMiningNex: evaluation.transferableMiningNex,
        transferableTaskNex: evaluation.transferableTaskNex,
        duplicateAvailableNex: roundNex(duplicate.balance?.availableNex ?? 0),
        duplicateLedgerNetNex: sumNex(duplicate.ledger),
        taskCollisions: evaluation.taskCollisions,
        levelCollisions: evaluation.levelCollisions,
        miningDayCollisions: evaluation.miningDayCollisions,
        entryDayCollisions: evaluation.entryDayCollisions,
        xpCollisions: evaluation.xpCollisions,
        referralCollisions: evaluation.referralCollisions,
      },
      blockers: evaluation.blockers,
      mergeReady: evaluation.blockers.length === 0,
      ledgerPreview: {
        primary: primary.ledger
          .slice()
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 20)
          .map((row) => ({
            kind: row.kind,
            amountNex: roundNex(row.amountNex),
            memo: row.memo,
            refId: row.refId ?? null,
            createdAt: row.createdAt,
          })),
        duplicate: duplicate.ledger
          .slice()
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 20)
          .map((row) => ({
            kind: row.kind,
            amountNex: roundNex(row.amountNex),
            memo: row.memo,
            refId: row.refId ?? null,
            createdAt: row.createdAt,
          })),
      },
    };
  },
});

/**
 * Atomic canonical merge. The primary profile and its ledger remain canonical;
 * only duplicate ledger rows with unique (kind, refId) keys are transferred.
 * Collisions are never added to the primary balance. The duplicate's complete
 * records are archived before any row is moved or removed.
 */
export const mergeDuplicateAccount = mutation({
  args: {
    primaryNexId: v.string(),
    duplicateNexId: v.string(),
    confirmPrimaryNexId: v.string(),
    confirmDuplicateNexId: v.string(),
    ownershipConfirmed: v.boolean(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const primaryNexId = args.primaryNexId.trim();
    const duplicateNexId = args.duplicateNexId.trim();
    if (!args.ownershipConfirmed) {
      throw new Error(
        "Confirm that both NEX IDs belong to the same person and that the duplicate owns the verified Telegram identity.",
      );
    }
    if (
      args.confirmPrimaryNexId.trim() !== primaryNexId ||
      args.confirmDuplicateNexId.trim() !== duplicateNexId
    ) {
      throw new Error("Both NEX ID confirmations must match exactly.");
    }
    if (primaryNexId === duplicateNexId) {
      throw new Error("Primary and duplicate must be different accounts.");
    }

    const duplicateProfile = await ctx.db
      .query("profiles")
      .withIndex("by_nexId", (q) => q.eq("nexId", duplicateNexId))
      .first();
    const primaryProfile = await ctx.db
      .query("profiles")
      .withIndex("by_nexId", (q) => q.eq("nexId", primaryNexId))
      .first();

    if (!duplicateProfile) {
      const archived = await ctx.db
        .query("accountMergeArchives")
        .withIndex("by_duplicateNexId", (q) =>
          q.eq("duplicateNexId", duplicateNexId),
        )
        .first();
      if (archived) {
        return {
          merged: false as const,
          alreadyMerged: true as const,
          archiveId: archived._id,
          primaryNexId: archived.primaryNexId,
          duplicateNexId: archived.duplicateNexId,
        };
      }
      throw new Error("The duplicate account no longer exists and has no merge archive.");
    }
    if (!primaryProfile) throw new Error("The primary account was not found.");

    const existingArchive = await ctx.db
      .query("accountMergeArchives")
      .withIndex("by_duplicateNexId", (q) => q.eq("duplicateNexId", duplicateNexId))
      .first();
    if (existingArchive) {
      return {
        merged: false as const,
        alreadyMerged: true as const,
        archiveId: existingArchive._id,
        primaryNexId: existingArchive.primaryNexId,
        duplicateNexId: existingArchive.duplicateNexId,
      };
    }

    const [primary, duplicate] = await Promise.all([
      loadAccount(ctx, primaryProfile),
      loadAccount(ctx, duplicateProfile),
    ]);
    const evaluation = await evaluate(ctx, primary, duplicate);
    if (evaluation.blockers.length > 0) {
      throw new Error(
        `Merge blocked: ${evaluation.blockers.join(" ")}`,
      );
    }
    if (!primary.balance) {
      throw new Error("The primary account has no balance record.");
    }

    const now = Date.now();
    const telegramId = duplicate.profile.telegramId!;
    const archive = {
      profileSnapshot: JSON.stringify({
        profile: duplicate.profile,
        user: duplicate.user,
      }),
      balanceSnapshot: JSON.stringify(duplicate.balance),
      ledgerSnapshot: JSON.stringify(duplicate.ledger),
      miningSnapshot: JSON.stringify({
        miningDays: duplicate.miningDays,
        miningEntries: duplicate.miningEntries,
        extensionSessions: duplicate.extensionSessions,
        challenges: duplicate.challenges,
        adEvents: duplicate.adEvents,
      }),
      taskSnapshot: JSON.stringify({
        completions: duplicate.completions,
        levelClaims: duplicate.levelClaims,
        xpEvents: duplicate.xpEvents,
      }),
      referralSnapshot: JSON.stringify({
        asInviter: duplicate.referralsAsInviter,
        asInvitee: duplicate.referralsAsInvitee,
        byTelegram: duplicate.referralsByTelegram,
      }),
      walletSnapshot: JSON.stringify({
        deposits: duplicate.deposits,
        withdrawals: duplicate.withdrawals,
      }),
    };
    for (const value of Object.values(archive)) {
      if (value.length > 900_000) {
        throw new Error("The duplicate has too much archived data for one atomic merge.");
      }
    }

    const totalRows =
      duplicate.ledger.length +
      duplicate.miningDays.length +
      duplicate.miningEntries.length +
      duplicate.extensionSessions.length +
      duplicate.completions.length +
      duplicate.levelClaims.length +
      duplicate.xpEvents.length +
      duplicate.referralsAsInviter.length +
      duplicate.referralsAsInvitee.length +
      duplicate.referralsByTelegram.length +
      duplicate.deposits.length +
      duplicate.withdrawals.length +
      duplicate.notifications.length +
      duplicate.challenges.length +
      duplicate.adEvents.length +
      duplicate.authAccounts.length +
      12;
    if (totalRows > 4_000) {
      throw new Error("The duplicate has too many rows for one atomic merge.");
    }

    const summary = {
      transferableNex: evaluation.transferableNex,
      transferableMiningNex: evaluation.transferableMiningNex,
      transferableTaskNex: evaluation.transferableTaskNex,
      skippedLedgerRows: evaluation.collidedLedger.length,
      taskCollisions: evaluation.taskCollisions,
      levelCollisions: evaluation.levelCollisions,
      miningDayCollisions: evaluation.miningDayCollisions,
      entryDayCollisions: evaluation.entryDayCollisions,
      xpCollisions: evaluation.xpCollisions,
      referralCollisions: evaluation.referralCollisions,
      duplicateAvailableNex: roundNex(duplicate.balance?.availableNex ?? 0),
      duplicateLedgerNetNex: sumNex(duplicate.ledger),
    };
    const archiveId = await ctx.db.insert("accountMergeArchives", {
      primaryProfileId: primary.profile._id,
      duplicateProfileId: duplicate.profile._id,
      primaryUserId: primary.profile.userId,
      duplicateUserId: duplicate.profile.userId,
      primaryNexId: primary.profile.nexId,
      duplicateNexId: duplicate.profile.nexId,
      telegramId,
      actorId: String(actor.userId),
      actorLabel: actor.label,
      reason: args.reason?.trim().slice(0, 300),
      summary: JSON.stringify(summary),
      ...archive,
      createdAt: now,
    });

    // 1. Reconcile the ledger. A colliding (kind, refId) row is archived and
    // removed from the live duplicate; it is never added to primary or balance.
    let transferredNetNex = 0;
    let transferredMiningNex = 0;
    let transferredTaskNex = 0;
    for (const row of duplicate.ledger) {
      const key = ledgerKey(row);
      if (key && evaluation.primaryLedgerKeys.has(key)) {
        await ctx.db.delete(row._id);
        continue;
      }
      await ctx.db.patch(row._id, { userId: primary.profile.userId });
      evaluation.primaryLedgerKeys.add(key ?? `id:${row._id}`);
      transferredNetNex = roundNex(transferredNetNex + row.amountNex);
      if (row.kind === "mining" && row.amountNex > 0) {
        transferredMiningNex = roundNex(transferredMiningNex + row.amountNex);
      }
      if (row.kind === "task" && row.amountNex > 0) {
        transferredTaskNex = roundNex(transferredTaskNex + row.amountNex);
      }
    }

    // 2. Mining days and materialised entries: primary's day wins on collision.
    for (const row of duplicate.miningDays) {
      if (evaluation.primaryDays.has(row.day)) {
        await ctx.db.delete(row._id);
      } else {
        await ctx.db.patch(row._id, { userId: primary.profile.userId });
        evaluation.primaryDays.add(row.day);
      }
    }
    for (const row of duplicate.miningEntries) {
      const key = `${row.day}:${row.fromTs}:${row.toTs}:${row.amountNex}`;
      if (evaluation.primaryEntryKeys.has(key)) {
        await ctx.db.delete(row._id);
      } else {
        await ctx.db.patch(row._id, { userId: primary.profile.userId });
        evaluation.primaryEntryKeys.add(key);
      }
    }

    // 3. Preserve one active extension at most. Primary wins an overlap.
    let movedActiveSession: Doc<"miningExtensionSessions"> | null = null;
    const primaryHasActiveExtension = primary.extensionSessions.some(
      (row) => row.status === "active" && row.endsAt > now,
    );
    for (const row of duplicate.extensionSessions) {
      if (row.status === "active" && row.endsAt > now) {
        if (!primaryHasActiveExtension && !movedActiveSession) {
          await ctx.db.patch(row._id, { userId: primary.profile.userId });
          movedActiveSession = row;
        } else {
          await ctx.db.delete(row._id);
        }
      } else {
        await ctx.db.patch(row._id, { userId: primary.profile.userId });
      }
    }

    for (const row of duplicate.challenges) {
      if (row.status === "pending" || row.status === "awaiting") {
        await ctx.db.delete(row._id);
      } else {
        await ctx.db.patch(row._id, { userId: primary.profile.userId });
      }
    }
    for (const row of duplicate.adEvents) {
      await ctx.db.patch(row._id, { userId: primary.profile.userId });
    }

    // 4. Tasks, levels and XP are deduplicated by their stable keys.
    for (const row of duplicate.completions) {
      if (evaluation.primaryTaskIds.has(row.taskId)) {
        // Preserve a verified completion if the primary only had a pending or
        // rejected attempt. The duplicate row is retired either way.
        const existing = primary.completions.find(
          (completion) => completion.taskId === row.taskId,
        );
        if (
          existing &&
          existing.status !== "verified" &&
          row.status === "verified"
        ) {
          await ctx.db.patch(existing._id, {
            status: "verified",
            submittedAt: row.submittedAt ?? existing.submittedAt,
            verifiedAt: row.verifiedAt ?? now,
            note: row.note ?? existing.note,
            verifiedBy: row.verifiedBy ?? "account-merge",
          });
        }
        await ctx.db.delete(row._id);
      } else {
        await ctx.db.patch(row._id, { userId: primary.profile.userId });
        evaluation.primaryTaskIds.add(row.taskId);
      }
    }
    for (const row of duplicate.levelClaims) {
      if (evaluation.primaryLevels.has(row.level)) {
        await ctx.db.delete(row._id);
      } else {
        await ctx.db.patch(row._id, { userId: primary.profile.userId });
        evaluation.primaryLevels.add(row.level);
      }
    }
    for (const row of duplicate.xpEvents) {
      const key = xpKey(row);
      if (evaluation.primaryXpKeys.has(key)) {
        await ctx.db.delete(row._id);
      } else {
        await ctx.db.patch(row._id, { userId: primary.profile.userId });
        evaluation.primaryXpKeys.add(key);
      }
    }

    // 5. Referrals: transfer only invitee relationships primary does not
    // already own. Never create a self-referral.
    const duplicateInviteeProfiles = await ctx.db
      .query("profiles")
      .withIndex("by_referredBy", (q) =>
        q.eq("referredBy", duplicate.profile._id),
      )
      .collect();
    for (const invitee of duplicateInviteeProfiles) {
      if (invitee._id !== primary.profile._id) {
        await ctx.db.patch(invitee._id, {
          referredBy: primary.profile._id,
        });
      }
    }
    for (const row of duplicate.referralsAsInviter) {
      const key = row.inviteeProfileId
        ? `p:${row.inviteeProfileId}`
        : `t:${row.inviteeTelegramId}`;
      if (
        evaluation.primaryInviteKeys.has(key) ||
        row.inviteeProfileId === primary.profile._id
      ) {
        await ctx.db.delete(row._id);
        continue;
      }
      await ctx.db.patch(row._id, {
        inviterProfileId: primary.profile._id,
        inviterUserId: primary.profile.userId,
        inviterNexId: primary.profile.nexId,
        inviterTelegramId: primary.profile.telegramId ?? telegramId,
      });
      evaluation.primaryInviteKeys.add(key);
    }
    const inviteeRows = [...duplicate.referralsAsInvitee];
    for (const row of duplicate.referralsByTelegram) {
      if (!inviteeRows.some((existing) => existing._id === row._id)) {
        inviteeRows.push(row);
      }
    }
    for (const row of inviteeRows) {
      if (evaluation.primaryHasInvitee || primary.profile.referredBy) {
        await ctx.db.delete(row._id);
        continue;
      }
      const inviter = await ctx.db.get(row.inviterProfileId);
      if (!inviter) {
        await ctx.db.delete(row._id);
        continue;
      }
      await ctx.db.patch(row._id, {
        inviteeProfileId: primary.profile._id,
        inviteeUserId: primary.profile.userId,
        inviteeName: primary.profile.displayName,
      });
      await ctx.db.patch(primary.profile._id, {
        referredBy: row.inviterProfileId,
        referredAt: row.createdAt,
        referralQualifiedAt: row.qualifiedAt,
      });
      break;
    }

    // Preserve the duplicate's own inviter if only the profile link exists and
    // there is no materialised referral row. The primary's inviter always wins.
    const primaryAfterInviteeTransfer = await ctx.db.get(primary.profile._id);
    if (
      primaryAfterInviteeTransfer &&
      !primaryAfterInviteeTransfer.referredBy &&
      !evaluation.primaryHasInvitee &&
      duplicate.profile.referredBy &&
      duplicate.profile.referredBy !== primary.profile._id
    ) {
      const inviter = await ctx.db.get(duplicate.profile.referredBy);
      if (inviter) {
        await ctx.db.patch(primary.profile._id, {
          referredBy: inviter._id,
          referredAt: duplicate.profile.referredAt,
          referralQualifiedAt: duplicate.profile.referralQualifiedAt,
        });
      }
    }

    // 6. Wallet history. Pending states were rejected above.
    const primaryDepositHashes = new Set(
      primary.deposits.map((row) => row.txHash).filter(Boolean),
    );
    for (const row of duplicate.deposits) {
      if (row.txHash && primaryDepositHashes.has(row.txHash)) {
        await ctx.db.delete(row._id);
      } else {
        await ctx.db.patch(row._id, {
          userId: primary.profile.userId,
          nexId: primary.profile.nexId,
        });
        if (row.txHash) primaryDepositHashes.add(row.txHash);
      }
    }
    for (const row of duplicate.withdrawals) {
      await ctx.db.patch(row._id, { userId: primary.profile.userId });
    }
    for (const row of duplicate.notifications) {
      await ctx.db.delete(row._id);
    }

    // 7. Balance is reconciled from unique ledger rows, not by adding the two
    // displayed balances. Colliding rewards never increase the canonical total.
    const nextAvailable = Math.max(
      0,
      roundNex(primary.balance.availableNex + transferredNetNex),
    );
    await ctx.db.patch(primary.balance._id, {
      availableNex: nextAvailable,
      lifetimeMinedNex: roundNex(
        primary.balance.lifetimeMinedNex + transferredMiningNex,
      ),
      lifetimeTaskNex: roundNex(
        primary.balance.lifetimeTaskNex + transferredTaskNex,
      ),
      lastSettledAt: Math.max(
        primary.balance.lastSettledAt,
        duplicate.balance?.lastSettledAt ?? 0,
      ),
      updatedAt: now,
    });

    // 8. Canonical profile keeps its NEX ID, referral code, history and name.
    const profilePatch: Record<string, unknown> = {
      telegramId,
      telegramVerifiedAt: now,
      xp: Math.max(primary.profile.xp ?? 0, duplicate.profile.xp ?? 0),
    };
    const username = duplicate.profile.username ?? primary.profile.username;
    if (username) profilePatch.username = username;
    const photoUrl = duplicate.profile.photoUrl ?? primary.profile.photoUrl;
    if (photoUrl) profilePatch.photoUrl = photoUrl;
    if (
      primary.profile.firstMiningStartedAt !== undefined ||
      duplicate.profile.firstMiningStartedAt !== undefined
    ) {
      profilePatch.firstMiningStartedAt = Math.min(
        primary.profile.firstMiningStartedAt ?? Infinity,
        duplicate.profile.firstMiningStartedAt ?? Infinity,
      );
    }
    if (
      primary.profile.lastActiveAt !== undefined ||
      duplicate.profile.lastActiveAt !== undefined
    ) {
      profilePatch.lastActiveAt = Math.max(
        primary.profile.lastActiveAt ?? 0,
        duplicate.profile.lastActiveAt ?? 0,
      );
    }
    if (
      primary.profile.miniAppOpenedAt !== undefined ||
      duplicate.profile.miniAppOpenedAt !== undefined
    ) {
      profilePatch.miniAppOpenedAt = Math.min(
        primary.profile.miniAppOpenedAt ?? Infinity,
        duplicate.profile.miniAppOpenedAt ?? Infinity,
      );
    }
    if (!primary.profile.walletAddress && duplicate.profile.walletAddress) {
      profilePatch.walletAddress = duplicate.profile.walletAddress;
      profilePatch.walletNetwork = duplicate.profile.walletNetwork;
      profilePatch.walletApp = duplicate.profile.walletApp;
      profilePatch.walletConnectedAt = duplicate.profile.walletConnectedAt;
    }
    if (movedActiveSession) {
      profilePatch.activeExtensionSessionId = movedActiveSession._id;
      profilePatch.miningExtensionStartedAt = movedActiveSession.startedAt;
      profilePatch.miningExtensionEndsAt = movedActiveSession.endsAt;
      profilePatch.extensionUnlockedAt = movedActiveSession.startedAt;
      profilePatch.extensionUnlockDay = movedActiveSession.day;
      profilePatch.extensionAdProgress = 0;
    }
    await ctx.db.patch(primary.profile._id, profilePatch);

    // 9. Move the verified Telegram auth account and clear the old sessions.
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", duplicate.profile.userId))
      .collect();
    for (const session of sessions) {
      const refreshTokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
        .collect();
      for (const token of refreshTokens) await ctx.db.delete(token._id);
      await ctx.db.delete(session._id);
    }
    for (const account of duplicate.authAccounts) {
      if (
        account.provider === "telegram" &&
        account.providerAccountId === telegramId
      ) {
        await ctx.db.patch(account._id, { userId: primary.profile.userId });
      } else {
        const codes = await ctx.db
          .query("authVerificationCodes")
          .withIndex("accountId", (q) => q.eq("accountId", account._id))
          .collect();
        for (const code of codes) await ctx.db.delete(code._id);
        await ctx.db.delete(account._id);
      }
    }

    const claim = await ctx.db
      .query("telegramIdentities")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", telegramId))
      .first();
    if (claim) {
      await ctx.db.patch(claim._id, {
        userId: primary.profile.userId,
        profileId: primary.profile._id,
        verifiedAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("telegramIdentities", {
        telegramId,
        userId: primary.profile.userId,
        profileId: primary.profile._id,
        verifiedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    const primaryUser = await ctx.db.get(primary.profile.userId);
    if (primaryUser) {
      await ctx.db.patch(primaryUser._id, {
        isAnonymous: false,
        role:
          primaryUser.role === "admin" || duplicate.user?.role === "admin"
            ? "admin"
            : (primaryUser.role ?? "user"),
      });
    }

    const duplicateUser = duplicate.user
      ? await ctx.db.get(duplicate.profile.userId)
      : null;
    if (duplicateUser) {
      await ctx.db.delete(duplicateUser._id);
    }
    await ctx.db.delete(duplicate.profile._id);

    await audit(
      ctx,
      actor,
      "account.merge",
      `${duplicate.profile.nexId} merged into ${primary.profile.nexId}` +
        ` · telegram verified · ledger ${duplicate.ledger.length} rows (${transferredNetNex} NEX unique, ${evaluation.collidedLedger.length} collisions skipped)` +
        ` · archive ${archiveId}${args.reason?.trim() ? ` · reason: ${args.reason.trim().slice(0, 300)}` : ""}`,
    );

    return {
      merged: true as const,
      alreadyMerged: false as const,
      archiveId,
      primaryNexId: primary.profile.nexId,
      duplicateNexId: duplicate.profile.nexId,
      telegramLinked: true as const,
      transferred: {
        netNex: transferredNetNex,
        miningNex: transferredMiningNex,
        taskNex: transferredTaskNex,
        ledgerRows: duplicate.ledger.length - evaluation.collidedLedger.length,
        ledgerCollisions: evaluation.collidedLedger.length,
        taskRows:
          duplicate.completions.length - evaluation.taskCollisions,
        levelRows:
          duplicate.levelClaims.length - evaluation.levelCollisions,
        referrals:
          duplicate.referralsAsInviter.length - evaluation.referralCollisions,
        deposits: duplicate.deposits.length,
        withdrawals: duplicate.withdrawals.length,
        extensionSessions: duplicate.extensionSessions.length,
      },
      primaryBalanceNex: nextAvailable,
      blockers: [] as string[],
    };
  },
});

