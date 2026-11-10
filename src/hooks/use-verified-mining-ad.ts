import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { showVerifiedRewardedAd } from "@/lib/monetag";

export type MiningAdPurpose = "away" | "extension";

export type VerifiedMiningAdResult = {
  status: "granted" | "recorded" | "rejected" | "already" | "failed";
  message: string;
};

/**
 * Requests a purpose-specific server challenge, opens the Monetag rewarded
 * view, and sends the provider's confirmed completion back for validation.
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

      const confirmation = await confirmMiningAd({
        challengeId: challenge.challengeId,
        ymid: challenge.ymid,
        rewardEventType: ad.result.reward_event_type ?? "valued",
        eventType: ad.result.event_type,
        estimatedPriceUsd: ad.result.estimated_price,
      });

      if (confirmation.status === "rejected") {
        toast.error(confirmation.message);
        return { status: "rejected", message: confirmation.message };
      }
      if (confirmation.status === "already") {
        const message = "This Monetag view was already counted.";
        toast.info(message);
        return { status: "already", message };
      }

      if (confirmation.status === "granted") {
        const message =
          purpose === "away"
            ? "Away mining unlocked. Normal mining now continues on server time while the app is closed."
            : `${extensionHours}-hour extension unlocked. Extension NEX is recorded separately from the normal daily cap.`;
        toast.success(
          purpose === "away"
            ? "Away mining unlocked."
            : `${extensionHours}-hour extension unlocked.`,
        );
        return { status: "granted", message };
      }

      const message = `Verified Monetag view counted. ${confirmation.progress}/${challenge.required} ${
        purpose === "away" ? "background-mining" : "extension"
      } ads completed.`;
      toast.success("Verified Monetag view counted.");
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
