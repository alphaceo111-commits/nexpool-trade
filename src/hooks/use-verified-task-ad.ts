import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { showVerifiedRewardedAd } from "@/lib/monetag";
import { formatNex } from "@/components/app/parts";

export type VerifiedTaskAdResult = {
  status: "granted" | "pending" | "rejected" | "already" | "failed";
  message: string;
};

const PROVIDER_POLL_DELAYS_MS = [1_500, 2_500, 3_500, 4_500];

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * A task-linked Monetag view. The server issues a ymid challenge, the client
 * only opens the SDK, and task credit waits for the authenticated postback.
 */
export function useVerifiedTaskAd() {
  const requestAd = useMutation(api.miningAds.requestAd);
  const confirmFromClient = useMutation(api.miningAds.confirmFromClient);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  const watchTaskAd = async (taskId: string): Promise<VerifiedTaskAdResult> => {
    if (running.current) {
      return {
        status: "failed",
        message: "Another verified ad is already open. Finish it before starting another.",
      };
    }
    running.current = true;
    setBusy(true);
    try {
      const challenge = await requestAd({
        purpose: "task",
        taskId: taskId as Id<"tasks">,
      });
      const ad = await showVerifiedRewardedAd({
        ymid: challenge.ymid,
        requestVar: "task_reward",
      });
      if (!ad.ok) {
        toast.error(ad.reason);
        return { status: "failed", message: ad.reason };
      }

      const payload = {
        challengeId: challenge.challengeId,
        ymid: challenge.ymid,
        rewardEventType: ad.result.reward_event_type ?? "valued",
        eventType: ad.result.event_type,
        estimatedPriceUsd: ad.result.estimated_price,
      };
      let confirmation = await confirmFromClient(payload);
      for (const delay of PROVIDER_POLL_DELAYS_MS) {
        if (confirmation.status !== "pending") break;
        await wait(delay);
        confirmation = await confirmFromClient(payload);
      }

      if (confirmation.status === "rejected") {
        toast.error(confirmation.message);
        return { status: "rejected", message: confirmation.message };
      }
      if (confirmation.status === "pending") {
        const message =
          "The ad closed, but Monetag has not sent its authenticated postback yet. The task will credit automatically if the provider confirms it.";
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
      const message =
        confirmation.status === "granted"
          ? `Task verified by Monetag.${reward > 0 ? ` +${formatNex(reward)} NEX credited to your balance.` : ""}`
          : "Verified Monetag view counted.";
      toast.success(message);
      return { status: "granted", message };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The verified ad task could not complete.";
      toast.error(message);
      return { status: "failed", message };
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return { busy, watchTaskAd };
}
