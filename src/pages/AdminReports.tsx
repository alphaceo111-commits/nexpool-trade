import { Brand } from "@/components/Brand";
import {
  EmptyState,
  formatDateTime,
  formatNex,
  formatUsd,
  LoadingBlock,
  Metric,
  Panel,
  StatusPill,
} from "@/components/app/parts";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Coins,
  FileText,
  Gauge,
  Megaphone,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "overview", label: "Overview", icon: Activity },
  { key: "mining", label: "Mining", icon: Gauge },
  { key: "users", label: "Users", icon: Users },
  { key: "ads", label: "Ads", icon: Megaphone },
  { key: "referrals", label: "Referrals", icon: BarChart3 },
  { key: "finance", label: "Finance", icon: Coins },
  { key: "leaderboard", label: "Leaderboard", icon: Trophy },
  { key: "audit", label: "Audit", icon: FileText },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const LEADER_CATEGORIES = [
  { key: "earners", label: "Earners" },
  { key: "miners", label: "Miners" },
  { key: "inviters", label: "Inviters" },
  { key: "active", label: "Active" },
  { key: "tasks", label: "Tasks" },
  { key: "levels", label: "Levels" },
] as const;

const PERIODS = [
  { key: "daily", label: "Today" },
  { key: "weekly", label: "7d" },
  { key: "monthly", label: "30d" },
  { key: "all", label: "All" },
] as const;

export default function AdminReports() {
  const access = useQuery(api.admin.access);
  const reports = useQuery(api.reports.adminReports);
  const [tab, setTab] = useState<TabKey>("overview");

  if (access === undefined || reports === undefined) {
    return <LoadingBlock rows={5} />;
  }

  if (!access.signedIn || !access.isAdmin || reports === null) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-4">
        <div className="max-w-md border border-border bg-card p-5 text-center">
          <ShieldCheck className="mx-auto size-5 text-muted-foreground" />
          <h1 className="mt-2 text-base font-semibold">Operator access required</h1>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
            {access.reason ??
              "Reporting is protected by the same backend authorization as every admin mutation."}
          </p>
          <Button asChild className="mt-3" variant="outline">
            <Link to="/app">Back to NEXPOOL</Link>
          </Button>
        </div>
      </div>
    );
  }

  const { mining, users, ads, referrals, financial, audit } = reports;

  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-30 border-b border-border/80 nav-blur safe-top">
        <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center gap-3 px-4 lg:px-6">
          <Link to="/admin" className="flex items-center gap-2">
            <Brand subtitle="REPORTING" compact />
          </Link>
          <span className="ml-auto hidden items-center gap-1.5 border border-primary/40 bg-primary/[0.06] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-primary sm:flex">
            <ShieldCheck className="size-3" /> {access.telegramId ? `telegram ${access.telegramId}` : "operator"}
          </span>
          <Link
            to="/admin"
            className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> Console
          </Link>
          <Link
            to="/app"
            className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground"
          >
            Mini app <ArrowUpRight className="size-3" />
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1280px] px-3 py-4 lg:px-6">
        <div className="-mx-3 overflow-x-auto px-3 no-scrollbar">
          <div className="flex w-max gap-1 border-b border-border/70 pb-2">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-sm border px-2.5 py-2 font-mono text-[9.5px] uppercase tracking-[0.1em] transition-colors",
                  tab === item.key
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-transparent text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                )}
              >
                <item.icon className="size-3.5" /> {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {tab === "overview" ? (
            <>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <Metric label="Total NEX mined" value={formatNex(mining.allTimeNex)} sub="confirmed ledger" tone="gold" />
                <Metric label="Total accounts" value={users.total} sub={`${users.botStarters} bot starters`} />
                <Metric label="Referrals" value={referrals.total} sub={`${referrals.totalQualified} qualified`} />
                <Metric label="Verified ads" value={ads.allTime} sub={`${ads.today} today`} />
              </div>
              <div className="grid gap-3.5 lg:grid-cols-2">
                <Panel eyebrow="Mining" title="Confirmed NEX credited">
                  <div className="grid grid-cols-2 gap-2">
                    <Metric label="Today" value={formatNex(mining.todayNex)} sub={`${mining.usersMinedToday} miners`} />
                    <Metric label="Yesterday" value={formatNex(mining.yesterdayNex)} />
                    <Metric label="Last 7 days" value={formatNex(mining.weekNex)} />
                    <Metric label="Last 30 days" value={formatNex(mining.monthNex)} />
                  </div>
                </Panel>
                <Panel eyebrow="Activity" title="Users actually using NEXPOOL">
                  <div className="grid grid-cols-2 gap-2">
                    <Metric label="New today" value={users.newToday} sub={`${users.newThisWeek} this week`} />
                    <Metric label="Active today" value={users.activeToday} sub={`${users.activeThisWeek} this week`} />
                    <Metric label="Mini App users" value={users.miniAppUsers} sub="recorded presence" />
                    <Metric label="Online now" value={users.onlineNow} sub="60s heartbeat" tone="up" />
                  </div>
                </Panel>
              </div>
              <Panel eyebrow="Referral performance" title={`${referrals.total} invited · ${referrals.totalQualified} qualified`}>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Metric label="Pending" value={referrals.pending} sub="no verified task" />
                  <Metric label="In progress" value={referrals.inProgress} sub="1–2 verified tasks" tone="warn" />
                  <Metric label="Conversion" value={`${referrals.conversionRate}%`} sub="qualified / total" tone="up" />
                  <Metric label="Inviters" value={referrals.inviters} sub="accounts inviting" />
                </div>
              </Panel>
            </>
          ) : null}

          {tab === "mining" ? (
            <>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <Metric label="Today" value={formatNex(mining.todayNex)} sub={`${mining.usersMinedToday} miners`} tone="gold" />
                <Metric label="Yesterday" value={formatNex(mining.yesterdayNex)} />
                <Metric label="7 days" value={formatNex(mining.weekNex)} />
                <Metric label="30 days" value={formatNex(mining.monthNex)} />
              </div>
              <div className="grid gap-3.5 lg:grid-cols-2">
                <Panel eyebrow="Confirmed rewards" title="All-time mining ledger">
                  <div className="grid grid-cols-2 gap-2">
                    <Metric label="Total mined" value={formatNex(mining.allTimeNex)} sub={`${mining.confirmedEntries} entries`} tone="gold" />
                    <Metric label="Normal mining" value={formatNex(mining.normal.allTimeNex)} sub={`${formatNex(mining.normal.todayNex)} today`} />
                    <Metric label="Extension mining" value={formatNex(mining.extension.allTimeNex)} sub={`${formatNex(mining.extension.todayNex)} today`} />
                    <Metric label="Level rewards" value={formatNex(mining.levelRewardsAllTimeNex)} sub="claim ledger" />
                  </div>
                  <p className="mt-3 border border-border/70 bg-panel/60 p-2.5 text-[10px] leading-relaxed text-muted-foreground">
                    Only confirmed ledger rows count. Pending task claims, rejected
                    ads and failed withdrawals are excluded. Unique miners is a
                    distinct-user count, not a session count.
                  </p>
                </Panel>
                <Panel eyebrow="Trend" title="Last 14 UTC days" bodyClassName="p-0">
                  <ul>
                    {mining.trend.map((row) => (
                      <li key={row.day} className="flex items-center gap-3 border-b border-border/60 px-4 py-2 last:border-0">
                        <span className="w-20 font-mono text-[9px] text-muted-foreground">{row.day}</span>
                        <div className="h-1.5 flex-1 overflow-hidden bg-secondary">
                          <div
                            className="h-full bg-gold"
                            style={{
                              width: `${Math.min(100, (row.minedNex / Math.max(1e-12, Math.max(...mining.trend.map((item) => item.minedNex)))) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="num w-24 text-right text-[10px] text-gold">{formatNex(row.minedNex)}</span>
                        <span className="w-14 text-right font-mono text-[8.5px] text-muted-foreground">{row.miners} miners</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </div>
            </>
          ) : null}

          {tab === "users" ? (
            <>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <Metric label="New today" value={users.newToday} sub={`${users.newYesterday} yesterday`} />
                <Metric label="New this week" value={users.newThisWeek} sub={`${users.newThisMonth} in 30 days`} />
                <Metric label="Total accounts" value={users.total} sub={`${users.verifiedTelegram} verified Telegram`} />
                <Metric label="Restricted" value={users.restricted} sub="no accrual" tone="warn" />
              </div>
              <div className="grid gap-3.5 lg:grid-cols-2">
                <Panel eyebrow="Active users" title="Backend activity only">
                  <div className="grid grid-cols-2 gap-2">
                    <Metric label="Today" value={users.activeToday} tone="up" />
                    <Metric label="This week" value={users.activeThisWeek} />
                    <Metric label="This month" value={users.activeThisMonth} />
                    <Metric label="Online now" value={users.onlineNow} sub="60s heartbeat" tone="gold" />
                  </div>
                  <p className="mt-3 border border-border/70 bg-panel/60 p-2.5 text-[10px] leading-relaxed text-muted-foreground">
                    Active = a distinct user with a confirmed ledger row, verified
                    task, completed ad or mining heartbeat in the window. Opening a
                    report never changes the number; multiple devices collapse to
                    one user.
                  </p>
                </Panel>
                <Panel eyebrow="Acquisition" title="Bot and Mini App" bodyClassName="p-0">
                  <div className="grid grid-cols-2 divide-x divide-border/60">
                    <div className="p-4">
                      <p className="label-xs">Bot starters</p>
                      <p className="num mt-1 text-2xl font-semibold">{users.botStarters}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">Telegram ID verified</p>
                    </div>
                    <div className="p-4">
                      <p className="label-xs">Mini App users</p>
                      <p className="num mt-1 text-2xl font-semibold">{users.miniAppUsers}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">Launched the app</p>
                    </div>
                  </div>
                  <div className="border-t border-border/60 p-3">
                    <p className="label-xs mb-2">New accounts · 14 days</p>
                    <div className="flex h-20 items-end gap-1">
                      {users.trend.map((row) => (
                        <div key={row.day} className="flex flex-1 flex-col items-center gap-1" title={`${row.day}: ${row.joined}`}>
                          <div
                            className="w-full bg-primary/60"
                            style={{
                              height: `${Math.max(3, (row.joined / Math.max(1, Math.max(...users.trend.map((item) => item.joined)))) * 64)}px`,
                            }}
                          />
                          <span className="font-mono text-[7px] text-muted-foreground">{row.day.slice(8)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </Panel>
              </div>
            </>
          ) : null}

          {tab === "ads" ? (
            <>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <Metric label="Verified today" value={ads.today} sub={`${ads.uniqueUsersToday} unique users`} tone="up" />
                <Metric label="Yesterday" value={ads.yesterday} />
                <Metric label="All time" value={ads.allTime} sub={`${ads.uniqueUsersAllTime} unique users`} />
                <Metric label="Rejected" value={ads.rejected} sub={`${ads.duplicates} duplicates`} tone="warn" />
              </div>
              <div className="grid gap-3.5 lg:grid-cols-2">
                <Panel eyebrow="Rewarded ads" title="Provider-confirmed completions">
                  <div className="grid grid-cols-2 gap-2">
                    <Metric label="Away mining ads" value={ads.awayCompleted} sub="10 required" />
                    <Metric label="Extension ads" value={ads.extensionCompleted} sub="20 required" />
                    <Metric label="Away unlocks" value={ads.awayUnlocks} sub="accounts with a window" />
                    <Metric label="Extension unlocks" value={ads.extensionUnlocks} sub="accounts with a window" />
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <p className="label-xs">By provider</p>
                    {ads.byProvider.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">No verified completions yet.</p>
                    ) : (
                      ads.byProvider.map((row) => (
                        <div key={row.provider} className="flex items-center justify-between border border-border/60 bg-panel/50 px-2.5 py-1.5">
                          <span className="font-mono text-[10px]">{row.provider}</span>
                          <span className="num text-[11px]">{row.count}</span>
                        </div>
                      ))
                    )}
                  </div>
                </Panel>
                <Panel eyebrow="Verification quality" title="What did not count">
                  <div className="grid grid-cols-2 gap-2">
                    <Metric label="Rejected views" value={ads.rejected} tone="warn" />
                    <Metric label="Duplicate attempts" value={ads.duplicates} tone="warn" />
                    <Metric label="Expired / invalid" value={ads.failedAttempts} tone="warn" />
                    <Metric label="Verified completions" value={ads.verifiedEvents} tone="up" />
                  </div>
                  <p className="mt-3 border border-warn/30 bg-warn/[0.04] p-2.5 text-[10px] leading-relaxed text-muted-foreground">
                    A click, an ad open, or a client-side promise never counts. The
                    Monetag SDK must resolve a valued reward event and the server
                    re-checks the challenge, user, expiry and duplicate status.
                  </p>
                </Panel>
              </div>
            </>
          ) : null}

          {tab === "referrals" ? (
            <>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <Metric label="Total referrals" value={referrals.total} sub={`${referrals.newToday} today`} />
                <Metric label="Qualified" value={referrals.totalQualified} sub={`${referrals.qualifiedToday} today`} tone="up" />
                <Metric label="Pending" value={referrals.pending} sub="no verified task" tone="warn" />
                <Metric label="Conversion" value={`${referrals.conversionRate}%`} sub="qualified / total" tone="gold" />
              </div>
              <div className="grid gap-3.5 lg:grid-cols-2">
                <Panel eyebrow="Referral book" title={`${referrals.total} invited · ${referrals.total - referrals.totalQualified} not qualified`}>
                  <div className="grid grid-cols-2 gap-2">
                    <Metric label="Pending" value={referrals.pending} />
                    <Metric label="In progress" value={referrals.inProgress} tone="warn" />
                    <Metric label="Qualified" value={referrals.totalQualified} tone="up" />
                    <Metric label="Rejected" value={referrals.rejected} tone="down" />
                  </div>
                  <p className="mt-3 border border-border/70 bg-panel/60 p-2.5 text-[10px] leading-relaxed text-muted-foreground">
                    Pending referrals are included in the total. Only qualified
                    referrals count toward the withdrawal gate and the referral
                    speed bonus. Legacy profile links are merged without rewriting
                    history.
                  </p>
                </Panel>
                <Panel eyebrow="Top inviters" title="Qualified referrals" bodyClassName="p-0">
                  {referrals.topInviters.length === 0 ? (
                    <div className="p-4">
                      <EmptyState icon={<Users className="size-4" />} title="No inviters yet" body="A referral record appears the moment an invited Telegram account starts the bot." />
                    </div>
                  ) : (
                    <ul>
                      {referrals.topInviters.map((row, index) => (
                        <li key={row.profileId} className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-0">
                          <span className="num w-5 text-[10px] text-muted-foreground">{index + 1}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11.5px] font-medium">{row.displayName}</p>
                            <p className="font-mono text-[9px] text-muted-foreground">
                              {row.total} invited · {row.qualified} qualified
                            </p>
                          </div>
                          <span className="num text-[10px] text-gold">+{formatNex(row.bonusNexPerHour)}/h</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </div>
              <Panel eyebrow="Bonus ledger" title="Referral speed currently priced">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Metric label="Inviters" value={referrals.inviters} />
                  <Metric label="Qualified referrals" value={referrals.totalQualified} tone="up" />
                  <Metric
                    label="Active speed bonus NEX/h"
                    value={formatNex(referrals.activeSpeedBonusNexPerHour)}
                    tone="gold"
                  />
                </div>
              </Panel>
            </>
          ) : null}

          {tab === "finance" ? (
            <>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <Metric label="Total NEX issued" value={formatNex(financial.totalIssuedNex)} sub="confirmed credits" tone="gold" />
                <Metric label="Available balances" value={formatNex(financial.availableNex)} sub="user liabilities" />
                <Metric label="Reserved" value={formatNex(financial.reservedNex)} sub="pending payouts" tone="warn" />
                <Metric label="Treasury" value={formatUsd(financial.treasuryAvailableUsd)} sub="reported liquidity" />
              </div>
              <div className="grid gap-3.5 lg:grid-cols-2">
                <Panel eyebrow="Rewards" title="Confirmed NEX by source">
                  <div className="grid grid-cols-2 gap-2">
                    <Metric label="Mining" value={formatNex(financial.miningRewardsNex)} />
                    <Metric label="Tasks" value={formatNex(financial.taskRewardsNex)} />
                    <Metric label="Referrals" value={formatNex(financial.referralRewardsNex)} />
                    <Metric label="Levels" value={formatNex(financial.levelRewardsNex)} />
                  </div>
                  <p className="mt-3 border border-border/70 bg-panel/60 p-2.5 text-[10px] leading-relaxed text-muted-foreground">
                    NEX is an internal accounting unit. The ${financial.nexUsdRate.toFixed(2)}{" "}
                    reference rate is not guaranteed cash and no payout is implied
                    unless the operator funds the redemption pool.
                  </p>
                </Panel>
                <Panel eyebrow="Withdrawals" title={`${financial.withdrawalRequests} requests`}>
                  <div className="grid grid-cols-2 gap-2">
                    <Metric label="Requested" value={formatNex(financial.requestedNex)} sub="awaiting review" tone="warn" />
                    <Metric label="Paid" value={formatNex(financial.approvedNex)} sub={`${financial.paidCount} payouts`} tone="up" />
                    <Metric label="Rejected" value={formatNex(financial.rejectedNex)} tone="down" />
                    <Metric label="Liability USD" value={formatUsd(financial.liabilityUsd)} sub="at reference rate" />
                  </div>
                </Panel>
              </div>
            </>
          ) : null}

          {tab === "leaderboard" ? <AdminLeaderboard /> : null}

          {tab === "audit" ? (
            <Panel eyebrow="Operator audit" title="Privileged actions" bodyClassName="p-0">
              {audit.length === 0 ? (
                <div className="p-4">
                  <EmptyState icon={<FileText className="size-4" />} title="No audit entries" body="Every admin mutation records an actor, action and detail here." />
                </div>
              ) : (
                <ul>
                  {audit.map((row) => (
                    <li key={row.id} className="border-b border-border/60 px-4 py-2.5 last:border-0">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-primary">{row.action}</p>
                        <span className="font-mono text-[9px] text-muted-foreground">{formatDateTime(row.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 text-[11px]">{row.detail}</p>
                      <p className="font-mono text-[9px] text-muted-foreground">{row.actor}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AdminLeaderboard() {
  const [category, setCategory] = useState<(typeof LEADER_CATEGORIES)[number]["key"]>("earners");
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["key"]>("all");
  const data = useQuery(api.leaderboard.rankings, {
    category,
    period,
    limit: 25,
    offset: 0,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {LEADER_CATEGORIES.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setCategory(item.key)}
            className={cn(
              "rounded-sm border px-2.5 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em]",
              category === item.key
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
        <span className="mx-1 w-px bg-border" />
        {PERIODS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setPeriod(item.key)}
            className={cn(
              "rounded-sm border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em]",
              period === item.key
                ? "border-gold/50 bg-gold/10 text-gold"
                : "border-border bg-card text-muted-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <Panel
        eyebrow={data?.valueLabel ?? "Ranking"}
        title={`Top ${data?.category ?? category} · ${data?.period ?? period}`}
        action={<StatusPill tone="gold">{data?.total ?? 0} ranked</StatusPill>}
        bodyClassName="p-0"
      >
        {!data || data.rows.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={<Trophy className="size-4" />} title="No ranked users" body="Confirmed mining, verified tasks, completed ads and qualified referrals create rankings." />
          </div>
        ) : (
          <ul>
            {data.rows.map((row) => (
              <li key={row.profileId} className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-0">
                <span className="num w-6 text-[10px] text-muted-foreground">#{row.rank}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11.5px] font-medium">{row.displayName}</p>
                  <p className="truncate font-mono text-[9px] text-muted-foreground">
                    {row.username ? `@${row.username} · ` : ""}
                    {row.secondary}
                  </p>
                </div>
                <span className="num text-[11px] font-semibold text-gold">
                  {category === "earners" || category === "miners"
                    ? `${formatNex(row.value)} NEX`
                    : row.value}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <p className="text-[10px] text-muted-foreground">
        {data?.privacy ?? "Public profile fields only. Telegram IDs are never exposed."}
      </p>
    </div>
  );
}
