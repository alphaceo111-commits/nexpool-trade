import { api } from "@/convex/_generated/api";
import { SectionTabs } from "@/components/app/SectionTabs";
import {
  Metric,
  Panel,
  ProgressBar,
  SectionHeading,
  StatusPill,
  formatNex,
} from "@/components/app/parts";
import {
  ArrowUpRight,
  Coins,
  ListChecks,
  Megaphone,
  Pickaxe,
  Plane,
  Timer,
} from "lucide-react";
import { useQuery } from "convex/react";
import { Link, Outlet } from "react-router";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const TABS = [
  { to: "/app/earn", label: "Overview", end: true },
  { to: "/app/earn/mining", label: "Mining" },
  { to: "/app/earn/tasks", label: "Tasks & missions" },
];

function EarnCard({
  to,
  icon: Icon,
  eyebrow,
  title,
  body,
  value,
  detail,
  accent = "lime",
}: {
  to: string;
  icon: typeof Pickaxe;
  eyebrow: string;
  title: string;
  body: string;
  value: string;
  detail: string;
  accent?: "lime" | "gold";
}) {
  const gold = accent === "gold";
  return (
    <Link
      to={to}
      className={cn(
        "group premium-card relative overflow-hidden rounded-2xl p-5 transition-colors",
        gold ? "hover:border-gold/35" : "hover:border-primary/35",
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute -right-16 -top-16 size-40 rounded-full blur-3xl",
          gold ? "bg-gold/[0.06]" : "bg-primary/[0.05]",
        )}
      />
      <div className="relative flex items-start justify-between gap-3">
        <span
          className={cn(
            "flex size-11 items-center justify-center rounded-2xl border",
            gold
              ? "border-gold/25 bg-gold/10 text-gold"
              : "border-primary/25 bg-primary/10 text-primary",
          )}
        >
          <Icon className="size-5" />
        </span>
        <ArrowUpRight className="size-4 text-muted-foreground/60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
      <p className={cn("label-xs relative mt-4", gold ? "text-gold/80" : "text-primary/80")}>{eyebrow}</p>
      <h3 className="relative mt-1.5 text-[18px] font-semibold tracking-tight">{title}</h3>
      <p className="relative mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">{body}</p>
      <div className="relative mt-4 flex items-end justify-between gap-2 border-t border-border/55 pt-3">
        <span className={cn("num text-[16px] font-semibold", gold ? "text-gold" : "text-foreground")}>{value}</span>
        <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-muted-foreground">{detail}</span>
      </div>
    </Link>
  );
}

export default function EarnLayout() {
  return (
    <div className="space-y-5">
      <SectionTabs tabs={TABS} />
      <Outlet />
    </div>
  );
}

export function EarnHub() {
  const snapshot = useQuery(api.app.snapshot);

  if (!snapshot) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-52 animate-pulse rounded-xl bg-card/70" />
        <div className="h-[280px] animate-pulse rounded-3xl border border-border/60 bg-card/60" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-56 animate-pulse rounded-2xl border border-border/60 bg-card/60" />
          <div className="h-56 animate-pulse rounded-2xl border border-border/60 bg-card/60" />
        </div>
      </div>
    );
  }

  const { mining, speed, tasks, config } = snapshot;
  const stateTone: "up" | "warn" | "down" | "muted" | "gold" =
    mining.state === "ACTIVE" || mining.state === "BACKGROUND_ACTIVE"
      ? "up"
      : mining.state === "CAP_REACHED"
        ? "gold"
        : mining.state === "PAUSED"
          ? "down"
          : "muted";

  return (
    <div className="space-y-5">
      <SectionHeading
        index="Earn"
        title="Build your balance"
        body="Mining, verified tasks and two separate ad-backed sessions. Every reward settles on the backend before it reaches your balance."
        action={<StatusPill tone={stateTone}>{mining.state.replace("_", " ")}</StatusPill>}
      />

      <section className="premium-card card-sheen relative overflow-hidden rounded-3xl p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-28 size-64 rounded-full bg-primary/[0.055] blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="label-xs">Mining earning power</p>
            <div className="mt-2 flex items-end gap-2.5">
              <p className="num gold-ink text-[36px] font-semibold leading-none tracking-[-0.05em] sm:text-[50px]">
                {formatNex(speed.total)}
              </p>
              <span className="mb-1.5 text-[11px] font-semibold text-muted-foreground">NEX / hour</span>
            </div>
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              {mining.state === "ACTIVE"
                ? "A server-authorized session is running now."
                : mining.state === "BACKGROUND_ACTIVE"
                  ? "An existing session is continuing under background permission."
                  : mining.state === "CAP_REACHED"
                    ? "Normal mining is complete for today. Extra mining is separate."
                    : "No session is running. Start it explicitly from Mining."}
            </p>
          </div>
          <StatusPill tone={stateTone}>{mining.state.replace("_", " ")}</StatusPill>
        </div>

        <div className="relative mt-6 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="label-xs">Normal daily progress</span>
              <span className="num text-[11px] text-muted-foreground">
                {formatNex(mining.todayMinedNex)} / {formatNex(mining.todayLimitNex)} NEX
              </span>
            </div>
            <ProgressBar
              value={mining.todayMinedNex}
              max={mining.todayLimitNex}
              tone={mining.state === "CAP_REACHED" ? "gold" : "signal"}
              className="mt-3"
            />
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Remaining" value={formatNex(mining.remainingTodayNex)} sub="normal cap" />
              <Metric label="Extension" value={formatNex(mining.extensionMinedNex)} sub="separate bucket" tone="gold" />
              <Metric label="Tasks" value={tasks.available} sub="available" />
              <Metric label="Background" value={mining.awayMiningActive ? "Ready" : "Locked"} sub={`${config.awayMiningHours}h window`} />
            </div>
          </div>

          <div className="grid gap-2.5">
            <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-white/[0.018] p-3.5">
              <span className="flex size-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/8 text-primary">
                <Plane className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11.5px] font-semibold">Background mining</p>
                <p className="mt-0.5 text-[9.5px] leading-relaxed text-muted-foreground">
                  {mining.ads.away.completed}/{mining.ads.away.required} verified ads · {mining.awayMiningActive ? "active" : "locked"}
                </p>
              </div>
              <span className="num text-[11px] text-muted-foreground">{mining.ads.away.completed}/{mining.ads.away.required}</span>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-white/[0.018] p-3.5">
              <span className="flex size-9 items-center justify-center rounded-xl border border-gold/20 bg-gold/8 text-gold">
                <Megaphone className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11.5px] font-semibold">Extra 5-hour session</p>
                <p className="mt-0.5 text-[9.5px] leading-relaxed text-muted-foreground">
                  {mining.extensionActive
                    ? "Live now · separate from the normal cap"
                    : mining.extensionStartable
                      ? "Unlocked · waiting for your Start"
                      : `${mining.ads.extension.completed}/${mining.ads.extension.required} verified ads`}
                </p>
              </div>
              <StatusPill tone={mining.extensionActive || mining.extensionStartable ? "gold" : "muted"}>
                {mining.extensionActive ? "Live" : mining.extensionStartable ? "Ready" : "Locked"}
              </StatusPill>
            </div>
          </div>
        </div>

        <div className="relative mt-5 flex flex-col gap-2 sm:flex-row">
          <ButtonLink to="/app/earn/mining" label={mining.state === "ACTIVE" ? "Open mining controls" : "Start or manage mining"} icon={Pickaxe} />
          <ButtonLink to="/app/earn/tasks" label={`Browse ${tasks.available} available tasks`} icon={ListChecks} variant="outline" />
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <EarnCard
          to="/app/earn/mining"
          icon={Pickaxe}
          eyebrow="Server-time rewards"
          title="Mining engine"
          body="A calm, live engine with explicit Start and Stop, a real daily cap and two independent verified-ad unlocks."
          value={`${formatNex(speed.total)} NEX/h`}
          detail={mining.state === "ACTIVE" ? "session live" : "open controls"}
        />
        <EarnCard
          to="/app/earn/tasks"
          icon={ListChecks}
          eyebrow="Verified campaigns"
          title="Tasks & missions"
          body="Sponsor campaigns, Telegram membership checks and one-time rewards. Nothing posts until the backend verifies it."
          value={`${tasks.available} available`}
          detail={`${tasks.completed} completed`}
          accent="gold"
        />
      </div>

      <Panel eyebrow="The two rules that matter" title="What a reset does — and does not do">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-white/[0.014] p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/8 text-primary">
              <Timer className="size-4" />
            </span>
            <div>
              <p className="text-[12px] font-semibold">A new UTC day refreshes the allowance</p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
                It never authorizes a session. The user still presses Start.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-white/[0.014] p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-gold/20 bg-gold/8 text-gold">
              <Coins className="size-4" />
            </span>
            <div>
              <p className="text-[12px] font-semibold">Extra earnings stay in their own bucket</p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
                Twenty verified ads unlock a separate {config.extensionHours}-hour session; it never changes the normal cap.
              </p>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function ButtonLink({
  to,
  label,
  icon: Icon,
  variant = "default",
}: {
  to: string;
  label: string;
  icon: typeof Pickaxe;
  variant?: "default" | "outline";
}) {
  return (
    <Button asChild variant={variant} size="sm" className="w-full gap-1.5 sm:w-auto">
      <Link to={to}>
        <Icon className="size-3.5" /> {label}
      </Link>
    </Button>
  );
}
