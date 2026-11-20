import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { Link } from "react-router";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowUpRight,
  BadgeCheck,
  Bell,
  ChevronRight,
  Coins,
  Gauge as GaugeIcon,
  LineChart,
  ListChecks,
  Pickaxe,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import {
  CopyButton,
  formatDateTime,
  formatNex,
  formatUsd,
  initials,
  Metric,
  Panel,
  StatusPill,
} from "@/components/app/parts";
import { Button } from "@/components/ui/button";
import { OnboardingChecklist } from "@/components/app/OnboardingChecklist";
import { axisNex } from "@/components/app/TerminalChart";
import { cn } from "@/lib/utils";

type NexChartPoint = {
  day: string;
  amountNex: number;
  cumulativeNex: number;
};

function HomeMiningRing({
  todayNex,
  capNex,
  state,
}: {
  todayNex: number;
  capNex: number;
  state: string;
}) {
  const pct = capNex > 0 ? Math.min(100, (todayNex / capNex) * 100) : 0;
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const dash = (pct / 100) * circumference;
  const tone =
    state === "CAP_REACHED"
      ? "var(--gold)"
      : state === "ACTIVE" || state === "BACKGROUND_ACTIVE"
        ? "var(--primary)"
        : "var(--muted-foreground)";

  return (
    <div className="relative flex size-[124px] shrink-0 items-center justify-center sm:size-[142px]">
      {(state === "ACTIVE" || state === "BACKGROUND_ACTIVE") ? (
        <span className="absolute inset-2 rounded-full border border-primary/15 heartbeat-gold" />
      ) : null}
      <svg viewBox="0 0 120 120" className="size-[120px] -rotate-90 sm:size-[138px]" aria-hidden="true">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--secondary)" strokeWidth="6" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {Math.round(pct)}%
        </span>
        <span className="num gold-ink mt-1 text-[20px] font-semibold leading-none">
          {formatNex(todayNex)}
        </span>
        <span className="mt-1 text-[9px] text-muted-foreground">of daily cap</span>
      </div>
    </div>
  );
}

function NexChart({ data }: { data: NexChartPoint[] }) {
  const rows = data.length ? data : [{ day: "today", amountNex: 0, cumulativeNex: 0 }];
  return (
    <div className="relative mt-3 h-[184px] w-full border-t border-border/45 pt-2">
      <div className="pointer-events-none absolute left-1 top-3 z-10 flex items-center gap-2 font-mono text-[7.5px] uppercase tracking-[0.09em]">
        <span className="text-gold/90">NEX</span>
        <span className="text-muted-foreground/70">mining curve</span>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 12, right: 2, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="home-nex-curve" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--gold)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--gold)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="var(--border)"
            strokeOpacity={0.55}
            strokeDasharray="2 6"
            vertical={false}
          />
          <XAxis
            dataKey="day"
            tickFormatter={(value: string) => value.slice(5)}
            tick={{ fontSize: 8.5, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            minTickGap={22}
          />
          <YAxis
            width={48}
            tickFormatter={(value: number) => axisNex(value)}
            tick={{ fontSize: 8.5, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ stroke: "color-mix(in oklab, var(--gold) 40%, transparent)" }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid color-mix(in oklab, var(--gold) 22%, var(--border))",
              borderRadius: 8,
              fontSize: 10,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
            labelStyle={{ color: "var(--muted-foreground)", fontSize: 9 }}
            labelFormatter={(label) => `UTC ${String(label)}`}
            formatter={(value) => [formatNex(Number(value)), "NEX"]}
          />
          <Bar
            dataKey="amountNex"
            fill="var(--gold)"
            opacity={0.18}
            radius={[2, 2, 0, 0]}
            barSize={9}
          />
          <Area
            type="monotone"
            dataKey="cumulativeNex"
            stroke="var(--gold)"
            fill="url(#home-nex-curve)"
            strokeWidth={1.8}
            dot={false}
            activeDot={{ r: 2.5, fill: "var(--gold)", stroke: "none" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Home() {
  const snapshot = useQuery(api.app.snapshot);

  if (!snapshot) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-56 animate-pulse rounded-xl bg-card/70" />
        <div className="h-[250px] animate-pulse rounded-3xl border border-border/60 bg-card/60" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-80 animate-pulse rounded-2xl border border-border/60 bg-card/60" />
          <div className="h-80 animate-pulse rounded-2xl border border-border/60 bg-card/60" />
        </div>
      </div>
    );
  }

  const {
    account,
    balance,
    config,
    mining,
    speed,
    referrals,
    tasks,
    withdrawal,
    notifications,
    ledger,
  } = snapshot;

  const usdValue = balance.totalNex * config.nexUsdRate;
  const active = mining.state === "ACTIVE" || mining.state === "BACKGROUND_ACTIVE";
  const metRequirements = withdrawal.requirements.filter((item) => item.met);
  const firstUnmet = withdrawal.requirements.find((item) => !item.met);
  const lifetime = balance.lifetimeMinedNex + balance.lifetimeTaskNex + balance.lifetimeAdNex;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gold/25 bg-gold/10 font-mono text-[12px] font-semibold text-gold">
            {account.photoUrl ? (
              <img
                src={account.photoUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="size-full object-cover"
              />
            ) : (
              initials(account.displayName)
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="truncate text-[19px] font-semibold tracking-tight">
                {account.displayName}
              </h1>
              {account.telegramLinked ? (
                <BadgeCheck className="size-4 shrink-0 text-primary" />
              ) : null}
            </div>
            <p className="mt-0.5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.07em] text-muted-foreground">
              {account.nexId}
              <span className="size-1 rounded-full bg-border" />
              {account.telegramLinked ? "verified Telegram" : "limited session"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CopyButton value={account.nexId} label="Account ID" />
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link to="/app/terminal">
              <LineChart className="size-3.5 text-gold" /> Terminal
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link to="/app/earn">
              <Coins className="size-3.5 text-gold" /> Earn
            </Link>
          </Button>
        </div>
      </div>

      <OnboardingChecklist
        accountNexId={account.nexId}
        miningStarted={account.firstMiningStartedAt !== null}
        walletConnected={Boolean(account.walletAddress)}
        telegramLinked={account.telegramLinked}
        tasksCompleted={tasks.completed}
        referralsQualified={referrals.qualified}
      />

      <div className="grid gap-4 lg:grid-cols-[1.12fr_0.88fr]">
        <section className="premium-card card-sheen relative overflow-hidden rounded-3xl p-5 sm:p-7">
          <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-gold/[0.09] blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="label-xs">Total NEX balance</p>
              <div className="mt-2 flex flex-wrap items-end gap-2.5">
                <p className="num gold-ink text-[38px] font-semibold leading-none tracking-[-0.055em] sm:text-[58px]">
                  {formatNex(balance.totalNex)}
                </p>
                <span className="mb-1.5 text-[11px] font-semibold text-muted-foreground">NEX</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="num text-[14px] font-medium">≈ {formatUsd(usdValue)}</span>
                <span className="rounded-full border border-border/70 bg-white/[0.022] px-2.5 py-1 font-mono text-[8.5px] uppercase tracking-[0.07em] text-muted-foreground">
                  target {formatUsd(config.nexUsdRate)} / NEX
                </span>
              </div>
            </div>
            <StatusPill tone={active ? "up" : mining.state === "CAP_REACHED" ? "gold" : "muted"}>
              {active ? "Mining live" : mining.state === "CAP_REACHED" ? "Daily cap" : "Mining idle"}
            </StatusPill>
          </div>

          <p className="relative mt-4 max-w-lg text-[10.5px] leading-relaxed text-muted-foreground">
            Target valuation only. Redemption depends on verified activity, compliance
            checks and the funded reward pool — it is not a guaranteed cash balance.
          </p>

          <div className="relative mt-6 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-border/60 pt-5 sm:grid-cols-4">
            <Metric label="Available" value={formatNex(balance.availableNex)} sub="confirmed" />
            <Metric label="Reserved" value={formatNex(balance.reservedNex)} sub="withdrawal review" tone="warn" />
            <Metric label="Accruing" value={formatNex(mining.projectedAccrualNex)} sub="server window" tone="up" />
            <Metric label="Lifetime" value={formatNex(lifetime)} sub="mined + tasks + ads" tone="gold" />
          </div>
        </section>

        <Panel
          eyebrow="Mining overview"
          title={
            active
              ? mining.state === "BACKGROUND_ACTIVE"
                ? "Background session"
                : "Session in progress"
              : mining.state === "CAP_REACHED"
                ? "Normal allowance complete"
                : "Ready to start"
          }
          action={<StatusPill tone={active ? "up" : mining.state === "CAP_REACHED" ? "gold" : "muted"}>{mining.state.replace("_", " ")}</StatusPill>}
        >
          <div className="flex items-center gap-4">
            <HomeMiningRing todayNex={mining.todayMinedNex} capNex={mining.todayLimitNex} state={mining.state} />
            <div className="min-w-0 flex-1 space-y-2.5">
              <div className="flex items-center justify-between gap-3 border-b border-border/55 pb-2">
                <span className="text-[10.5px] text-muted-foreground">Speed</span>
                <span className="num text-[12px] font-semibold text-gold">{formatNex(speed.total)} NEX/h</span>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-border/55 pb-2">
                <span className="text-[10.5px] text-muted-foreground">Remaining</span>
                <span className="num text-[12px] font-semibold">{formatNex(mining.remainingTodayNex)} NEX</span>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-border/55 pb-2">
                <span className="text-[10.5px] text-muted-foreground">Background</span>
                <span className={cn("text-[10.5px] font-semibold", mining.awayMiningActive ? "text-up" : "text-muted-foreground")}>
                  {mining.awayMiningActive ? "Active" : "Locked"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10.5px] text-muted-foreground">Extra session</span>
                <span className={cn("text-[10.5px] font-semibold", mining.extensionActive ? "text-gold" : mining.extensionStartable ? "text-gold" : "text-muted-foreground")}>
                  {mining.extensionActive ? "Live" : mining.extensionStartable ? "Ready" : "Locked"}
                </span>
              </div>
            </div>
          </div>

          <Button asChild size="sm" className="mt-4 w-full gap-1.5">
            <Link to="/app/earn/mining">
              <Pickaxe className="size-3.5" />
              {active ? "Open mining controls" : "Open mining"}
            </Link>
          </Button>
          {mining.extensionStartable ? (
            <Link to="/app/earn/mining" className="mt-2 flex items-center justify-center gap-1 text-[10px] font-semibold text-gold">
              Extra session ready to start <ArrowUpRight className="size-3" />
            </Link>
          ) : null}
        </Panel>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <QuickAction icon={Pickaxe} label="Mine now" hint={active ? "Open live engine" : "Start on your terms"} to="/app/earn/mining" primary />
        <QuickAction icon={ListChecks} label="Complete tasks" hint={`${tasks.available} available`} to="/app/earn/tasks" />
        <QuickAction icon={Users} label="Invite friends" hint={`${referrals.qualified}/${referrals.target} qualified`} to="/app/community/referrals" />
        <QuickAction icon={Wallet} label="Open wallet" hint={withdrawal.eligible ? "Payout ready" : "Deposit · withdraw"} to="/app/wallet" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
        <Panel
          eyebrow="Withdrawal readiness"
          title={withdrawal.eligible ? "All checks complete" : `${metRequirements.length}/${withdrawal.requirements.length} checks complete`}
          action={
            <Link to="/app/withdraw" className="text-[10px] font-semibold text-primary">
              Review
            </Link>
          }
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              {withdrawal.eligible
                ? "You can request a payout. The operator still verifies treasury and compliance before broadcasting."
                : firstUnmet?.detail}
            </p>
            <StatusPill tone={withdrawal.eligible ? "up" : "warn"}>
              {withdrawal.eligible ? "Eligible" : "Pending"}
            </StatusPill>
          </div>
          <div className="mt-4 space-y-2">
            {withdrawal.requirements.slice(0, 5).map((item) => (
              <div key={item.key} className="flex items-center gap-2.5 rounded-xl border border-border/55 bg-white/[0.014] px-3 py-2">
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border",
                    item.met ? "border-up/35 bg-up/10 text-up" : "border-warn/30 bg-warn/10 text-warn",
                  )}
                >
                  {item.met ? <ShieldCheck className="size-3" /> : <span className="size-1.5 rounded-full bg-current" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-[10.5px] font-medium">{item.label}</span>
                <span className={cn("num max-w-[46%] truncate text-right text-[9.5px]", item.met ? "text-up" : "text-warn")}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
          <Button asChild variant="outline" size="sm" className="mt-3 w-full gap-1.5">
            <Link to="/app/withdraw">View requirements <ChevronRight className="size-3" /></Link>
          </Button>
        </Panel>

        <section className="premium-card overflow-hidden rounded-2xl">
          <div className="flex h-11 items-center gap-2 border-b border-border/50 px-4">
            <span className="relative flex size-1.5 shrink-0 rounded-full bg-up">
              <span className="absolute inset-0 animate-ping rounded-full bg-up/50" />
            </span>
            <span className="font-mono text-[10.5px] font-bold tracking-[0.12em]">NEX</span>
            <span className="truncate font-mono text-[8px] uppercase tracking-[0.14em] text-muted-foreground">
              confirmed earnings
            </span>
            <span className="ml-1 hidden rounded border border-border/60 px-1 py-px font-mono text-[8px] uppercase tracking-[0.1em] text-muted-foreground sm:inline">
              UTC
            </span>
            <Link
              to="/app/terminal"
              className="ml-auto flex shrink-0 items-center gap-1 font-mono text-[8px] uppercase tracking-[0.1em] text-gold transition-opacity hover:opacity-80"
            >
              <LineChart className="size-3" /> Terminal
            </Link>
          </div>
          <div className="px-4 py-3.5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-mono text-[7.5px] uppercase tracking-[0.1em] text-muted-foreground/80">
                  Mining speed
                </p>
                <p className="num mt-1 text-[26px] font-semibold leading-none text-gold">
                  {formatNex(speed.total)}
                </p>
                <p className="mt-1 text-[9.5px] text-muted-foreground">
                  NEX / hour · confirmed server rate
                </p>
              </div>
              <div className="grid grid-cols-2 gap-x-6">
                <div>
                  <p className="font-mono text-[7.5px] uppercase tracking-[0.1em] text-muted-foreground/80">
                    Today
                  </p>
                  <p className="num mt-1 text-[14px] font-semibold text-up">
                    +{formatNex(mining.todayTotalNex)}
                  </p>
                  <p className="mt-0.5 font-mono text-[7px] uppercase tracking-[0.08em] text-muted-foreground/70">
                    normal + extension
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[7.5px] uppercase tracking-[0.1em] text-muted-foreground/80">
                    Confirmed
                  </p>
                  <p className="num mt-1 text-[14px] font-semibold">
                    {formatNex(balance.totalNex)}
                  </p>
                  <p className="mt-0.5 font-mono text-[7px] uppercase tracking-[0.08em] text-muted-foreground/70">
                    ledger balance
                  </p>
                </div>
              </div>
            </div>
            <NexChart data={snapshot.miningChart} />
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/45 pt-2">
              <p className="text-[9px] leading-relaxed text-muted-foreground">
                Confirmed mining entries only — no synthetic price, no frontend
                projection.
              </p>
              <Link
                to="/app/terminal"
                className="flex shrink-0 items-center gap-1 font-mono text-[8px] uppercase tracking-[0.1em] text-gold"
              >
                Open <ChevronRight className="size-3" />
              </Link>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Panel
          eyebrow="Recent activity"
          title="Latest account movements"
          action={
            <Link to="/app/history" className="flex items-center gap-1 text-[10px] font-semibold text-primary">
              Full history <ChevronRight className="size-3" />
            </Link>
          }
          bodyClassName="p-0"
        >
          {ledger.length === 0 ? (
            <div className="p-6 text-center">
              <Coins className="mx-auto size-5 text-muted-foreground" />
              <p className="mt-2 text-[12px] font-medium">No movements yet</p>
              <p className="mt-1 text-[10.5px] text-muted-foreground">
                Mining settlements, ad rewards and verified tasks appear here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/55">
              {ledger.slice(0, 6).map((row) => (
                <li key={row.id} className="flex items-center gap-3 px-5 py-3">
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full border",
                      row.kind === "mining"
                        ? "border-primary/20 bg-primary/8 text-primary"
                        : row.kind === "ad"
                          ? "border-gold/25 bg-gold/10 text-gold"
                          : row.kind === "deposit"
                            ? "border-gold/25 bg-gold/10 text-gold"
                            : row.kind === "task"
                              ? "border-up/20 bg-up/8 text-up"
                              : "border-border bg-secondary/45 text-muted-foreground",
                    )}
                  >
                    {row.kind === "mining" ? (
                      <GaugeIcon className="size-3.5" />
                    ) : row.kind === "ad" ? (
                      <Coins className="size-3.5" />
                    ) : row.kind === "task" ? (
                      <ListChecks className="size-3.5" />
                    ) : (
                      <Wallet className="size-3.5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11.5px] font-semibold">{row.memo}</p>
                    <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.07em] text-muted-foreground">
                      {formatDateTime(row.createdAt)}
                    </p>
                  </div>
                  <span className={cn("num shrink-0 text-[12px] font-semibold", row.amountNex >= 0 ? "text-up" : "text-down")}>
                    {row.amountNex >= 0 ? "+" : "−"}
                    {formatNex(Math.abs(row.amountNex))}
                    <span className="ml-1 font-sans text-[8px] text-muted-foreground">NEX</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          eyebrow="Notifications"
          title="Worth knowing"
          action={
            <Link to="/app/notifications" className="flex items-center gap-1 text-[10px] font-semibold text-primary">
              All <ChevronRight className="size-3" />
            </Link>
          }
          bodyClassName="p-0"
        >
          {notifications.rows.length === 0 ? (
            <div className="p-6 text-center">
              <Bell className="mx-auto size-5 text-muted-foreground" />
              <p className="mt-2 text-[12px] font-medium">Nothing new</p>
              <p className="mt-1 text-[10.5px] text-muted-foreground">Verified rewards and payout updates appear here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/55">
              {notifications.rows.slice(0, 4).map((note) => (
                <li key={note.id} className="flex items-start gap-2.5 px-5 py-3">
                  <span
                    className={cn(
                      "mt-1.5 size-1.5 shrink-0 rounded-full",
                      note.kind === "wallet"
                        ? "bg-gold"
                        : note.kind === "task"
                          ? "bg-primary"
                          : note.kind === "referral"
                            ? "bg-up"
                            : "bg-muted-foreground/60",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11.5px] font-semibold">{note.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{note.body}</p>
                  </div>
                  {!note.read ? <span className="mt-0.5 font-mono text-[7.5px] uppercase tracking-[0.1em] text-primary">new</span> : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-white/[0.018] px-4 py-3.5">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-[10.5px] leading-relaxed text-muted-foreground">
          NEXPOOL never starts mining automatically. A daily 00:00 UTC reset only
          refreshes the normal allowance. Background eligibility continues an
          already-started session; the extra five-hour bucket must be started
          separately. Every confirmed movement is written to the backend ledger.
        </p>
      </div>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  hint,
  to,
  primary,
}: {
  icon: typeof Coins;
  label: string;
  hint: string;
  to: string;
  primary?: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "group flex min-h-[92px] flex-col justify-between rounded-2xl border p-3.5 transition-all",
        primary
          ? "border-primary/30 bg-primary/[0.075] hover:border-primary/50 hover:bg-primary/[0.11]"
          : "border-border/65 bg-card/70 hover:border-border hover:bg-card",
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-xl border",
            primary
              ? "border-primary/25 bg-primary/12 text-primary"
              : "border-border/70 bg-white/[0.03] text-muted-foreground",
          )}
        >
          <Icon className="size-4" />
        </span>
        <ArrowUpRight className="size-3.5 text-muted-foreground/60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
      </span>
      <span>
        <span className="block text-[11.5px] font-semibold text-foreground">{label}</span>
        <span className="mt-1 block text-[9.5px] leading-relaxed text-muted-foreground">{hint}</span>
      </span>
    </Link>
  );
}
