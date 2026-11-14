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
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Crown, Medal, Sparkles, Trophy, Users } from "lucide-react";
import { useQuery } from "convex/react";
import { Link, Outlet } from "react-router";
import { cn } from "@/lib/utils";

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
  accent = "lime",
}: {
  to: string;
  icon: typeof Users;
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
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "flex size-11 items-center justify-center rounded-2xl border",
            gold ? "border-gold/25 bg-gold/10 text-gold" : "border-primary/25 bg-primary/10 text-primary",
          )}
        >
          <Icon className="size-5" />
        </span>
        <ArrowUpRight className="size-4 text-muted-foreground/60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
      <p className={cn("label-xs mt-4", gold ? "text-gold/80" : "text-primary/80")}>{eyebrow}</p>
      <h3 className="mt-1.5 text-[17px] font-semibold tracking-tight">{title}</h3>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">{body}</p>
      <div className="mt-4 flex items-end justify-between gap-2 border-t border-border/55 pt-3">
        <span className={cn("num text-[16px] font-semibold", gold ? "text-gold" : "text-foreground")}>{value}</span>
        <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-muted-foreground">{detail}</span>
      </div>
    </Link>
  );
}

export default function CommunityLayout() {
  return (
    <div className="space-y-5">
      <SectionTabs tabs={TABS} />
      <Outlet />
    </div>
  );
}

export function CommunityHub() {
  const snapshot = useQuery(api.app.snapshot);

  if (!snapshot) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-52 animate-pulse rounded-xl bg-card/70" />
        <div className="h-[250px] animate-pulse rounded-3xl border border-border/60 bg-card/60" />
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-56 animate-pulse rounded-2xl border border-border/60 bg-card/60" />
          ))}
        </div>
      </div>
    );
  }

  const { referrals, speed, tasks, config } = snapshot;

  return (
    <div className="space-y-5">
      <SectionHeading
        index="Community"
        title="Grow together"
        body="A clear view of your referral network, progression and confirmed rankings. Pending activity never inflates a reward."
        action={
          <StatusPill tone={referrals.qualified > 0 ? "up" : "muted"}>
            {referrals.qualified} qualified
          </StatusPill>
        }
      />

      <section className="premium-card relative overflow-hidden rounded-3xl p-5 sm:p-7">
        <div className="pointer-events-none absolute -left-20 -top-24 size-64 rounded-full bg-primary/[0.05] blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="label-xs">Referral network</p>
            <h2 className="mt-1.5 text-[23px] font-semibold tracking-tight">Your circle, verified.</h2>
            <p className="mt-1.5 max-w-lg text-[11.5px] leading-relaxed text-muted-foreground">
              A referral becomes qualified only after the invited account completes{" "}
              {config.referralTaskTarget} distinct verified tasks. Invitations and clicks never count.
            </p>
          </div>
          <Button asChild size="sm" className="gap-1.5">
            <Link to="/app/community/referrals">
              Invite friends <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
        </div>

        <div className="relative mt-6 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="label-xs">Withdrawal referral target</span>
              <span className="num text-[12px] font-semibold">
                {referrals.qualified} / {referrals.target}
              </span>
            </div>
            <ProgressBar
              value={referrals.qualified}
              max={Math.max(referrals.target, 1)}
              tone={referrals.qualified >= referrals.target ? "up" : "signal"}
              className="mt-3"
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Metric label="Invited" value={referrals.total} sub="all statuses" />
              <Metric label="Qualified" value={referrals.qualified} sub={`${config.referralTaskTarget} tasks each`} tone="gold" />
              <Metric label="Speed bonus" value={`${formatNex(speed.referralBonus)}/h`} sub={`cap ${config.referralBonusCap}`} />
            </div>
          </div>
          <div className="grid gap-2.5">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-white/[0.018] p-3.5">
              <span className="flex items-center gap-2.5 text-[11.5px] font-medium">
                <Users className="size-4 text-primary" /> Pending
              </span>
              <span className="num text-[12px] font-semibold">{referrals.pending}</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-white/[0.018] p-3.5">
              <span className="flex items-center gap-2.5 text-[11.5px] font-medium">
                <Sparkles className="size-4 text-gold" /> In progress
              </span>
              <span className="num text-[12px] font-semibold">{referrals.inProgress}</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-white/[0.018] p-3.5">
              <span className="flex items-center gap-2.5 text-[11.5px] font-medium">
                <CheckIcon /> Qualified
              </span>
              <span className="num text-[12px] font-semibold text-up">{referrals.qualified}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <CommunityCard
          to="/app/community/referrals"
          icon={Users}
          eyebrow="Network"
          title="Referrals"
          body="Share your link, follow pending and qualified invitations and see each verified task progress."
          value={`${referrals.total} invited`}
          detail={`${referrals.pending} pending`}
        />
        <CommunityCard
          to="/app/community/levels"
          icon={Crown}
          eyebrow="Progression"
          title="Levels"
          body="Claim level rewards and permanent speed bonuses earned through verified account activity."
          value={`Level ${speed.claimedLevel}`}
          detail="claimed"
          accent="gold"
        />
        <CommunityCard
          to="/app/community/leaderboard"
          icon={Trophy}
          eyebrow="Rankings"
          title="Leaderboards"
          body="Top earners, miners, inviters and task completers — built only from confirmed backend activity."
          value={`${tasks.completed} tasks`}
          detail="your completions"
        />
      </div>

      <Panel eyebrow="Fair rankings" title="One account, one place">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-gold/20 bg-gold/8 text-gold">
            <Medal className="size-4" />
          </span>
          <div>
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              Rankings use canonical account activity. Similar names are never merged,
              duplicate accounts are not counted and pending, failed or reversed rewards
              never inflate a score.
            </p>
            <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.08em] text-muted-foreground">
              Your row is marked <span className="text-primary">YOU</span> from your authenticated identity.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function CheckIcon() {
  return (
    <span className="flex size-4 items-center justify-center rounded-full border border-up/30 bg-up/10">
      <span className="size-1.5 rounded-full bg-up" />
    </span>
  );
}
