/**
 * Monetag rewarded ads (zone 12157822).
 *
 * The SDK is loaded from index.html, which defines `window.show_12157822`.
 * Rewarded-interstitial promises resolve after the ad is closed and Monetag
 * confirms the event. Mining only accepts `reward_event_type === "valued"`;
 * a click or an unfinished opening never gets that result.
 *
 * The resolved SDK result never credits NEX directly. The Mining page sends it
 * to the backend, which owns the challenge, entitlement and balance.
 */

type MonetagShowOptions = {
  type?: "end" | "start" | "pop" | "preload" | "inApp";
  ymid?: string;
  requestVar?: string;
  timeout?: number;
};

export type MonetagRewardEvent = {
  reward_event_type?: "valued" | "non_valued" | string;
  event_type?: string;
  estimated_price?: number;
  sub_zone_id?: number;
  zone_id?: number;
  request_var?: string;
  variable2?: string;
  telegram_id?: string;
};

type MonetagRuntime = (
  options?: MonetagShowOptions | string,
) => Promise<MonetagRewardEvent | undefined>;

declare global {
  interface Window {
    show_12157822?: MonetagRuntime;
  }
}

export type RewardedAdResult =
  | { ok: true }
  | { ok: false; reason: string };

export type VerifiedRewardedAdResult =
  | { ok: true; result: MonetagRewardEvent }
  | { ok: false; reason: string };

const LOAD_TIMEOUT_MS = 15_000;

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "The rewarded ad did not complete. No reward was issued.";
}

async function waitForRuntime(): Promise<MonetagRuntime | null> {
  const deadline = Date.now() + LOAD_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const runtime = window.show_12157822;
    if (typeof runtime === "function") return runtime;
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }
  return window.show_12157822 ?? null;
}

async function run(
  runtime: MonetagRuntime,
  options?: MonetagShowOptions,
): Promise<RewardedAdResult> {
  try {
    // Kept for the existing task/home ad flows. It reports that the SDK
    // finished an ad; the task backend still applies its own timing check.
    await (options ? runtime(options) : runtime());
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }
}

/**
 * Opens the generic Monetag rewarded interstitial. Call it directly from the
 * tap handler so the ad network keeps the user gesture.
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

/**
 * Opens a rewarded interstitial for a server-issued mining challenge. The
 * result is accepted only when Monetag confirms a valued event and does not
 * classify it as a click.
 */
export async function showVerifiedRewardedAd(options: {
  ymid: string;
  requestVar: string;
}): Promise<VerifiedRewardedAdResult> {
  if (typeof window === "undefined") {
    return {
      ok: false,
      reason: "Rewarded ads only run inside the app.",
    };
  }

  const runtime =
    typeof window.show_12157822 === "function"
      ? window.show_12157822
      : await waitForRuntime();
  if (!runtime) {
    return {
      ok: false,
      reason:
        "The ad network could not be reached. Check the connection and try again.",
    };
  }

  try {
    const result = await runtime({
      type: "end",
      ymid: options.ymid,
      requestVar: options.requestVar,
    });
    if (!result) {
      return {
        ok: false,
        reason:
          "Monetag returned no confirmed reward event. Make sure this zone uses a rewarded format with reward postback enabled.",
      };
    }
    if (result.reward_event_type !== "valued") {
      return {
        ok: false,
        reason:
          "Monetag did not value this view. The ad may have been skipped, not completed, or classified as unpaid traffic.",
      };
    }
    if (result.event_type === "click") {
      return {
        ok: false,
        reason:
          "Monetag reported a click, not a completed rewarded view. No progress was added.",
      };
    }
    return { ok: true, result };
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }
}
