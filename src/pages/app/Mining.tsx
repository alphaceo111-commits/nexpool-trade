import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  Clock,
  Gauge,
  History,
  Layers,
  Lock,
  Megaphone,
  Pickaxe,
  Plane,
  Timer,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import {
  EmptyState,
  formatDateTime,
  formatNex,
  LiveMined,
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
import {
  adsgramConfigured,
  showVerifiedRewardedAd,
} from "@/lib/adsgram";

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
  const requestMiningAd = useMutation(api.miningAds.requestAd);
  const tick = useTick(1000);
  const [settling, setSettling] = useState(false);
  const [adBusy, setAdBusy] = useState<"away" | "extension" | null>(null);
  const [adNotice, setAdNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!adNotice) return;
    const timer = window.setTimeout(() => setAdNotice(null), 12_000);
    return () => window.clearTimeout(timer);
  }, [adNotice]);

  if (!snapshot) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-md border border-border/60 bg-card/60"
          />
        ))}
      </div>
    );
  }

  const { mining, speed, config, referrals, miningHistory } = snapshot;
  const active = mining.status === "active";
  const extensionLive = mining.extensionActive;
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
    if (!adsgramConfigured || !mining.ads.providerReady) {
      toast.error(
        "Rewarded ads are not fully configured. The operator must set the Adsgram block ID and backend reward secret.",
      );
      return;
    }
    if (adBusy) return;
    setAdBusy(purpose);
    setAdNotice(null);
    try {
      // A provider callback may only complete a challenge the server issued
      // first. The ad is opened immediately after the challenge is stored.
      const challenge = await requestMiningAd({ purpose });
      const ad = await showVerifiedRewardedAd();
      if (!ad.ok) {
        toast.error(ad.reason);
        return;
      }
      setAdNotice(
        `Ad completed. Adsgram is confirming the view; the ${purpose === "away" ? "away-mining" : "extension"} counter updates automatically when the provider callback arrives.`,
      );
      toast.success("Verified ad finished. Waiting for the provider receipt.");
      // Keep the type visible in development logs without trusting the client
      // for any reward decision.
      if (import.meta.env.DEV) console.debug("ad challenge", challenge.challengeId);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The verified ad could not be started.",
      );
    } finally {
      setAdBusy(null);
    }
  };

  const settleNow = async () => {
    setSettling(true);
    try {
      if (!active) {
        const result = await startMining();
        if (result.status === "active" || result.status === "limit") {
          toast.success(
            result.status === "limit"
              ? "Normal cap already reached. Watch 20 verified ads below to unlock the extension."
              : "Mining started. It runs only while this app is open.",
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
        toast.info("Daily cap already reached. Accrual resumes at 00:00 UTC.");
      } else if (result.status === "paused" || result.status === "restricted") {
        toast.error("Mining is not active for this account.");
      } else {
        toast.info("Nothing to settle yet.");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Settlement failed.",
      );
    } finally {
      setSettling(false);
    }
  };

  return (
    <div className="space-y-3.5">
      <SectionHeading
        index="02"
        title="Mining engine"
        body="Nano-NEX accrual on server time. Normal mining stops at the daily cap; verified ads can extend it."
        action={<StatusLabel status={mining.status} />}
      />

      <Panel className="relative overflow-hidden" bodyClassName="p-0">
        <div className="pointer-events-none absolute inset-0 terminal-grid opacity-25" />
        <div className="relative p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="label-xs">Current mining rate</p>
              <div className="mt-1 flex items-end gap-2">
                <span className="num gold-glow text-[44px] leading-none font-semibold text-gold">
                  {formatNex(speed.total)}
                </span>
                <span className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  NEX / hour
                </span>
              </div>
              <p className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground">
                {speed.capped
                  ? `base ${formatNex(speed.base)} · bonuses capped at 2×`
                  : "base rate · server controlled"}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              {active ? (
                <span className="flex items-center gap-1.5 rounded-sm border border-up/40 bg-up/10 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-up">
                  <span className="size-1.5 animate-signal-pulse rounded-full bg-up" />
                  {extensionLive ? "extension live" : "accruing"}
                </span>
              ) : (
                <StatusPill tone={mining.status === "limit" ? "warn" : "muted"}>
                  {mining.status === "limit"
                    ? "cap reached"
                    : mining.status === "restricted"
                      ? "restricted"
                      : "paused"}
                </StatusPill>
              )}
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                server rate
              </span>
            </div>
          </div>

          <div className="mt-5 rounded-sm border border-border/70 bg-background/40 p-3">
            <div className="flex items-center justify-between">
              <p className="label-xs">Normal daily cap</p>
              <p className="num text-[10px] text-muted-foreground">
                <LiveMined
                  key={snapshot.serverNow}
                  settledNex={mining.todayMinedNex}
                  ratePerHour={speed.total}
                  capNex={mining.todayLimitNex}
                  enabled={active && !extensionLive}
                  className="text-foreground"
                />{" "}
                / {formatNex(mining.todayLimitNex)} NEX
              </p>
            </div>
            <ProgressBar
              value={mining.todayMinedNex}
              max={mining.todayLimitNex}
              tone={mining.status === "limit" ? "warn" : "signal"}
              className="mt-2"
            />
            {extensionLive ? (
              <div className="mt-2.5 rounded-sm border border-gold/30 bg-gold/[0.04] px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-gold">
                    <Megaphone className="size-3" /> 5-hour extension
                  </span>
                  <span className="num text-[10px] text-foreground">
                    {formatNex(mining.extensionMinedNex)} NEX · {countdown(extensionMs)} left
                  </span>
                </div>
                <ProgressBar
                  value={mining.extensionMinedNex}
                  max={Math.max(mining.extensionMinedNex, speed.total * config.extensionHours)}
                  tone="gold"
                  className="mt-1.5"
                />
              </div>
            ) : null}
            <div className="mt-2.5 grid grid-cols-2 gap-y-2 sm:grid-cols-4 sm:divide-x sm:divide-border/70">
              <Metric
                label="Normal today"
                value={formatNex(mining.todayMinedNex)}
                sub="confirmed"
                tone="gold"
              />
              <Metric
                label="Extension"
                value={formatNex(mining.extensionMinedNex)}
                sub="separate bucket"
                className="pl-0 sm:pl-3"
              />
              <Metric
                label="Remaining"
                value={formatNex(mining.remainingTodayNex)}
                sub="normal cap"
                className="pt-2 sm:pl-3 sm:pt-0"
              />
              <Metric
                label="Daily cap"
                value={formatNex(config.dailyLimitNex)}
                sub="NEX / day"
                className="pt-2 sm:pl-3 sm:pt-0"
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
            <span className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
              <Timer className="size-3" /> Daily reset in{" "}
              <span className="num text-foreground">{countdown(remainingMs)}</span>
            </span>
            <Button
              size="sm"
              onClick={() => {
                if (!active && mining.status === "limit") {
                  document
                    .getElementById("ad-unlocks")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  return;
                }
                void settleNow();
              }}
              disabled={settling || mining.status === "restricted"}
              className="gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em]"
            >
              {settling ? <Spinner /> : <Pickaxe className="size-3.5" />}
              {settling
                ? "Working"
                : active
                  ? "Settle accrual"
                  : mining.status === "limit"
                    ? "View ad unlocks"
                    : "Start mining"}
            </Button>
          </div>
        </div>
      </Panel>

      {mining.status !== "active" ? (
        <div
          className={cn(
            "flex items-start gap-2.5 rounded-md border px-3.5 py-3",
            mining.status === "restricted"
              ? "border-down/40 bg-down/[0.06]"
              : "border-warn/40 bg-warn/[0.05]",
          )}
        >
          {mining.status === "restricted" ? (
            <Lock className="mt-0.5 size-4 shrink-0 text-down" />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
          )}
          <div>
            <p className="text-[12px] font-medium">
              {mining.status === "limit"
                ? "Daily limit reached"
                : mining.status === "restricted"
                  ? "Mining unavailable — account restricted"
                  : mining.sessionActive
                    ? "Mining paused by the operator"
                    : "Mining session idle"}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {mining.status === "limit"
                ? `You have mined the full ${formatNex(config.dailyLimitNex)} NEX normal allowance for today. Watch ${mining.ads.extension.required} verified ads below to unlock ${config.extensionHours} more hours; normal mining also resumes at 00:00 UTC in ${countdown(remainingMs)}.`
                : mining.status === "restricted"
                  ? snapshot.account.restrictionReason ||
                    "Contact support. Accrual is frozen while the restriction is in place."
                  : mining.sessionActive
                    ? "The mining engine is paused. Accrual restarts from the moment the operator re-enables it."
                    : "Tap Start mining. Accrual runs only while this app is open and visible, and stops within 60 seconds of leaving."}
            </p>
          </div>
        </div>
      ) : null}

      {mining.awayMiningActive ? (
        <div className="flex items-start gap-2.5 rounded-md border border-up/40 bg-up/[0.05] px-3.5 py-3">
          <Plane className="mt-0.5 size-4 shrink-0 text-up" />
          <div>
            <p className="text-[12px] font-medium">Away mining active</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Verified permission is live for {countdown(awayMs)}. Mining
              continues on server time while the Mini App is closed, up to the
              normal cap and any active extension.
            </p>
          </div>
        </div>
      ) : null}

      <div id="ad-unlocks" className="scroll-mt-4 space-y-3">
        <SectionHeading
          index="03"
          title="Verified ad unlocks"
          body="Two independent entitlements. Both require completed Adsgram reward views, confirmed by the provider callback."
        />
        {adNotice ? (
          <div className="flex items-start gap-2.5 rounded-md border border-primary/40 bg-primary/[0.05] px-3.5 py-2.5">
            <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {adNotice}
            </p>
          </div>
        ) : null}
        <div className="grid gap-3.5 lg:grid-cols-2">
          <AdUnlockCard
            icon={Plane}
            eyebrow="Leave the app"
            title="Away mining"
            description={`Normal mining pauses when you close the Mini App. Complete ${mining.ads.away.required} separately verified ads to keep it running for ${mining.awayMiningHours} hours.`}
            completed={mining.ads.away.completed}
            required={mining.ads.away.required}
            active={mining.ads.away.active}
            activeLabel={`Active · ${countdown(awayMs)} left`}
            note={
              mining.ads.away.active
                ? "Permission is stored on the server and expires automatically."
                : "One verified view counts once. Opening or clicking an ad never counts."
            }
            busy={adBusy === "away"}
            disabled={
              mining.ads.away.active ||
              !adsgramConfigured ||
              !mining.ads.providerReady
            }
            providerReady={adsgramConfigured && mining.ads.providerReady}
            onWatch={() => void watchAds("away")}
          />
          <AdUnlockCard
            icon={Megaphone}
            eyebrow="Beyond the daily cap"
            title={`${config.extensionHours}-hour extension`}
            description={`After reaching ${formatNex(config.dailyLimitNex)} NEX normal mining, complete ${mining.ads.extension.required} verified ads to unlock ${config.extensionHours} more hours. Extension NEX is recorded separately.`}
            completed={mining.ads.extension.completed}
            required={mining.ads.extension.required}
            active={mining.ads.extension.active}
            activeLabel={`Extension live · ${countdown(extensionMs)} left`}
            note={
              mining.ads.extension.active
                ? `${formatNex(mining.extensionMinedNex)} NEX extension earnings confirmed today.`
                : mining.ads.extension.unlockedToday
                  ? "Unlocked once today. The next extension becomes available after the next normal cap."
                  : mining.remainingTodayNex > 0
                    ? `Reach the normal cap first — ${formatNex(mining.remainingTodayNex)} NEX remaining.`
                    : "Unlock once per UTC day. The extension window starts immediately."
            }
            busy={adBusy === "extension"}
            disabled={
              mining.ads.extension.active ||
              !mining.ads.extension.eligible ||
              !adsgramConfigured ||
              !mining.ads.providerReady
            }
            providerReady={adsgramConfigured && mining.ads.providerReady}
            onWatch={() => void watchAds("extension")}
          />
        </div>
      </div>

      <div className="grid gap-3.5 lg:grid-cols-2">
        <Panel eyebrow="Speed composition" title="How your rate is built">
          <div className="space-y-3">
            <SpeedLine
              icon={Gauge}
              label="Base mining speed"
              value={speed.base}
              total={speed.total}
              note="Configured by the operator"
            />
            {speed.taskLines.length === 0 ? (
              <div className="rounded-sm border border-dashed border-border/70 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">
                  No task bonuses active yet.
                </p>
                <Link
                  to="/app/tasks"
                  className="mt-1 inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-primary"
                >
                  Complete a task <ArrowUpRight className="size-3" />
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
                  note={
                    line.active
                      ? `${line.sponsor} · active since ${formatDateTime(line.verifiedAt)}`
                      : `${line.sponsor} · campaign ended, bonus inactive`
                  }
                  muted={!line.active}
                />
              ))
            )}
            {speed.pendingLines.length > 0 ? (
              <div className="space-y-1.5 border-t border-dashed border-border/70 pt-2.5">
                <p className="label-xs">Pending upgrades</p>
                {speed.pendingLines.map((line) => (
                  <div
                    key={line.completionId}
                    className="flex items-center justify-between gap-2 rounded-sm border border-dashed border-warn/30 bg-warn/[0.03] px-2 py-1.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[10.5px] text-muted-foreground">
                        {line.title}
                      </p>
                      <p className="font-mono text-[8.5px] uppercase tracking-[0.06em] text-warn">
                        {line.status === "unavailable"
                          ? "verification unavailable"
                          : "awaiting verification"}{" "}
                        · submitted {formatDateTime(line.submittedAt)}
                      </p>
                    </div>
                    <span className="num shrink-0 text-[10px] text-warn">
                      +{formatNex(line.bonusNexPerHour)} pending
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            <SpeedLine
              icon={Users}
              label={`Referral bonuses · ${referrals.qualified} qualified`}
              value={speed.referralBonus}
              total={speed.total}
              note={`${formatNex(referrals.bonusNexPerHour)} NEX/h per qualified referral, capped at ${speed.referralBonusCap}`}
            />
            <SpeedLine
              icon={Trophy}
              label={`Level bonuses · L${speed.claimedLevel}`}
              value={speed.levelBonus}
              total={speed.total}
              note="Claimed level rewards raise the base rate permanently. XP alone adds nothing."
            />
            <div className="flex items-center justify-between border-t border-border/70 pt-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Total active rate
              </span>
              <span className="num text-sm font-semibold text-gold">
                {formatNex(speed.total)} NEX/h
              </span>
            </div>
            <p className="text-[9.5px] leading-relaxed text-muted-foreground">
              Total speed is hard-capped at 2× the base rate. Legacy task and
              referral bonuses cannot accelerate nano-NEX mining past that rail.
            </p>
          </div>
        </Panel>

        <Panel eyebrow="Mining rules" title="Caps & settlement">
          <div className="space-y-2.5">
            {[
              {
                label: "Base speed",
                value: `${formatNex(speed.base)} NEX/h`,
                icon: Gauge,
              },
              {
                label: "Task speed bonuses",
                value: `${formatNex(speed.taskBonus)} NEX/h`,
                icon: Layers,
              },
              {
                label: "Referral speed bonuses",
                value: `${formatNex(speed.referralBonus)} NEX/h`,
                icon: Users,
              },
              {
                label: "Level speed bonuses",
                value: `${formatNex(speed.levelBonus)} NEX/h`,
                icon: Trophy,
              },
              {
                label: "Daily cap (normal)",
                value: `${formatNex(config.dailyLimitNex)} NEX`,
                icon: Zap,
              },
              {
                label: "Extension bucket",
                value: `${formatNex(mining.extensionMinedNex)} NEX today`,
                icon: Megaphone,
              },
              {
                label: "Away permission",
                value: mining.awayMiningActive
                  ? `${countdown(awayMs)} left`
                  : `${mining.awayMiningHours} h after 10 ads`,
                icon: Plane,
              },
              {
                label: "Rate cap",
                value: `2× base · ${formatNex(speed.rateCapNexPerHour)} NEX/h`,
                icon: Gauge,
              },
              {
                label: "Reset",
                value: "00:00 UTC",
                icon: Clock,
              },
              {
                label: "Settlement",
                value: "Server-side only",
                icon: Activity,
              },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between border-b border-border/60 py-1.5 last:border-0"
              >
                <span className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                  <row.icon className="size-3.5" /> {row.label}
                </span>
                <span className="num text-[11px]">{row.value}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-sm border border-border/70 bg-panel/50 p-2.5">
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Rewards accrue only during a live, heartbeated session while the
              Mini App is open, unless away mining was unlocked with 10 verified
              ads. Normal earnings stop at 0.000006000 NEX per UTC day. The
              five-hour extension is a separate bucket and never raises the
              normal cap. Everything is settled from server time.
            </p>
          </div>
        </Panel>
      </div>

      <Panel
        eyebrow="Mining ledger"
        title="Settlement history"
        action={
          <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
            <History className="size-3" /> {miningHistory.length} entries
          </span>
        }
        bodyClassName="p-0"
      >
        {miningHistory.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Pickaxe className="size-4" />}
              title="No settlements yet"
              body="Your first confirmed accrual appears here after the backend credits a live mining session."
            />
          </div>
        ) : (
          <ul>
            {miningHistory.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-0"
              >
                <span className="flex size-7 items-center justify-center rounded-sm border border-border bg-secondary/50">
                  <Pickaxe className="size-3 text-primary" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11.5px] font-medium">
                    Mining settlement
                    <span className="ml-2 font-mono text-[9px] text-muted-foreground">
                      {entry.day}
                    </span>
                  </p>
                  <p className="num mt-0.5 text-[9px] text-muted-foreground">
                    {formatDateTime(entry.fromTs)} → {formatDateTime(entry.toTs)} ·{" "}
                    {formatNex(entry.rateNexPerHour)} NEX/h
                  </p>
                  <p className="num mt-0.5 text-[8.5px] text-muted-foreground">
                    normal {formatNex(entry.normalNex)} · extension{" "}
                    {formatNex(entry.extensionNex)}
                  </p>
                </div>
                <span className="num shrink-0 text-[12px] text-gold">
                  +{formatNex(entry.amountNex)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function AdUnlockCard({
  icon: Icon,
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
  providerReady,
  onWatch,
}: {
  icon: typeof Gauge;
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
  providerReady: boolean;
  onWatch: () => void;
}) {
  return (
    <Panel eyebrow={eyebrow} title={title}>
      <div className="flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-border bg-secondary/50 text-primary">
          <Icon className="size-4" />
        </span>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="mt-3 rounded-sm border border-border/70 bg-background/40 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
            {active ? activeLabel : "Verified ad progress"}
          </span>
          <span className="num text-[10px] text-foreground">
            {completed} / {required}
          </span>
        </div>
        <ProgressBar
          value={active ? required : completed}
          max={required}
          tone={active ? "gold" : "signal"}
          className="mt-1.5"
        />
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{note}</p>
      {!providerReady ? (
        <p className="mt-2 rounded-sm border border-warn/40 bg-warn/[0.04] px-2.5 py-1.5 text-[9.5px] leading-relaxed text-warn">
          Rewarded ads are not fully configured. Set VITE_ADSGRAM_BLOCK_ID on
          the frontend and ADSGRAM_REWARD_SECRET on the backend before enabling
          this unlock.
        </p>
      ) : null}
      <Button
        size="sm"
        onClick={onWatch}
        disabled={disabled || busy}
        className="mt-3 w-full gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em]"
      >
        {busy ? <Spinner /> : <Icon className="size-3.5" />}
        {busy
          ? "Waiting for verified ad"
          : active
            ? "Permission active"
            : `Watch verified ad · ${Math.min(completed + 1, required)}/${required}`}
      </Button>
    </Panel>
  );
}

function StatusLabel({
  status,
}: {
  status: "active" | "paused" | "limit" | "restricted";
}) {
  if (status === "active") return <StatusPill tone="up">Active</StatusPill>;
  if (status === "limit") return <StatusPill tone="warn">Daily limit</StatusPill>;
  if (status === "restricted") return <StatusPill tone="down">Restricted</StatusPill>;
  return <StatusPill tone="muted">Paused</StatusPill>;
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
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Icon
            className={cn(
              "mt-0.5 size-3.5 shrink-0",
              muted ? "text-muted-foreground" : "text-primary",
            )}
          />
          <div className="min-w-0">
            <p className="truncate text-[11.5px] font-medium">{label}</p>
            <p className="mt-0.5 text-[9.5px] leading-relaxed text-muted-foreground">
              {note}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "num shrink-0 text-[11px]",
            muted ? "text-muted-foreground" : "text-foreground",
          )}
        >
          +{formatNex(value)}
        </span>
      </div>
      <ProgressBar value={value} max={Math.max(total, 0.0001)} className="mt-1.5" />
    </div>
  );
}
