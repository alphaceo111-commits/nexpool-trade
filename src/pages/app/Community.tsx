import { api } from "@/convex/_generated/api";
import { SectionTabs } from "@/components/app/SectionTabs";
import {
  Metric,
  Panel,
  SectionHeading,
  StatusPill,
  formatNex,
} from "@/components/app/parts";
import { ArrowUpRight, Crown, Medal, Trophy, Users } from "lucide-react";
import { useQuery } from "convex/react";
import { Link, Outlet } from "react-router";

const TABS = [
  { to: "/app/community", label: "Overview", end: true },
  { to: "/app/community/referrals", label: "Referrals" },
  { to: "/app/community/levels", label: "Levels" },
  { to: "/app/community/leaderboard", label: "Leaderboards" },
];

function CommunityCard({
  to,
  icon: Icon,
  eyebrow,
  title,
  body,
  value,
  detail,
}: {
  to: string;
  icon: typeof Users;
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
      <div className="flex items-start justify-between gap-3">
        <div className="flex size-9 items-center justify-center rounded-sm border border-primary/25 bg-primary/10 text-primary">
          <Icon className="size-4" />
        </div>
        <ArrowUpRight className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
      </div>
      <p className="label-xs mt-4">{eyebrow}</p>
      <p className="mt-1 text-[15px] font-semibold">{title}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        {body}
      </p>
      <div className="mt-3 flex items-end justify-between gap-2 border-t border-border/60 pt-2.5">
        <span className="num text-[15px] font-semibold text-gold">{value}</span>
        <span className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground">
          {detail}
        </span>
      </div>
    </Link>
  );
}

export default function CommunityLayout() {
  return (
    <div className="space-y-3.5">
      <SectionTabs tabs={TABS} />
      <Outlet />
    </div>
  );
}

export function CommunityHub() {
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

  const { referrals, speed, tasks, config } = snapshot;
  const qualifiedPct =
    referrals.target > 0
      ? Math.min(100, (referrals.qualified / referrals.target) * 100)
      : 0;

  return (
    <div className="space-y-3.5">
      <SectionHeading
        index="03"
        title="Community"
        body="Referrals, progression and every leaderboard category — grouped without hiding any feature."
        action={
          <StatusPill tone={referrals.qualified > 0 ? "up" : "muted"}>
            {referrals.qualified} qualified
          </StatusPill>
        }
      />

      <Panel eyebrow="Referral network" title="Invite. Verify. Earn together.">
        <div className="grid grid-cols-3 divide-x divide-border/70">
          <Metric
            label="Invited"
            value={String(referrals.total)}
            sub="all statuses"
          />
          <Metric
            label="Qualified"
            value={String(referrals.qualified)}
            sub={`${config.referralTaskTarget} tasks each`}
            className="pl-3"
            tone="gold"
          />
          <Metric
            label="Speed bonus"
            value={`${formatNex(speed.referralBonus)}/h`}
            sub={`cap ${config.referralBonusCap}`}
            className="pl-3"
          />
        </div>
        <div className="mt-3 border-t border-border/70 pt-2.5">
          <div className="flex items-center justify-between gap-2 font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">
            <span>Withdrawal referral target</span>
            <span className="num text-foreground">
              {referrals.qualified} / {referrals.target}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${qualifiedPct}%` }}
            />
          </div>
        </div>
      </Panel>

      <div className="grid gap-3.5 md:grid-cols-3">
        <CommunityCard
          to="/app/community/referrals"
          icon={Users}
          eyebrow="Grow the network"
          title="Referrals"
          body="Share your link, track pending and qualified invitations, and see each referral's verified task progress."
          value={`${referrals.total} invited`}
          detail={`${referrals.pending} pending`}
        />
        <CommunityCard
          to="/app/community/levels"
          icon={Crown}
          eyebrow="Progression"
          title="Levels"
          body="Claim level rewards, permanent speed bonuses and achievement milestones earned through verified activity."
          value={`Level ${speed.claimedLevel}`}
          detail="claimed"
        />
        <CommunityCard
          to="/app/community/leaderboard"
          icon={Trophy}
          eyebrow="Rankings"
          title="Leaderboards"
          body="Switch between top earners, miners, inviters, most active users and task completers without losing a category."
          value={`${tasks.completed} tasks`}
          detail="your completions"
        />
      </div>

      <Panel eyebrow="Fair rankings" title="One you, not a duplicate">
        <div className="flex items-start gap-2.5">
          <Medal className="mt-0.5 size-4 shrink-0 text-gold" />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Rankings are calculated from confirmed backend records. Similar
            display names are never merged into one entry, and the{" "}
            <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-foreground">
              YOU
            </span>{" "}
            marker follows your canonical account identity.
          </p>
        </div>
      </Panel>
    </div>
  );
}
