import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { showVerifiedRewardedAd } from "@/lib/monetag";
import { formatNex } from "@/components/app/parts";

export type MiningAdPurpose = "away" | "extension";

export type VerifiedMiningAdResult = {
  status: "granted" | "recorded" | "pending" | "rejected" | "already" | "failed";
  message: string;
};

const PROVIDER_POLL_DELAYS_MS = [1_500, 2_500, 3_500, 4_500];

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Requests a purpose-specific server challenge, opens the Monetag rewarded
 * view, then polls the backend for the provider's authenticated postback.
 * Nothing here credits NEX or advances an entitlement on its own.
 */
export function useVerifiedMiningAd(extensionHours: number) {
  const requestMiningAd = useMutation(api.miningAds.requestAd);
  const confirmMiningAd = useMutation(api.miningAds.confirmFromClient);
  const [busy, setBusy] = useState<MiningAdPurpose | null>(null);
  const running = useRef(false);

  const watchAd = async (purpose: MiningAdPurpose): Promise<VerifiedMiningAdResult> => {
    if (running.current) {
      return {
        status: "failed",
        message: "Another verified ad is already open. Finish it before starting another.",
      };
    }
    running.current = true;
    setBusy(purpose);
    try {
      const challenge = await requestMiningAd({ purpose });
      const ad = await showVerifiedRewardedAd({
        ymid: challenge.ymid,
        requestVar: `mining_${purpose}`,
      });
      if (!ad.ok) {
        toast.error(ad.reason);
        return { status: "failed", message: ad.reason };
      }

      let confirmation = await confirmMiningAd({
        challengeId: challenge.challengeId,
        ymid: challenge.ymid,
        rewardEventType: ad.result.reward_event_type ?? "valued",
        eventType: ad.result.event_type,
        estimatedPriceUsd: ad.result.estimated_price,
      });

      // The provider's server postback is authoritative and can trail the SDK
      // callback by a few seconds. Poll the same challenge; repeat calls are
      // idempotent and can never apply progress twice.
      for (const delay of PROVIDER_POLL_DELAYS_MS) {
        if (confirmation.status !== "pending") break;
        await wait(delay);
        confirmation = await confirmMiningAd({
          challengeId: challenge.challengeId,
          ymid: challenge.ymid,
          rewardEventType: ad.result.reward_event_type ?? "valued",
          eventType: ad.result.event_type,
          estimatedPriceUsd: ad.result.estimated_price,
        });
      }

      if (confirmation.status === "rejected") {
        toast.error(confirmation.message);
        return { status: "rejected", message: confirmation.message };
      }
      if (confirmation.status === "pending") {
        const message =
          "Monetag has not sent its server confirmation yet. This view will count automatically if the provider confirms it; nothing was granted manually.";
        toast.info("Waiting for provider confirmation.");
        return { status: "pending", message };
      }
      if (confirmation.status === "already") {
        const message = "This Monetag view was already counted. No second reward was issued.";
        toast.info(message);
        return { status: "already", message };
      }

      const reward =
        "rewardNex" in confirmation && typeof confirmation.rewardNex === "number"
          ? confirmation.rewardNex
          : 0;
      const rewardNote = reward > 0 ? ` +${formatNex(reward)} NEX credited to your balance.` : "";

      if (confirmation.status === "granted") {
        const message =
          purpose === "away"
            ? `Background mining unlocked.${rewardNote} It only continues a session you already started.`
            : `${extensionHours}-hour extension unlocked.${rewardNote} Press Start Extra Mining to begin the clock.`;
        toast.success(
          purpose === "away"
            ? `Background mining unlocked.${rewardNote}`
            : `${extensionHours}-hour extension unlocked.${rewardNote}`,
        );
        return { status: "granted", message };
      }

      const message = `Verified Monetag view counted.${rewardNote} ${confirmation.progress}/${challenge.required} ${
        purpose === "away" ? "background-mining" : "extension"
      } ads completed.`;
      toast.success(`Verified Monetag view counted.${rewardNote}`);
      return { status: "recorded", message };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The verified ad could not be completed.";
      toast.error(message);
      return { status: "failed", message };
    } finally {
      running.current = false;
      setBusy(null);
    }
  };

  return { busy, watchAd };
}
