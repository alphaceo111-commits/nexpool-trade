import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
import {
  TerminalChart,
  type ChartMode,
  type IndicatorFlags,
} from "@/components/app/TerminalChart";
import { formatNex, formatUsd, StatusPill } from "@/components/app/parts";
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

function utcClock(ts: number) {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

const INDICATOR_LABELS: { key: keyof IndicatorFlags; label: string }[] = [
  { key: "volume", label: "Volume" },
  { key: "sma", label: "SMA 20" },
  { key: "ema", label: "EMA 20" },
  { key: "bands", label: "Bollinger" },
  { key: "rsi", label: "RSI 14" },
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
        parsed.mode === "candles" ||
        parsed.mode === "balance" ||
        parsed.mode === "earnings"
          ? parsed.mode
          : DEFAULT_PREFS.mode,
      indicators: { ...DEFAULT_PREFS.indicators, ...(parsed.indicators ?? {}) },
      expanded: false,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/**
 * Presentation-only tween for the confirmed balance. It never adds value: it
 * interpolates between two balances the ledger already confirmed, so the number
 * cannot imply an unconfirmed reward.
 */
function useTweenedNex(target: number) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);

  useEffect(() => {
    const from = fromRef.current;
    if (!Number.isFinite(target) || from === target) return;
    let frame = 0;
    const started = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / 420);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(from + (target - from) * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
      }
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      fromRef.current = target;
    };
  }, [target]);

  return value;
}

/** Marks the moment a confirmed credit lands, without implying anything else. */
function useSettlePulse(total: number) {
  const previous = useRef(total);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (total > previous.current + 1e-12) {
      setPulse(true);
      const id = window.setTimeout(() => setPulse(false), 1600);
      previous.current = total;
      return () => window.clearTimeout(id);
    }
    previous.current = total;
    return undefined;
  }, [total]);

  return pulse;
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
  const tweened = useTweenedNex(totalNex);
  const pulse = useSettlePulse(totalNex);
  const usd = totalNex * (terminal?.nexUsdRate ?? snapshot?.config.nexUsdRate ?? 0);
  const miningState = snapshot?.mining.state ?? "IDLE";
  const miningActive =
    miningState === "ACTIVE" || miningState === "BACKGROUND_ACTIVE";

  const showOscillator = prefs.indicators.rsi || prefs.indicators.macd;
  const windowLabel = useMemo(
    () => TIMEFRAME_LABEL[prefs.timeframe],
    [prefs.timeframe],
  );

  const delta =
    active === null || active === undefined ? 0 : active.close - active.open;
  const windowChange = summary?.change ?? 0;

  const rewardRows = (terminal?.byKind ?? []).filter((row) => row.amountNex > 0);
  const rewardMax = rewardRows.reduce(
    (max, row) => Math.max(max, row.amountNex),
    0,
  );
  const debitRows = (terminal?.byKind ?? []).filter((row) => row.amountNex < 0);

  const overlays = [
    prefs.indicators.sma ? { label: "SMA 20", tone: "text-gold/85" } : null,
    prefs.indicators.ema ? { label: "EMA 20", tone: "text-[#7aa2f7]" } : null,
    prefs.indicators.bands
      ? { label: "BOLL 20 · 2", tone: "text-gold/55" }
      : null,
  ].filter(Boolean) as { label: string; tone: string }[];

  const timeframeRow = (
    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {TERMINAL_TIMEFRAMES.map((timeframe) => {
        const isActive = prefs.timeframe === timeframe;
        return (
          <button
            key={timeframe}
            type="button"
            onClick={() => update({ timeframe })}
            aria-pressed={isActive}
            className={cn(
              "relative shrink-0 px-2 py-[7px] font-mono text-[10px] font-semibold tracking-[0.02em] transition-colors",
              isActive
                ? "text-gold"
                : "text-muted-foreground hover:text-foreground/90",
            )}
          >
            {timeframe}
            <span
              className={cn(
                "absolute inset-x-1.5 -bottom-px h-px transition-opacity",
                isActive ? "bg-gold opacity-100" : "opacity-0",
              )}
            />
          </button>
        );
      })}
    </div>
  );

  const modeRow = (
    <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border/60 bg-white/[0.02] p-0.5">
      {MODES.map((entry) => {
        const Icon = entry.icon;
        const isActive = prefs.mode === entry.key;
        return (
          <button
            key={entry.key}
            type="button"
            onClick={() => update({ mode: entry.key })}
            aria-pressed={isActive}
            aria-label={entry.label}
            title={entry.label}
            className={cn(
              "flex items-center gap-1 rounded-md px-[7px] py-[5px] text-[9px] font-semibold uppercase tracking-[0.05em] transition-colors",
              isActive
                ? "bg-gold/[0.12] text-gold"
                : "text-muted-foreground/80 hover:text-foreground",
            )}
          >
            <Icon className="size-3" />
            <span className={prefs.expanded ? "hidden" : "hidden sm:inline"}>
              {entry.label}
            </span>
          </button>
        );
      })}
    </div>
  );

  const indicatorRow = (
    <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {INDICATOR_LABELS.map((entry) => {
        const on = prefs.indicators[entry.key];
        return (
          <button
            key={entry.key}
            type="button"
            onClick={() => toggleIndicator(entry.key)}
            aria-pressed={on}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-md border px-1.5 py-1 font-mono text-[8.5px] uppercase tracking-[0.06em] transition-colors",
              on
                ? "border-gold/35 bg-gold/[0.07] text-gold"
                : "border-border/50 text-muted-foreground/75 hover:border-border hover:text-foreground/90",
            )}
          >
            <span
              className={cn(
                "size-1 rounded-full",
                on ? "bg-gold" : "bg-muted-foreground/40",
              )}
            />
            {entry.label}
          </button>
        );
      })}
    </div>
  );

  const workspace = (
    <div
      className={cn(
        "premium-card relative flex flex-col overflow-hidden",
        prefs.expanded
          ? "fixed inset-0 z-[60] rounded-none border-0 bg-background px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4"
          : "rounded-2xl",
      )}
    >
      {/* Instrument bar */}
      <div
        className={cn(
          "flex items-center gap-2 border-b border-border/50 px-3 sm:px-4",
          prefs.expanded ? "h-10" : "h-11",
        )}
      >
        <span className="relative flex size-1.5 shrink-0 rounded-full bg-up">
          <span className="absolute inset-0 animate-ping rounded-full bg-up/50" />
        </span>
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="font-mono text-[10.5px] font-bold tracking-[0.12em] text-foreground">
            NEX
          </span>
          <span className="truncate font-mono text-[8px] uppercase tracking-[0.14em] text-muted-foreground">
            confirmed balance
          </span>
        </div>
        <span className="ml-1 hidden shrink-0 rounded border border-border/60 px-1 py-px font-mono text-[8px] uppercase tracking-[0.1em] text-muted-foreground sm:inline">
          UTC
        </span>
        {prefs.expanded ? (
          <span className="ml-auto flex items-baseline gap-1.5 pr-1">
            <span className="num text-[13px] font-semibold text-gold">
              {formatNex(totalNex)}
            </span>
            <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-muted-foreground">
              NEX
            </span>
          </span>
        ) : (
          <span className="ml-auto flex items-center gap-1.5">
            <span
              className={cn(
                "hidden font-mono text-[8px] uppercase tracking-[0.1em] sm:inline",
                windowChange < 0 ? "text-down" : "text-up",
              )}
            >
              {summary
                ? `${windowChange >= 0 ? "▲" : "▼"} ${formatNex(Math.abs(windowChange))}`
                : "—"}
            </span>
            <StatusPill tone={miningActive ? "up" : "muted"}>
              {miningActive ? "Mining" : miningState.replace("_", " ")}
            </StatusPill>
          </span>
        )}
        <div className="flex shrink-0 items-center gap-1 pl-1">
          <button
            type="button"
            onClick={() => setResetKey((key) => key + 1)}
            aria-label="Reset zoom"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
          >
            <RotateCcw className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => update({ expanded: !prefs.expanded })}
            aria-label={prefs.expanded ? "Close expanded chart" : "Expand chart"}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
          >
            {prefs.expanded ? (
              <X className="size-4" />
            ) : (
              <Expand className="size-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Portfolio strip — the primary number, then the position at a glance */}
      <div
        className={cn(
          "relative px-3 sm:px-4",
          prefs.expanded ? "py-2" : "py-3.5 sm:py-4",
        )}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(120%_100%_at_0%_0%,color-mix(in_oklab,var(--gold)_8%,transparent),transparent_70%)]" />
        <div className="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <p
                className={cn(
                  "num gold-ink font-semibold leading-none tracking-[-0.045em] transition-all duration-500",
                  prefs.expanded
                    ? "text-[24px]"
                    : "text-[34px] sm:text-[42px]",
                  pulse && "drop-shadow-[0_0_18px_color-mix(in_oklab,var(--gold)_45%,transparent)]",
                )}
              >
                {formatNex(prefs.expanded ? totalNex : tweened)}
              </p>
              <span className="pb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-gold/70">
                NEX
              </span>
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-muted-foreground">
              <span className="font-mono uppercase tracking-[0.08em]">
                Ledger balance
              </span>
              <span className="text-border">/</span>
              <span>≈ {formatUsd(usd)} target value</span>
            </p>
          </div>

          {prefs.expanded ? (
            <div className="flex items-center gap-4 font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground">
              <span className={windowChange < 0 ? "text-down" : "text-up"}>
                window {windowChange >= 0 ? "+" : "−"}
                {formatNex(Math.abs(windowChange))}
              </span>
              <span>{windowLabel}</span>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-x-4 gap-y-1 sm:gap-x-7">
              <Figure
                label="Window Δ"
                value={`${windowChange >= 0 ? "+" : "−"}${formatNex(Math.abs(windowChange))}`}
                tone={windowChange < 0 ? "down" : "up"}
              />
              <Figure
                label="Today"
                value={`+${formatNex(terminal?.today.minedNex ?? 0)}`}
                tone="gold"
              />
              <Figure
                label="Credits"
                value={formatNex(summary?.credits ?? 0)}
              />
              <Figure label="Debits" value={formatNex(summary?.debits ?? 0)} />
            </div>
          )}
        </div>
      </div>

      {/* Chart toolbar: timeframes on the left, chart type on the right */}
      <div
        className={cn(
          "flex items-center gap-2 border-t border-border/45 px-3 sm:px-4",
          prefs.expanded ? "py-0" : "py-0.5",
        )}
      >
        {timeframeRow}
        <span className="ml-auto" />
        {modeRow}
      </div>

      {/* OHLC tape */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-border/45 bg-white/[0.012] px-3 py-1.5 font-mono text-[9.5px] sm:px-4">
        <Quote label="O" value={active?.open} />
        <Quote label="H" value={active?.high} />
        <Quote label="L" value={active?.low} />
        <Quote label="C" value={active?.close} emphasis />
        <span className="flex items-center gap-1">
          <span className="text-[8px] uppercase tracking-[0.1em] text-muted-foreground">
            Δ
          </span>
          <span
            className={cn(
              "num text-[10px] font-semibold",
              delta >= 0 ? "text-up" : "text-down",
            )}
          >
            {delta >= 0 ? "+" : "−"}
            {formatNex(Math.abs(delta))}
          </span>
        </span>
        <span className="ml-auto whitespace-nowrap text-[8px] uppercase tracking-[0.1em] text-muted-foreground/80">
          {activeTime ? `UTC ${utcStamp(activeTime)}` : "—"}
        </span>
      </div>

      {/* Chart surface */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="pointer-events-none absolute left-2 top-1.5 z-10 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[8px] uppercase tracking-[0.08em]">
          <span className="text-gold/90">NEX</span>
          <span className="text-muted-foreground/70">{prefs.timeframe}</span>
          {overlays.map((row) => (
            <span key={row.label} className={row.tone}>
              {row.label}
            </span>
          ))}
        </div>
        <div
          className={cn(
            "px-1 pb-1",
            prefs.expanded
              ? "min-h-0 flex-1"
              : showOscillator
                ? "h-[372px] sm:h-[452px]"
                : "h-[300px] sm:h-[390px]",
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
            balance={totalNex}
          />
        </div>
        {!terminal ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-[1px]">
            <p className="animate-pulse font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
              Loading confirmed ledger
            </p>
          </div>
        ) : null}
      </div>

      {/* Indicator rack + status line */}
      <div className="border-t border-border/45 px-3 py-1.5 sm:px-4">
        {indicatorRow}
      </div>
      <div className="flex items-center gap-2 border-t border-border/45 px-3 py-1.5 sm:px-4">
        {terminal && terminal.summary.movements === 0 ? (
          <p className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
            <Info className="size-3 shrink-0" />
            No confirmed movements in this window.
          </p>
        ) : (
          <p className="font-mono text-[8px] uppercase tracking-[0.08em] text-muted-foreground/80">
            {windowLabel} · {terminal?.summary.movements ?? 0} movements · zero
            activity intervals stay flat
          </p>
        )}
        <span className="ml-auto font-mono text-[8px] uppercase tracking-[0.1em] text-muted-foreground/60">
          {prefs.expanded ? "Full screen" : "NEXPOOL terminal"}
        </span>
      </div>
    </div>
  );

  return (
    <div className={cn(prefs.expanded ? "" : "space-y-3.5")}>
      {prefs.expanded ? null : (
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[8.5px] font-semibold uppercase tracking-[0.3em] text-gold/85">
              NEXPOOL Terminal
            </p>
            <h1 className="mt-1 text-[12px] font-medium uppercase tracking-[0.16em] text-foreground/70">
              Mining analytics
            </h1>
          </div>
          <span className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.12em] text-up">
            <span className="size-1.5 rounded-full bg-up" />
            Live ledger
          </span>
        </div>
      )}

      {workspace}

      {prefs.expanded ? null : (
        <>
          <div className="premium-card overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-2.5">
              <div className="flex items-baseline gap-2">
                <p className="font-mono text-[8px] uppercase tracking-[0.22em] text-gold/80">
                  Analytics
                </p>
                <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-muted-foreground">
                  {prefs.timeframe} · selected window
                </span>
              </div>
              <Link
                to="/app/history"
                className="flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:text-gold"
              >
                Ledger <ChevronRight className="size-3" />
              </Link>
            </div>

            <div className="grid divide-y divide-border/50 md:grid-cols-2 md:divide-y-0">
              <DeckSection
                eyebrow="Mining performance"
                title="Confirmed earnings"
                className="md:border-r md:border-b md:border-border/50"
                action={
                  <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-muted-foreground">
                    ledger based
                  </span>
                }
              >
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-muted-foreground">
                      Today
                    </p>
                    <p className="num mt-1 text-[26px] font-semibold leading-none text-gold">
                      +{formatNex(terminal?.today.minedNex ?? 0)}
                    </p>
                    <p className="mt-1 text-[9.5px] text-muted-foreground">
                      of {formatNex(terminal?.today.limitNex ?? 0)} NEX normal
                      allowance
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-muted-foreground">
                      Window net
                    </p>
                    <p
                      className={cn(
                        "num mt-1 text-[16px] font-semibold",
                        windowChange < 0 ? "text-down" : "text-up",
                      )}
                    >
                      {windowChange >= 0 ? "+" : "−"}
                      {formatNex(Math.abs(windowChange))}
                    </p>
                    <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.08em] text-muted-foreground">
                      {prefs.timeframe} · {windowLabel}
                    </p>
                  </div>
                </div>
                <CapBar
                  mined={terminal?.today.minedNex ?? 0}
                  limit={terminal?.today.limitNex ?? 0}
                />
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MiniStat
                    label="Highest"
                    value={summary ? formatNex(summary.highest) : "—"}
                  />
                  <MiniStat
                    label="Lowest"
                    value={summary ? formatNex(summary.lowest) : "—"}
                  />
                  <MiniStat
                    label="Movements"
                    value={String(summary?.movements ?? 0)}
                  />
                  <MiniStat
                    label="Active"
                    value={`${summary?.activeBuckets ?? 0}/${candles.length}`}
                  />
                </div>
              </DeckSection>

              <DeckSection
                eyebrow="Mining activity"
                title="Session history"
                className="md:border-b md:border-border/50"
                bodyClassName="mt-2"
                action={
                  <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-muted-foreground">
                    settlements
                  </span>
                }
              >
                {terminal && terminal.sessions.length > 0 ? (
                  <ul className="-mx-1 divide-y divide-border/40">
                    {terminal.sessions.slice(0, 4).map((session) => (
                      <li
                        key={session.id}
                        className="flex items-center gap-2.5 px-1 py-2"
                      >
                        <span className="flex size-6 items-center justify-center rounded-md border border-up/20 bg-up/[0.08] text-up">
                          <TrendingUp className="size-3" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-mono text-[9.5px] text-foreground/90">
                            {utcClock(session.fromTs)} → {utcClock(session.toTs)}
                          </p>
                          <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.06em] text-muted-foreground">
                            {session.day} UTC ·{" "}
                            {formatNex(session.rateNexPerHour)} NEX/h
                            {session.extensionNex > 0 ? " · extension" : ""}
                          </p>
                        </div>
                        <span className="num text-[10.5px] font-semibold text-up">
                          +{formatNex(session.amountNex)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="py-5 text-center">
                    <p className="text-[11.5px] font-medium">
                      No settled sessions yet
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Settlement windows appear once the backend confirms mining.
                    </p>
                  </div>
                )}
                {terminal && terminal.extensionSessions.length > 0 ? (
                  <div className="mt-2 space-y-1 border-t border-border/40 pt-2">
                    {terminal.extensionSessions.slice(0, 2).map((row) => (
                      <div
                        key={row.id}
                        className="flex items-center justify-between gap-2 font-mono text-[8.5px]"
                      >
                        <span className="uppercase tracking-[0.06em] text-muted-foreground">
                          {row.status} · {row.extensionHours}h
                        </span>
                        <span className="text-foreground/75">
                          {row.startedAt
                            ? utcStamp(row.startedAt)
                            : row.grantedAt
                              ? `${utcStamp(row.grantedAt)} granted`
                              : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </DeckSection>

              <DeckSection
                eyebrow="Reward distribution"
                title="Reward sources"
                className="md:border-t md:border-r md:border-border/50"
                action={
                  <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-muted-foreground">
                    lifetime
                  </span>
                }
              >
                <div className="mb-3 grid grid-cols-3 gap-2">
                  <MiniStat
                    label="Mining"
                    value={formatNex(snapshot?.balance.lifetimeMinedNex ?? 0)}
                  />
                  <MiniStat
                    label="Tasks"
                    value={formatNex(snapshot?.balance.lifetimeTaskNex ?? 0)}
                  />
                  <MiniStat
                    label="Ads"
                    value={formatNex(snapshot?.balance.lifetimeAdNex ?? 0)}
                  />
                </div>
                {rewardRows.length === 0 ? (
                  <p className="rounded-lg border border-border/40 px-3 py-3 text-[10.5px] leading-relaxed text-muted-foreground">
                    No confirmed credits in this window. Widen the timeframe to
                    see earlier rewards.
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
                        <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.045]">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-gold/40 to-gold/85"
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
                  <div className="mt-3 space-y-1 border-t border-border/40 pt-2">
                    {debitRows.map((row) => (
                      <div
                        key={row.kind}
                        className="flex items-center justify-between gap-2"
                      >
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
              </DeckSection>

              <DeckSection
                eyebrow="Account balance history"
                title="Ledger history"
                className="md:border-t md:border-border/50"
                action={
                  <Link
                    to="/app/history"
                    className="flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:text-gold"
                  >
                    All <ChevronRight className="size-3" />
                  </Link>
                }
              >
                {terminal && terminal.recent.length > 0 ? (
                  <ul className="-mx-1 divide-y divide-border/40">
                    {terminal.recent.slice(0, 5).map((row) => (
                      <li
                        key={row.id}
                        className="flex items-center gap-2.5 px-1 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[10.5px] font-medium">
                            {row.memo}
                          </p>
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
                  <div className="py-5 text-center">
                    <p className="text-[11.5px] font-medium">
                      No ledger movements yet
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Confirmed credits and debits appear here with their source.
                    </p>
                  </div>
                )}
              </DeckSection>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-border/50 px-4 py-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-gold/80" />
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Every candle aggregates this account&apos;s confirmed ledger
              entries on UTC boundaries. NEX has no market price and no order
              book: these candles describe your own balance history, not trading
              activity. Flat intervals mean the balance genuinely did not move.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function Quote({
  label,
  value,
  emphasis,
}: {
  label: string;
  value?: number;
  emphasis?: boolean;
}) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-[8px] uppercase tracking-[0.1em] text-muted-foreground">
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
    </span>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down" | "gold";
}) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[7.5px] uppercase tracking-[0.1em] text-muted-foreground/80">
        {label}
      </p>
      <p
        className={cn(
          "num mt-0.5 truncate text-[12px] font-semibold sm:text-[13px]",
          tone === "down"
            ? "text-down"
            : tone === "up"
              ? "text-up"
              : tone === "gold"
                ? "text-gold"
                : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function DeckSection({
  eyebrow,
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("px-4 py-3.5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[7.5px] uppercase tracking-[0.2em] text-gold/70">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-[12.5px] font-semibold tracking-tight">
            {title}
          </h2>
        </div>
        {action}
      </div>
      <div className={cn("mt-3", bodyClassName)}>{children}</div>
    </section>
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
    <div className="rounded-md border border-border/40 bg-white/[0.012] px-2 py-1.5">
      <p className="font-mono text-[7px] uppercase tracking-[0.09em] text-muted-foreground">
        {label}
      </p>
      <p className="num mt-0.5 truncate text-[10.5px] font-semibold">{value}</p>
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
      <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.05]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-gold/55 to-gold transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between font-mono text-[7.5px] uppercase tracking-[0.08em] text-muted-foreground">
        <span>{Math.round(pct)}% of daily allowance</span>
        <span>UTC reset</span>
      </div>
    </div>
  );
}
