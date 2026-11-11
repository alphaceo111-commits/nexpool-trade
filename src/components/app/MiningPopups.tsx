import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProgressBar, Spinner, formatDateTime, formatNex } from "@/components/app/parts";
import {
  MiningPopupsContext,
  type MiningPopupKind,
} from "@/components/app/mining-popups-context";
import { useVerifiedMiningAd } from "@/hooks/use-verified-mining-ad";
import { useMutation, useQuery } from "convex/react";
import { BadgeCheck, Megaphone, Plane, Play, Timer } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Owns both automatic mining popups. Presentation claims are server-backed so
 * a refresh or a second device cannot replay them; the manual open path never
 * claims and never changes ad progress or entitlements.
 */
export function MiningPopupsProvider({ children }: { children: ReactNode }) {
  const snapshot = useQuery(api.app.snapshot);
  const claimPopup = useMutation(api.app.claimMiningPopup);
  const [open, setOpen] = useState<MiningPopupKind | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { busy, watchAd } = useVerifiedMiningAd(
    snapshot?.config.extensionHours ?? 5,
  );

  const openMiningPopup = useCallback((kind: MiningPopupKind) => {
    setNotice(null);
    setOpen(kind);
  }, []);

  const snapshotReady = Boolean(snapshot);
  const restricted = snapshot?.mining.status === "restricted";
  const sessionActive = snapshot?.mining.sessionActive ?? false;
  const normalRoom = (snapshot?.mining.remainingTodayNex ?? 0) > 0;
  const capReached = Boolean(
    snapshot &&
      snapshot.mining.status === "limit" &&
      snapshot.mining.remainingTodayNex <= 0 &&
      !snapshot.mining.extensionActive &&
      !snapshot.mining.ads.extension.unlockedToday,
  );

  // First popup: once per account, after the backend has observed a real
  // mining session or confirmed normal NEX for the day.
  useEffect(() => {
    if (!snapshotReady || !sessionActive || !normalRoom || restricted || open) return;
    let cancelled = false;
    claimPopup({ kind: "started" })
      .then((result) => {
        if (!cancelled && result.show) {
          setOpen((current) => current ?? "away");
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [claimPopup, normalRoom, open, restricted, sessionActive, snapshotReady]);

  // Second popup: once per UTC day, only after the server-confirmed normal cap
  // has been reached and no extension entitlement is already active.
  useEffect(() => {
    if (!snapshotReady || !capReached || restricted || open) return;
    let cancelled = false;
    claimPopup({ kind: "cap" })
      .then((result) => {
        if (!cancelled && result.show) {
          setOpen((current) => current ?? "extension");
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [capReached, claimPopup, open, restricted, snapshotReady]);

  const mining = snapshot?.mining;
  const isExtension = open === "extension";
  const required = isExtension
    ? (mining?.ads.extension.required ?? 20)
    : (mining?.ads.away.required ?? 10);
  const completed = isExtension
    ? (mining?.ads.extension.completed ?? 0)
    : (mining?.ads.away.completed ?? 0);
  const active = isExtension
    ? Boolean(mining?.ads.extension.active)
    : Boolean(mining?.ads.away.active);
  const unlockedToday = Boolean(mining?.ads.extension.unlockedToday);
  const extensionExpired = Boolean(mining?.ads.extension.expiredToday);
  const extensionEligible = Boolean(mining?.ads.extension.eligible);
  const providerReady = Boolean(mining?.ads.providerReady);
  const remaining = mining?.remainingTodayNex ?? 0;
  const extensionHours = snapshot?.config.extensionHours ?? 5;
  const shownCompleted = active ? required : completed;
  const ctaDisabled =
    Boolean(busy) ||
    active ||
    !providerReady ||
    (isExtension && (!extensionEligible || unlockedToday));

  const title = isExtension ? "DAILY CAP REACHED" : "MINING STARTED";
  const heading = isExtension
    ? `Keep mining for ${extensionHours} more hours!`
    : "Keep mining in the background!";
  const body = isExtension
    ? `You've reached your normal daily mining limit. Watch ${required} verified advertisements to unlock an additional ${extensionHours} hours of mining and earn extra NEX beyond your normal daily cap.`
    : `Your normal mining pauses when you leave NEXPOOL. Watch ${required} verified advertisements to unlock background mining.`;

  let statusNote = "Only completed Monetag reward views count — an open or click never counts.";
  if (active) {
    const endsAt = isExtension
      ? mining?.extensionEndsAt
      : mining?.awayMiningExpiresAt;
    statusNote = isExtension
      ? endsAt
        ? `Extension live · ends ${formatDateTime(endsAt)}.`
        : "The extension entitlement is active."
      : endsAt
        ? `Background mining active · expires ${formatDateTime(endsAt)}.`
        : "The background-mining entitlement is active.";
  } else if (isExtension && extensionExpired) {
    statusNote = `The ${extensionHours}-hour session has completed. It earned ${formatNex(mining?.extensionMinedNex ?? 0)} NEX outside the normal cap.`;
  } else if (isExtension && unlockedToday) {
    statusNote = `The ${extensionHours}-hour extension was already granted today.`;
  } else if (!providerReady) {
    statusNote =
      "Verified ads are unavailable until Monetag's server confirmation callback is configured. No progress can be granted manually.";
  } else if (isExtension && remaining > 0) {
    statusNote = `Reach the normal daily cap first — ${formatNex(remaining)} NEX remaining.`;
  }

  let ctaLabel = isExtension ? `Unlock ${extensionHours} Hours` : `Watch ${required} Ads`;
  if (busy) ctaLabel = "Waiting for provider confirmation";
  else if (active) {
    ctaLabel = isExtension
      ? `${extensionHours}-hour extension active`
      : "Background mining active";
  } else if (isExtension && extensionExpired) ctaLabel = "Session completed today";
  else if (isExtension && unlockedToday) ctaLabel = "Already granted today";
  else if (isExtension && !extensionEligible) ctaLabel = "Reach the daily cap first";
  else if (!providerReady) ctaLabel = "Verification unavailable";

  const Icon = isExtension ? Megaphone : Plane;
  const contextValue = useMemo(() => ({ openMiningPopup }), [openMiningPopup]);

  const runAd = async () => {
    if (!open || ctaDisabled) return;
    setNotice(null);
    if (!providerReady) {
      setNotice(
        "Monetag server verification is not configured, so this unlock is unavailable. Opening or clicking an ad cannot grant progress.",
      );
      return;
    }
    const result = await watchAd(open);
    setNotice(result.message);
  };

  return (
    <MiningPopupsContext.Provider value={contextValue}>
      {children}
      <Dialog
        open={Boolean(open)}
        onOpenChange={(next) => {
          if (!next) {
            setOpen(null);
            setNotice(null);
          }
        }}
      >
        <DialogContent className="max-h-[92dvh] gap-0 overflow-y-auto border-border/80 bg-card p-0 sm:max-w-[440px]">
          {open && snapshot ? (
            <>
              <div className="relative overflow-hidden border-b border-border/70 px-5 pt-6 pb-5">
                <div
                  className="pointer-events-none absolute -top-16 -right-10 size-44 rounded-full bg-primary/15 blur-3xl"
                  aria-hidden="true"
                />
                <div className="relative">
                  <p className="label-xs flex items-center gap-1.5">
                    <Icon className="size-3 text-primary" />
                    {isExtension ? "Cap extension" : "Background mining"}
                  </p>
                  <DialogTitle className="mt-2 font-mono text-[21px] font-bold tracking-[0.14em] text-primary">
                    {title}
                  </DialogTitle>
                  <h3 className="mt-3 text-[17px] font-semibold tracking-tight">
                    {heading}
                  </h3>
                  <DialogDescription className="mt-1.5 text-[12px] leading-relaxed">
                    {body}
                  </DialogDescription>
                </div>
              </div>

              <div className="space-y-3.5 px-5 py-4">
                <div className="rounded-sm border border-border/70 bg-background/50 p-3">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="num text-[30px] leading-none font-semibold text-foreground">
                        {shownCompleted}
                        <span className="ml-1 text-[15px] text-muted-foreground">
                          / {required}
                        </span>
                      </p>
                      <p className="label-xs mt-2">Verified ads completed</p>
                    </div>
                    <span className="flex size-9 items-center justify-center rounded-sm border border-primary/30 bg-primary/10 text-primary">
                      {active ? <BadgeCheck className="size-4" /> : <Timer className="size-4" />}
                    </span>
                  </div>
                  <ProgressBar
                    value={active ? required : completed}
                    max={required}
                    tone={active ? "up" : "signal"}
                    className="mt-3"
                  />
                  <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                    {statusNote}
                  </p>
                </div>

                {notice ? (
                  <p className="rounded-sm border border-primary/30 bg-primary/[0.05] px-2.5 py-2 text-[10.5px] leading-relaxed text-muted-foreground">
                    {notice}
                  </p>
                ) : null}

                <Button
                  onClick={() => void runAd()}
                  disabled={ctaDisabled}
                  className="w-full gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em]"
                >
                  {busy ? <Spinner /> : <Play className="size-3.5" />}
                  {ctaLabel}
                </Button>

                <p className="text-[9.5px] leading-relaxed text-muted-foreground">
                  {isExtension
                    ? `This is the ${required}-ad cap extension. It unlocks only the extra ${extensionHours}-hour session and never grants background mining.`
                    : `This is the ${required}-ad background-mining unlock. It never grants the ${mining?.ads.extension.required ?? 20}-ad cap extension.`}{" "}
                  Only a Monetag postback authenticated by the backend counts.
                </p>

                <div className="flex items-center justify-between border-t border-border/70 pt-2.5">
                  <p className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">
                    Separate entitlements · server counted
                  </p>
                  <DialogClose asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 font-mono text-[9px] uppercase tracking-[0.1em]"
                    >
                      Close
                    </Button>
                  </DialogClose>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </MiningPopupsContext.Provider>
  );
}
