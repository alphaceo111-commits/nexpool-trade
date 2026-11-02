import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

export function Sparkline({
  points,
  color = "var(--signal)",
  className,
  filled = true,
}: {
  points: number[];
  color?: string;
  className?: string;
  filled?: boolean;
}) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const width = 120;
  const height = 36;
  const coords = points.map((point, index) => {
    const x = (index / (points.length - 1)) * width;
    const y = height - ((point - min) / span) * (height - 4) - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const line = `M${coords.join(" L")}`;
  const area = `${line} L${width},${height} L0,${height} Z`;
  const id = `spark-${color.replace(/[^a-z0-9]/gi, "")}-${points.length}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("h-9 w-full", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {filled ? <path d={area} fill={`url(#${id})`} /> : null}
      <path d={line} fill="none" stroke={color} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Panel({
  label,
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  label?: string;
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("border border-border bg-card", className)}>
      {(label || title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            {label ? <p className="label-xs">{label}</p> : null}
            {title ? (
              <h2 className="mt-1 truncate text-sm font-semibold tracking-tight">{title}</h2>
            ) : null}
          </div>
          {action}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  delta,
  spark,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  delta?: { value: string; direction: "up" | "down" | "flat" };
  spark?: number[];
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative border bg-card px-4 py-3.5",
        accent ? "border-primary/40" : "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="label-xs">{label}</p>
        {delta ? (
          <span
            className={cn(
              "flex items-center gap-0.5 font-mono text-[10px] tabular-nums",
              delta.direction === "up"
                ? "text-up"
                : delta.direction === "down"
                  ? "text-down"
                  : "text-muted-foreground",
            )}
          >
            {delta.direction === "up" ? (
              <ArrowUpRight className="size-3" />
            ) : delta.direction === "down" ? (
              <ArrowDownRight className="size-3" />
            ) : null}
            {delta.value}
          </span>
        ) : null}
      </div>
      <div className="mt-2 font-mono text-[22px] leading-none font-semibold tracking-tight tabular-nums">
        {value}
      </div>
      {hint ? (
        <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          {hint}
        </div>
      ) : null}
      {spark ? <Sparkline points={spark} className="mt-3 h-6" /> : null}
      {accent ? (
        <span className="absolute top-0 right-0 h-1 w-8 bg-primary" aria-hidden="true" />
      ) : null}
    </div>
  );
}

export function StatusDot({
  status,
  className,
}: {
  status: "online" | "degraded" | "offline" | "live";
  className?: string;
}) {
  const tone =
    status === "online" || status === "live"
      ? "bg-up"
      : status === "degraded"
        ? "bg-warn"
        : "bg-down";
  return (
    <span className={cn("relative inline-flex size-1.5 shrink-0", className)}>
      <span className={cn("absolute inset-0 rounded-full", tone)} />
      {status !== "offline" ? (
        <span className={cn("absolute inset-0 rounded-full animate-signal-pulse", tone)} />
      ) : null}
    </span>
  );
}

export function CoinChip({ coin }: { coin: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.1em]">
      <span className={cn("size-1.5", COIN_DOT[coin] ?? "bg-muted-foreground")} />
      {coin}
    </span>
  );
}

const COIN_DOT: Record<string, string> = {
  BTC: "bg-warn",
  KAS: "bg-chart-2",
  LTC: "bg-chart-5",
  ETC: "bg-primary",
};
