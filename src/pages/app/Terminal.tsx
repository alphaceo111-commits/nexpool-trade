import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "convex/react";
import {
  AreaChart,
  BarChart3,
  ChevronRight,
  Expand,
  Info,
  Minus,
  RotateCcw,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import {
  TERMINAL_TIMEFRAMES,
  TIMEFRAME_LABEL,
  type ChartCandle,
  type TerminalTimeframe,
} from "@/convex/terminalMath";
import { TerminalChart, type ChartMode, type IndicatorFlags } from "@/components/app/TerminalChart";
import { formatNex, formatUsd, Panel, StatusPill } from "@/components/app/parts";
import { cn } from "@/lib/utils";

type Prefs = {
  timeframe: TerminalTimeframe;
  mode: ChartMode;
  indicators: IndicatorFlags;
  expanded: boolean;
};

const DEFAULT_PREFS: Prefs = {
  timeframe: "1H",
  mode: "candles",
  indicators: {
    sma: false,
    ema: false,
    bands: false,
    volume: true,
    rsi: false,
    macd: false,
  },
  expanded: false,
};

const PREFS_KEY = "nexpool.terminal.v1";

/** The terminal is UTC end to end, so labels never disagree with the axis. */
function utcStamp(ts: number) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

const INDICATOR_LABELS: { key: keyof IndicatorFlags; label: string }[] = [
  { key: "volume", label: "VOL" },
  { key: "sma", label: "SMA 20" },
  { key: "ema", label: "EMA 20" },
  { key: "bands", label: "BOLL" },
  { key: "rsi", label: "RSI" },
  { key: "macd", label: "MACD" },
];

const MODES: { key: ChartMode; label: string; icon: typeof BarChart3 }[] = [
  { key: "candles", label: "Candles", icon: BarChart3 },
  { key: "balance", label: "Balance", icon: AreaChart },
  { key: "earnings", label: "Earnings", icon: TrendingUp },
];

function readPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      timeframe:
        parsed.timeframe && TERMINAL_TIMEFRAMES.includes(parsed.timeframe)
          ? parsed.timeframe
          : DEFAULT_PREFS.timeframe,
      mode:
        parsed.mode === "candles" || parsed.mode === "balance" || parsed.mode === "earnings"
          ? parsed.mode
          : DEFAULT_PREFS.mode,
      indicators: { ...DEFAULT_PREFS.indicators, ...(parsed.indicators ?? {}) },
      expanded: false,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function KindIcon({ kind }: { kind: string }) {
  if (kind === "withdrawal" || kind === "deposit") {
    return <Minus className="size-3" />;
  }
  return <TrendingUp className="size-3" />;
}

export default function Terminal() {
  const snapshot = useQuery(api.app.snapshot);
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const [hover, setHover] = useState<{
    candle: ChartCandle | null;
    time: number | null;
  }>({ candle: null, time: null });
  const [resetKey, setResetKey] = useState(0);

  const terminal = useQuery(api.terminal.data, { timeframe: prefs.timeframe });

  const update = (patch: Partial<Prefs>) =>
    setPrefs((current) => {
      const next = { ...current, ...patch };
      try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable: preferences simply do not persist */
      }
      return next;
    });

  const toggleIndicator = (key: keyof IndicatorFlags) =>
    update({
      indicators: { ...prefs.indicators, [key]: !prefs.indicators[key] },
    });

  useEffect(() => {
    if (!prefs.expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [prefs.expanded]);

  const candles = terminal?.candles ?? [];
  const last = candles.length ? candles[candles.length - 1] : null;
  const active = hover.candle ?? last;
  const activeTime = hover.candle ? hover.time : last?.t ?? null;

  const summary = terminal?.summary;
  const totalNex = snapshot?.balance.totalNex ?? terminal?.balance.totalNex ?? 0;
  const usd = totalNex * (terminal?.nexUsdRate ?? snapshot?.config.nexUsdRate ?? 0);
  const miningState = snapshot?.mining.state ?? "IDLE";
  const miningActive =
    miningState === "ACTIVE" || miningState === "BACKGROUND_ACTIVE";

  const showOscillator = prefs.indicators.rsi || prefs.indicators.macd;
  const windowLabel = useMemo(
    () => TIMEFRAME_LABEL[prefs.timeframe],
    [prefs.timeframe],
  );

  const rewardRows = (terminal?.byKind ?? []).filter((row) => row.amountNex > 0);
  const rewardMax = rewardRows.reduce(
    (max, row) => Math.max(max, row.amountNex),
    0,
  );
  const debitRows = (terminal?.byKind ?? []).filter((row) => row.amountNex < 0);

  const chartBlock = (
    <div
      className={cn(
        "premium-card relative flex flex-col overflow-hidden rounded-3xl",
        prefs.expanded
          ? "fixed inset-0 z-50 rounded-none border-0 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          : "p-3 sm:p-4",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="relative flex size-1.5 shrink-0 rounded-full bg-up">
            <span className="absolute inset-0 animate-ping rounded-full bg-up/60" />
          </span>
          <p className="truncate font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-foreground/90">
            NEX / Mining rewards
          </p>
          <span className="rounded-md border border-border/60 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">
            {prefs.timeframe}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex items-center rounded-lg border border-border/60 p-0.5">
            {MODES.map((entry) => {
              const Icon = entry.icon;
              const isActive = prefs.mode === entry.key;
              return (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => update({ mode: entry.key })}
                  aria-pressed={isActive}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.06em] transition-colors",
                    isActive
                      ? "bg-white/[0.09] text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-3" />
                  <span className="hidden sm:inline">{entry.label}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setResetKey((key) => key + 1)}
            aria-label="Reset zoom"
            className="flex size-7 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => update({ expanded: !prefs.expanded })}
            aria-label={prefs.expanded ? "Close expanded chart" : "Expand chart"}
            className="flex size-7 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:text-foreground"
          >
            {prefs.expanded ? <X className="size-3.5" /> : <Expand className="size-3.5" />}
          </button>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-y border-border/45 py-1.5 font-mono text-[9.5px] sm:grid-cols-5">
        <Readout label="O" value={active?.open} />
        <Readout label="H" value={active?.high} />
        <Readout label="L" value={active?.low} />
        <Readout label="C" value={active?.close} emphasis />
        <div className="flex items-center justify-between gap-2 sm:justify-start">
          <span className="text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground">
            Δ
          </span>
          <span
            className={cn(
              "num text-[10px] font-semibold",
              (active?.close ?? 0) >= (active?.open ?? 0) ? "text-up" : "text-down",
            )}
          >
            {(active?.close ?? 0) >= (active?.open ?? 0) ? "+" : "−"}
            {formatNex(Math.abs((active?.close ?? 0) - (active?.open ?? 0)))}
          </span>
        </div>
      </div>

      <div
        className={cn(
          "mt-1",
          prefs.expanded ? "min-h-0 flex-1" : "h-[286px] sm:h-[360px]",
        )}
      >
        <TerminalChart
          candles={candles}
          mode={prefs.mode}
          indicators={prefs.indicators}
          frameKey={prefs.timeframe}
          resetKey={resetKey}
          showOscillator={showOscillator}
          onHover={setHover}
        />
      </div>

      <div className="mt-2 flex items-center gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TERMINAL_TIMEFRAMES.map((timeframe) => (
          <button
            key={timeframe}
            type="button"
            onClick={() => update({ timeframe })}
            aria-pressed={prefs.timeframe === timeframe}
            className={cn(
              "shrink-0 rounded-lg border px-2.5 py-1 font-mono text-[10px] font-semibold transition-colors",
              prefs.timeframe === timeframe
                ? "border-gold/45 bg-gold/12 text-gold"
                : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            {timeframe}
          </button>
        ))}
        <span className="ml-auto hidden shrink-0 pl-2 font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground/70 sm:block">
          UTC
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {INDICATOR_LABELS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => toggleIndicator(entry.key)}
            aria-pressed={prefs.indicators[entry.key]}
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.06em] transition-colors",
              prefs.indicators[entry.key]
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/50 text-muted-foreground/80 hover:text-foreground",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {!terminal ? (
        <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
          Loading confirmed ledger…
        </p>
      ) : terminal.summary.movements === 0 ? (
        <p className="mt-2 flex items-center gap-1.5 text-[9.5px] text-muted-foreground">
          <Info className="size-3 shrink-0" />
          No confirmed movements in this window. Flat candles mean the balance
          genuinely did not move.
        </p>
      ) : (
        <p className="mt-2 font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground/80">
          {windowLabel} · {terminal.summary.movements} movements ·{" "}
          {activeTime ? `UTC ${utcStamp(activeTime)}` : "—"}
        </p>
      )}

    </div>
  );

  return (
    <div className="space-y-5">
      <section className="premium-card card-sheen relative overflow-hidden rounded-3xl p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-gold/[0.08] blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.28em] text-gold/90">
              NEXPOOL Terminal
            </p>
            <h1 className="mt-1.5 text-[13px] font-medium uppercase tracking-[0.2em] text-foreground/85">
              Mining analytics
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full border border-up/30 bg-up/10 px-2 py-1 font-mono text-[8.5px] font-semibold uppercase tracking-[0.12em] text-up">
              <span className="size-1.5 rounded-full bg-up" /> Live data
            </span>
            <StatusPill
              tone={miningActive ? "up" : miningState === "CAP_REACHED" ? "gold" : "muted"}
            >
              {miningActive ? "Mining active" : miningState.replace("_", " ")}
            </StatusPill>
          </div>
        </div>

        <div className="relative mt-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label-xs">Total confirmed NEX</p>
            <p className="num gold-ink mt-1.5 text-[36px] font-semibold leading-none tracking-[-0.05em] sm:text-[46px]">
              {formatNex(totalNex)}
            </p>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Backend ledger balance · ≈ {formatUsd(usd)} target value
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 sm:gap-6">
            <SmallStat
              label="Window change"
              value={
                summary
                  ? `${summary.change >= 0 ? "+" : "−"}${formatNex(Math.abs(summary.change))}`
                  : "—"
              }
              tone={summary && summary.change < 0 ? "down" : "up"}
            />
            <SmallStat
              label="Credits"
              value={summary ? formatNex(summary.credits) : "—"}
            />
            <SmallStat
              label="Debits"
              value={summary ? formatNex(summary.debits) : "—"}
            />
          </div>
        </div>
      </section>

      {chartBlock}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          eyebrow="Mining performance"
          title="Confirmed earnings"
          action={
            <span className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground">
              ledger based
            </span>
          }
        >
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="label-xs">Today</p>
              <p className="num mt-1 text-[24px] font-semibold text-gold">
                +{formatNex(terminal?.today.minedNex ?? 0)}
              </p>
              <p className="mt-1 text-[9.5px] text-muted-foreground">
                of {formatNex(terminal?.today.limitNex ?? 0)} NEX normal allowance
              </p>
            </div>
            <div className="text-right">
              <p className="label-xs">Window net</p>
              <p
                className={cn(
                  "num mt-1 text-[15px] font-semibold",
                  (summary?.change ?? 0) < 0 ? "text-down" : "text-up",
                )}
              >
                {summary
                  ? `${summary.change >= 0 ? "+" : "−"}${formatNex(Math.abs(summary.change))}`
                  : "—"}
              </p>
              <p className="mt-1 text-[9px] text-muted-foreground">
                {prefs.timeframe} · {windowLabel}
              </p>
            </div>
          </div>
          <CapBar
            mined={terminal?.today.minedNex ?? 0}
            limit={terminal?.today.limitNex ?? 0}
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MiniStat
              label="Highest balance"
              value={summary ? formatNex(summary.highest) : "—"}
            />
            <MiniStat
              label="Lowest balance"
              value={summary ? formatNex(summary.lowest) : "—"}
            />
            <MiniStat
              label="Ledger movements"
              value={String(summary?.movements ?? 0)}
            />
            <MiniStat
              label="Active intervals"
              value={`${summary?.activeBuckets ?? 0} / ${candles.length}`}
            />
          </div>
        </Panel>

        <Panel
          eyebrow="Mining activity"
          title="Session history"
          action={
            <span className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground">
              settlements
            </span>
          }
          bodyClassName="p-0"
        >
          {terminal && terminal.sessions.length > 0 ? (
            <ul className="divide-y divide-border/50">
              {terminal.sessions.slice(0, 5).map((session) => (
                <li key={session.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="flex size-7 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                    <TrendingUp className="size-3" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[9.5px] text-foreground/90">
                      {utcStamp(session.fromTs)} →{" "}
                      {new Date(session.toTs).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                        timeZone: "UTC",
                      })}
                    </p>
                    <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.06em] text-muted-foreground">
                      {session.day} UTC · {formatNex(session.rateNexPerHour)} NEX/h
                      {session.extensionNex > 0 ? " · extension" : ""}
                    </p>
                  </div>
                  <span className="num text-[11px] font-semibold text-up">
                    +{formatNex(session.amountNex)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-5 py-6 text-center">
              <p className="text-[11.5px] font-medium">No settled sessions yet</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Settlement windows appear here once the backend confirms mining.
              </p>
            </div>
          )}
          {terminal && terminal.extensionSessions.length > 0 ? (
            <div className="border-t border-border/50 px-5 py-2.5">
              <p className="label-xs">Extra sessions</p>
              <div className="mt-1.5 space-y-1">
                {terminal.extensionSessions.slice(0, 3).map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between gap-2 font-mono text-[9px]"
                  >
                    <span className="uppercase tracking-[0.06em] text-muted-foreground">
                      {row.status} · {row.extensionHours}h
                    </span>
                    <span className="text-foreground/80">
                      {row.startedAt
                        ? utcStamp(row.startedAt)
                        : row.grantedAt
                          ? `${utcStamp(row.grantedAt)} granted`
                          : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Panel>

        <Panel
          eyebrow="Reward distribution"
          title="Reward sources"
          action={
            <span className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground">
              selected window
            </span>
          }
        >
          <div className="mb-3 grid grid-cols-3 gap-2">
            <MiniStat
              label="Mining"
              value={formatNex(snapshot?.balance.lifetimeMinedNex ?? 0)}
              hint="lifetime"
            />
            <MiniStat
              label="Tasks"
              value={formatNex(snapshot?.balance.lifetimeTaskNex ?? 0)}
              hint="lifetime"
            />
            <MiniStat
              label="Ads"
              value={formatNex(snapshot?.balance.lifetimeAdNex ?? 0)}
              hint="lifetime"
            />
          </div>
          {rewardRows.length === 0 ? (
            <p className="rounded-xl border border-border/50 bg-white/[0.014] px-3 py-3 text-[10.5px] leading-relaxed text-muted-foreground">
              No confirmed credits in this window. Widen the timeframe to see
              earlier rewards.
            </p>
          ) : (
            <ul className="space-y-2">
              {rewardRows.map((row) => (
                <li key={row.kind}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[10.5px] font-medium">
                      <KindIcon kind={row.kind} />
                      {row.label}
                    </span>
                    <span className="num text-[10.5px] font-semibold text-up">
                      +{formatNex(row.amountNex)}
                    </span>
                  </div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/[0.05]">
                    <div
                      className="h-full rounded-full bg-gold/70"
                      style={{
                        width: `${rewardMax > 0 ? Math.max(3, (row.amountNex / rewardMax) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {debitRows.length > 0 ? (
            <div className="mt-3 border-t border-border/50 pt-2">
              {debitRows.map((row) => (
                <div key={row.kind} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                    <TrendingDown className="size-3" />
                    {row.label}
                  </span>
                  <span className="num text-[10.5px] font-semibold text-down">
                    −{formatNex(Math.abs(row.amountNex))}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </Panel>

        <Panel
          eyebrow="Account balance history"
          title="Ledger history"
          action={
            <Link
              to="/app/history"
              className="flex items-center gap-1 text-[10px] font-semibold text-primary"
            >
              All <ChevronRight className="size-3" />
            </Link>
          }
          bodyClassName="p-0"
        >
          {terminal && terminal.recent.length > 0 ? (
            <ul className="divide-y divide-border/50">
              {terminal.recent.slice(0, 7).map((row) => (
                <li key={row.id} className="flex items-center gap-2.5 px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10.5px] font-medium">{row.memo}</p>
                    <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.06em] text-muted-foreground">
                      {row.kind} · {utcStamp(row.createdAt)} UTC
                    </p>
                  </div>
                  <span
                    className={cn(
                      "num shrink-0 text-[10.5px] font-semibold",
                      row.amountNex >= 0 ? "text-up" : "text-down",
                    )}
                  >
                    {row.amountNex >= 0 ? "+" : "−"}
                    {formatNex(Math.abs(row.amountNex))}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-5 py-6 text-center">
              <p className="text-[11.5px] font-medium">No ledger movements yet</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Confirmed credits and debits appear here with their source.
              </p>
            </div>
          )}
        </Panel>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-white/[0.018] px-4 py-3.5">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-[10.5px] leading-relaxed text-muted-foreground">
          Every candle is aggregated from this account&apos;s confirmed ledger
          entries in UTC. NEX has no market price and no order book: these
          candles describe your own balance history, not trading activity. The
          chart never invents data — a flat interval means the balance did not
          move.
        </p>
      </div>
    </div>
  );
}

function Readout({
  label,
  value,
  emphasis,
}: {
  label: string;
  value?: number;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 sm:justify-start">
      <span className="text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "num text-[10px]",
          emphasis ? "font-semibold text-gold" : "text-foreground/85",
        )}
      >
        {value === undefined ? "—" : formatNex(value)}
      </span>
    </div>
  );
}

function SmallStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div>
      <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "num mt-1 text-[14px] font-semibold",
          tone === "down" ? "text-down" : tone === "up" ? "text-up" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-white/[0.014] px-2.5 py-2">
      <p className="font-mono text-[7.5px] uppercase tracking-[0.09em] text-muted-foreground">
        {label}
      </p>
      <p className="num mt-1 truncate text-[11px] font-semibold">{value}</p>
      {hint ? (
        <p className="mt-0.5 font-mono text-[7px] uppercase tracking-[0.08em] text-muted-foreground/60">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function CapBar({ mined, limit }: { mined: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, (mined / limit) * 100) : 0;
  return (
    <div className="mt-3">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-gold/60 to-gold transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between font-mono text-[8px] uppercase tracking-[0.08em] text-muted-foreground">
        <span>{Math.round(pct)}% of daily allowance</span>
        <span>UTC reset</span>
      </div>
    </div>
  );
}
