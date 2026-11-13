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
import { ArrowUpRight, Coins, ListChecks, Pickaxe, Timer } from "lucide-react";
import { useQuery } from "convex/react";
import { Link, Outlet } from "react-router";

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
}: {
  to: string;
  icon: typeof Pickaxe;
  eyebrow: string;
  title: string;
  body: string;
  value: string;
  detail: string;
}) {
  return (
    <Link
      to={to}
      className="group relative overflow-hidden rounded-md border border-border/80 bg-card/70 p-4 transition-colors hover:border-primary/40 hover:bg-card"
    >
      <div className="pointer-events-none absolute -top-10 -right-8 size-28 rounded-full bg-primary/8 blur-2xl transition-opacity group-hover:opacity-100" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex size-9 items-center justify-center rounded-sm border border-primary/25 bg-primary/10 text-primary">
          <Icon className="size-4" />
        </div>
        <ArrowUpRight className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
      </div>
      <p className="label-xs relative mt-4">{eyebrow}</p>
      <p className="relative mt-1 text-[15px] font-semibold">{title}</p>
      <p className="relative mt-1 text-[11px] leading-relaxed text-muted-foreground">
        {body}
      </p>
      <div className="relative mt-3 flex items-end justify-between gap-2 border-t border-border/60 pt-2.5">
        <span className="num text-[15px] font-semibold text-gold">{value}</span>
        <span className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground">
          {detail}
        </span>
      </div>
    </Link>
  );
}

export default function EarnLayout() {
  return (
    <div className="space-y-3.5">
      <SectionTabs tabs={TABS} />
      <Outlet />
    </div>
  );
}

export function EarnHub() {
  const snapshot = useQuery(api.app.snapshot);

  if (!snapshot) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-md border border-border/60 bg-card/60"
          />
        ))}
      </div>
    );
  }

  const { mining, speed, tasks, config } = snapshot;
  const progress =
    mining.todayLimitNex > 0
      ? (mining.todayMinedNex / mining.todayLimitNex) * 100
      : 0;
  const stateTone: "up" | "warn" | "down" | "muted" =
    mining.state === "ACTIVE" || mining.state === "BACKGROUND_ACTIVE"
      ? "up"
      : mining.state === "CAP_REACHED"
        ? "warn"
        : mining.state === "PAUSED"
          ? "down"
          : "muted";

  return (
    <div className="space-y-3.5">
      <SectionHeading
        index="02"
        title="Earn"
        body="Every way to earn NEX in one place: controlled mining, daily caps and verified tasks."
        action={<StatusPill tone={stateTone}>{mining.state.replace("_", " ")}</StatusPill>}
      />

      <Panel
        eyebrow="Mining status"
        title={
          mining.state === "ACTIVE"
            ? "Mining is running"
            : mining.state === "BACKGROUND_ACTIVE"
              ? "Background session active"
              : mining.state === "CAP_REACHED"
                ? "Daily normal cap reached"
                : "Mining has not started"
        }
        action={
          <Link
            to="/app/earn/mining"
            className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-primary"
          >
            Open mining <ArrowUpRight className="size-3" />
          </Link>
        }
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="label-xs">Current speed</p>
            <p className="num mt-1 text-[28px] font-semibold leading-none text-gold">
              {formatNex(speed.total)}
              <span className="ml-1 font-mono text-[9px] font-normal uppercase tracking-[0.12em] text-muted-foreground">
                NEX / hour
              </span>
            </p>
          </div>
          <div className="text-right">
            <p className="label-xs">Normal cap</p>
            <p className="num mt-1 text-[12px]">
              {formatNex(mining.todayMinedNex)} / {formatNex(mining.todayLimitNex)}
            </p>
          </div>
        </div>
        <ProgressBar
          value={progress}
          max={100}
          tone={mining.state === "CAP_REACHED" ? "warn" : "signal"}
          className="mt-3"
        />
        <div className="mt-3 grid grid-cols-2 gap-y-2 border-t border-border/70 pt-3 sm:grid-cols-4 sm:divide-x sm:divide-border/70">
          <Metric
            label="Remaining"
            value={formatNex(mining.remainingTodayNex)}
            sub="normal allowance"
            tone="gold"
          />
          <Metric
            label="Extra bucket"
            value={formatNex(mining.extensionMinedNex)}
            sub="separate from cap"
            className="pl-0 sm:pl-3"
          />
          <Metric
            label="Background"
            value={mining.awayMiningActive ? "Ready" : "Locked"}
            sub={`${mining.awayMiningHours}h entitlement`}
            className="pt-2 sm:pl-3 sm:pt-0"
          />
          <Metric
            label="Extra session"
            value={mining.extensionActive ? "Live" : mining.extensionUnlocked ? "Unlocked" : "Locked"}
            sub={`${config.extensionHours}h after 20 ads`}
            className="pt-2 sm:pl-3 sm:pt-0"
          />
        </div>
      </Panel>

      <div className="grid gap-3.5 md:grid-cols-2">
        <EarnCard
          to="/app/earn/mining"
          icon={Pickaxe}
          eyebrow="Normal + extra mining"
          title="Mining engine"
          body="Start and stop explicitly, watch the server-confirmed cap, and unlock background or extra mining with verified ads."
          value={`${formatNex(speed.total)} NEX/h`}
          detail={mining.state === "ACTIVE" ? "session live" : "press start"}
        />
        <EarnCard
          to="/app/earn/tasks"
          icon={ListChecks}
          eyebrow="Missions"
          title="Tasks & missions"
          body="Verified sponsor campaigns, one-time rewards and speed bonuses. Rewards settle only after backend verification."
          value={`${tasks.available} available`}
          detail={`${tasks.completed} completed`}
        />
      </div>

      <Panel eyebrow="How earnings work" title="Two separate mining buckets">
        <div className="space-y-2 text-[11px] leading-relaxed text-muted-foreground">
          <div className="flex items-start gap-2">
            <Coins className="mt-0.5 size-3.5 shrink-0 text-gold" />
            <p>
              Normal mining stops at {formatNex(config.dailyLimitNex)} NEX per UTC
              day. The daily reset makes a new allowance available; it does not
              start a session.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <Timer className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <p>
              After the cap, 20 verified ads grant a separate {config.extensionHours}
              -hour session. It stays unlocked until you press Start Extra Mining,
              and its earnings never change the normal cap.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
