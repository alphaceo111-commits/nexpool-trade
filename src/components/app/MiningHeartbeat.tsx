import { Activity, Pause, Pickaxe, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNex } from "./parts";

export type HeartbeatState =
  | "IDLE"
  | "ACTIVE"
  | "BACKGROUND_ACTIVE"
  | "PAUSED"
  | "CAP_REACHED"
  | "EXPIRED"
  | "COMPLETED";

const STATE_LABEL: Record<HeartbeatState, string> = {
  IDLE: "Ready to start",
  ACTIVE: "Mining live",
  BACKGROUND_ACTIVE: "Background active",
  PAUSED: "Mining paused",
  CAP_REACHED: "Daily cap reached",
  EXPIRED: "Session complete",
  COMPLETED: "Session complete",
};

function relativeServerTime(serverNow: number, lastHeartbeatAt: number | null) {
  if (!lastHeartbeatAt) return "Waiting for the first server sync";
  const seconds = Math.max(0, Math.floor((serverNow - lastHeartbeatAt) / 1000));
  if (seconds < 10) return "Last server update: just now";
  if (seconds < 60) return `Last server update: ${seconds}s ago`;
  return `Last server update: ${Math.floor(seconds / 60)}m ago`;
}

export function MiningHeartbeat({
  state,
  todayNex,
  capNex,
  speedNexPerHour,
  extensionNex,
  serverNow,
  lastHeartbeatAt,
  online = true,
  className,
}: {
  state: HeartbeatState;
  todayNex: number;
  capNex: number;
  speedNexPerHour: number;
  extensionNex: number;
  serverNow: number;
  lastHeartbeatAt: number | null;
  online?: boolean;
  className?: string;
}) {
  const pct = capNex > 0 ? Math.min(100, Math.max(0, (todayNex / capNex) * 100)) : 0;
  const active = state === "ACTIVE" || state === "BACKGROUND_ACTIVE";
  const capped = state === "CAP_REACHED";
  // Never animate a live engine while the device has lost its connection to
  // the backend. The ring keeps the last confirmed progress and becomes muted.
  const visualActive = active && online;
  const visualCapped = capped && online;
  const radius = 100;
  const circumference = 2 * Math.PI * radius;
  const dash = (pct / 100) * circumference;
  const tone = !online
    ? "var(--muted-foreground)"
    : capped
      ? "var(--gold)"
      : active
        ? "var(--primary)"
        : "var(--muted-foreground)";
  const Icon =
    state === "BACKGROUND_ACTIVE"
      ? Activity
      : active
        ? Pickaxe
        : capped
          ? Sparkles
          : state === "PAUSED"
            ? Pause
            : Pickaxe;

  return (
    <div className={cn("relative flex flex-col items-center", className)}>
      <div className="relative flex size-[224px] items-center justify-center sm:size-[264px]">
        {visualActive ? (
          <>
            <span className="absolute inset-5 rounded-full border border-primary/20 heartbeat-gold" />
            <span className="absolute inset-1 rounded-full border border-primary/8" />
          </>
        ) : null}
        {visualCapped ? (
          <span className="absolute inset-5 rounded-full border border-gold/20 heartbeat-gold" />
        ) : null}

        <svg
          viewBox="0 0 240 240"
          className="size-[212px] -rotate-90 drop-shadow-[0_0_26px_rgba(190,255,80,0.07)] sm:size-[250px]"
          aria-hidden="true"
        >
          <circle
            cx="120"
            cy="120"
            r={radius}
            fill="none"
            stroke="color-mix(in oklab, var(--border) 72%, transparent)"
            strokeWidth="6"
          />
          <circle
            cx="120"
            cy="120"
            r={radius}
            fill="none"
            stroke={tone}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            className="transition-[stroke-dasharray,stroke] duration-1000 ease-out"
          />
          <circle
            cx="120"
            cy="120"
            r={radius - 17}
            fill="none"
            stroke={visualActive ? "color-mix(in oklab, var(--primary) 20%, transparent)" : "transparent"}
            strokeWidth="1"
            strokeDasharray="2 10"
          />
          {visualActive ? (
            <g className="heartbeat-orbit" style={{ transformOrigin: "120px 120px" }}>
              <circle cx="120" cy="3" r="4.5" fill="var(--primary)" />
              <circle cx="120" cy="3" r="9" fill="none" stroke="var(--primary)" opacity="0.24" />
            </g>
          ) : null}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
          <span
            className={cn(
              "mb-1 flex size-10 items-center justify-center rounded-full border",
              visualActive
                ? "border-primary/25 bg-primary/10 text-primary mining-breathe"
                : visualCapped
                  ? "border-gold/25 bg-gold/10 text-gold"
                  : "border-border bg-secondary/50 text-muted-foreground",
            )}
          >
            <Icon className="size-[18px]" />
          </span>
          <span
            className={cn(
              "text-[10px] font-semibold tracking-[0.08em]",
              !online
                ? "text-muted-foreground"
                : active
                  ? "text-primary"
                  : capped
                    ? "text-gold"
                    : "text-muted-foreground",
            )}
          >
            {!online ? "WAITING FOR SERVER" : STATE_LABEL[state].toUpperCase()}
          </span>
          <span className="num gold-ink mt-1 text-[27px] font-semibold leading-none sm:text-[31px]">
            {formatNex(todayNex)}
          </span>
          <span className="text-[10px] font-medium text-muted-foreground">NEX mined today</span>
          <span className="mt-1 rounded-full border border-border/70 bg-background/55 px-2.5 py-1 font-mono text-[9px] text-muted-foreground">
            {Math.round(pct)}% of {formatNex(capNex)}
          </span>
        </div>
      </div>

      <div className="mt-1 flex h-8 w-full max-w-[286px] items-center justify-center gap-[3px] overflow-hidden px-2">
        <span
          className={cn(
            "heartbeat-wave flex h-6 items-center justify-center gap-[3px]",
            visualActive
              ? "text-primary/75"
              : visualCapped
                ? "text-gold/70"
                : "text-muted-foreground/45",
          )}
          aria-hidden="true"
        >
          {[0.32, 0.48, 0.7, 0.4, 0.92, 0.56, 0.34, 0.78, 0.45, 1, 0.62, 0.38, 0.82, 0.5, 0.3].map(
            (scale, index) => (
              <span
                key={index}
                style={{
                  height: `${10 + scale * 17}px`,
                  animationDelay: `${index * 0.09}s`,
                  animationPlayState: visualActive || visualCapped ? "running" : "paused",
                }}
              />
            ),
          )}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
        <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
          <span className={cn("size-1.5 rounded-full", visualActive ? "animate-signal-pulse bg-up" : visualCapped ? "bg-gold" : "bg-muted-foreground/60")} />
          {!online
            ? "Connection interrupted"
            : active
              ? "Engine synchronized"
              : capped
                ? "Normal session finished"
                : "Synchronized with backend"}
        </span>
        <span className="font-mono text-[8.5px] uppercase tracking-[0.07em] text-muted-foreground/75">
          {relativeServerTime(serverNow, lastHeartbeatAt)}
        </span>
      </div>

      <div className="mt-4 grid w-full max-w-[330px] grid-cols-2 overflow-hidden rounded-2xl border border-border/60 bg-white/[0.018]">
        <div className="border-r border-border/60 px-3 py-3">
          <p className="label-xs">Mining speed</p>
          <p className="num mt-1 text-[15px] font-semibold text-foreground">
            {formatNex(speedNexPerHour)}
            <span className="ml-1 font-sans text-[9px] font-medium text-muted-foreground">NEX/h</span>
          </p>
        </div>
        <div className="px-3 py-3">
          <p className="label-xs">Extension bucket</p>
          <p className="num mt-1 text-[15px] font-semibold text-gold">
            {formatNex(extensionNex)}
            <span className="ml-1 font-sans text-[9px] font-medium text-muted-foreground">NEX</span>
          </p>
        </div>
      </div>
    </div>
  );
}
