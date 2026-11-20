import {
  formatDateTime,
  LoadingBlock,
  Metric,
  Panel,
  StatusPill,
} from "@/components/app/parts";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { Users } from "lucide-react";

/**
 * Growth desk: how many people registered, how many became real users, and
 * where they came from. Read-only — it never grants rewards or changes levels.
 */
export function GrowthPanel() {
  const growth = useQuery(api.growth.overview);
  if (!growth) return <LoadingBlock rows={4} />;

  const { totals, activity, newUsers, retention, churn, referrals, acquisition } =
    growth;
  const maxNew = Math.max(1, ...newUsers.map((row) => row.registered));
  const funnel = [
    { label: "Registered", value: totals.registered },
    { label: "Telegram verified", value: totals.telegramVerified },
    { label: "Opened Mini App", value: totals.miniAppOpened },
    { label: "Activated (mined)", value: totals.activated },
    { label: "Active last 7d", value: activity.wau },
  ];
  const funnelMax = Math.max(1, ...funnel.map((step) => step.value));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="label-xs">Growth desk</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">
            Real users, not registrations
          </h1>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
          counted {formatDateTime(growth.generatedAt)}
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-12">
        <Panel
          className="lg:col-span-7"
          eyebrow="Activation funnel"
          title="From registration to a real miner"
          action={
            <StatusPill tone={totals.activationRate >= 40 ? "up" : "warn"}>
              {totals.activationRate}% activated
            </StatusPill>
          }
        >
          <div className="space-y-2.5">
            {funnel.map((step, index) => {
              const previous = index === 0 ? step.value : funnel[index - 1].value;
              const dropped = index === 0 ? 0 : previous - step.value;
              return (
                <div key={step.label}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[11.5px] text-foreground/90">
                      {step.label}
                    </p>
                    <p className="num text-[12px] font-semibold">
                      {step.value.toLocaleString("en-US")}
                      {index > 0 && dropped > 0 ? (
                        <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground">
                          −{dropped} drop-off
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary/80"
                      style={{ width: `${(step.value / funnelMax) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
            “Activated” means the account has started mining at least once.
            Opening the app is counted separately and never as activation.
          </p>
        </Panel>

        <Panel className="lg:col-span-5" eyebrow="Engagement" title="Who came back">
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            <Metric label="DAU" value={activity.dau} sub="seen in 24h" />
            <Metric label="WAU" value={activity.wau} sub="seen in 7d" />
            <Metric label="MAU" value={activity.mau} sub="seen in 30d" />
            <Metric
              label="Active miners"
              value={activity.activeMiners}
              sub="mined + seen 7d"
              tone="up"
            />
            <Metric
              label="Churned 30d"
              value={churn.accounts}
              sub={`${churn.rate}% of accounts`}
              tone={churn.accounts > 0 ? "warn" : "default"}
            />
            <Metric
              label="Never activated"
              value={totals.notActivated}
              sub="joined, never mined"
              tone="warn"
            />
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
            Activity is recorded by the backend on real events only, so a page
            refresh cannot mark an account active.
          </p>
        </Panel>
      </div>

      <Panel
        eyebrow="Registration"
        title="New accounts, last 14 days"
        action={
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
            lime = activated
          </span>
        }
      >
        <div className="flex h-28 items-end gap-1.5">
          {newUsers.map((row) => (
            <div
              key={row.day}
              className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
              title={`${row.day}: ${row.registered} registered, ${row.activated} activated`}
            >
              <div className="relative flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t bg-secondary"
                  style={{
                    height: `${Math.max(3, (row.registered / maxNew) * 100)}%`,
                  }}
                />
                <div
                  className="absolute bottom-0 w-full rounded-t bg-primary/70"
                  style={{
                    height: `${(row.activated / maxNew) * 100}%`,
                  }}
                />
              </div>
              <span className="font-mono text-[7.5px] text-muted-foreground">
                {row.day.slice(8)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/70 pt-3">
          {retention.map((row) => (
            <Metric
              key={row.days}
              label={`D${row.days} retention`}
              value={`${row.rate}%`}
              sub={`${row.retained} of ${row.eligible} seen again`}
              tone={row.rate >= 25 ? "up" : "default"}
            />
          ))}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          Retention is a last-seen proxy: an account counts as retained at Dn
          when the backend recorded activity at least n days after it registered.
        </p>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel
          eyebrow="Referrals"
          title={`${referrals.conversion}% of invites qualify`}
          action={
            <StatusPill tone={referrals.qualified > 0 ? "up" : "muted"}>
              {referrals.qualified} qualified
            </StatusPill>
          }
        >
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            <Metric label="Invitations" value={referrals.total} sub="all time" />
            <Metric
              label="Qualified"
              value={referrals.qualified}
              sub="verified participation"
              tone="up"
            />
            <Metric label="Pending" value={referrals.pending} sub="not opened app" />
            <Metric
              label="In progress"
              value={referrals.inProgress}
              sub="task threshold not met"
            />
            <Metric
              label="Rejected"
              value={referrals.rejected}
              sub="fraud / duplicate"
              tone={referrals.rejected > 0 ? "down" : "default"}
            />
            <Metric
              label="Conversion"
              value={`${referrals.conversion}%`}
              sub="qualified / invited"
            />
          </div>
          <div className="mt-3 space-y-1.5 border-t border-border/70 pt-3">
            {referrals.bySource.map((row) => (
              <div
                key={row.source}
                className="flex items-center justify-between gap-2 text-[11px]"
              >
                <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                  {row.source.replace("_", " ")}
                </span>
                <span className="num">
                  {row.invitations} invited ·{" "}
                  <span className="text-up">{row.qualified} qualified</span>
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          eyebrow="Acquisition"
          title="Referred vs organic"
          action={<Users className="size-4 text-muted-foreground" />}
        >
          <div className="grid grid-cols-2 gap-3">
            <Metric
              label="Referred"
              value={acquisition.referred}
              sub={`${acquisition.referredActivated} activated`}
              tone="up"
            />
            <Metric
              label="Organic / direct"
              value={acquisition.organic}
              sub={`${acquisition.organicActivated} activated`}
            />
          </div>
          <div className="mt-3 border-t border-border/70 pt-3">
            <p className="label-xs">Top inviters by qualified users</p>
            {referrals.topInviters.length === 0 ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                No referral records yet.
              </p>
            ) : (
              <ul className="mt-2 space-y-1">
                {referrals.topInviters.map((row) => (
                  <li
                    key={row.nexId}
                    className="flex items-center justify-between gap-2 text-[11px]"
                  >
                    <span className="truncate">
                      {row.displayName}{" "}
                      <span className="font-mono text-[9px] text-muted-foreground">
                        {row.nexId}
                      </span>
                    </span>
                    <span className="num shrink-0">
                      {row.invitations} invited ·{" "}
                      <span className="text-up">{row.qualified} qualified</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
            Campaign-level attribution (which channel or group a user arrived
            from) needs a launch parameter stored at bootstrap; today only
            referral vs organic is recorded.
          </p>
        </Panel>
      </div>
    </div>
  );
}
