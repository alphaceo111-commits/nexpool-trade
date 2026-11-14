import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Check,
  ChevronRight,
  Copy,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

/** NEX renders at 9 decimals (matching the nano-NEX accounting grid) until it
 * grows past 0.01, then at a readable precision. */
export function formatNex(value: number) {
  const abs = Math.abs(value);
  if (abs < 0.01) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 9,
      maximumFractionDigits: 9,
    });
  }
  const digits = abs >= 100 ? 2 : abs >= 1 ? 3 : 4;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: Math.min(digits, 2),
    maximumFractionDigits: digits,
  });
}

export function formatUsd(value: number, digits = 2) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function timeUntil(ts: number) {
  const diff = Math.max(0, ts - Date.now());
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function useTick(intervalMs = 1000) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((value) => value + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return tick;
}

export function Panel({
  eyebrow,
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  eyebrow?: string;
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "premium-card relative overflow-hidden rounded-2xl",
        className,
      )}
    >
      {(eyebrow || title || action) && (
        <header className="flex items-start justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            {eyebrow ? <p className="label-xs">{eyebrow}</p> : null}
            {title ? (
              <h2 className="mt-1.5 text-[15px] font-semibold tracking-tight text-foreground">
                {title}
              </h2>
            ) : null}
          </div>
          {action}
        </header>
      )}
      <div
        className={cn(
          eyebrow || title || action ? "px-5 pb-5" : "p-5",
          bodyClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}

export function SectionHeading({
  index,
  title,
  body,
  action,
}: {
  index?: string;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="label-xs">
          {index ? `${index} · ` : ""}NEXPOOL
        </p>
        <h1 className="mt-1.5 text-[26px] font-semibold leading-tight tracking-[-0.035em] sm:text-[30px]">
          {title}
        </h1>
        {body ? (
          <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
            {body}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

type Tone = "up" | "down" | "warn" | "muted" | "signal" | "gold";

const TONE_TEXT: Record<Tone, string> = {
  up: "text-up",
  down: "text-down",
  warn: "text-warn",
  muted: "text-muted-foreground",
  signal: "text-primary",
  gold: "text-gold",
};
const TONE_BORDER: Record<Tone, string> = {
  up: "border-up/40 bg-up/10",
  down: "border-down/40 bg-down/10",
  warn: "border-warn/40 bg-warn/10",
  muted: "border-border bg-secondary/50",
  signal: "border-primary/40 bg-primary/10",
  gold: "border-gold/40 bg-gold/10",
};

export function StatusPill({
  tone = "muted",
  children,
  dot = true,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-[0.01em]",
        TONE_BORDER[tone],
        TONE_TEXT[tone],
        className,
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export function Metric({
  label,
  value,
  sub,
  tone = "default",
  className,
  align = "left",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "gold" | "up" | "warn" | "down";
  className?: string;
  align?: "left" | "right";
}) {
  const toneClass =
    tone === "gold"
      ? "text-gold"
      : tone === "up"
        ? "text-up"
        : tone === "warn"
          ? "text-warn"
          : tone === "down"
            ? "text-down"
            : "text-foreground";
  return (
    <div className={cn("min-w-0", align === "right" && "text-right", className)}>
      <p className="label-xs">{label}</p>
      <p className={cn("num mt-1.5 text-[17px] font-semibold leading-none", toneClass)}>{value}</p>
      {sub ? (
        <p className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.09em] text-muted-foreground">
          {sub}
        </p>
      ) : null}
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  tone = "signal",
  ticks = 0,
  className,
}: {
  value: number;
  max: number;
  tone?: "signal" | "gold" | "up" | "warn";
  ticks?: number;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const fill =
    tone === "gold"
      ? "bg-gold"
      : tone === "up"
        ? "bg-up"
        : tone === "warn"
          ? "bg-warn"
          : "bg-primary";
  return (
    <div className={cn("relative", className)}>
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.055] ring-1 ring-white/[0.035]">
        <div
          className={cn("h-full rounded-full transition-[width] duration-700 ease-out", fill)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {ticks > 0 ? (
        <div className="pointer-events-none absolute inset-0 flex justify-between">
          {Array.from({ length: ticks }).map((_, index) => (
            <span
              key={index}
              className={cn(
                "h-1.5 w-px",
                index === 0 ? "bg-transparent" : "bg-background/70",
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function RequirementRow({
  label,
  value,
  detail,
  met,
}: {
  label: string;
  value: string;
  detail: string;
  met: boolean;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border/60 py-3 last:border-0 last:pb-0">
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
          met
            ? "border-up/50 bg-up/15 text-up"
            : "border-warn/40 bg-warn/10 text-warn",
        )}
      >
        {met ? <Check className="size-2.5" /> : <span className="size-1 rounded-full bg-current" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-[12.5px] font-medium">{label}</p>
          <p
            className={cn(
              "num text-[10px] uppercase tracking-[0.06em]",
              met ? "text-up" : "text-warn",
            )}
          >
            {value}
          </p>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          {detail}
        </p>
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-white/[0.012] px-5 py-10 text-center">
      {icon ? (
        <div className="mb-3 flex size-11 items-center justify-center rounded-full border border-border bg-secondary/60 text-muted-foreground">
          {icon}
        </div>
      ) : null}
      <p className="text-[14px] font-semibold">{title}</p>
      <p className="mt-1.5 max-w-sm text-[12px] leading-relaxed text-muted-foreground">
        {body}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="h-20 animate-pulse rounded-2xl border border-border/60 bg-card/60"
        />
      ))}
    </div>
  );
}

export function InlineError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-md border border-down/30 bg-down/[0.06] p-4">
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-down" />
        <div>
          <p className="text-[12.5px] font-medium text-foreground">
            Could not load this screen
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
            {message}
          </p>
        </div>
      </div>
      {onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry} className="gap-1.5">
          <RefreshCw className="size-3" /> Retry
        </Button>
      ) : null}
    </div>
  );
}

export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={cn(
        "gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em]",
        className,
      )}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success("Copied");
          if (timer.current) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setCopied(false), 1600);
        } catch {
          toast.error("Clipboard is blocked in this webview.");
        }
      }}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

/**
 * Projected mining counter between server updates. Uses a monotonic tick, not
 * the device clock, and always clamps to the server daily cap. Settlement is
 * still performed by the backend.
 */
export function LiveMined({
  settledNex,
  ratePerHour,
  capNex,
  enabled,
  className,
}: {
  settledNex: number;
  ratePerHour: number;
  capNex: number;
  enabled: boolean;
  className?: string;
}) {
  const [elapsed, setElapsed] = useState(0);

  // Callers key this component by `serverNow`, so a new server snapshot
  // remounts it and resets the projection without a state-sync effect.
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      setElapsed((value) => Math.min(86_400, value + 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [enabled]);

  const projected = enabled
    ? Math.min(capNex, settledNex + (elapsed / 3_600_000) * ratePerHour)
    : settledNex;

  return (
    <span className={cn("num tabular-nums", className)}>
      {projected.toLocaleString("en-US", {
        minimumFractionDigits: 3,
        maximumFractionDigits: 4,
      })}
    </span>
  );
}

export function LinkRow({
  label,
  value,
  onClick,
}: {
  label: string;
  value?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 border-b border-border/60 py-2.5 text-left last:border-0"
    >
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5 text-[12px]">
        {value}
        <ChevronRight className="size-3.5 text-muted-foreground" />
      </span>
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin", className)} />;
}
