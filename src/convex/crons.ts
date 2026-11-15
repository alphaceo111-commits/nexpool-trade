import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Credits TON deposits whose payment landed after the mini app closed, and
 * retires quotes that were never paid. One indexer call per treasury account.
 */
crons.interval(
  "reconcile TON deposits",
  { minutes: 5 },
  internal.payments.reconcileDeposits,
  {},
);

// Finalizes five-hour extension rows from server time even when the user never
// reopens NEXPOOL after the window ends.
crons.interval(
  "finalize extension sessions",
  { minutes: 10 },
  internal.miningAds.finalizeExtensionSessions,
  {},
);

// Runs every automated Telegram post whose scheduled UTC slot has arrived.
// Each run is idempotent per slot, so overlapping ticks cannot double-post.
crons.interval(
  "run telegram automations",
  { minutes: 5 },
  internal.publishing.runDueAutomations,
  {},
);

export default crons;
