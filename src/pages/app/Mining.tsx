import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Clock,
  Gauge,
  History,
  Layers,
  Lock,
  Pickaxe,
  Timer,
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
import { useState } from "react";

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
  const tick = useTick(1000);
  const [settling, setSettling] = useState(false);

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
  const remainingMs = Math.max(
    0,
    mining.resetAt - (snapshot.serverNow + tick * 1000),
  );

  const settleNow = async () => {
    setSettling(true);
    try {
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
        body="Server-calculated accrual, capped per UTC day."
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
            </div>
            <div className="flex flex-col items-end gap-1.5">
              {active ? (
                <span className="flex items-center gap-1.5 rounded-sm border border-up/40 bg-up/10 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-up">
                  <span className="size-1.5 animate-signal-pulse rounded-full bg-up" />
                  accruing
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
              <p className="label-xs">Today&apos;s accrual</p>
              <p className="num text-[10px] text-muted-foreground">
                <LiveMined
                  key={snapshot.serverNow}
                  settledNex={mining.todayMinedNex}
                  ratePerHour={speed.total}
                  capNex={mining.todayLimitNex}
                  enabled={active}
                  className="text-foreground"
                />{" "}
                / {mining.todayLimitNex.toFixed(2)} NEX
              </p>
            </div>
            <ProgressBar
              value={mining.todayMinedNex}
              max={mining.todayLimitNex}
              tone={mining.status === "limit" ? "warn" : "signal"}
              className="mt-2"
            />
            <div className="mt-2.5 grid grid-cols-3 divide-x divide-border/70">
              <Metric
                label="Earned today"
                value={formatNex(mining.todayMinedNex)}
                sub="confirmed"
                tone="gold"
              />
              <Metric
                label="Remaining"
                value={formatNex(mining.remainingTodayNex)}
                sub="until cap"
                className="pl-3"
              />
              <Metric
                label="Daily cap"
                value={config.dailyLimitNex.toFixed(2)}
                sub="NEX / day"
                className="pl-3"
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
              onClick={settleNow}
              disabled={settling || !active}
              className="gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em]"
            >
              {settling ? <Spinner /> : <Pickaxe className="size-3.5" />}
              {settling ? "Settling" : "Settle accrual"}
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
                  : "Mining paused by the operator"}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {mining.status === "limit"
                ? `You have mined the full ${config.dailyLimitNex} NEX allowance for today. Accrual resumes automatically at 00:00 UTC in ${countdown(remainingMs)} — refreshing or changing your clock will not add NEX.`
                : mining.status === "restricted"
                  ? snapshot.account.restrictionReason ||
                    "Contact support. Accrual is frozen while the restriction is in place."
                  : "The mining engine is paused. Accrual restarts from the moment the operator re-enables it."}
            </p>
          </div>
        </div>
      ) : null}

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
            <div className="flex items-center justify-between border-t border-border/70 pt-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Total active rate
              </span>
              <span className="num text-sm font-semibold text-gold">
                {formatNex(speed.total)} NEX/h
              </span>
            </div>
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
                label: "Daily cap",
                value: `${config.dailyLimitNex} NEX`,
                icon: Zap,
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
              Rewards are accrued from the last confirmed server timestamp and the
              configured rate. The backend caps each UTC day; the live counter is
              display-only. There is no client-side reward calculation.
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
              body="Your first confirmed accrual appears here after the backend settles elapsed mining time."
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
