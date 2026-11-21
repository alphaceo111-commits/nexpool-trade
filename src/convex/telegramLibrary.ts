import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireAdmin } from "./engine";

/**
 * NEXPOOL's automated post library.
 *
 * Every template is backend-owned: IDs are stable, the body lives here (not in
 * the database), and rendering refuses to run when a required dynamic value is
 * missing. A post about a streak, challenge or achievement cannot be produced
 * until the backend actually records those things — the renderer throws instead
 * of printing a zero or a guess.
 *
 * `blockedBy` marks copy whose trigger does not exist in NEXPOOL yet. Those
 * templates are visible to the operator so the library stays honest about what
 * the product can currently support.
 */
export type LibraryDestination = "channel" | "group" | "bot";

export type LibraryTemplate = {
  id: string;
  destination: LibraryDestination;
  title: string;
  trigger: string;
  body: string;
  /** Feature or wiring that must exist before this can be published. */
  blockedBy?: string;
  schedule?: { frequency: "daily" | "weekly" | "monthly"; hourUtc: number; minuteUtc: number };
};

const APP_LINK = "https://t.me/NEXPOOLBOT";

/** Values the backend can always supply when an event fires. */
export const SAFE_FALLBACKS: Record<string, string> = {
  user_name: "NEXPOOL miner",
  app_link: APP_LINK,
};

function channel(
  id: string,
  title: string,
  trigger: string,
  body: string,
  extra?: Partial<LibraryTemplate>,
): LibraryTemplate {
  return { id, destination: "channel", title, trigger, body, ...extra };
}

function group(
  id: string,
  title: string,
  trigger: string,
  body: string,
  extra?: Partial<LibraryTemplate>,
): LibraryTemplate {
  return { id, destination: "group", title, trigger, body, ...extra };
}

function bot(
  id: string,
  title: string,
  trigger: string,
  body: string,
  extra?: Partial<LibraryTemplate>,
): LibraryTemplate {
  return { id, destination: "bot", title, trigger, body, ...extra };
}

const BOT_DM_GAP = "per-user Telegram delivery is not wired for this event yet";

export const LIBRARY_TEMPLATES: LibraryTemplate[] = [
  /* ------------------------------------------------------ channel (20) */
  channel(
    "C01",
    "Daily NEXPOOL welcome",
    "Daily schedule",
    `🌍 WELCOME TO A NEW DAY WITH NEXPOOL!

Every day brings a new opportunity to explore, participate and progress.

⛏️ Continue your mining journey.
🎯 Explore available missions.
🏆 Work toward new achievements.
👥 Grow together with the community.

Your NEXPOOL journey continues today!

${APP_LINK}`,
    { schedule: { frequency: "daily", hourUtc: 9, minuteUtc: 0 } },
  ),
  channel(
    "C02",
    "New feature released",
    "A feature is officially released",
    `🚀 SOMETHING NEW IS HERE!

NEXPOOL has introduced a new feature: {feature_name}.

Explore the latest update and discover what's new inside the platform.

Thank you for being part of the NEXPOOL community!

${APP_LINK}`,
    { blockedBy: "release-event publishing is not wired: features are shipped in code, not announced by an event" },
  ),
  channel(
    "C03",
    "New mission available",
    "A mission becomes active",
    `🎯 A NEW MISSION IS AVAILABLE!

A new mission has arrived in NEXPOOL.

Mission: {mission_name}

Open the Mini App to read the requirements, follow your progress and see the available reward.

Your next achievement could start here!

${APP_LINK}`,
  ),
  channel(
    "C04",
    "Weekly challenge launch",
    "A weekly challenge becomes active",
    `🔥 THE WEEKLY COMMUNITY CHALLENGE STARTS NOW!

Challenge: {challenge_name}

The NEXPOOL community has a new shared goal.

Participate, follow the progress and help the community reach its target.

Let's make this week count!

${APP_LINK}`,
    { blockedBy: "community challenges are not implemented" },
  ),
  channel(
    "C05",
    "Community growth milestone",
    "Verified user count reaches a configured milestone",
    `🎉 ANOTHER NEXPOOL MILESTONE!

Our community has reached {verified_users} verified members!

Every genuine participant contributes to the growth of NEXPOOL.

Thank you for being part of this journey.

Let's keep building!`,
  ),
  channel(
    "C06",
    "Weekly leaderboard",
    "Weekly leaderboard is finalized",
    `🏆 WEEKLY NEXPOOL LEADERBOARD!

The results for {period} are officially available.

🥇 First: {first_place}
🥈 Second: {second_place}
🥉 Third: {third_place}

Congratulations to our top participants!

Visit NEXPOOL to explore the complete rankings.

${APP_LINK}`,
  ),
  channel(
    "C07",
    "Monthly community report",
    "Monthly reporting period closes",
    `📊 NEXPOOL MONTHLY COMMUNITY UPDATE

Here is our verified community activity for {period}:

👥 Verified community members: {verified_users}
🎯 Missions completed: {missions_completed}
🔥 Challenges completed: {challenges_completed}
🏆 Achievements unlocked: {achievements_unlocked}

Thank you to everyone who participated.

${APP_LINK}`,
    { blockedBy: "challenges and achievements do not exist, so the report cannot be complete" },
  ),
  channel(
    "C08",
    "Referral campaign",
    "An approved referral campaign starts",
    `👥 INVITE. CONNECT. GROW.

The NEXPOOL referral campaign is now active!

Share your personal invitation link and invite friends to explore NEXPOOL.

Track your eligible referrals and progress directly inside the Mini App.

Real participation matters. Keep your invitations genuine.

${APP_LINK}`,
    { blockedBy: "growth campaigns are not implemented" },
  ),
  channel(
    "C09",
    "New achievement system",
    "Achievement feature is released",
    `🏆 YOUR PROGRESS DESERVES RECOGNITION!

The NEXPOOL achievement system is here.

Complete qualifying activities, reach milestones and collect achievements as you progress.

Every milestone tells part of your journey.

${APP_LINK}`,
    { blockedBy: "achievement badges are not implemented (levels and XP are)" },
  ),
  channel(
    "C10",
    "New streak milestone",
    "Streak feature or a new milestone is launched",
    `🔥 BUILD YOUR NEXPOOL STREAK!

Consistency is part of the journey.

Explore your consecutive-day progress, work toward new milestones and keep participating.

Open NEXPOOL to see your streak.

${APP_LINK}`,
    { schedule: { frequency: "weekly", hourUtc: 8, minuteUtc: 0 } },
  ),
  channel(
    "C11",
    "New level system",
    "Level feature becomes available",
    `⭐ LEVEL UP YOUR NEXPOOL JOURNEY!

A new progression experience is available.

Earn XP through eligible activities, track your progress and discover your next level.

Your journey. Your progress. Your achievements.

${APP_LINK}`,
  ),
  channel(
    "C12",
    "Community challenge progress",
    "A challenge reaches a configured milestone",
    `🔥 COMMUNITY CHALLENGE UPDATE!

Our community has reached {challenge_progress} of the target for {challenge_name}.

Every qualifying contribution moves the community forward.

Let's keep participating!

${APP_LINK}`,
    { blockedBy: "community challenges are not implemented" },
  ),
  channel(
    "C13",
    "Challenge completed",
    "Challenge reaches its verified target and is finalized",
    `🎉 COMMUNITY GOAL COMPLETED!

The NEXPOOL community has completed {challenge_name}!

Thank you to everyone who participated.

Open the Mini App to view the final results.

${APP_LINK}`,
    { blockedBy: "community challenges are not implemented" },
  ),
  channel(
    "C14",
    "New campaign",
    "An approved promotional campaign begins",
    `🚀 A NEW NEXPOOL CAMPAIGN IS LIVE!

Campaign: {campaign_name}

Discover the campaign, read its conditions and see how you can participate.

Visit the official NEXPOOL Mini App for details.

${APP_LINK}`,
    { blockedBy: "growth campaigns are not implemented" },
  ),
  channel(
    "C15",
    "Security reminder",
    "An approved security notice is published",
    `🔐 IMPORTANT NEXPOOL SECURITY REMINDER

Protect your account.

Never share your private account credentials.
Do not trust unofficial withdrawal agents.
Use official NEXPOOL communication channels.
Be careful with suspicious links and impersonators.

Always verify information through official NEXPOOL channels.`,
    { schedule: { frequency: "weekly", hourUtc: 12, minuteUtc: 0 } },
  ),
  channel(
    "C16",
    "Maintenance announcement",
    "An approved maintenance event begins",
    `⚙️ NEXPOOL MAINTENANCE NOTICE

NEXPOOL is undergoing scheduled maintenance.

Expected maintenance window: {maintenance_window}

Some services may be temporarily unavailable.

We appreciate your patience while the work is completed.`,
    { blockedBy: "there is no maintenance-event record to trigger this" },
  ),
  channel(
    "C17",
    "Maintenance completed",
    "Maintenance is confirmed complete",
    `✅ NEXPOOL SERVICE UPDATE

The scheduled maintenance has been completed.

The affected services are now available again.

Thank you for your patience!

${APP_LINK}`,
    { blockedBy: "there is no maintenance-event record to trigger this" },
  ),
  channel(
    "C18",
    "New weekly missions",
    "A new weekly mission set becomes active",
    `🎯 YOUR NEW WEEKLY MISSIONS ARE HERE!

A fresh set of missions is available.

Explore the requirements, track your progress and complete eligible activities.

Make this week productive!

${APP_LINK}`,
  ),
  channel(
    "C19",
    "Community appreciation",
    "Scheduled community appreciation post",
    `💚 THANK YOU, NEXPOOL COMMUNITY!

To every person participating, sharing feedback, completing missions and helping the community grow:

We appreciate you.

NEXPOOL continues to grow through genuine community participation.

Thank you for being here!`,
    { schedule: { frequency: "weekly", hourUtc: 18, minuteUtc: 0 } },
  ),
  channel(
    "C20",
    "Weekly recap",
    "Weekly schedule after data finalization",
    `📅 YOUR NEXPOOL WEEKLY RECAP

Another week of progress and community activity!

Explore this week's:

Community achievements.
Mission results.
Leaderboard rankings.
Challenge progress.
New platform updates.

See you in the next week of NEXPOOL!

${APP_LINK}`,
    { schedule: { frequency: "weekly", hourUtc: 19, minuteUtc: 0 } },
  ),

  /* -------------------------------------------------------- group (20) */
  group(
    "G01",
    "Daily community question",
    "Daily group engagement schedule",
    `💬 NEXPOOL DAILY QUESTION!

Which feature are you enjoying most?

⛏️ Mining
🎯 Missions
🏆 Achievements
👥 Referrals

Tell the community what you think!`,
    { schedule: { frequency: "daily", hourUtc: 16, minuteUtc: 0 } },
  ),
  group(
    "G02",
    "New member welcome",
    "A new member joins an authorized group",
    `👋 WELCOME TO THE NEXPOOL COMMUNITY!

We're happy to have you here, {user_name}!

Explore NEXPOOL, learn about the platform and connect with other community members.

Remember to use official NEXPOOL links and follow the group rules.

${APP_LINK}`,
    { blockedBy: "the bot does not receive join events (allowed_updates is message/edited_message)" },
  ),
  group(
    "G03",
    "Mission reminder",
    "Scheduled while a mission remains active",
    `🎯 HAVE YOU CHECKED YOUR MISSIONS TODAY?

There may be active missions waiting for you in NEXPOOL.

Open your Mini App, review the requirements and follow your progress.

${APP_LINK}`,
    { schedule: { frequency: "daily", hourUtc: 13, minuteUtc: 0 } },
  ),
  group(
    "G04",
    "Challenge reminder",
    "Scheduled challenge reminder",
    `🔥 THE COMMUNITY CHALLENGE IS STILL RUNNING!

Challenge: {challenge_name}

Current verified progress: {challenge_progress}

There is still time to participate if the challenge is open.

Let's work toward the community goal!`,
    { blockedBy: "community challenges are not implemented" },
  ),
  group(
    "G05",
    "Challenge milestone",
    "Challenge reaches a new configured progress milestone",
    `🚀 WE'RE MAKING PROGRESS!

The NEXPOOL community has reached {challenge_progress}.

Thank you to everyone contributing to {challenge_name}.

Let's keep moving!`,
    { blockedBy: "community challenges are not implemented" },
  ),
  group(
    "G06",
    "Weekly leaderboard reminder",
    "Scheduled before the period closes",
    `🏆 WEEKLY COMPETITION UPDATE!

The current leaderboard period is approaching its end.

Check your verified ranking and see how the competition is progressing.

${APP_LINK}`,
  ),
  group(
    "G07",
    "Leaderboard results",
    "Final leaderboard results are published",
    `🥇 THE WEEKLY RESULTS ARE IN!

Congratulations to everyone who reached a new milestone this week.

The verified leaderboard is now available.

Check the Mini App to see the results.`,
  ),
  group(
    "G08",
    "Referral discussion",
    "Scheduled community engagement post",
    `👥 HOW MANY FRIENDS HAVE DISCOVERED NEXPOOL?

Share what you enjoy about the platform and invite people who may genuinely be interested.

Remember: real users and genuine participation make a stronger community.`,
    { schedule: { frequency: "weekly", hourUtc: 15, minuteUtc: 0 } },
  ),
  group(
    "G09",
    "Community feedback",
    "Weekly feedback schedule",
    `💡 WE WANT TO HEAR FROM YOU!

What feature would you like to see improved in NEXPOOL?

Share your suggestions and feedback.

Your ideas help us understand what the community needs.`,
    { schedule: { frequency: "weekly", hourUtc: 17, minuteUtc: 0 } },
  ),
  group(
    "G10",
    "New update discussion",
    "A feature release has been announced",
    `🚀 HAVE YOU TRIED THE NEW NEXPOOL UPDATE?

The latest feature is now available.

Explore it and share your experience with the community!`,
    { blockedBy: "release-event publishing is not wired" },
  ),
  group(
    "G11",
    "Security reminder",
    "Weekly approved security reminder",
    `🔐 STAY SAFE IN THE NEXPOOL COMMUNITY!

Never share sensitive account information.

Use official links, verify announcements and report suspicious messages to the moderators.

Your account security matters.`,
    { schedule: { frequency: "weekly", hourUtc: 11, minuteUtc: 0 } },
  ),
  group(
    "G12",
    "Weekly welcome",
    "Weekly recurring schedule",
    `🌞 A NEW WEEK WITH NEXPOOL!

New missions, new goals and another opportunity to make progress.

Let's keep the community active and supportive.

What is your goal this week?`,
    { schedule: { frequency: "weekly", hourUtc: 9, minuteUtc: 30 } },
  ),
  group(
    "G13",
    "Achievement celebration",
    "A verified community achievement milestone",
    `🏆 ANOTHER COMMUNITY ACHIEVEMENT!

NEXPOOL participants have reached a new milestone.

Congratulations to everyone who contributed!`,
    { blockedBy: "achievements are not implemented" },
  ),
  group(
    "G14",
    "Community poll",
    "Scheduled poll campaign",
    `📊 COMMUNITY POLL!

Which type of feature should NEXPOOL improve next?

Missions
Achievements
Community challenges
Leaderboards

Cast your vote and help us understand your priorities.`,
    { blockedBy: "Telegram polls are not sent by the delivery engine yet" },
  ),
  group(
    "G15",
    "Community goal announcement",
    "A new community goal becomes active",
    `🎯 A NEW COMMUNITY GOAL!

Our next target is {challenge_name}.

Check the Mini App for the goal, requirements and progress.

Let's work toward it together!`,
    { blockedBy: "community challenges are not implemented" },
  ),
  group(
    "G16",
    "Streak engagement",
    "Scheduled streak feature promotion",
    `🔥 CONSISTENCY BUILDS PROGRESS!

Have you checked your NEXPOOL streak?

Explore your streak history and see which milestone you're working toward.

${APP_LINK}`,
    { schedule: { frequency: "weekly", hourUtc: 14, minuteUtc: 0 } },
  ),
  group(
    "G17",
    "Weekly mission results",
    "Weekly mission results are finalized",
    `🎯 WEEKLY MISSION UPDATE!

This week's mission period has ended.

Open NEXPOOL to explore your completed missions and verified results.

Thank you for participating!`,
  ),
  group(
    "G18",
    "Group rules reminder",
    "Scheduled moderation notice",
    `📌 NEXPOOL COMMUNITY GUIDELINES

Please keep this community respectful and useful.

No scams or impersonation.
No misleading reward claims.
No spam.
No suspicious links.
Respect other community members.

Contact official support for account-related issues.`,
    { schedule: { frequency: "weekly", hourUtc: 10, minuteUtc: 0 } },
  ),
  group(
    "G19",
    "Community appreciation",
    "Weekly scheduled post",
    `💚 THIS COMMUNITY IS BUILT BY ITS PEOPLE!

Thank you for sharing ideas, asking questions and helping new members understand NEXPOOL.

Let's continue growing a helpful community together.`,
    { schedule: { frequency: "weekly", hourUtc: 20, minuteUtc: 0 } },
  ),
  group(
    "G20",
    "Weekly discussion",
    "Weekly engagement schedule",
    `💬 WEEKLY DISCUSSION!

What was your biggest NEXPOOL achievement this week?

Share your progress, feedback or something you learned.

Let's celebrate genuine progress together.`,
    { schedule: { frequency: "weekly", hourUtc: 18, minuteUtc: 30 } },
  ),

  /* ---------------------------------------------------------- bot (20) */
  bot(
    "B01",
    "First welcome",
    "First successful bot start",
    `👋 WELCOME TO NEXPOOL, {user_name}!

Your NEXPOOL journey starts here.

Explore mining, missions, referrals and achievements.

Open the Mini App to get started.

${APP_LINK}`,
  ),
  bot(
    "B02",
    "Mining started",
    "Backend confirms a new mining session",
    `⛏️ MINING SESSION STARTED!

Your NEXPOOL mining session has started successfully.

Open your dashboard to view your session details.

${APP_LINK}`,
    { blockedBy: BOT_DM_GAP },
  ),
  bot(
    "B03",
    "Mining completed",
    "Backend confirms the session is completed",
    `✅ MINING SESSION COMPLETED!

Your latest mining session has finished.

Open NEXPOOL to review your mining history and account activity.

${APP_LINK}`,
    { blockedBy: BOT_DM_GAP },
  ),
  bot(
    "B04",
    "Mining milestone",
    "A verified mining milestone is reached",
    `🏆 MINING MILESTONE REACHED!

Congratulations, {user_name}!

You've reached a new mining milestone.

Keep exploring your progress inside NEXPOOL.

${APP_LINK}`,
    { blockedBy: "mining milestones are not recorded as events" },
  ),
  bot(
    "B05",
    "New mission",
    "A new mission becomes available to the user",
    `🎯 A NEW MISSION IS AVAILABLE!

Mission: {mission_name}

Open NEXPOOL to review the requirements and start participating.

${APP_LINK}`,
    { blockedBy: BOT_DM_GAP },
  ),
  bot(
    "B06",
    "Mission completed",
    "Mission completion is verified",
    `🎉 MISSION COMPLETED!

Well done, {user_name}!

You have successfully completed {mission_name}.

Open NEXPOOL to see your verified result.

${APP_LINK}`,
    { blockedBy: BOT_DM_GAP },
  ),
  bot(
    "B07",
    "Reward credited",
    "A reward is recorded in the ledger",
    `💚 REWARD CREDITED!

Your eligible mission reward has been successfully recorded.

Open your NEXPOOL wallet to view the transaction details.

${APP_LINK}`,
    { blockedBy: BOT_DM_GAP },
  ),
  bot(
    "B08",
    "Referral registered",
    "A referral registration is attributed to the user",
    `👥 A NEW REFERRAL HAS JOINED!

Someone has joined NEXPOOL through your invitation.

Their participation status will update as they complete the eligibility requirements.

${APP_LINK}`,
    { blockedBy: BOT_DM_GAP },
  ),
  bot(
    "B09",
    "Referral activated",
    "A referral satisfies the activation definition",
    `🚀 YOUR REFERRAL HAS BECOME ACTIVE!

One of your invited users has completed the required activation steps.

Open your referral dashboard to view the updated status.

${APP_LINK}`,
    { blockedBy: BOT_DM_GAP },
  ),
  bot(
    "B10",
    "Referral reward credited",
    "Referral reward is actually credited",
    `🎉 REFERRAL REWARD CONFIRMED!

Your eligible referral reward has been recorded successfully.

Open your wallet and referral history for details.

${APP_LINK}`,
    { blockedBy: BOT_DM_GAP },
  ),
  bot(
    "B11",
    "Streak reminder",
    "Scheduled reminder for an active streak",
    `🔥 YOUR NEXPOOL STREAK!

Your current streak is {current_streak} qualifying days.

Check your progress and see your next milestone.

${APP_LINK}`,
    { blockedBy: BOT_DM_GAP },
  ),
  bot(
    "B12",
    "Streak milestone",
    "A streak milestone is verified",
    `🏆 STREAK MILESTONE UNLOCKED!

Congratulations!

You've reached {current_streak} qualifying days.

Your consistency is being recognized.

${APP_LINK}`,
    { blockedBy: BOT_DM_GAP },
  ),
  bot(
    "B13",
    "XP earned",
    "An XP transaction is recorded",
    `⭐ YOU EARNED XP!

Your latest activity earned {xp} XP.

Your progress toward the next level is waiting in NEXPOOL.

${APP_LINK}`,
    { blockedBy: BOT_DM_GAP },
  ),
  bot(
    "B14",
    "Level up",
    "User's level changes successfully",
    `🚀 LEVEL UP!

Congratulations, {user_name}!

You've reached level {level}.

Keep participating and exploring your next achievements.

${APP_LINK}`,
    { blockedBy: BOT_DM_GAP },
  ),
  bot(
    "B15",
    "New achievement",
    "An achievement is unlocked",
    `🏅 NEW ACHIEVEMENT UNLOCKED!

You have earned a new achievement in NEXPOOL.

Open your profile to see your badge and achievement details.

${APP_LINK}`,
    { blockedBy: "achievements are not implemented" },
  ),
  bot(
    "B16",
    "Leaderboard position",
    "User reaches a meaningful ranking milestone",
    `🏆 LEADERBOARD UPDATE!

Your current position is {rank} for {period}.

Open NEXPOOL to see the latest verified rankings.

${APP_LINK}`,
    { blockedBy: BOT_DM_GAP },
  ),
  bot(
    "B17",
    "Challenge starting",
    "A challenge starts and the user is eligible",
    `🔥 A NEW COMMUNITY CHALLENGE IS STARTING!

Challenge: {challenge_name}

Explore the requirements and participate with the NEXPOOL community.

${APP_LINK}`,
    { blockedBy: "community challenges are not implemented" },
  ),
  bot(
    "B18",
    "Challenge completed",
    "The user's participation in a challenge is finalized",
    `🎉 CHALLENGE COMPLETED!

Your participation in {challenge_name} has been finalized.

Open NEXPOOL to review your result.

${APP_LINK}`,
    { blockedBy: "community challenges are not implemented" },
  ),
  bot(
    "B19",
    "Weekly personal summary",
    "Weekly scheduled personal report",
    `📊 YOUR NEXPOOL WEEKLY SUMMARY

Here is your activity for {period}:

Mining sessions: {mining_sessions}
Missions completed: {missions_completed}
XP earned: {xp}
Current level: {level}
Current streak: {current_streak}

Open your profile to explore your progress.

${APP_LINK}`,
    { blockedBy: BOT_DM_GAP },
  ),
  bot(
    "B20",
    "Welcome back",
    "Inactive user re-engagement campaign",
    `👋 WE MISS HAVING YOU AROUND!

There are new things to explore in NEXPOOL.

Check your available missions, community updates and latest features.

Whenever you're ready, your NEXPOOL journey is waiting.

${APP_LINK}`,
    { blockedBy: BOT_DM_GAP },
  ),
];

export const libraryTemplateById = new Map(
  LIBRARY_TEMPLATES.map((template) => [template.id, template]),
);

const PLACEHOLDER = /\{([a-z_]+)\}/g;

export function placeholdersIn(body: string): string[] {
  return [...new Set([...body.matchAll(PLACEHOLDER)].map((match) => match[1]))].sort();
}

/**
 * Renders one library template from verified values.
 *
 * Throws when a placeholder has no value and no safe fallback: a post that says
 * "our community reached {verified_users} members" must never be sent.
 */
export function renderLibraryTemplate(
  id: string,
  values: Record<string, string | number | undefined>,
): { title: string; text: string } {
  const template = libraryTemplateById.get(id);
  if (!template) throw new Error(`Unknown post template ${id}.`);

  const missing: string[] = [];
  const text = template.body.replace(PLACEHOLDER, (_match, name: string) => {
    const raw = values[name];
    const fallback = SAFE_FALLBACKS[name];
    const value =
      raw === undefined || raw === null || String(raw).trim() === ""
        ? fallback
        : String(raw);
    if (!value) {
      missing.push(name);
      return "";
    }
    // Inline buttons and HTML are not part of the plain-text delivery path, so
    // a display name containing markup is flattened instead of injected.
    return value.replace(/[<>]/g, "").trim();
  });

  if (missing.length > 0) {
    throw new Error(
      `Refusing to publish ${id}: missing verified ${missing.join(", ")}.`,
    );
  }
  return { title: template.title, text: text.trim() };
}

/** Templates that can be scheduled today: no blocked trigger, no dynamic data. */
export const SCHEDULABLE_TEMPLATE_IDS = LIBRARY_TEMPLATES.filter(
  (template) =>
    !template.blockedBy &&
    template.schedule &&
    placeholdersIn(template.body).every((name) => name === "app_link"),
).map((template) => template.id);

/** Operator view: what exists, what is blocked, and why. */
export const catalog = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return {
      generatedAt: Date.now(),
      templates: LIBRARY_TEMPLATES.map((template) => ({
        id: template.id,
        destination: template.destination,
        title: template.title,
        trigger: template.trigger,
        blockedBy: template.blockedBy ?? null,
        schedule: template.schedule ?? null,
        placeholders: placeholdersIn(template.body),
        schedulable: SCHEDULABLE_TEMPLATE_IDS.includes(template.id),
      })),
      counts: {
        total: LIBRARY_TEMPLATES.length,
        channel: LIBRARY_TEMPLATES.filter((t) => t.destination === "channel").length,
        group: LIBRARY_TEMPLATES.filter((t) => t.destination === "group").length,
        bot: LIBRARY_TEMPLATES.filter((t) => t.destination === "bot").length,
        blocked: LIBRARY_TEMPLATES.filter((t) => t.blockedBy).length,
        schedulable: SCHEDULABLE_TEMPLATE_IDS.length,
      },
    };
  },
});

/** Renders a preview from operator-supplied sample values, refusing gaps. */
export const preview = query({
  args: { id: v.string(), sampleName: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const template = libraryTemplateById.get(args.id);
    if (!template) throw new Error("Unknown post template.");
    if (template.blockedBy) {
      return {
        blocked: true as const,
        reason: template.blockedBy,
        title: template.title,
        text: null,
      };
    }
    try {
      const rendered = renderLibraryTemplate(args.id, {
        user_name: args.sampleName?.trim() || undefined,
      });
      return { blocked: false as const, reason: null, ...rendered };
    } catch (error) {
      return {
        blocked: false as const,
        reason: error instanceof Error ? error.message : "Cannot render.",
        title: template.title,
        text: null,
      };
    }
  },
});
