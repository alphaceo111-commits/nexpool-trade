import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { audit, loadConfig, requireAdmin, roundNex } from "./engine";
import { buildArchive, loadAccount } from "./recovery";

export const retireDuplicateAccount = mutation({
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
          retired: false as const,
          alreadyRetired: true as const,
          archiveId: archived._id,
          primaryNexId: archived.primaryNexId,
          duplicateNexId: archived.duplicateNexId,
        };
      }
      throw new Error(
        "The duplicate account no longer exists and has no retirement archive.",
      );
    }
    if (!primaryProfile) throw new Error("The primary account was not found.");

    const existingArchive = await ctx.db
      .query("accountMergeArchives")
      .withIndex("by_duplicateNexId", (q) =>
        q.eq("duplicateNexId", duplicateNexId),
      )
      .first();
    if (existingArchive) {
      return {
        retired: false as const,
        alreadyRetired: true as const,
        archiveId: existingArchive._id,
        primaryNexId: existingArchive.primaryNexId,
        duplicateNexId: existingArchive.duplicateNexId,
      };
    }

    const [primary, duplicate] = await Promise.all([
      loadAccount(ctx, primaryProfile),
      loadAccount(ctx, duplicateProfile),
    ]);
    const config = await loadConfig(ctx);
    const now = Date.now();
    const telegramId = duplicate.profile.telegramId;
    const authAccountsForTelegram = telegramId
      ? await ctx.db
          .query("authAccounts")
          .withIndex("providerAndAccountId", (q) =>
            q.eq("provider", "telegram").eq("providerAccountId", telegramId),
          )
          .collect()
      : [];
    const duplicateAuth = authAccountsForTelegram.find(
      (row) => row.userId === duplicate.profile.userId,
    );
    const primaryAuth = authAccountsForTelegram.find(
      (row) => row.userId === primary.profile.userId,
    );
    const claim = telegramId
      ? await ctx.db
          .query("telegramIdentities")
          .withIndex("by_telegramId", (q) => q.eq("telegramId", telegramId))
          .first()
      : null;
    const otherTelegramProfiles = duplicate.profilesByTelegram.filter(
      (row) =>
        row._id !== primary.profile._id && row._id !== duplicate.profile._id,
    );
    const otherTelegramAuth = authAccountsForTelegram.filter(
      (row) =>
        row.userId !== duplicate.profile.userId &&
        row.userId !== primary.profile.userId,
    );
    const otherAuthProviders = duplicate.authAccounts.filter(
      (row) => row.provider !== "telegram" && row.provider !== "anonymous",
    );
    const pendingWithdrawals = duplicate.withdrawals.filter(
      (row) => row.status === "requested" || row.status === "reviewing",
    );
    const pendingDeposits = duplicate.deposits.filter(
      (row) => row.status === "pending" && row.expiresAt > now,
    );

    const blockers: string[] = [];
    if (primary.profile.userId === duplicate.profile.userId) {
      blockers.push("Both profiles share the same auth user.");
    }
    if (!telegramId) {
      blockers.push("The duplicate has no verified Telegram numeric ID.");
    }
    if (!duplicate.profile.telegramVerifiedAt) {
      blockers.push(
        "The duplicate's Telegram identity has no verification timestamp.",
      );
    }
    if (!duplicateAuth) {
      blockers.push(
        "The duplicate does not own the verified Telegram auth account.",
      );
    }
    if (otherTelegramAuth.length > 0) {
      blockers.push("Another auth user also claims this Telegram identity.");
    }
    if (
      primary.profile.telegramId &&
      primary.profile.telegramId !== telegramId
    ) {
      blockers.push("The primary is already linked to a different Telegram ID.");
    }
    if (otherTelegramProfiles.length > 0) {
      blockers.push(
        "Another profile also claims this Telegram ID; recovery must be reviewed manually.",
      );
    }
    if (duplicate.profilesForUser.length !== 1) {
      blockers.push(
        "The duplicate auth user has more than one NEXPOOL profile.",
      );
    }
    if (primary.profilesForUser.length !== 1) {
      blockers.push("The primary auth user has more than one NEXPOOL profile.");
    }
    if (otherAuthProviders.length > 0) {
      blockers.push(
        "The duplicate has non-Telegram auth providers; retiring it would remove that access.",
      );
    }
    if (
      pendingWithdrawals.length > 0 ||
      (duplicate.balance?.reservedNex ?? 0) > 0
    ) {
      blockers.push(
        "The duplicate has a pending or reserved withdrawal. Resolve it before retiring the account.",
      );
    }
    if (pendingDeposits.length > 0) {
      blockers.push(
        "The duplicate has an unexpired pending TON deposit. Wait for it to settle or expire.",
      );
    }
    if (config.ownerUserId === duplicate.profile.userId) {
      blockers.push("The duplicate is the configured operator owner.");
    }
    if (
      claim &&
      claim.profileId !== primary.profile._id &&
      claim.profileId !== duplicate.profile._id
    ) {
      blockers.push(
        "The canonical Telegram registry points at a third profile.",
      );
    }
    if (!primary.user) blockers.push("The primary auth user row is missing.");
    if (!duplicate.user)
      blockers.push("The duplicate auth user row is missing.");
    if (blockers.length > 0) {
      throw new Error(`Retirement blocked: ${blockers.join(" ")}`);
    }

    const archive = buildArchive(duplicate);
    for (const value of Object.values(archive)) {
      if (value.length > 900_000) {
        throw new Error(
          "The duplicate has too much archived data for one atomic retirement.",
        );
      }
    }
    const totalRows =
      duplicate.ledger.length +
      duplicate.miningDays.length +
      duplicate.miningEntries.length +
      duplicate.extensionSessions.length +
      duplicate.challenges.length +
      duplicate.adEvents.length +
      duplicate.completions.length +
      duplicate.levelClaims.length +
      duplicate.xpEvents.length +
      duplicate.referralsAsInviter.length +
      duplicate.referralsAsInvitee.length +
      duplicate.referralsByTelegram.length +
      duplicate.deposits.length +
      duplicate.withdrawals.length +
      duplicate.notifications.length +
      duplicate.authAccounts.length +
      12;
    if (totalRows > 4_000) {
      throw new Error(
        "The duplicate has too many rows for one atomic retirement.",
      );
    }

    const summary = {
      mode: "retire",
      transferredNex: 0,
      discardedAvailableNex: roundNex(duplicate.balance?.availableNex ?? 0),
      discardedLedgerRows: duplicate.ledger.length,
      discardedMiningDays: duplicate.miningDays.length,
      discardedTasks: duplicate.completions.length,
      discardedLevels: duplicate.levelClaims.length,
      discardedReferrals:
        duplicate.referralsAsInviter.length +
        duplicate.referralsAsInvitee.length,
      discardedDeposits: duplicate.deposits.length,
      discardedWithdrawals: duplicate.withdrawals.length,
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

    // No data is transferred to the primary in this path. Every duplicate row
    // is archived above and then removed from the live database.
    for (const row of duplicate.ledger) await ctx.db.delete(row._id);
    for (const row of duplicate.miningDays) await ctx.db.delete(row._id);
    for (const row of duplicate.miningEntries) await ctx.db.delete(row._id);
    for (const row of duplicate.extensionSessions) {
      await ctx.db.delete(row._id);
    }
    for (const row of duplicate.challenges) await ctx.db.delete(row._id);
    for (const row of duplicate.adEvents) await ctx.db.delete(row._id);
    for (const row of duplicate.completions) await ctx.db.delete(row._id);
    for (const row of duplicate.levelClaims) await ctx.db.delete(row._id);
    for (const row of duplicate.xpEvents) await ctx.db.delete(row._id);
    for (const row of duplicate.deposits) await ctx.db.delete(row._id);
    for (const row of duplicate.withdrawals) await ctx.db.delete(row._id);
    for (const row of duplicate.notifications) await ctx.db.delete(row._id);
    for (const row of duplicate.authAccounts) {
      if (row._id === duplicateAuth!._id && !primaryAuth) {
        await ctx.db.patch(row._id, { userId: primary.profile.userId });
      } else {
        const codes = await ctx.db
          .query("authVerificationCodes")
          .withIndex("accountId", (q) => q.eq("accountId", row._id))
          .collect();
        for (const code of codes) await ctx.db.delete(code._id);
        await ctx.db.delete(row._id);
      }
    }

    const referralIds = new Set<string>();
    for (const row of [
      ...duplicate.referralsAsInviter,
      ...duplicate.referralsAsInvitee,
      ...duplicate.referralsByTelegram,
    ]) {
      if (referralIds.has(row._id)) continue;
      referralIds.add(row._id);
      await ctx.db.delete(row._id);
    }
    if (duplicate.balance) await ctx.db.delete(duplicate.balance._id);

    const invitees = await ctx.db
      .query("profiles")
      .withIndex("by_referredBy", (q) =>
        q.eq("referredBy", duplicate.profile._id),
      )
      .collect();
    for (const invitee of invitees) {
      if (invitee._id !== primary.profile._id) {
        await ctx.db.patch(invitee._id, {
          referredBy: undefined,
          referredAt: undefined,
          referralQualifiedAt: undefined,
        });
      }
    }

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

    if (claim) {
      if (claim.profileId === duplicate.profile._id) {
        await ctx.db.patch(claim._id, {
          userId: primary.profile.userId,
          profileId: primary.profile._id,
          verifiedAt: now,
          updatedAt: now,
        });
      }
    } else {
      await ctx.db.insert("telegramIdentities", {
        telegramId: telegramId!,
        userId: primary.profile.userId,
        profileId: primary.profile._id,
        verifiedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    const profilePatch: Record<string, unknown> = {
      telegramId: telegramId!,
      telegramVerifiedAt: now,
    };
    if (duplicate.profile.username) {
      profilePatch.username = duplicate.profile.username;
    }
    if (duplicate.profile.photoUrl) {
      profilePatch.photoUrl = duplicate.profile.photoUrl;
    }
    await ctx.db.patch(primary.profile._id, profilePatch);

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

    const duplicateUser = await ctx.db.get(duplicate.profile.userId);
    if (duplicateUser) await ctx.db.delete(duplicateUser._id);
    await ctx.db.delete(duplicate.profile._id);

    await audit(
      ctx,
      actor,
      "account.retire",
      `${duplicate.profile.nexId} retired from ${primary.profile.nexId}` +
        ` · telegram identity moved · duplicate balance/history archived with zero transfer` +
        ` · archive ${archiveId}${args.reason?.trim() ? ` · reason: ${args.reason.trim().slice(0, 300)}` : ""}`,
    );

    return {
      retired: true as const,
      alreadyRetired: false as const,
      archiveId,
      primaryNexId: primary.profile.nexId,
      duplicateNexId: duplicate.profile.nexId,
      telegramLinked: true as const,
      transferredNex: 0 as const,
      primaryBalanceNex: roundNex(primary.balance?.availableNex ?? 0),
      discarded: summary,
    };
  },
});
