/**
 * Monetag rewarded ads (zone 12157822).
 *
 * The SDK is loaded from index.html, which defines `window.show_12157822`.
 * This wrapper only reports whether the ad actually ran; it never credits
 * anything. The reward is still granted by the backend after its own
 * server-timed check, so a resolved promise is not a payout.
 */

type MonetagRuntime = (format?: string) => Promise<unknown>;

declare global {
  interface Window {
    show_12157822?: MonetagRuntime;
  }
}

export type RewardedAdResult =
  | { ok: true }
  | { ok: false; reason: string };

const LOAD_TIMEOUT_MS = 15_000;

async function waitForRuntime(): Promise<MonetagRuntime | null> {
  const deadline = Date.now() + LOAD_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const runtime = window.show_12157822;
    if (typeof runtime === "function") return runtime;
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }
  return window.show_12157822 ?? null;
}

async function run(runtime: MonetagRuntime): Promise<RewardedAdResult> {
  try {
    // Rewarded interstitial: the promise settles when the view is over.
    await runtime();
    return { ok: true };
  } catch {
    return {
      ok: false,
      reason: "The rewarded ad did not complete. No reward was issued.",
    };
  }
}

/**
 * Opens the Monetag rewarded interstitial. Call it directly from the tap handler so
 * the ad network keeps the user gesture; the promise resolves when the ad
 * finishes (or rejects when it could not be played).
 */
export function showRewardedAd(): Promise<RewardedAdResult> {
  if (typeof window === "undefined") {
    return Promise.resolve({
      ok: false,
      reason: "Rewarded ads only run inside the app.",
    });
  }
  const runtime = window.show_12157822;
  if (typeof runtime === "function") return run(runtime);
  return waitForRuntime().then((loaded) =>
    loaded
      ? run(loaded)
      : {
          ok: false as const,
          reason:
            "The ad network could not be reached. Check the connection and try again.",
        },
  );
}
