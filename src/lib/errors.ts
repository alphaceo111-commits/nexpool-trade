/**
 * Turns technical failures into messages a NEXPOOL user can act on.
 *
 * The backend already speaks plainly for expected conditions (deposit limits,
 * an unconfigured treasury, a quote that expired). This helper only rewrites
 * infrastructure noise — network drops, indexer timeouts, auth expiry — and
 * otherwise passes a short, human server message straight through.
 */
const FALLBACK = "Something went wrong. Please try again in a moment.";

const RULES: Array<[RegExp, string]> = [
  [
    /offline|failed to fetch|network ?error|connection (lost|closed|error|interrupted)|load failed/i,
    "Your internet connection was interrupted. NEXPOOL reconnects automatically when you're back online.",
  ],
  [
    /timed? ?out|timeout/i,
    "The request took too long. Check your connection and try again.",
  ],
  [
    /indexer|tonapi|ton api|blockchain|tonscan/i,
    "The TON network is not responding right now. Your payment is safe — NEXPOOL keeps checking and credits it once it is confirmed.",
  ],
  [
    /service unavailable|temporarily unavailable|bad gateway|gateway timeout|\b50[234]\b|backend/i,
    "NEXPOOL is temporarily unavailable. Please try again in a moment.",
  ],
  [
    /rate.?limit|too many/i,
    "Too many attempts. Wait a minute and try again.",
  ],
  [
    /sign in|session (expired|ended|no longer)|unauthori[sz]ed|\b401\b|not authenticated/i,
    "Your session ended. Reopen NEXPOOL from the Telegram bot to continue.",
  ],
  [
    /treasury|deposits are offline|not configured|pricing is not configured/i,
    "TON deposits are temporarily unavailable. No payment has been taken.",
  ],
  [
    /cannot be verified|could not be verified|transaction rejected/i,
    "This payment could not be verified. Please check its details and contact support with the transaction hash.",
  ],
];

export function friendlyError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  // Convex prefixes server messages with the error class and a request id.
  const cleaned = raw
    .replace(/^\[[^\]]*\]\s*/, "")
    .replace(/^ConvexError:\s*/i, "")
    .replace(/\s*\[Request ID:[^\]]*\]\s*$/i, "")
    .trim();

  for (const [pattern, message] of RULES) {
    if (pattern.test(cleaned)) return message;
  }

  // A short, stack-free server message is already written for a person.
  if (cleaned && cleaned.length <= 180 && !/^\s*at\s+\S+/m.test(cleaned)) {
    return cleaned;
  }
  return FALLBACK;
}
