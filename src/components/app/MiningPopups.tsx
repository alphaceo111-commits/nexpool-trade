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
  const startExtraMining = useMutation(api.app.startExtraMining);
  const [open, setOpen] = useState<MiningPopupKind | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [startingExtra, setStartingExtra] = useState(false);
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
  const extensionUnlocked = snapshot?.mining.extensionUnlocked ?? false;
  const capReachedToday = Boolean(
    snapshot?.mining.capReachedAt &&
      new Date(snapshot.mining.capReachedAt).toISOString().slice(0, 10) ===
        new Date(snapshot.serverNow).toISOString().slice(0, 10),
  );
  const capReached = Boolean(
    snapshot &&
      snapshot.mining.status === "limit" &&
      snapshot.mining.state === "CAP_REACHED" &&
      snapshot.mining.remainingTodayNex <= 0 &&
      capReachedToday &&
      !snapshot.mining.extensionActive &&
      !extensionUnlocked &&
      !snapshot.mining.ads.extension.unlockedToday,
  );

  // First popup: once per account, after the backend has observed a real
  // mining session or confirmed normal NEX for the day.
  useEffect(() => {
    if (!snapshotReady || !sessionActive || !normalRoom || restricted || open) return;
    if (snapshot?.mining.state !== "ACTIVE") return;
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
  }, [claimPopup, normalRoom, open, restricted, sessionActive, snapshot, snapshotReady]);

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
  }, [capReached, claimPopup, extensionUnlocked, open, restricted, snapshotReady]);

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
  const extensionStartable = Boolean(mining?.ads.extension.startable);
  const unlockedToday = Boolean(mining?.ads.extension.unlockedToday);
  const extensionExpired = Boolean(mining?.ads.extension.expiredToday);
  const extensionEligible = Boolean(mining?.ads.extension.eligible);
  const providerReady = Boolean(mining?.ads.providerReady);
  const remaining = mining?.remainingTodayNex ?? 0;
  const extensionHours = snapshot?.config.extensionHours ?? 5;
  const adRewardNex = snapshot?.config.adRewardNex ?? 0;
  const shownCompleted =
    active || (isExtension && extensionStartable) ? required : completed;
  const ctaDisabled = isExtension
    ? startingExtra || active || (!extensionStartable && (!providerReady || !extensionEligible || unlockedToday))
    : Boolean(busy) || active || (!providerReady);

  const title = isExtension
    ? extensionStartable
      ? "EXTRA MINING UNLOCKED"
      : "DAILY CAP REACHED"
    : "MINING STARTED";
  const heading = isExtension
    ? extensionStartable
      ? `Your ${extensionHours}-hour session is ready`
      : `Keep mining for ${extensionHours} more hours!`
    : "Keep mining in the background!";
  const body = isExtension
    ? extensionStartable
      ? `The verified-ad requirement is complete. The five-hour clock has not started and no extra NEX is accruing until you press Start Extra Mining.`
      : `You've reached your normal daily mining limit. Watch ${required} verified advertisements to unlock an additional ${extensionHours} hours of mining and earn extra NEX beyond your normal daily cap.`
    : `Your normal mining pauses when you leave NEXPOOL. Watch ${required} verified advertisements to unlock background mining.`;

  let statusNote = `Only completed Monetag reward views count — an open or click never counts. Each valued postback credits ${formatNex(adRewardNex)} NEX once.`;
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
  } else if (isExtension && extensionStartable) {
    statusNote = "Unlocked but not started. No extra NEX is accruing yet.";
  } else if (!providerReady) {
    statusNote =
      "Verified ads are unavailable until Monetag's server confirmation callback is configured. No progress can be granted manually.";
  } else if (isExtension && remaining > 0) {
    statusNote = `Reach the normal daily cap first — ${formatNex(remaining)} NEX remaining.`;
  } else if (mineToday === 0) {
    statusNote = "Start normal mining first.";
  }

  let ctaLabel = isExtension
    ? `Unlock ${extensionHours} Hours`
    : `Watch verified ad · ${Math.min(completed + 1, required)}/${required}`;
  if (startingExtra) ctaLabel = "Starting extra mining";
  else if (busy) ctaLabel = "Waiting for provider confirmation";
  else if (active) {
    ctaLabel = isExtension
      ? `${extensionHours}-hour extension active`
      : "Background mining active";
  } else if (isExtension && extensionStartable)
    ctaLabel = "Start Extra Mining";
  else if (isExtension && extensionExpired) ctaLabel = "Session completed today";
  else if (isExtension && unlockedToday) ctaLabel = "Unlocked today";
  else if (!providerReady) ctaLabel = "Verification unavailable";
  else if (remaining > 0) ctaLabel = "Reach the daily cap first";

  const Icon = isExtension ? Megaphone : Plane;
  const contextValue = useMemo(() => ({ openMiningPopup }), [openMiningPopup]);

  const runPrimaryAction = async () => {
    if (!open || ctaDisabled) return;
    setNotice(null);
    if (isExtension && extensionStartable) {
      setStartingExtra(true);
      try {
        const result = await startExtraMining();
        if (!result.started) {
          setNotice(
            result.reason === "not_unlocked"
              ? "Complete all 20 verified ads before starting the extra session."
              : "Extra mining is unavailable right now.",
          );
          return;
        }
        setNotice(
          result.alreadyActive
            ? "Your extra mining session is already running."
            : `Extra mining started for ${extensionHours} hours. The clock started now.`,
        );
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : "Extra mining could not start.",
        );
      } else if (!providerReady) {
        setNotice(
          "Verified ads are unavailable until Monetag's server confirmation callback is configured. No progress can be granted manually.",
        );
      } else if (isExtension && remaining > 0) {
        setNotice(
          `Reach the normal daily cap first — ${formatNex(remaining)} NEX remaining.`,
        );
      } else {
        const result = await watchAd(open);
        setNotice(result.message);
      }
  };

  const Icon = isExtension ? Megaphone : Plane;
  const contextValue = useMemo(() => ({ openMiningPopup }), [openMiningPopup]);
      } else {
        const result = await watchAd(open);
        setNotice(result.message);
      }
  };

  const Icon = isExtension ? Megaphone : Plane;
  const contextValue = useMemo(() => ({ openMiningPopup }), [openMiningPopup]);

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
                    value={shownCompleted}
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

              } else {
              const result = await watchAd(open);
              setNotice(result.message);
            }

  const Icon = isExtension ? Megaphone : Plane;
  const contextValue = useMemo(() => ({ openMiningPopup }), [openMiningPopup]);

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
            } else {
              const result = await watchAd(open);
              setNotice(result.message);
            }
          };

          const Icon = isExtension ? Megaphone : Plane;
          const contextValue = useMemo(() => ({ openMiningPopup }), [openMiningPopup]);

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
                            value={shownCompleted}
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

                        } else {
                          const result = await watchAd(open);
                          setNotice(result.message);
                        }
                      };

                      const Icon = isExtension ? Megaphone : Plane;
                      const contextValue = useMemo(...) => ({ openMiningPopup }), [openMiningPopup]);

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
                                        value={shownCompleted}
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

                                                      } else {
                  };

                <Button
                  onClick={() => void runPrimaryAction()}
                  disabled={ctaDisabled}
                  className="w-full gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em]"
                >


                  {busy || startingExtra ? <Spinner /> : <Play className="size-3.5" />}
                  {ctaLabel}
                </Button>

                <p className="text-[9.5px] leading-relaxed text-muted-foreground">
                  {isExtension
                    ? `This is the ${required}-ad cap extension. It unlocks only the extra ${extensionHours}-hour session and never grants background mining. The five-hour clock starts only when you press Start Extra Mining.`
                    : `This is the ${required}-ad background-mining unlock. It never grants the ${mining?.ads.extension.required ?? 20}-ad cap extension. It continues an already-started session and never starts one.`}{" "}
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
