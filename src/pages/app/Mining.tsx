import { api } from "@/convex/_generated/api";
import { useMiningPopups } from "@/components/app/mining-popups-context";
import { MiningHeartbeat } from "@/components/app/MiningHeartbeat";
import { useVerifiedMiningAd } from "@/hooks/use-verified-mining-ad";
import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router";
import { toast } from "sonner";
import {
  Activity,
  ArrowUpRight,
  BadgeCheck,
  Gauge,
  History,
  Info,
  Layers,
  Lock,
  Megaphone,
  Pause,
  Pickaxe,
  Plane,
  Play,
  Timer,
  Trophy,
  Users,
} from "lucide-react";
import {
  EmptyState,
  formatDateTime,
  formatNex,
  Metric,
  Panel,
  ProgressBar,
  SectionHeading,
  Spinner,
  StatusPill,
  useTick,
} from "@/components/app/parts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

function countdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function Mining() {
  const snapshot = useQuery(api.app.snapshot);
  const settle = useMutation(api.app.settleMiningNow);
  const startMining = useMutation(api.app.startMining);
  const startExtraMining = useMutation(api.app.startExtraMining);
  const pauseMining = useMutation(api.app.pauseMining);
  const { openMiningPopup } = useMiningPopups();
  const { busy: adBusy, watchAd } = useVerifiedMiningAd(
    snapshot?.config.extensionHours ?? 5,
  );
  const tick = useTick(1000);
  const [settling, setSettling] = useState(false);
  const [startingExtra, setStartingExtra] = useState(false);
  const [adNotice, setAdNotice] = useState<string | null>(null);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (!adNotice) return;
    const timer = window.setTimeout(() => setAdNotice(null), 12_000);
    return () => window.clearTimeout(timer);
  }, [adNotice]);

  if (!snapshot) {
    return (
      <div className="space-y-4">
        <div className="h-12 w-56 animate-pulse rounded-2xl bg-card/60" />
        <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="h-[610px] animate-pulse rounded-3xl border border-border/60 bg-card/60" />
          <div className="space-y-4">
            <div className="h-44 animate-pulse rounded-2xl border border-border/60 bg-card/60" />
            <div className="h-52 animate-pulse rounded-2xl border border-border/60 bg-card/60" />
            <div className="h-48 animate-pulse rounded-2xl border border-border/60 bg-card/60" />
          </div>
        </div>
      </div>
    );
  }

  const { mining, speed, config, referrals, miningHistory } = snapshot;
  const active = mining.sessionActive;
  const extensionLive = mining.extensionActive;
  const extensionExpired = mining.extensionExpiredToday;
  const providerReady = mining.ads.providerReady;
  const remainingMs = Math.max(
    0,
    mining.resetAt - (snapshot.serverNow + tick * 1000),
  );
  const extensionMs = Math.max(
    0,
    (mining.extensionEndsAt ?? 0) - (snapshot.serverNow + tick * 1000),
  );
  const awayMs = Math.max(
    0,
    (mining.awayMiningExpiresAt ?? 0) - (snapshot.serverNow + tick * 1000),
  );

  const watchAds = async (purpose: "away" | "extension") => {
    if (adBusy) return;
    if (!providerReady) {
      setAdNotice(
        "Verified ads are unavailable until the Monetag server confirmation callback is configured. No progress can be granted manually.",
      );
      return;
    }
    setAdNotice(null);
    const result = await watchAd(purpose);
    setAdNotice(result.message);
  };

  const settleNow = async () => {
    setSettling(true);
    try {
      if (!active) {
        const result = await startMining();
        if (result.status === "active" || result.status === "limit") {
          toast.success(
            result.status === "limit"
              ? result.extensionReady
                ? "Your extra session is unlocked. Press Start Extra Mining when you are ready."
                : "Today's normal cap is already reached. Watch 20 verified ads to unlock the extension."
              : "Mining started. The backend is now the source of truth for every reward.",
          );
        } else {
          toast.error("Mining is paused by the operator or your account.");
        }
        return;
      }
      const result = await settle();
      if (result.creditedNex > 0) {
        toast.success(`${formatNex(result.creditedNex)} NEX confirmed`);
      } else if (result.status === "limit") {
        toast.info("Normal daily cap reached. Your extension status is below.");
      } else if (result.status === "paused" || result.status === "restricted") {
        toast.error("Mining is not active for this account.");
      } else {
        toast.info("Nothing new to settle yet.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Settlement failed.");
    } finally {
      setSettling(false);
    }
  };

  const startExtraNow = async () => {
    setStartingExtra(true);
    try {
      const result = await startExtraMining();
      if (!result.started) {
        toast.error(
          result.reason === "not_unlocked"
            ? "Complete 20 verified ads after reaching the normal cap first."
            : "Extra mining is unavailable right now.",
        );
        return;
      }
      toast.success(
        result.alreadyActive
          ? "Your extra mining session is already running."
          : `Extra mining started for ${config.extensionHours} hours.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Extra mining could not start.",
      );
    } finally {
      setStartingExtra(false);
    }
  };

  const stopNow = async () => {
    try {
      await pauseMining();
      toast.success(
        "Mining stopped. Background and heartbeat cannot resume it until you press Start again.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not stop mining.");
    }
  };

  const capProgress =
    mining.todayLimitNex > 0
      ? Math.min(100, (mining.todayMinedNex / mining.todayLimitNex) * 100)
      : 0;

  return (
    <div className="space-y-5">
      <SectionHeading
        index="Earn / Mining"
        title="Mining engine"
        body="A live view of server-time accrual. Your heartbeat proves presence; it never authorizes a new session."
        action={<StatusLabel state={mining.state} />}
      />

      <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <section className="premium-card card-sheen relative overflow-hidden rounded-3xl p-5 sm:p-7">
          <div className="pointer-events-none absolute -top-28 left-1/2 h-64 w-80 -translate-x-1/2 rounded-full bg-primary/[0.035] blur-3xl" />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <p className="label-xs">Mining engine</p>
              <p className="mt-1.5 text-[14px] font-semibold text-foreground">
                {mining.state === "ACTIVE"
                  ? "Server session in progress"
                  : mining.state === "BACKGROUND_ACTIVE"
                    ? "Background continuation active"
                    : mining.state === "CAP_REACHED"
                      ? "Normal allowance complete"
                      : mining.state === "PAUSED"
                        ? "Session paused"
                        : "Ready when you are"}
              </p>
            </div>
            <span className="flex items-center gap-1.5 rounded-full border border-border/70 bg-white/[0.025] px-2.5 py-1 font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground">
              <span className={cn("size-1.5 rounded-full", active ? "animate-signal-pulse bg-up" : "bg-muted-foreground/60")} />
              server time
            </span>
          </div>

          <MiningHeartbeat
            className="mt-3"
            state={mining.state}
            todayNex={mining.todayMinedNex}
            capNex={mining.todayLimitNex}
            speedNexPerHour={speed.total}
            extensionNex={mining.extensionMinedNex}
            serverNow={snapshot.serverNow + tick * 1000}
            lastHeartbeatAt={mining.lastHeartbeatAt}
            online={online}
          />

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MiniStat label="Normal today" value={formatNex(mining.todayMinedNex)} sub="NEX confirmed" />
            <MiniStat label="Remaining" value={formatNex(mining.remainingTodayNex)} sub="before normal cap" />
            <MiniStat label="Total today" value={formatNex(mining.todayTotalNex)} sub="normal + extension" />
            <MiniStat label="Reset in" value={countdown(remainingMs)} sub="00:00 UTC" mono />
          </div>

          <div className="mt-5 rounded-2xl border border-border/60 bg-background/35 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="label-xs">Normal daily allowance</span>
              <span className="num text-[11px] text-muted-foreground">
                {formatNex(mining.todayMinedNex)} / {formatNex(mining.todayLimitNex)} NEX
              </span>
            </div>
            <ProgressBar
              value={mining.todayMinedNex}
              max={mining.todayLimitNex}
              tone={mining.state === "CAP_REACHED" ? "gold" : "signal"}
              className="mt-2.5"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground">
                {capProgress.toFixed(0)}% of the normal cap
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground">
                <Timer className="size-3" />
                heartbeats never start mining
              </span>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            {active ? (
              <>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => void stopNow()}
                  className="w-full gap-2 border-down/35 text-down hover:border-down/55 hover:bg-down/[0.055] sm:flex-1"
                >
                  <Pause className="size-4" /> Stop mining
                </Button>
                <Button
                  size="lg"
                  onClick={() => void settleNow()}
                  disabled={settling}
                  className="w-full gap-2 sm:w-auto sm:min-w-44"
                >
                  {settling ? <Spinner /> : <Activity className="size-4" />}
                  Settle now
                </Button>
              </>
            ) : mining.extensionStartable ? (
              <Button
                size="lg"
                onClick={() => void startExtraNow()}
                disabled={startingExtra}
                className="w-full gap-2 bg-gold text-[#241b08] hover:bg-gold/90"
              >
                {startingExtra ? <Spinner /> : <Play className="size-4" />}
                Start extra mining · {config.extensionHours}h
              </Button>
            ) : mining.status === "limit" ? (
              <Button size="lg" className="w-full gap-2" disabled>
                <Lock className="size-4" /> Normal daily cap reached
              </Button>
            ) : (
              <Button
                size="lg"
                onClick={() => void settleNow()}
                disabled={settling || mining.status === "restricted"}
                className="w-full gap-2"
              >
                {settling ? <Spinner /> : <Pickaxe className="size-4" />}
                Start mining
              </Button>
            )}
          </div>
          <p className="mt-3 text-center text-[10px] leading-relaxed text-muted-foreground">
            Opening, refreshing or returning to NEXPOOL never starts a session. The
            backend only credits an explicitly authorized presence window.
          </p>
        </section>

        <div className="space-y-4">
          <Panel
            eyebrow="Current state"
            title={mining.state === "BACKGROUND_ACTIVE" ? "Background continuation" : "Why this state?"}
            action={<Info className="size-4 text-muted-foreground" />}
          >
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              {mining.status === "restricted"
                ? snapshot.account.restrictionReason ||
                  "Mining is frozen while your account restriction is in place."
                : mining.state === "ACTIVE"
                  ? "The app is visible and the server has a fresh presence heartbeat. Accrual is credited against server time."
                  : mining.state === "BACKGROUND_ACTIVE"
                    ? "Your background entitlement is continuing an already-authorized session. It did not create a new one."
                    : mining.state === "CAP_REACHED"
                      ? `The normal allowance is complete for today. ${mining.extensionUnlocked ? "Your extra session is unlocked but has not started." : "The extra session is a separate, explicitly started bucket."}`
                      : mining.state === "PAUSED"
                        ? "A manual Stop is authoritative. Background mining and heartbeats cannot resume this session until you start again."
                        : "No mining session is authorized. Press Start mining when you are ready; a new UTC day does not do it for you."}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border/60 pt-4">
              <Metric label="Server rate" value={`${formatNex(speed.total)}/h`} sub="NEX per hour" tone="gold" />
              <Metric
                label="Background"
                value={mining.awayMiningActive ? "Active" : "Locked"}
                sub={mining.awayMiningActive ? `${countdown(awayMs)} left` : `${config.awayMiningHours}h after 10 ads`}
              />
              <Metric
                label="Extra session"
                value={extensionLive ? "Live" : mining.extensionStartable ? "Ready" : "Locked"}
                sub={extensionLive ? `${countdown(extensionMs)} left` : `${config.extensionHours}h after 20 ads`}
              />
              <Metric
                label="Ads verified"
                value={`${mining.ads.away.completed + mining.ads.extension.completed}`}
                sub="today · provider confirmed"
                tone="up"
              />
            </div>
            <div className="mt-4 rounded-xl border border-primary/20 bg-primary/[0.035] px-3 py-2.5">
              <p className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-primary">
                Verified ad reward
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Each Monetag-valued postback credits{" "}
                <span className="num text-foreground">{formatNex(config.adRewardNex)} NEX</span>{" "}
                once to your available balance and the existing ledger. A duplicate
                ymid never pays twice.
              </p>
            </div>
          </Panel>

          <Panel eyebrow="Speed composition" title="How your rate is built">
            <div className="space-y-3">
              <SpeedLine icon={Gauge} label="Base mining speed" value={speed.base} total={speed.total} note="Operator-configured server rate" />
              {speed.taskLines.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/70 px-3 py-2.5">
                  <p className="text-[11px] text-muted-foreground">No task bonuses active yet.</p>
                  <Link to="/app/earn/tasks" className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-primary">
                    Explore tasks <ArrowUpRight className="size-3" />
                  </Link>
                </div>
              ) : (
                speed.taskLines.map((line) => (
                  <SpeedLine
                    key={line.completionId}
                    icon={Layers}
                    label={line.title}
                    value={line.bonusNexPerHour}
                    total={speed.total}
                    note={line.active ? `${line.sponsor} · active` : `${line.sponsor} · campaign ended`}
                    muted={!line.active}
                  />
                ))
              )}
              <SpeedLine
                icon={Users}
                label={`Referrals · ${referrals.qualified} qualified`}
                value={speed.referralBonus}
                total={speed.total}
                note={`${formatNex(referrals.bonusNexPerHour)} NEX/h each · cap ${speed.referralBonusCap}`}
              />
              <SpeedLine
                icon={Trophy}
                label={`Level bonus · L${speed.claimedLevel}`}
                value={speed.levelBonus}
                total={speed.total}
                note="Claimed levels only; XP alone adds no rate."
              />
              <div className="flex items-center justify-between border-t border-border/60 pt-3">
                <span className="label-xs">Total active rate</span>
                <span className="num text-[14px] font-semibold text-gold">{formatNex(speed.total)} NEX/h</span>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <div id="ad-unlocks" className="scroll-mt-6 space-y-4">
        <SectionHeading
          index="Verified ads"
          title="Two independent unlocks"
          body="Both use a server-issued ymid and wait for Monetag's authenticated postback. A click, an open, or a client callback alone is never enough."
        />
        {adNotice ? (
          <div className="flex items-start gap-2.5 rounded-2xl border border-primary/30 bg-primary/[0.045] px-4 py-3">
            <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">{adNotice}</p>
          </div>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-2">
          <UnlockCard
            icon={Plane}
            accent="lime"
            eyebrow="Background continuation"
            title="Keep a started session alive"
            description={`Complete ${mining.ads.away.required} separately verified ads to let an already-authorized session continue for ${mining.awayMiningHours} hours while the Mini App is closed.`}
            completed={mining.ads.away.completed}
            required={mining.ads.away.required}
            active={mining.ads.away.active}
            activeLabel={mining.ads.away.active ? `Active · ${countdown(awayMs)} left` : "Entitlement expires automatically"}
            note={
              mining.ads.away.active
                ? "The permission never starts mining by itself. A manual Stop still overrides it."
                : mining.ads.away.expired
                  ? "The previous permission expired. Complete a new 10-ad unlock for another window."
                  : providerReady
                    ? "Only provider-confirmed views count. Opening or clicking an ad does not."
                    : "Provider verification is not configured. This card fails closed."
            }
            busy={adBusy === "away"}
            disabled={mining.ads.away.active || !providerReady}
            ctaLabel={
              mining.ads.away.active
                ? "Permission active"
                : providerReady
                  ? undefined
                  : "Verification unavailable"
            }
            onWatch={() => void watchAds("away")}
            onDetails={() => openMiningPopup("away")}
          />
          <UnlockCard
            icon={Megaphone}
            accent="gold"
            eyebrow="Beyond the normal cap"
            title={`${config.extensionHours}-hour extra session`}
            description={`After reaching ${formatNex(config.dailyLimitNex)} NEX normal mining, complete ${mining.ads.extension.required} verified ads to unlock ${config.extensionHours} more hours. The clock does not start by itself.`}
            completed={mining.extensionUnlocked ? mining.ads.extension.required : mining.ads.extension.completed}
            required={mining.ads.extension.required}
            active={mining.ads.extension.active}
            activeLabel={mining.ads.extension.active ? `Live · ${countdown(extensionMs)} left` : "Separate from the normal cap"}
            note={
              mining.ads.extension.active
                ? `${formatNex(mining.extensionMinedNex)} NEX extension earnings confirmed today.`
                : extensionExpired
                  ? `Session completed. ${formatNex(mining.extensionMinedNex)} NEX was earned outside the normal cap.`
                  : mining.extensionUnlocked
                    ? "The ads are complete. Press Start Extra Mining above to begin the five-hour clock."
                    : mining.ads.extension.unlockedToday
                      ? "Already unlocked today. The next extension requires a new normal cap."
                      : mining.remainingTodayNex > 0
                        ? `Reach the normal cap first — ${formatNex(mining.remainingTodayNex)} NEX remaining.`
                        : providerReady
                          ? "Completing the ads grants the entitlement. Starting it is always a separate action."
                          : "Provider verification is not configured. This card fails closed."
            }
            busy={adBusy === "extension"}
            disabled={mining.ads.extension.active || !mining.ads.extension.eligible || !providerReady}
            ctaLabel={
              mining.ads.extension.active
                ? "Permission active"
                : extensionExpired
                  ? "Session completed today"
                  : mining.extensionUnlocked
                    ? "Unlocked · start above"
                    : !mining.ads.extension.eligible
                      ? mining.remainingTodayNex > 0
                        ? "Reach the daily cap first"
                        : "Already completed today"
                      : providerReady
                        ? undefined
                        : "Verification unavailable"
            }
            onWatch={() => void watchAds("extension")}
            onDetails={() => openMiningPopup("extension")}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Panel eyebrow="Mining rules" title="What the engine will not do">
          <div className="space-y-2.5">
            {[
              ["Start on open", "No. App launch, refresh, login, heartbeat and ad completion never create a session."],
              ["Start on a new day", "No. 00:00 UTC only resets the normal allowance."],
              ["Resume after Stop", "No. A manual Stop blocks background and heartbeat resume until you press Start."],
              ["Oversell the cap", "No. Normal NEX stops at the configured daily cap; extension NEX is a separate bucket."],
              ["Trust the client", "No. Token credit and entitlement changes require the backend postback."],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4 border-b border-border/55 py-2.5 last:border-0 last:pb-0">
                <span className="text-[11.5px] font-medium text-foreground">{label}</span>
                <span className="max-w-[62%] text-right text-[10.5px] leading-relaxed text-muted-foreground">{value}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          eyebrow="Mining ledger"
          title={`${miningHistory.length} confirmed settlements`}
          action={
            <Link to="/app/history" className="flex items-center gap-1 text-[10px] font-semibold text-primary">
              Full ledger <ArrowUpRight className="size-3" />
            </Link>
          }
          bodyClassName="p-0"
        >
          {miningHistory.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<Pickaxe className="size-4" />}
                title="No settlements yet"
                body="A confirmed settlement appears here after the backend credits a server-authorized window."
              />
            </div>
          ) : (
            <ul className="divide-y divide-border/55">
              {miningHistory.slice(0, 6).map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/8">
                    <History className="size-3.5 text-primary" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11.5px] font-semibold">
                      Mining settlement <span className="ml-1 font-mono text-[8.5px] font-normal text-muted-foreground">{entry.day}</span>
                    </p>
                    <p className="num mt-0.5 text-[8.5px] text-muted-foreground">
                      {formatDateTime(entry.fromTs)} → {formatDateTime(entry.toTs)} · {formatNex(entry.rateNexPerHour)} NEX/h
                    </p>
                  </div>
                  <span className="num shrink-0 text-[12px] font-semibold text-gold">+{formatNex(entry.amountNex)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  sub,
  mono,
}: {
  label: string;
  value: string;
  sub: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/55 bg-white/[0.018] px-3 py-2.5">
      <p className="label-xs">{label}</p>
      <p className={cn("mt-1 text-[13px] font-semibold text-foreground", mono ? "num" : "num")}>{value}</p>
      <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.06em] text-muted-foreground">{sub}</p>
    </div>
  );
}

function UnlockCard({
  icon: Icon,
  accent,
  eyebrow,
  title,
  description,
  completed,
  required,
  active,
  activeLabel,
  note,
  busy,
  disabled,
  ctaLabel,
  onWatch,
  onDetails,
}: {
  icon: typeof Gauge;
  accent: "lime" | "gold";
  eyebrow: string;
  title: string;
  description: string;
  completed: number;
  required: number;
  active: boolean;
  activeLabel: string;
  note: string;
  busy: boolean;
  disabled: boolean;
  ctaLabel?: string;
  onWatch: () => void;
  onDetails: () => void;
}) {
  const gold = accent === "gold";
  return (
    <section className={cn("premium-card relative overflow-hidden rounded-2xl p-5", gold && "border-gold/20")}>
      <div className={cn("pointer-events-none absolute -right-16 -top-20 size-44 rounded-full blur-3xl", gold ? "bg-gold/[0.055]" : "bg-primary/[0.045]")} />
      <div className="relative flex items-start justify-between gap-3">
        <span
          className={cn(
            "flex size-11 items-center justify-center rounded-2xl border",
            gold ? "border-gold/25 bg-gold/10 text-gold" : "border-primary/25 bg-primary/10 text-primary",
          )}
        >
          <Icon className="size-5" />
        </span>
        <span className="rounded-full border border-border/60 bg-white/[0.025] px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.08em] text-muted-foreground">
          {active ? activeLabel : "independent"}
        </span>
      </div>
      <p className={cn("label-xs relative mt-4", gold ? "text-gold/80" : "text-primary/80")}>{eyebrow}</p>
      <h3 className="relative mt-1.5 text-[17px] font-semibold tracking-tight">{title}</h3>
      <p className="relative mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">{description}</p>

      <div className="relative mt-4 rounded-xl border border-border/60 bg-background/35 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="label-xs">{active ? "Entitlement" : "Verified progress"}</span>
          <span className="num text-[12px] font-semibold">
            {active ? activeLabel : `${completed} / ${required}`}
          </span>
        </div>
        <ProgressBar
          value={active ? required : completed}
          max={required}
          tone={gold ? "gold" : "signal"}
          className="mt-2"
        />
      </div>

      <p className="relative mt-3 min-h-9 text-[10.5px] leading-relaxed text-muted-foreground">{note}</p>
      <Button
        size="sm"
        onClick={onWatch}
        disabled={disabled || busy}
        variant={gold ? "outline" : "default"}
        className={cn("relative mt-3 w-full gap-1.5", gold && "border-gold/35 text-gold hover:bg-gold/[0.06]")}
      >
        {busy ? <Spinner /> : <Icon className="size-3.5" />}
        {busy ? "Waiting for provider" : (ctaLabel ?? `Watch verified ad · ${Math.min(completed + 1, required)}/${required}`)}
      </Button>
      <button
        type="button"
        onClick={onDetails}
        className="relative mt-2.5 flex w-full items-center justify-center gap-1 text-[9.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <Info className="size-3" /> How this unlock works
      </button>
    </section>
  );
}

function StatusLabel({
  state,
}: {
  state:
    | "IDLE"
    | "ACTIVE"
    | "BACKGROUND_ACTIVE"
    | "PAUSED"
    | "CAP_REACHED"
    | "EXPIRED"
    | "COMPLETED";
}) {
  if (state === "ACTIVE") return <StatusPill tone="up">Active</StatusPill>;
  if (state === "BACKGROUND_ACTIVE") return <StatusPill tone="up">Background active</StatusPill>;
  if (state === "CAP_REACHED") return <StatusPill tone="gold">Daily limit</StatusPill>;
  if (state === "EXPIRED" || state === "COMPLETED") {
    return <StatusPill tone="muted">{state.toLowerCase()}</StatusPill>;
  }
  return <StatusPill tone="muted">{state === "IDLE" ? "Idle" : "Paused"}</StatusPill>;
}

function SpeedLine({
  icon: Icon,
  label,
  value,
  total,
  note,
  muted,
}: {
  icon: typeof Gauge;
  label: string;
  value: number;
  total: number;
  note: string;
  muted?: boolean;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border", muted ? "border-border bg-secondary/40 text-muted-foreground" : "border-primary/20 bg-primary/8 text-primary")}>
            <Icon className="size-3.5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[11.5px] font-semibold">{label}</p>
            <p className="mt-0.5 text-[9.5px] leading-relaxed text-muted-foreground">{note}</p>
          </div>
        </div>
        <span className={cn("num shrink-0 text-[11px]", muted ? "text-muted-foreground" : "text-foreground")}>
          +{formatNex(value)}
        </span>
      </div>
      <ProgressBar value={value} max={Math.max(total, 0.0001)} className="mt-1.5" />
    </div>
  );
}
