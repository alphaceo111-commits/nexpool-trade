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

export default crons;
