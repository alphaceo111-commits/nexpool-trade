/**
 * Adsgram rewarded ads for the verified mining entitlements.
 *
 * A resolved SDK promise only tells the UI that the provider finished a reward
 * view. It never credits NEX. The server waits for Adsgram's Reward URL
 * callback, which is sent after the view completes and is matched to a pending
 * server-issued challenge.
 */

type AdsgramShowResult = {
  done?: boolean;
  error?: boolean;
  description?: string;
};

type AdsgramController = {
  show: () => Promise<AdsgramShowResult>;
};

type AdsgramSdk = {
  init: (options: { blockId: string }) => AdsgramController;
};

declare global {
  interface Window {
    Adsgram?: AdsgramSdk;
  }
}

const SCRIPT_ID = "adsgram-sdk";
const SCRIPT_URL = "https://sad.adsgram.ai/js/sad.min.js";
const LOAD_TIMEOUT_MS = 12_000;

export const ADSGRAM_BLOCK_ID = (
  import.meta.env.VITE_ADSGRAM_BLOCK_ID as string | undefined
)?.trim();

export const adsgramConfigured = Boolean(ADSGRAM_BLOCK_ID);

export type VerifiedAdResult =
  | { ok: true }
  | { ok: false; reason: string };

function loadSdk(): Promise<AdsgramSdk | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.Adsgram) return Promise.resolve(window.Adsgram);

  return new Promise((resolve) => {
    const existing = document.getElementById(SCRIPT_ID) as
      | HTMLScriptElement
      | null;
    const script = existing ?? document.createElement("script");
    let settled = false;

    const finish = (sdk: AdsgramSdk | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(sdk);
    };

    const timeout = window.setTimeout(() => {
      finish(window.Adsgram ?? null);
    }, LOAD_TIMEOUT_MS);

    script.id = SCRIPT_ID;
    script.src = SCRIPT_URL;
    script.async = true;
    script.addEventListener("load", () => finish(window.Adsgram ?? null), {
      once: true,
    });
    script.addEventListener("error", () => finish(null), { once: true });

    if (!existing) document.head.appendChild(script);
  });
}

/**
 * Opens a full-screen Adsgram rewarded ad from the button handler. `done` is
 * true only when the provider considers the rewarded view complete.
 */
export async function showVerifiedRewardedAd(): Promise<VerifiedAdResult> {
  if (!ADSGRAM_BLOCK_ID) {
    return {
      ok: false,
      reason:
        "Rewarded ads are not configured. The operator must set VITE_ADSGRAM_BLOCK_ID.",
    };
  }
  const sdk = await loadSdk();
  if (!sdk) {
    return {
      ok: false,
      reason:
        "The advertising provider could not be reached. Check the connection and try again.",
    };
  }

  try {
    const controller = sdk.init({ blockId: ADSGRAM_BLOCK_ID });
    const result = await controller.show();
    if (result?.done && !result.error) return { ok: true };
    return {
      ok: false,
      reason:
        result?.description?.trim() ||
        "The rewarded ad was skipped or did not finish. No reward was issued.",
    };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? error.message
          : "The rewarded ad did not complete. No reward was issued.",
    };
  }
}
