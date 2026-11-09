import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  type AppConfigShape,
  loadConfig,
  notifyUser,
  roundNex,
} from "./engine";
import { QUALIFIED_REFERRAL_XP, awardXp } from "./levels";

export type ReferralStatus = "pending" | "in_progress" | "qualified" | "rejected";

export type ReferralDeskRow = {
  id: string;
  profileId: Id<"profiles"> | null;
  telegramId: string | null;
  displayName: string;
  username?: string;
  photoUrl?: string;
  joinedAt: number;
  verifiedTasks: number;
  requiredTasks: number;
  qualified: boolean;
  status: ReferralStatus;
  speedContribution: number;
  qualifiedAt?: number;
  source: "bot_start" | "mini_app" | "legacy" | "admin";
  rejectionReason?: string;
};

/** Referral codes are ours: 6-12 uppercase base32 characters. */
export function normalizeReferralCode(raw?: string | null): string | null {
  if (!raw) return null;
  const code = raw
    .trim()
    .toUpperCase()
    .replace(/^REF[_-]/, "");
  return /^[A-Z2-9]{6,12}$/.test(code) ? code : null;
}

export function statusForTaskCount(
  verifiedTasks: number,
  requiredTasks: number,
): ReferralStatus {
  if (verifiedTasks >= Math.max(1, requiredTasks)) return "qualified";
  if (verifiedTasks > 0) return "in_progress";
  return "pending";
}

/** Distinct verified task count. Duplicate task rows can never count twice. */
export async function verifiedTaskCount(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
) {
  const rows = await ctx.db
    .query("taskCompletions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return new Set(
    rows.filter((row) => row.status === "verified").map((row) => String(row.taskId)),
  ).size;
}

async function findInviter(ctx: QueryCtx | MutationCtx, code: string) {
  return await ctx.db
    .query("profiles")
    .withIndex("by_referralCode", (q) => q.eq("referralCode", code))
    .first();
}

/**
 * Reject A -> B -> A (and longer cycles) by walking the inviter's existing
 * referrer chain. A cycle would make both users each other's downline and
 * corrupt every referral total, so detection is conservative.
 */
async function wouldCreateLoop(
  ctx: QueryCtx | MutationCtx,
  inviterProfileId: Id<"profiles">,
  inviteeProfileId: Id<"profiles">,
): Promise<boolean> {
  let cursor: Doc<"profiles"> | null = await ctx.db.get(inviterProfileId);
  const seen = new Set<string>();
  while (cursor?.referredBy) {
    const parentId = String(cursor.referredBy);
    if (parentId === String(inviteeProfileId)) return true;
    if (seen.has(parentId)) return true;
    seen.add(parentId);
    if (seen.size > 64) return true;
    cursor = await ctx.db.get(cursor.referredBy);
  }
  return false;
}

async function findRecordForInvitee(
  ctx: QueryCtx | MutationCtx,
  options: {
    telegramId?: string | null;
    profileId?: Id<"profiles"> | null;
  },
): Promise<Doc<"referrals"> | null> {
  if (options.profileId) {
    const byProfile = await ctx.db
      .query("referrals")
      .withIndex("by_inviteeProfile", (q) =>
        q.eq("inviteeProfileId", options.profileId!),
      )
      .first();
    if (byProfile) return byProfile;
  }
  if (options.telegramId) {
    return await ctx.db
      .query("referrals")
      .withIndex("by_inviteeTelegramId", (q) =>
        q.eq("inviteeTelegramId", options.telegramId!),
      )
      .first();
  }
  return null;
}

async function recordJoinNotification(
  ctx: MutationCtx,
  record: Doc<"referrals">,
  inviter: Doc<"profiles">,
  config: AppConfigShape,
) {
  if (record.joinNotifiedAt) return;
  const now = Date.now();
  await ctx.db.patch(record._id, { joinNotifiedAt: now, updatedAt: now });
  await notifyUser(
    ctx,
    inviter,
    "referral",
    "New referral joined",
    `${record.inviteeName ?? `Telegram ${record.inviteeTelegramId}`} joined NEXPOOL using your invitation link. Status: Pending. ${config.referralTaskTarget} verified tasks qualify them.`,
  );
}

/**
 * Binds an invite code to an invitee. This is the single write path for both
 * the Telegram bot (`/start CODE`) and the Mini App launch (`start_param` or
 * `?ref=CODE`). It never overwrites an existing attribution, rejects
 * self-referrals, and creates the Pending record immediately.
 */
export async function attachReferral(
  ctx: MutationCtx,
  args: {
    code?: string | null;
    inviteeTelegramId?: string | null;
    inviteeProfile?: Doc<"profiles"> | null;
    inviteeName?: string;
    inviteeUsername?: string;
    inviteePhotoUrl?: string;
    source: "bot_start" | "mini_app" | "legacy" | "admin";
  },
): Promise<{
  attached: boolean;
  reason?:
    | "invalid-code"
    | "unknown-code"
    | "self"
    | "already-attributed"
    | "already-referred"
    | "loop";
  record?: Doc<"referrals">;
  inviter?: Doc<"profiles">;
}> {
  const code = normalizeReferralCode(args.code);
  if (!code) return { attached: false, reason: "invalid-code" };

  const inviter = await findInviter(ctx, code);
  if (!inviter) return { attached: false, reason: "unknown-code" };

  const profile = args.inviteeProfile ?? null;
  const telegramId =
    args.inviteeTelegramId?.trim() ||
    profile?.telegramId ||
    (profile ? `anon:${String(profile._id)}` : "");

  if (!telegramId) return { attached: false, reason: "invalid-code", inviter };

  if (profile && inviter._id === profile._id) {
    return { attached: false, reason: "self", inviter };
  }
  if (inviter.telegramId && inviter.telegramId === telegramId) {
    return { attached: false, reason: "self", inviter };
  }
  if (profile && (await wouldCreateLoop(ctx, inviter._id, profile._id))) {
    return { attached: false, reason: "loop", inviter };
  }

  const config = await loadConfig(ctx);
  const now = Date.now();

  const existing = await findRecordForInvitee(ctx, {
    telegramId,
    profileId: profile?._id,
  });

  if (existing) {
    if (existing.inviterProfileId !== inviter._id) {
      return {
        attached: false,
        reason: "already-attributed",
        record: existing,
        inviter,
      };
    }
    if (
      profile &&
      existing.inviteeProfileId === undefined &&
      existing.status !== "rejected"
    ) {
      const verifiedTasks = await verifiedTaskCount(ctx, profile.userId);
      const status = statusForTaskCount(
        verifiedTasks,
        config.referralTaskTarget,
      );
      await ctx.db.patch(existing._id, {
        inviteeProfileId: profile._id,
        inviteeUserId: profile.userId,
        inviteeName: profile.displayName,
        inviteeUsername: profile.username,
        inviteePhotoUrl: profile.photoUrl,
        verifiedTaskCount: verifiedTasks,
        requiredTaskCount: config.referralTaskTarget,
        status,
        qualifiedAt:
          status === "qualified"
            ? (existing.qualifiedAt ?? now)
            : existing.qualifiedAt,
        updatedAt: now,
      });
      // The bot may have written this record before the account existed. Link
      // the profile now so speed bonuses and legacy counters see it too.
      if (profile) {
        const freshProfile = (await ctx.db.get(profile._id))!;
        if (!freshProfile.referredBy) {
          await ctx.db.patch(profile._id, {
            referredBy: inviter._id,
            referredAt: existing.createdAt,
          });
        }
      }
      let fresh = (await ctx.db.get(existing._id))!;
      await recordJoinNotification(ctx, fresh, inviter, config);
      if (status === "qualified") {
        await qualifyRecord(ctx, fresh, inviter, config, profile);
        fresh = (await ctx.db.get(existing._id))!;
      }
      return { attached: true, record: fresh, inviter };
    }
    return { attached: true, record: existing, inviter };
  }

  // A profile may already have a legacy referrer from the old system.
  if (profile?.referredBy && profile.referredBy !== inviter._id) {
    return { attached: false, reason: "already-referred", inviter };
  }

  const verifiedTasks = profile
    ? await verifiedTaskCount(ctx, profile.userId)
    : 0;
  const status = statusForTaskCount(verifiedTasks, config.referralTaskTarget);

  const recordId = await ctx.db.insert("referrals", {
    code,
    inviterProfileId: inviter._id,
    inviterUserId: inviter.userId,
    inviterNexId: inviter.nexId,
    inviterTelegramId: inviter.telegramId,
    inviteeTelegramId: telegramId,
    inviteeProfileId: profile?._id,
    inviteeUserId: profile?.userId,
    inviteeName:
      args.inviteeName?.slice(0, 40) ?? profile?.displayName,
    inviteeUsername: args.inviteeUsername ?? profile?.username,
    inviteePhotoUrl: args.inviteePhotoUrl ?? profile?.photoUrl,
    status,
    verifiedTaskCount: verifiedTasks,
    requiredTaskCount: config.referralTaskTarget,
    source: args.source,
    createdAt: now,
    updatedAt: now,
    qualifiedAt: status === "qualified" ? now : undefined,
  });

  if (profile && !profile.referredBy) {
    await ctx.db.patch(profile._id, {
      referredBy: inviter._id,
      referredAt: now,
      referralQualifiedAt:
        status === "qualified" ? (profile.referralQualifiedAt ?? now) : undefined,
    });
  }

  let record = (await ctx.db.get(recordId))!;
  await recordJoinNotification(ctx, record, inviter, config);
  record = (await ctx.db.get(recordId))!;

  if (profile && status === "qualified") {
    await qualifyRecord(ctx, record, inviter, config, profile);
    record = (await ctx.db.get(recordId))!;
  }

  return { attached: true, record, inviter };
}

async function qualifyRecord(
  ctx: MutationCtx,
  record: Doc<"referrals">,
  inviter: Doc<"profiles">,
  config: AppConfigShape,
  invitee: Doc<"profiles">,
) {
  if (record.qualifiedAt && record.qualifiedNotifiedAt) return;
  const now = Date.now();
  const bonus = roundNex(
    Math.min(1, config.referralBonusCap) * config.referralBonusNexPerHour,
  );
  await ctx.db.patch(record._id, {
    status: "qualified",
    qualifiedAt: record.qualifiedAt ?? now,
    bonusNexPerHour: bonus,
    bonusRecordedAt: now,
    xpAwarded: QUALIFIED_REFERRAL_XP,
    qualifiedNotifiedAt: record.qualifiedNotifiedAt ?? now,
    updatedAt: now,
  });
  if (!invitee.referralQualifiedAt) {
    await ctx.db.patch(invitee._id, { referralQualifiedAt: now });
  }
  await awardXp(ctx, {
    userId: inviter.userId,
    profile: inviter,
    amountXp: QUALIFIED_REFERRAL_XP,
    source: "referral",
    refId: String(record._id),
    memo: `Qualified referral · ${invitee.displayName}`,
  });
  await notifyUser(
    ctx,
    inviter,
    "referral",
    "Referral qualified",
    `${invitee.displayName} completed ${record.requiredTaskCount} verified tasks. Your referral statistics and eligible mining bonus have been updated. +${QUALIFIED_REFERRAL_XP} XP.`,
  );
}

/**
 * Recomputes a referral record from confirmed task completions. Called after
 * every verified task, so Pending -> In Progress -> Qualified happens without
 * any client refresh.
 */
export async function syncReferralProgress(
  ctx: MutationCtx,
  profile: Doc<"profiles">,
): Promise<Doc<"referrals"> | null> {
  const config = await loadConfig(ctx);
  let record = await findRecordForInvitee(ctx, {
    telegramId: profile.telegramId,
    profileId: profile._id,
  });

  // Legacy profile.referredBy without a row: materialise it now.
  if (!record && profile.referredBy) {
    const inviter = await ctx.db.get(profile.referredBy);
    if (inviter) {
      const result = await attachReferral(ctx, {
        code: inviter.referralCode,
        inviteeTelegramId:
          profile.telegramId ?? `anon:${String(profile._id)}`,
        inviteeProfile: profile,
        source: profile.telegramId ? "mini_app" : "legacy",
      });
      record = result.record ?? null;
    }
  }
  if (!record) return null;
  if (record.status === "rejected") return record;

  // A bot-only pending record is matched by Telegram id. Make the profile
  // side of the attribution permanent as well; speed bonuses, the withdrawal
  // counter and the legacy desk all rely on profiles.referredBy.
  if (!profile.referredBy) {
    await ctx.db.patch(profile._id, {
      referredBy: record.inviterProfileId,
      referredAt: record.createdAt,
    });
    profile = (await ctx.db.get(profile._id))!;
  }

  const verifiedTasks = await verifiedTaskCount(ctx, profile.userId);
  const status = statusForTaskCount(verifiedTasks, config.referralTaskTarget);
  const now = Date.now();

  if (
    record.verifiedTaskCount !== verifiedTasks ||
    record.status !== status ||
    record.inviteeProfileId !== profile._id
  ) {
    await ctx.db.patch(record._id, {
      inviteeProfileId: profile._id,
      inviteeUserId: profile.userId,
      inviteeTelegramId: profile.telegramId ?? record.inviteeTelegramId,
      inviteeName: profile.displayName,
      inviteeUsername: profile.username,
      inviteePhotoUrl: profile.photoUrl,
      verifiedTaskCount: verifiedTasks,
      requiredTaskCount: config.referralTaskTarget,
      status,
      updatedAt: now,
    });
  }

  record = (await ctx.db.get(record._id))!;
  const inviter = await ctx.db.get(record.inviterProfileId);

  if (inviter && status === "in_progress" && !record.progressNotifiedAt) {
    await ctx.db.patch(record._id, {
      progressNotifiedAt: now,
      updatedAt: now,
    });
    await notifyUser(
      ctx,
      inviter,
      "referral",
      "Referral in progress",
      `${profile.displayName} completed a verified task (${verifiedTasks}/${config.referralTaskTarget}). They qualify after ${config.referralTaskTarget} distinct tasks.`,
    );
  }

  if (inviter && status === "qualified") {
    await qualifyRecord(ctx, record, inviter, config, profile);
  }

  return await ctx.db.get(record._id);
}

/** Live Referral Desk rows: permanent records plus legacy profile links. */
export async function listReferralDesk(
  ctx: QueryCtx | MutationCtx,
  inviterProfileId: Id<"profiles">,
  config: AppConfigShape,
): Promise<ReferralDeskRow[]> {
  const records = await ctx.db
    .query("referrals")
    .withIndex("by_inviter_createdAt", (q) =>
      q.eq("inviterProfileId", inviterProfileId),
    )
    .order("desc")
    .collect();

  const legacyProfiles = await ctx.db
    .query("profiles")
    .withIndex("by_referredBy", (q) => q.eq("referredBy", inviterProfileId))
    .collect();

  const seenProfiles = new Set<string>();
  const seenTelegram = new Set<string>();
  const rows: ReferralDeskRow[] = [];

  for (const record of records) {
    if (record.inviteeProfileId) seenProfiles.add(String(record.inviteeProfileId));
    seenTelegram.add(record.inviteeTelegramId);

    const profile = record.inviteeProfileId
      ? await ctx.db.get(record.inviteeProfileId)
      : null;
    const verifiedTasks = profile
      ? await verifiedTaskCount(ctx, profile.userId)
      : record.verifiedTaskCount;
    const status =
      record.status === "rejected"
        ? "rejected"
        : profile
          ? statusForTaskCount(verifiedTasks, config.referralTaskTarget)
          : record.status;
    const qualified = status === "qualified";

    rows.push({
      id: String(record._id),
      profileId: record.inviteeProfileId ?? null,
      telegramId:
        record.inviteeTelegramId.startsWith("anon:")
          ? null
          : record.inviteeTelegramId,
      displayName:
        profile?.displayName ??
        record.inviteeName ??
        (record.inviteeTelegramId.startsWith("anon:")
          ? "Mini App account"
          : `Telegram ${record.inviteeTelegramId}`),
      username: profile?.username ?? record.inviteeUsername,
      photoUrl: profile?.photoUrl ?? record.inviteePhotoUrl,
      joinedAt: record.createdAt,
      verifiedTasks,
      requiredTasks: config.referralTaskTarget,
      qualified,
      status,
      speedContribution: qualified
        ? roundNex(config.referralBonusNexPerHour)
        : 0,
      qualifiedAt: record.qualifiedAt ?? profile?.referralQualifiedAt,
      source: record.source,
      rejectionReason: record.rejectionReason,
    });
  }

  // Old profile.referredBy rows that predate the referrals table still show
  // up, so no historical attribution disappears from the desk.
  for (const profile of legacyProfiles) {
    if (seenProfiles.has(String(profile._id))) continue;
    if (profile.telegramId && seenTelegram.has(profile.telegramId)) continue;
    const verifiedTasks = await verifiedTaskCount(ctx, profile.userId);
    const status = statusForTaskCount(verifiedTasks, config.referralTaskTarget);
    rows.push({
      id: `legacy:${String(profile._id)}`,
      profileId: profile._id,
      telegramId: profile.telegramId ?? null,
      displayName: profile.displayName,
      username: profile.username,
      photoUrl: profile.photoUrl,
      joinedAt: profile.referredAt ?? profile.createdAt,
      verifiedTasks,
      requiredTasks: config.referralTaskTarget,
      qualified: status === "qualified",
      status,
      speedContribution:
        status === "qualified"
          ? roundNex(config.referralBonusNexPerHour)
          : 0,
      qualifiedAt: profile.referralQualifiedAt,
      source: "legacy",
    });
  }

  return rows.sort((a, b) => b.joinedAt - a.joinedAt);
}
