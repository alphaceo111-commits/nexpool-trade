import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router";
import { toast } from "sonner";
import {
  ArrowUpRight,
  BadgeCheck,
  Bell,
  ChevronRight,
  Coins,
  Gauge as GaugeIcon,
  ListChecks,
  Pickaxe,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import {
  formatDateTime,
  formatNex,
  formatUsd,
  initials,
  LiveMined,
  Metric,
  Panel,
  ProgressBar,
  StatusPill,
} from "@/components/app/parts";
import { CopyButton } from "@/components/app/parts";
import { cn } from "@/lib/utils";

function MiningDial({
  todayNex,
  capNex,
  ratePerHour,
  serverNow,
  enabled,
  status,
}: {
  todayNex: number;
  capNex: number;
  ratePerHour: number;
  serverNow: number;
  enabled: boolean;
  status: "active" | "paused" | "limit" | "restricted";
}) {
  const pct = capNex > 0 ? Math.min(100, (todayNex / capNex) * 100) : 0;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const dash = (pct / 100) * circumference;

  return (
    <div className="relative mx-auto flex size-[146px] items-center justify-center">
      {status === "active" ? (
        <>
          <span className="mining-ring" />
          <span
            className="mining-ring"
            style={{ animationDelay: "1.1s" }}
          />
        </>
      ) : null}
      <svg viewBox="0 0 130 130" className="size-[146px] -rotate-90">
        <circle
          cx="65"
          cy="65"
          r={radius}
          fill="none"
          stroke="var(--secondary)"
          strokeWidth="5"
        />
        <circle
          cx="65"
          cy="65"
          r={radius}
          fill="none"
          stroke={status === "limit" ? "var(--gold)" : "var(--primary)"}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="label-xs">Mined today</p>
        <p className="num mt-1 text-xl font-semibold text-gold">
          <LiveMined
            key={serverNow}
            settledNex={todayNex}
            ratePerHour={ratePerHour}
            capNex={capNex}
            enabled={enabled}
          />
        </p>
        <p className="num mt-0.5 text-[9px] text-muted-foreground">
          / {capNex.toFixed(2)} NEX
        </p>
      </div>
    </div>
  );
}

export default function Home() {
  const snapshot = useQuery(api.app.snapshot);
  const settle = useMutation(api.app.settleMiningNow);

  if (!snapshot) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="h-24 animate-pulse rounded-md border border-border/60 bg-card/60"
          />
        ))}
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
  const accruing = mining.projectedAccrualNex;
  const active = mining.status === "active";
  const metRequirements = withdrawal.requirements.filter((item) => item.met);
  const firstUnmet = withdrawal.requirements.find((item) => !item.met);

  const handleMine = async () => {
    try {
      const result = await settle();
      if (result.creditedNex > 0) {
        toast.success(
          `${formatNex(result.creditedNex)} NEX settled to your confirmed balance`,
        );
      } else if (result.status === "limit") {
        toast.info("Daily mining limit already reached. Accrual resumes at 00:00 UTC.");
      } else {
        toast.info("No new NEX to settle yet. Keep mining.");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Settlement failed. Nothing was credited.",
      );
    }
  };

  return (
    <div className="space-y-3.5">
      <div className="flex items-center gap-3">
        <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary font-mono text-[12px] font-semibold text-gold">
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
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[13px] font-semibold">
              {account.displayName}
            </p>
            {account.telegramLinked ? (
              <BadgeCheck className="size-3.5 shrink-0 text-primary" />
            ) : null}
          </div>
          <p className="num mt-0.5 text-[10px] text-muted-foreground">
            {account.nexId}
          </p>
        </div>
        <CopyButton value={account.nexId} label="ID" />
      </div>

      <div className="grid gap-3.5 lg:grid-cols-12">
        <Panel
          className="lg:col-span-7"
          eyebrow="Total NEX balance"
          action={<StatusPill tone="gold">Reward asset</StatusPill>}
          bodyClassName="p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
            <p className="num gold-glow text-[40px] leading-none font-semibold tracking-tight text-gold sm:text-[48px]">
              {formatNex(balance.totalNex)}
            </p>
            <span className="mb-1 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              NEX
            </span>
            {accruing > 0 ? (
              <span className="mb-1.5 ml-auto font-mono text-[10px] text-up">
                +{formatNex(accruing)} accruing
              </span>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="num text-[13px] text-foreground">
              ≈ {formatUsd(usdValue)}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
              at {formatUsd(config.nexUsdRate)} / NEX target
            </span>
          </div>
          <p className="mt-2 max-w-md text-[10.5px] leading-relaxed text-muted-foreground">
            USD value is an estimate at the published target rate. It is subject
            to redemption terms and the funded reward pool — not a guaranteed
            payout.
          </p>

          <div className="mt-4 grid grid-cols-3 divide-x divide-border/70 border-t border-border/70 pt-3">
            <Metric
              label="Available"
              value={formatNex(balance.availableNex)}
              sub="spendable"
            />
            <Metric
              label="Reserved"
              value={formatNex(balance.reservedNex)}
              sub="in review"
              className="pl-3"
            />
            <Metric
              label="Lifetime"
              value={formatNex(balance.lifetimeMinedNex + balance.lifetimeTaskNex)}
              sub="confirmed"
              className="pl-3"
              tone="gold"
            />
          </div>
        </Panel>

        <Panel
          className="lg:col-span-5"
          eyebrow="Mining engine"
          action={
            statusPill(active, mining.status)
          }
        >
          <MiningDial
            todayNex={mining.todayMinedNex}
            capNex={mining.todayLimitNex}
            ratePerHour={speed.total}
            serverNow={snapshot.serverNow}
            enabled={active}
            status={mining.status}
          />
          <div className="mt-2 grid grid-cols-2 divide-x divide-border/70 border-t border-border/70 pt-3">
            <Metric
              label="Speed"
              value={`${formatNex(speed.total)} NEX/h`}
              sub="server rate"
              tone="gold"
            />
            <Metric
              label="Remaining today"
              value={`${formatNex(mining.remainingTodayNex)} NEX`}
              sub="before cap"
              className="pl-3"
            />
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <QuickAction
          icon={Pickaxe}
          label="Mine now"
          hint="Settle accrual"
          onClick={handleMine}
          primary
        />
        <QuickAction
          icon={ListChecks}
          label="Complete tasks"
          hint={`${tasks.available} available`}
          to="/app/tasks"
        />
        <QuickAction
          icon={Users}
          label="Invite friends"
          hint={`${referrals.qualified}/${referrals.target} qualified`}
          to="/app/referrals"
        />
        <QuickAction
          icon={Wallet}
          label="Wallet"
          hint={withdrawal.eligible ? "Payout ready" : "Deposit · withdraw"}
          to="/app/wallet"
        />
      </div>

      <div className="grid gap-3.5 lg:grid-cols-12">
        <Panel
          className="lg:col-span-7"
          eyebrow="Withdrawal eligibility"
          action={
            <Link
              to="/app/withdraw"
              className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-primary"
            >
              Details <ChevronRight className="size-3" />
            </Link>
          }
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium">
                {withdrawal.eligible
                  ? "All requirements met"
                  : `${metRequirements.length}/${withdrawal.requirements.length} requirements met`}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {withdrawal.eligible
                  ? "You can request a payout. The operator still verifies treasury and compliance before broadcasting."
                  : firstUnmet?.detail}
              </p>
            </div>
            <StatusPill tone={withdrawal.eligible ? "up" : "warn"}>
              {withdrawal.eligible ? "Eligible" : "Pending"}
            </StatusPill>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
            {withdrawal.requirements.slice(0, 4).map((item) => (
              <div key={item.key} className="min-w-0">
                <p className="truncate text-[10px] text-muted-foreground">
                  {item.label}
                </p>
                <p
                  className={cn(
                    "num mt-0.5 truncate text-[10.5px]",
                    item.met ? "text-up" : "text-warn",
                  )}
                >
                  {item.value}
                </p>
              </div>
            ))}
          </div>
          <Link
            to="/app/withdraw"
            className="mt-3 flex h-8 items-center justify-center gap-1.5 rounded-sm border border-border bg-secondary/40 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors hover:bg-secondary"
          >
            Review requirements <ArrowUpRight className="size-3" />
          </Link>
        </Panel>

        <Panel
          className="lg:col-span-5"
          eyebrow="Mining speed"
          action={
            <Link
              to="/app/mining"
              className="font-mono text-[9px] uppercase tracking-[0.1em] text-primary"
            >
              Open
            </Link>
          }
        >
          <div className="flex items-end justify-between">
            <div>
              <p className="num text-2xl font-semibold text-gold">
                {formatNex(speed.total)}
              </p>
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                NEX per hour
              </p>
            </div>
            <GaugeIcon className="size-6 text-primary/70" />
          </div>
          <div className="mt-4 space-y-2 border-t border-border/70 pt-3">
            <SpeedRow label="Base" value={speed.base} total={speed.total} />
            <SpeedRow label="Task bonuses" value={speed.taskBonus} total={speed.total} />
            <SpeedRow
              label={`Referral bonuses (${referrals.qualified})`}
              value={speed.referralBonus}
              total={speed.total}
            />
          </div>
        </Panel>
      </div>

      <div className="grid gap-3.5 lg:grid-cols-12">
        <Panel
          className="lg:col-span-7"
          eyebrow="Referral qualification"
          action={
            <Link
              to="/app/referrals"
              className="font-mono text-[9px] uppercase tracking-[0.1em] text-primary"
            >
              Invite
            </Link>
          }
        >
          <div className="flex items-end justify-between">
            <div>
              <p className="num text-2xl font-semibold">
                {referrals.qualified}
                <span className="text-sm text-muted-foreground">
                  /{referrals.target}
                </span>
              </p>
              <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                qualified referrals
              </p>
            </div>
            <div className="text-right">
              <p className="num text-[13px] text-gold">
                +{formatNex(referrals.bonusNexPerHour)} NEX/h
              </p>
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                referral speed
              </p>
            </div>
          </div>
          <ProgressBar
            value={referrals.qualified}
            max={referrals.target}
            ticks={Math.min(referrals.target, 10)}
            tone="gold"
            className="mt-3"
          />
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/70 pt-3">
            <Metric label="Invited" value={referrals.total} />
            <Metric label="Qualified" value={referrals.qualified} tone="up" />
            <Metric label="In progress" value={referrals.incomplete} tone="warn" />
          </div>
        </Panel>

        <Panel
          className="lg:col-span-5"
          eyebrow="Notifications"
          action={
            <Link
              to="/app/notifications"
              className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-primary"
            >
              All <ChevronRight className="size-3" />
            </Link>
          }
          bodyClassName="p-0"
        >
          {notifications.rows.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <Bell className="mx-auto size-4 text-muted-foreground" />
              <p className="mt-2 text-[11.5px] text-muted-foreground">
                No notifications yet. Task verifications and payout events appear
                here.
              </p>
            </div>
          ) : (
            <ul>
              {notifications.rows.slice(0, 3).map((note) => (
                <li
                  key={note.id}
                  className="border-b border-border/60 px-4 py-2.5 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        note.kind === "wallet"
                          ? "bg-gold"
                          : note.kind === "task"
                            ? "bg-primary"
                            : note.kind === "referral"
                              ? "bg-up"
                              : "bg-muted-foreground",
                      )}
                    />
                    <p className="truncate text-[11.5px] font-medium">
                      {note.title}
                    </p>
                    {!note.read ? (
                      <span className="ml-auto font-mono text-[8px] uppercase tracking-[0.14em] text-primary">
                        new
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 line-clamp-1 pl-3.5 text-[10.5px] text-muted-foreground">
                    {note.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        eyebrow="Recent activity"
        title="Latest ledger entries"
        action={
          <Link
            to="/app/history"
            className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-primary"
          >
            All <ChevronRight className="size-3" />
          </Link>
        }
        bodyClassName="p-0"
      >
        {ledger.length === 0 ? (
          <p className="px-4 py-5 text-center text-[11.5px] leading-relaxed text-muted-foreground">
            Nothing posted yet. Mining accruals and verified rewards appear here
            the moment the backend writes them.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {ledger.slice(0, 5).map((row) => (
              <li key={row.id} className="flex items-center gap-2.5 px-4 py-2.5">
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    row.kind === "mining"
                      ? "bg-primary"
                      : row.kind === "deposit"
                        ? "bg-gold"
                        : row.kind === "task"
                          ? "bg-up"
                          : row.kind === "referral"
                            ? "bg-gold"
                            : row.kind === "withdrawal"
                              ? "bg-warn"
                              : "bg-muted-foreground",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11.5px] font-medium">{row.memo}</p>
                  <p className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">
                    {formatDateTime(row.createdAt)}
                  </p>
                </div>
                <span
                  className={cn(
                    "num shrink-0 text-[11.5px] font-semibold",
                    row.amountNex >= 0 ? "text-up" : "text-down",
                  )}
                >
                  {row.amountNex >= 0 ? "+" : "−"}
                  {Math.abs(row.amountNex).toFixed(4)}
                  <span className="ml-0.5 font-mono text-[8px] text-muted-foreground">
                    NEX
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="flex items-start gap-2.5 rounded-md border border-border/70 bg-panel/60 px-3.5 py-3">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-[10.5px] leading-relaxed text-muted-foreground">
          Mining is credited by the backend from server timestamps. Changing your
          device clock or refreshing the app does not create earnings. Daily cap
          resets at 00:00 UTC.
        </p>
      </div>
    </div>
  );
}

function statusPill(active: boolean, status: string) {
  if (status === "limit") return <StatusPill tone="warn">Cap reached</StatusPill>;
  if (status === "restricted") return <StatusPill tone="down">Restricted</StatusPill>;
  if (!active) return <StatusPill tone="muted">Paused</StatusPill>;
  return <StatusPill tone="up">Live</StatusPill>;
}

function QuickAction({
  icon: Icon,
  label,
  hint,
  to,
  onClick,
  primary,
}: {
  icon: typeof Coins;
  label: string;
  hint: string;
  to?: string;
  onClick?: () => void;
  primary?: boolean;
}) {
  const content = (
    <>
      <span
        className={cn(
          "flex size-7 items-center justify-center rounded-sm border",
          primary
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-border bg-secondary/60 text-muted-foreground",
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[11.5px] font-medium">{label}</span>
        <span className="mt-0.5 block truncate font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground">
          {hint}
        </span>
      </span>
      <ArrowUpRight className="size-3 shrink-0 text-muted-foreground" />
    </>
  );
  const classes = cn(
    "flex items-center gap-2 rounded-md border p-2.5 transition-colors",
    primary
      ? "border-primary/40 bg-primary/[0.06] hover:bg-primary/[0.1]"
      : "border-border/80 bg-card hover:bg-secondary/50",
  );
  if (to) {
    return (
      <Link to={to} className={classes}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes}>
      {content}
    </button>
  );
}

function SpeedRow({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between font-mono text-[10px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="num text-foreground">{formatNex(value)}</span>
      </div>
      <ProgressBar value={value} max={Math.max(total, 0.0001)} className="mt-1" />
      <span className="sr-only">{pct.toFixed(0)} percent</span>
    </div>
  );
}
