import { Brand } from "@/components/Brand";
import {
  EmptyState,
  formatDateTime,
  formatNex,
  formatUsd,
  LoadingBlock,
  Metric,
  Panel,
  Spinner,
  StatusPill,
} from "@/components/app/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Ban,
  Check,
  CheckCircle2,
  Coins,
  FileText,
  Flag,
  Gauge,
  GitMerge,
  ListChecks,
  Megaphone,
  Play,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

type AdminOverview = NonNullable<FunctionReturnType<typeof api.admin.overview>>;
type AdminConfig = AdminOverview["config"];

const TABS = [
  { key: "overview", label: "Overview", icon: Activity },
  { key: "mining", label: "Economy", icon: Gauge },
  { key: "tasks", label: "Campaigns", icon: ListChecks },
  { key: "users", label: "Users", icon: Users },
  { key: "recovery", label: "Recovery", icon: GitMerge },
  { key: "withdrawals", label: "Payouts", icon: Wallet },
  { key: "broadcast", label: "Announce", icon: Megaphone },
  { key: "audit", label: "Audit", icon: FileText },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function configPayload(config: AdminConfig, overrides: Partial<AdminConfig> = {}) {
  return {
    baseRateNexPerHour: config.baseRateNexPerHour,
    dailyLimitNex: config.dailyLimitNex,
    nexUsdRate: config.nexUsdRate,
    tonUsdRate: config.tonUsdRate,
    minWithdrawNex: config.minWithdrawNex,
    qualifiedReferralTarget: config.qualifiedReferralTarget,
    referralTaskTarget: config.referralTaskTarget,
    referralBonusNexPerHour: config.referralBonusNexPerHour,
    referralBonusCap: config.referralBonusCap,
    treasuryAvailableUsd: config.treasuryAvailableUsd,
    miningEnabled: config.miningEnabled,
    awayMiningHours: config.awayMiningHours,
    extensionHours: config.extensionHours,
    adRewardNex: config.adRewardNex,
    withdrawalsEnabled: config.withdrawalsEnabled,
    ...overrides,
  };
}

export default function Admin() {
  const access = useQuery(api.admin.access);
  const claimOwner = useMutation(api.admin.claimOwner);
  const [tab, setTab] = useState<TabKey>("overview");
  const [claiming, setClaiming] = useState(false);

  if (access === undefined) return <LoadingBlock rows={4} />;

  if (!access.signedIn) {
    return (
      <AdminMessage
        title="Operator sign-in required"
        body="The admin console is protected by backend authorization."
        action={
          <Button asChild>
            <Link to="/app">Back to NEXPOOL</Link>
          </Button>
        }
      />
    );
  }

  if (!access.isAdmin) {
    return (
      <AdminMessage
        title={access.canClaim ? "Claim the operator desk" : "Operator access denied"}
        body={
          access.canClaim
            ? "No operator is configured on this deployment. The first signed-in account can claim the console once; the action is audited."
            : access.telegramAdminAllowlistConfigured
              ? "A Telegram admin allowlist is configured, but this verified Telegram account is not on it. Sign in from the allowlisted account or update TELEGRAM_ADMIN_IDS in the Keys tab."
              : "This account is not authorized for admin mutations. No Telegram admin allowlist is configured; the existing operator must grant the role in the backend."
        }
        action={
          access.canClaim ? (
            <Button
              className="gap-1.5"
              disabled={claiming}
              onClick={async () => {
                setClaiming(true);
                try {
                  await claimOwner();
                  toast.success("Operator console unlocked");
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : "Could not claim.",
                  );
                } finally {
                  setClaiming(false);
                }
              }}
            >
              {claiming ? <Spinner /> : <ShieldCheck className="size-4" />}
              Claim operator access
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link to="/app">Back to NEXPOOL</Link>
            </Button>
          )
        }
      />
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-30 border-b border-border/80 nav-blur safe-top">
        <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center gap-3 px-4 lg:px-6">
          <Link to="/admin" className="flex items-center gap-2">
            <Brand subtitle="OPERATOR CONSOLE" compact />
          </Link>
          <span className="ml-auto hidden items-center gap-1.5 border border-warn/40 bg-warn/[0.06] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-warn sm:flex">
            <ShieldCheck className="size-3" /> authorized operator
          </span>
          <Link
            to="/admin/reports"
            className="flex items-center gap-1 border border-primary/30 bg-primary/[0.06] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-primary"
          >
            Reports <ArrowUpRight className="size-3" />
          </Link>
          <Link
            to="/admin/telegram"
            className="hidden items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground sm:flex"
          >
            Telegram Center <ArrowUpRight className="size-3" />
          </Link>
          <Link
            to="/admin/bot"
            className="hidden items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground xl:flex"
          >
            Bot desk <ArrowUpRight className="size-3" />
          </Link>
          <Link
            to="/app"
            className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> Mini app
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
                <item.icon className="size-3.5" />
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          {tab === "overview" ? <Overview onTab={setTab} /> : null}
          {tab === "mining" ? <Economy /> : null}
          {tab === "tasks" ? <Campaigns /> : null}
          {tab === "users" ? <UserTable /> : null}
          {tab === "recovery" ? <RecoveryDesk /> : null}
          {tab === "withdrawals" ? <PayoutQueue /> : null}
          {tab === "broadcast" ? <Broadcast /> : null}
          {tab === "audit" ? <AuditLog /> : null}
        </div>
      </div>
    </div>
  );
}

function AdminMessage({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-5">
      <div className="w-full max-w-md rounded-md border border-border bg-card p-5">
        <div className="flex size-9 items-center justify-center rounded-sm border border-warn/40 bg-warn/10">
          <ShieldAlert className="size-4 text-warn" />
        </div>
        <h1 className="mt-3 text-base font-semibold">{title}</h1>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
          {body}
        </p>
        <div className="mt-4">{action}</div>
      </div>
    </div>
  );
}

function Overview({ onTab }: { onTab: (tab: TabKey) => void }) {
  const overview = useQuery(api.admin.overview);
  const updateConfig = useMutation(api.admin.updateConfig);
  const [saving, setSaving] = useState<string | null>(null);

  if (!overview) return <LoadingBlock rows={4} />;
  const { service, counts, treasury, config, recentAudit, deposits } = overview;

  const emergencyToggle = async (field: "miningEnabled" | "withdrawalsEnabled") => {
    setSaving(field);
    try {
      await updateConfig(
        configPayload(config, { [field]: !config[field] } as Partial<AdminConfig>),
      );
      toast.success(
        `${field === "miningEnabled" ? "Mining" : "Withdrawals"} ${
          config[field] ? "paused" : "resumed"
        }`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="label-xs">Operator overview</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">
            Service health & treasury
          </h1>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
          backend-authorized · audited
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          {
            label: "Mining engine",
            value: service.miningEnabled ? "Enabled" : "Paused",
            good: service.miningEnabled,
          },
          {
            label: "Withdrawals",
            value: service.withdrawalsEnabled ? "Open" : "Paused",
            good: service.withdrawalsEnabled,
          },
          {
            label: "Telegram bot",
            value: service.telegramBotConfigured ? "Token set" : "No token",
            good: service.telegramBotConfigured,
          },
          {
            // Both mining unlocks and rewarded-ad tasks settle through the same
            // Monetag postback, so this one flag is the real verifier health.
            label: "Ad verifier (mining + tasks)",
            value: service.rewardedAdProviderConfigured
              ? "Postback secret set"
              : "Secret missing",
            good: service.rewardedAdProviderConfigured,
          },
          {
            label: "Monetag SDK",
            value: "Client-side only",
            good: true,
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-md border border-border/80 bg-card px-3 py-2.5"
          >
            <p className="label-xs">{item.label}</p>
            <p
              className={cn(
                "mt-1 flex items-center gap-1.5 text-[11px] font-medium",
                item.good ? "text-up" : "text-warn",
              )}
            >
              <span className="size-1.5 rounded-full bg-current" />
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {!service.rewardedAdProviderConfigured ? (
        <div className="flex items-start gap-2.5 rounded-md border border-warn/40 bg-warn/[0.05] px-3 py-2.5">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <div className="min-w-0">
            <p className="text-[11.5px] font-medium text-warn">
              Verified ads fail closed on this deployment
            </p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
              The Monetag SDK is loaded, but the backend cannot authenticate a
              reward postback because{" "}
              <code className="font-mono text-[10px] text-foreground">
                MONETAG_POSTBACK_SECRET
              </code>{" "}
              is not set on the Convex deployment serving this app. Every Watch
              Ad button stays disabled until it is. Set it with{" "}
              <code className="font-mono text-[10px] text-foreground">
                bunx convex env set MONETAG_POSTBACK_SECRET &lt;value&gt;
              </code>{" "}
              (add{" "}
              <code className="font-mono text-[10px] text-foreground">
                --prod
              </code>{" "}
              for production), then use the same value in the Monetag postback
              URL. Never put it in a{" "}
              <code className="font-mono text-[10px] text-foreground">
                VITE_*
              </code>{" "}
              variable.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-12">
        <Panel
          className="lg:col-span-5"
          eyebrow="Treasury"
          title="Payout coverage"
          action={<Coins className="size-4 text-gold" />}
        >
          <div className="flex items-end justify-between">
            <div>
              <p className="label-xs">Available reward pool</p>
              <p className="num mt-1 text-2xl font-semibold text-gold">
                {formatUsd(treasury.availableUsd)}
              </p>
            </div>
            <StatusPill tone={treasury.coverage >= 100 ? "up" : "warn"}>
              {treasury.coverage}% covered
            </StatusPill>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border/70 pt-3">
            <Metric
              label="NEX liability"
              value={`${formatNex(treasury.liabilityNex)}`}
              sub={`${formatUsd(treasury.liabilityUsd)} at target`}
            />
            <Metric
              label="Pending payouts"
              value={formatUsd(treasury.pendingPayoutUsd)}
              sub={`${formatNex(treasury.reservedNex)} NEX reserved`}
              tone="warn"
            />
          </div>
          <p className="mt-2 text-[9.5px] leading-relaxed text-muted-foreground">
            Fixed treasury is operator-entered. Fund it only from reconciled pool
            fees and advertising revenue.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full font-mono text-[9px] uppercase tracking-[0.1em]"
            onClick={() => onTab("mining")}
          >
            Reconcile treasury
          </Button>
        </Panel>

        <Panel
          className="lg:col-span-7"
          eyebrow="Account base"
          title="Live counts"
          action={
            <Button
              size="sm"
              variant="ghost"
              className="gap-1 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="size-3" /> Refresh
            </Button>
          }
        >
          <div className="grid grid-cols-3 gap-x-3 gap-y-3 sm:grid-cols-4">
            <Metric label="Accounts" value={counts.users} sub="registered" />
            <Metric label="Linked wallets" value={counts.walletsLinked} sub="TON" />
            <Metric label="Telegram" value={counts.telegramLinked} sub="verified" />
            <Metric
              label="Compliance"
              value={counts.complianceCleared}
              sub="cleared"
              tone="up"
            />
            <Metric
              label="Active tasks"
              value={counts.activeTasks}
              sub="campaigns"
            />
            <Metric
              label="Reviews"
              value={counts.pendingReviews}
              sub="pending"
              tone="warn"
            />
            <Metric
              label="Payout queue"
              value={counts.pendingWithdrawals}
              sub="requests"
              tone="warn"
            />
            <Metric
              label="Restricted"
              value={counts.restricted}
              sub="accounts"
              tone={counts.restricted > 0 ? "down" : "default"}
            />
          </div>
          <div className="mt-3 grid gap-2 border-t border-border/70 pt-3 sm:grid-cols-2">
            <EmergencyControl
              label="Mining engine"
              active={service.miningEnabled}
              busy={saving === "miningEnabled"}
              onToggle={() => emergencyToggle("miningEnabled")}
            />
            <EmergencyControl
              label="Withdrawal desk"
              active={service.withdrawalsEnabled}
              busy={saving === "withdrawalsEnabled"}
              onToggle={() => emergencyToggle("withdrawalsEnabled")}
            />
          </div>
        </Panel>
      </div>

      <Panel
        eyebrow="TON deposits"
        title="Deposit rail"
        action={
          <StatusPill
            tone={
              deposits.treasuryConfigured && deposits.ratesConfigured
                ? "up"
                : "warn"
            }
          >
            {deposits.treasuryConfigured && deposits.ratesConfigured
              ? "Live"
              : "Offline"}
          </StatusPill>
        }
      >
        {!deposits.treasuryConfigured ? (
          <p className="mb-3 rounded-lg border border-warn/40 bg-warn/[0.05] px-3 py-2 text-[10.5px] leading-relaxed text-muted-foreground">
            No valid TON treasury address is configured on this deployment, so
            users cannot create a deposit quote. Set{" "}
            <code className="font-mono text-[10px] text-foreground">
              TON_TREASURY_ADDRESS
            </code>{" "}
            (or{" "}
            <code className="font-mono text-[10px] text-foreground">
              TON_DEPOSIT_ADDRESS
            </code>
            ) and publish TON/NEX reference rates before opening the rail.
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
          <Metric
            label="Open quotes"
            value={deposits.openQuotes}
            sub="awaiting payment"
            tone={deposits.openQuotes > 0 ? "warn" : "default"}
          />
          <Metric
            label="Confirmed"
            value={deposits.confirmed}
            sub={`${deposits.receivedTon} TON received`}
            tone="up"
          />
          <Metric
            label="Failed"
            value={deposits.failed}
            sub="verification rejected"
            tone={deposits.failed > 0 ? "down" : "default"}
          />
          <Metric
            label="Expired quotes"
            value={deposits.expiredQuotes}
            sub="never matched"
          />
          <Metric
            label="Credited NEX"
            value={formatNex(deposits.creditedNex)}
            sub="all confirmed deposits"
            tone="gold"
          />
          <Metric
            label="Last 7 days"
            value={deposits.last7d}
            sub="new intents"
          />
          <Metric
            label="Reference rates"
            value={deposits.ratesConfigured ? "Set" : "Missing"}
            sub="TON + NEX"
            tone={deposits.ratesConfigured ? "default" : "warn"}
          />
          <Metric label="Total intents" value={deposits.total} sub="all time" />
        </div>
        {deposits.recent.length > 0 ? (
          <ul className="mt-3 divide-y divide-border/60 border-t border-border/70">
            {deposits.recent.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-2 py-2"
              >
                <div className="min-w-0">
                  <p className="num text-[11px]">
                    {row.tonAmount.toFixed(2)} TON
                    {row.creditedNex ? (
                      <span className="ml-1.5 text-[10px] text-up">
                        +{formatNex(row.creditedNex)} NEX
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground">
                    {row.nexId} · {row.memo} · {formatDateTime(row.createdAt)}
                  </p>
                </div>
                <StatusPill
                  tone={
                    row.status === "confirmed"
                      ? "up"
                      : row.status === "failed"
                        ? "down"
                        : "warn"
                  }
                >
                  {row.status}
                </StatusPill>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 border-t border-border/70 pt-3 text-[11px] text-muted-foreground">
            No deposit intents yet.
          </p>
        )}
      </Panel>

      <Panel
        eyebrow="Recent operator activity"
        title="Audit tape"
        action={
          <button
            type="button"
            onClick={() => onTab("audit")}
            className="font-mono text-[9px] uppercase tracking-[0.1em] text-primary"
          >
            Full log
          </button>
        }
        bodyClassName="p-0"
      >
        {recentAudit.length === 0 ? (
          <p className="px-4 py-4 text-[11px] text-muted-foreground">
            No privileged actions recorded yet.
          </p>
        ) : (
          <ul>
            {recentAudit.map((row) => (
              <li
                key={row.id}
                className="flex items-start gap-2 border-b border-border/60 px-3.5 py-2 last:border-0"
              >
                <span className="mt-1 size-1 shrink-0 bg-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10.5px]">
                    <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-primary">
                      {row.action}
                    </span>
                    <span className="ml-2 text-muted-foreground">{row.detail}</span>
                  </p>
                  <p className="font-mono text-[8.5px] text-muted-foreground">
                    {row.actor} · {formatDateTime(row.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function EmergencyControl({
  label,
  active,
  busy,
  onToggle,
}: {
  label: string;
  active: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-sm border px-2.5 py-2",
        active ? "border-border/80 bg-secondary/30" : "border-down/40 bg-down/[0.06]",
      )}
    >
      <div>
        <p className="text-[10.5px] font-medium">{label}</p>
        <p
          className={cn(
            "font-mono text-[8.5px] uppercase tracking-[0.08em]",
            active ? "text-up" : "text-down",
          )}
        >
          {active ? "running" : "paused"}
        </p>
      </div>
      <Button
        size="sm"
        variant={active ? "outline" : "default"}
        className="gap-1 font-mono text-[8.5px] uppercase tracking-[0.08em]"
        disabled={busy}
        onClick={onToggle}
      >
        {busy ? (
          <Spinner />
        ) : active ? (
          <Ban className="size-3" />
        ) : (
          <Play className="size-3" />
        )}
        {active ? "Pause" : "Resume"}
      </Button>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="label-xs">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint ? (
        <span className="mt-1 block text-[9px] leading-relaxed text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  step = "0.01",
  min = "0",
}: {
  value: number;
  onChange: (value: number) => void;
  step?: string;
  min?: string;
}) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      value={Number.isFinite(value) ? value : 0}
      onChange={(event) => onChange(Number(event.target.value))}
      className="num text-[12px]"
    />
  );
}

function Economy() {
  const overview = useQuery(api.admin.overview);
  if (!overview) return <LoadingBlock rows={4} />;
  return (
    <div className="space-y-3">
      <EconomyForm config={overview.config} />
      <LadderPanel levels={overview.levels} />
    </div>
  );
}

type AdminLevel = AdminOverview["levels"][number];

/** The level ladder: XP targets, NEX rewards and mining-speed steps are edited
 * separately, and the backend rejects thresholds that do not rise. */
function LadderPanel({ levels }: { levels: AdminLevel[] }) {
  const updateLevels = useMutation(api.admin.updateLevels);
  const [rows, setRows] = useState<AdminLevel[]>(levels);
  const [saving, setSaving] = useState(false);

  const patchRow = (level: number, patch: Partial<AdminLevel>) =>
    setRows((current) =>
      current.map((row) => (row.level === level ? { ...row, ...patch } : row)),
    );

  const save = async () => {
    setSaving(true);
    try {
      await updateLevels({ levels: rows });
      toast.success("Progression ladder saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ladder rejected.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      eyebrow="Progression"
      title="Level rewards & speed bonuses"
      action={
        <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
          {saving ? <Spinner /> : <Check className="size-3" />} Save ladder
        </Button>
      }
    >
      <p className="text-[9.5px] leading-relaxed text-muted-foreground">
        XP targets must climb at every level. Rewards and speed bonuses are edited
        separately; a claim is only accepted when the stored XP target is met and the
        previous level is already claimed.
      </p>
      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        {rows.map((row) => (
          <div
            key={row.level}
            className="rounded-sm border border-border/70 bg-panel/40 px-2.5 py-2"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium">
                Level {row.level} — {row.name}
              </p>
              <span className="num font-mono text-[9px] text-muted-foreground">
                {row.xpRequired.toLocaleString("en-US")} XP
              </span>
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              <label className="block">
                <span className="label-xs">XP target</span>
                <NumberInput
                  value={row.xpRequired}
                  onChange={(value) => patchRow(row.level, { xpRequired: value })}
                  step="1"
                  min="1"
                />
              </label>
              <label className="block">
                <span className="label-xs">Reward NEX</span>
                <NumberInput
                  value={row.rewardNex}
                  onChange={(value) => patchRow(row.level, { rewardNex: value })}
                  step="any"
                />
              </label>
              <label className="block">
                <span className="label-xs">Speed NEX/h</span>
                <NumberInput
                  value={row.speedBonusNexPerHour}
                  onChange={(value) =>
                    patchRow(row.level, { speedBonusNexPerHour: value })
                  }
                  step="any"
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function EconomyForm({ config }: { config: AdminConfig }) {
  const updateConfig = useMutation(api.admin.updateConfig);
  const [form, setForm] = useState<AdminConfig>(config);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof AdminConfig>(key: K, value: AdminConfig[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      await updateConfig(configPayload(form));
      toast.success("Economy configuration saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update rejected.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="label-xs">Backend economy</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">
            Mining rate, caps & payout rules
          </h1>
        </div>
        <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
          {saving ? <Spinner /> : <Check className="size-3" />} Save configuration
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel eyebrow="Mining engine" title="Rate & daily cap">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Base rate (NEX / hour)"
              hint="Applied to every active account · 9-decimal grid"
            >
              <NumberInput
                value={form.baseRateNexPerHour}
                onChange={(value) => set("baseRateNexPerHour", value)}
                step="any"
              />
            </Field>
            <Field label="Daily cap (NEX)" hint="Normal mining only; the extension has a separate bucket.">
              <NumberInput
                value={form.dailyLimitNex}
                onChange={(value) => set("dailyLimitNex", value)}
                step="any"
              />
            </Field>
            <Field label="Background permission (hours)" hint="Granted after 10 provider-verified ads.">
              <NumberInput
                value={form.awayMiningHours}
                onChange={(value) => set("awayMiningHours", value)}
                step="1"
                min="1"
              />
            </Field>
            <Field label="Extension length (hours)" hint="Granted after 20 verified ads at the cap.">
              <NumberInput
                value={form.extensionHours}
                onChange={(value) => set("extensionHours", value)}
                step="1"
                min="1"
              />
            </Field>
            <Field
              label="Verified-ad reward (NEX)"
              hint="Credited once per provider-valued postback. 0 disables the cash reward."
            >
              <NumberInput
                value={form.adRewardNex}
                onChange={(value) => set("adRewardNex", value)}
                step="any"
                min="0"
              />
            </Field>
            <Field label="NEX target (USD)" hint="Published reference, not a liquidity promise.">
              <NumberInput
                value={form.nexUsdRate}
                onChange={(value) => set("nexUsdRate", value)}
                step="0.01"
              />
            </Field>
            <Field label="TON reference (USD)" hint="Used to quote payout TON amounts.">
              <NumberInput
                value={form.tonUsdRate}
                onChange={(value) => set("tonUsdRate", value)}
                step="0.01"
              />
            </Field>
          </div>
          <div className="mt-3 space-y-2 border-t border-border/70 pt-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium">Mining enabled</p>
                <p className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground">
                  resets accrual start when resumed
                </p>
              </div>
              <Switch
                checked={form.miningEnabled}
                onCheckedChange={(value) => set("miningEnabled", value)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium">Withdrawals enabled</p>
                <p className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground">
                  does not bypass eligibility
                </p>
              </div>
              <Switch
                checked={form.withdrawalsEnabled}
                onCheckedChange={(value) => set("withdrawalsEnabled", value)}
              />
            </div>
          </div>
        </Panel>

        <Panel eyebrow="Referral & payout rules" title="Qualification">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Qualified referrals required">
              <NumberInput
                value={form.qualifiedReferralTarget}
                onChange={(value) => set("qualifiedReferralTarget", value)}
                step="1"
              />
            </Field>
            <Field label="Verified tasks per referral">
              <NumberInput
                value={form.referralTaskTarget}
                onChange={(value) => set("referralTaskTarget", value)}
                step="1"
                min="1"
              />
            </Field>
            <Field label="Referral bonus (NEX / hour)">
              <NumberInput
                value={form.referralBonusNexPerHour}
                onChange={(value) => set("referralBonusNexPerHour", value)}
                step="0.001"
              />
            </Field>
            <Field label="Referral bonus cap">
              <NumberInput
                value={form.referralBonusCap}
                onChange={(value) => set("referralBonusCap", value)}
                step="1"
              />
            </Field>
            <Field label="Minimum withdrawal (NEX)">
              <NumberInput
                value={form.minWithdrawNex}
                onChange={(value) => set("minWithdrawNex", value)}
              />
            </Field>
            <Field
              label="Treasury available (USD)"
              hint="Hard ceiling for payout requests."
            >
              <NumberInput
                value={form.treasuryAvailableUsd}
                onChange={(value) => set("treasuryAvailableUsd", value)}
              />
            </Field>
          </div>
          <p className="mt-3 rounded-sm border border-warn/30 bg-warn/[0.05] p-2.5 text-[9.5px] leading-relaxed text-muted-foreground">
            Referral speed is applied automatically from verified task records. No
            client can set a rate, and no referral counts before{" "}
            {form.referralTaskTarget} verified tasks.
          </p>
        </Panel>
      </div>

      <Panel eyebrow="Service controls" title="Pause and resume">
        <div className="grid gap-2 sm:grid-cols-2">
          <EmergencyControl
            label="Mining engine"
            active={form.miningEnabled}
            busy={false}
            onToggle={() => set("miningEnabled", !form.miningEnabled)}
          />
          <EmergencyControl
            label="Withdrawal desk"
            active={form.withdrawalsEnabled}
            busy={false}
            onToggle={() => set("withdrawalsEnabled", !form.withdrawalsEnabled)}
          />
        </div>
        <p className="mt-2 text-[9.5px] leading-relaxed text-muted-foreground">
          Changes take effect only after Save. Pausing mining stops accrual; resuming
          starts from the save timestamp — no back-pay is created.
        </p>
      </Panel>
    </div>
  );
}

type AdminTasks = NonNullable<FunctionReturnType<typeof api.admin.taskAdmin>>;

function Campaigns() {
  const data = useQuery(api.admin.taskAdmin);
  if (!data) return <LoadingBlock rows={4} />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="label-xs">Sponsor campaigns</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">
            Tasks & verification queue
          </h1>
        </div>
        <div className="flex gap-1.5">
          <StatusPill tone={data.configured.telegram ? "up" : "warn"}>
            Telegram {data.configured.telegram ? "ready" : "no token"}
          </StatusPill>
          <StatusPill tone={data.configured.adProvider ? "up" : "warn"}>
            Ads {data.configured.adProvider ? "ready" : "unconfigured"}
          </StatusPill>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <TaskForm />
        </div>
        <div className="lg:col-span-7">
          <ReviewQueue data={data} />
        </div>
      </div>

      <Panel
        eyebrow="Campaign registry"
        title={`${data.tasks.length} campaigns`}
        bodyClassName="p-0"
      >
        <TaskList tasks={data.tasks} />
      </Panel>
    </div>
  );
}

function TaskForm() {
  const createTask = useMutation(api.admin.createTask);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    sponsor: "",
    category: "join_channel" as
      | "advertisement"
      | "join_channel"
      | "join_group"
      | "sponsor_bot"
      | "social",
    verification: "telegram_channel" as
      | "telegram_channel"
      | "telegram_group"
      | "telegram_bot"
      | "provider_ad"
      | "social"
      | "manual",
    target: "",
    description: "",
    instructions: "",
    rewardNex: 0.25,
    speedBonusNexPerHour: 0.05,
    verificationNote: "",
    expiresAt: "",
  });

  const submit = async () => {
    setSaving(true);
    try {
      await createTask({
        title: form.title,
        sponsor: form.sponsor,
        category: form.category,
        description: form.description,
        instructions: form.instructions
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
        rewardNex: form.rewardNex,
        speedBonusNexPerHour: form.speedBonusNexPerHour,
        verification: form.verification,
        target: form.target || undefined,
        verificationNote: form.verificationNote,
        expiresAt: form.expiresAt
          ? new Date(form.expiresAt).getTime()
          : undefined,
      });
      toast.success("Campaign published");
      setForm((current) => ({
        ...current,
        title: "",
        description: "",
        instructions: "",
        target: "",
        verificationNote: "",
        expiresAt: "",
      }));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Campaign was rejected.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel eyebrow="New sponsor campaign" title="Publish a task">
      <div className="space-y-3">
        <Field label="Task title">
          <Input
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            placeholder="Join the sponsor announcement channel"
            className="text-[12px]"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Sponsor">
            <Input
              value={form.sponsor}
              onChange={(event) =>
                setForm({ ...form, sponsor: event.target.value })
              }
              placeholder="Sponsor name"
              className="text-[12px]"
            />
          </Field>
          <Field label="Category">
            <select
              value={form.category}
              onChange={(event) =>
                setForm({
                  ...form,
                  category: event.target.value as typeof form.category,
                })
              }
              className="h-9 w-full rounded-sm border border-input bg-transparent px-2 text-[11px] outline-none focus-visible:border-ring"
            >
              <option value="join_channel">Join channel</option>
              <option value="join_group">Join group</option>
              <option value="advertisement">Advertisement</option>
              <option value="sponsor_bot">Sponsor bot</option>
              <option value="social">Social</option>
            </select>
          </Field>
        </div>
        <Field label="Description">
          <Textarea
            value={form.description}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value })
            }
            className="min-h-16 text-[11.5px]"
            placeholder="What the user must do and what the sponsor gets."
          />
        </Field>
        <Field label="Instructions (one per line)">
          <Textarea
            value={form.instructions}
            onChange={(event) =>
              setForm({ ...form, instructions: event.target.value })
            }
            className="min-h-20 text-[11.5px]"
            placeholder={"Open the channel\nTap Join\nReturn here and verify"}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Verification">
            <select
              value={form.verification}
              onChange={(event) =>
                setForm({
                  ...form,
                  verification: event.target.value as typeof form.verification,
                })
              }
              className="h-9 w-full rounded-sm border border-input bg-transparent px-2 text-[11px] outline-none focus-visible:border-ring"
            >
              <option value="telegram_channel">Telegram channel</option>
              <option value="telegram_group">Telegram group</option>
              <option value="provider_ad">Ad provider</option>
              <option value="telegram_bot">Sponsor bot</option>
              <option value="social">Social (manual)</option>
              <option value="manual">Manual review</option>
            </select>
          </Field>
          <Field label="Target / placement">
            <Input
              value={form.target}
              onChange={(event) =>
                setForm({ ...form, target: event.target.value })
              }
              placeholder="@channel or placement id"
              className="text-[12px]"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Reward (NEX)">
            <NumberInput
              value={form.rewardNex}
              onChange={(value) => setForm({ ...form, rewardNex: value })}
            />
          </Field>
          <Field label="Speed bonus (NEX/h)">
            <NumberInput
              value={form.speedBonusNexPerHour}
              onChange={(value) =>
                setForm({ ...form, speedBonusNexPerHour: value })
              }
              step="0.01"
            />
          </Field>
        </div>
        <Field label="Expiry (optional)">
          <Input
            type="datetime-local"
            value={form.expiresAt}
            onChange={(event) =>
              setForm({ ...form, expiresAt: event.target.value })
            }
            className="text-[11.5px]"
          />
        </Field>
        <Field label="Verification note">
          <Input
            value={form.verificationNote}
            onChange={(event) =>
              setForm({ ...form, verificationNote: event.target.value })
            }
            placeholder="How completion is confirmed"
            className="text-[12px]"
          />
        </Field>
        <Button
          className="w-full gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em]"
          onClick={submit}
          disabled={
            saving ||
            form.title.trim().length < 3 ||
            form.sponsor.trim().length < 2 ||
            form.description.trim().length < 3 ||
            form.instructions.trim().length < 3
          }
        >
          {saving ? <Spinner /> : <Megaphone className="size-3.5" />} Publish
          campaign
        </Button>
        <p className="text-[9px] leading-relaxed text-muted-foreground">
          Telegram tasks call getChatMember with the configured bot token. Ad tasks
          call the provider verifier. Manual tasks wait for operator review. No
          campaign can reward a click alone.
        </p>
      </div>
    </Panel>
  );
}

function ReviewQueue({ data }: { data: AdminTasks }) {
  const review = useMutation(api.admin.reviewTask);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const decide = async (id: string, decision: "verify" | "reject") => {
    setBusy(id);
    try {
      await review({
        completionId: id as never,
        decision,
        note: notes[id] ?? "",
      });
      toast.success(decision === "verify" ? "Reward granted" : "Task rejected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Review failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel
      eyebrow="Verification queue"
      title={`${data.pendingTotal} awaiting review`}
      action={<Flag className="size-4 text-warn" />}
      bodyClassName="p-0"
    >
      {data.reviews.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={<CheckCircle2 className="size-4" />}
            title="Queue clear"
            body="Submissions that need a human decision appear here. Automated Telegram and provider checks settle without operator action."
          />
        </div>
      ) : (
        <ul>
          {data.reviews.map((row) => (
            <li
              key={row.id}
              className="border-b border-border/60 px-3.5 py-3 last:border-0"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[11.5px] font-medium">{row.taskTitle}</p>
                  <p className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                    {row.nexId} · {row.displayName} · {formatDateTime(row.submittedAt)}
                  </p>
                  <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                    {row.note ?? "No submission note."}
                  </p>
                </div>
                <span className="num shrink-0 text-[10px] text-gold">
                  +{formatNex(row.rewardNex)}
                </span>
              </div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Input
                  value={notes[row.id] ?? ""}
                  onChange={(event) =>
                    setNotes({ ...notes, [row.id]: event.target.value })
                  }
                  placeholder="Review note (audited)"
                  className="h-8 flex-1 text-[10.5px]"
                />
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    className="gap-1 font-mono text-[8.5px] uppercase tracking-[0.08em]"
                    disabled={busy === row.id}
                    onClick={() => decide(row.id, "verify")}
                  >
                    {busy === row.id ? <Spinner /> : <Check className="size-3" />}
                    Verify
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 font-mono text-[8.5px] uppercase tracking-[0.08em] text-down"
                    disabled={busy === row.id}
                    onClick={() => decide(row.id, "reject")}
                  >
                    <Ban className="size-3" /> Reject
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function TaskList({ tasks }: { tasks: AdminTasks["tasks"] }) {
  const setStatus = useMutation(api.admin.setTaskStatus);
  const [busy, setBusy] = useState<string | null>(null);

  if (tasks.length === 0) {
    return (
      <div className="p-4">
        <EmptyState
          icon={<ListChecks className="size-4" />}
          title="No campaigns published"
          body="Create the first verified sponsor task. Users will see it immediately in the task centre."
        />
      </div>
    );
  }

  return (
    <ul>
      {tasks.map((task) => (
        <li
          key={task.id}
          className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3.5 py-2.5 last:border-0"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11.5px] font-medium">{task.title}</p>
            <p className="mt-0.5 font-mono text-[8.5px] uppercase tracking-[0.06em] text-muted-foreground">
              {task.sponsor} · {task.category.replace("_", " ")} ·{" "}
              {task.verification.replace("_", " ")} · +{formatNex(task.rewardNex)}{" "}
              NEX
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[8.5px] text-muted-foreground">
              {task.verifiedCount} verified · {task.pendingCount} pending
            </span>
            <StatusPill
              tone={
                task.status === "active"
                  ? "up"
                  : task.status === "paused"
                    ? "warn"
                    : "muted"
              }
            >
              {task.status}
            </StatusPill>
            {task.status !== "active" ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 font-mono text-[8px] uppercase text-primary"
                disabled={busy === task.id}
                onClick={async () => {
                  setBusy(task.id);
                  try {
                    await setStatus({ taskId: task.id as never, status: "active" });
                    toast.success("Campaign resumed");
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : "Update failed.",
                    );
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                Resume
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 font-mono text-[8px] uppercase text-warn"
                disabled={busy === task.id}
                onClick={async () => {
                  setBusy(task.id);
                  try {
                    await setStatus({ taskId: task.id as never, status: "paused" });
                    toast.success("Campaign paused");
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : "Update failed.",
                    );
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                Pause
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function RecoveryDesk() {
  const [primaryNexId, setPrimaryNexId] = useState("NXP-8VFXVB");
  const [duplicateNexId, setDuplicateNexId] = useState("NXP-Q5UD78");
  const [submitted, setSubmitted] = useState<{
    primaryNexId: string;
    duplicateNexId: string;
  } | null>(null);
  const preview = useQuery(
    api.recovery.recoveryPreview,
    submitted ?? "skip",
  );
  const merge = useMutation(api.recovery.mergeDuplicateAccount);
  const retire = useMutation(api.recoveryRetire.retireDuplicateAccount);
  const [confirmPrimary, setConfirmPrimary] = useState("");
  const [confirmDuplicate, setConfirmDuplicate] = useState("");
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [retiring, setRetiring] = useState(false);

  const runPreview = () => {
    const primary = primaryNexId.trim();
    const duplicate = duplicateNexId.trim();
    if (!primary || !duplicate) {
      toast.error("Enter both NEX IDs.");
      return;
    }
    if (primary === duplicate) {
      toast.error("Primary and duplicate must be different accounts.");
      return;
    }
    setConfirmPrimary("");
    setConfirmDuplicate("");
    setOwnershipConfirmed(false);
    setSubmitted({ primaryNexId: primary, duplicateNexId: duplicate });
  };

  const performMerge = async () => {
    if (!submitted || !preview?.ok || !preview.mergeReady) return;
    if (
      confirmPrimary.trim() !== submitted.primaryNexId ||
      confirmDuplicate.trim() !== submitted.duplicateNexId
    ) {
      toast.error("Type both full NEX IDs exactly.");
      return;
    }
    if (!ownershipConfirmed) {
      toast.error(
        "Confirm that both accounts belong to the same person before merging.",
      );
      return;
    }
    const confirmed = window.confirm(
      `MERGE ${submitted.duplicateNexId} INTO ${submitted.primaryNexId}?\n\n` +
        "The duplicate profile will be retired and the verified Telegram login will move to the primary. " +
        "Only ledger entries with unique kind/refId keys are added to the primary balance. " +
        "The duplicate's complete records are archived first. This cannot be undone from the dashboard.",
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      const result = await merge({
        primaryNexId: submitted.primaryNexId,
        duplicateNexId: submitted.duplicateNexId,
        confirmPrimaryNexId: confirmPrimary.trim(),
        confirmDuplicateNexId: confirmDuplicate.trim(),
        ownershipConfirmed: true,
        reason: reason.trim() || undefined,
      });
      if (result.alreadyMerged) {
        toast.success("This duplicate was already merged; nothing was changed.");
      } else {
        toast.success(
          `${result.duplicateNexId} merged into ${result.primaryNexId}. ${formatNex(result.transferred.netNex)} NEX unique ledger value transferred; balance now ${formatNex(result.primaryBalanceNex)} NEX.`,
        );
      }
      setSubmitted(null);
      setConfirmPrimary("");
      setConfirmDuplicate("");
      setOwnershipConfirmed(false);
      setReason("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Merge failed.");
    } finally {
      setBusy(false);
    }
  };

  const performRetire = async () => {
    if (!submitted || !preview?.ok) return;
    if (
      confirmPrimary.trim() !== submitted.primaryNexId ||
      confirmDuplicate.trim() !== submitted.duplicateNexId
    ) {
      toast.error("Type both full NEX IDs exactly.");
      return;
    }
    if (!ownershipConfirmed) {
      toast.error(
        "Confirm that both accounts belong to the same person before retiring the duplicate.",
      );
      return;
    }
    const confirmed = window.confirm(
      `RETIRE ${submitted.duplicateNexId} WITHOUT TRANSFERRING ITS DATA?\n\n` +
        `The duplicate is archived, its verified Telegram login moves to ${submitted.primaryNexId}, and the duplicate is deleted. ` +
        `No duplicate balance, mining, task, referral, deposit or withdrawal data is added to ${submitted.primaryNexId}. ` +
        `This cannot be undone from the dashboard.`,
    );
    if (!confirmed) return;
    setRetiring(true);
    try {
      const result = await retire({
        primaryNexId: submitted.primaryNexId,
        duplicateNexId: submitted.duplicateNexId,
        confirmPrimaryNexId: confirmPrimary.trim(),
        confirmDuplicateNexId: confirmDuplicate.trim(),
        ownershipConfirmed: true,
        reason: reason.trim() || undefined,
      });
      if (result.alreadyRetired) {
        toast.success("This duplicate was already retired; nothing was changed.");
      } else {
        toast.success(
          `${result.duplicateNexId} retired with zero transfer. ${result.primaryNexId} balance remains ${formatNex(result.primaryBalanceNex)} NEX.`,
        );
      }
      setSubmitted(null);
      setConfirmPrimary("");
      setConfirmDuplicate("");
      setOwnershipConfirmed(false);
      setReason("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Retirement failed.",
      );
    } finally {
      setRetiring(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="label-xs">Identity repair</p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight">
          Account recovery & canonical merge
        </h1>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          Read-only preview first. A merge requires a verified Telegram auth
          account on the duplicate, exact NEX ID confirmations, an available
          balance with no pending withdrawals or deposits, and produces an
          immutable archive plus audit entry. The primary keeps its NEX ID,
          referral code, display name and lifetime identity.
        </p>
      </div>

      <div className="rounded-md border border-border/80 bg-card p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="label-xs">Primary · preserved</span>
            <Input
              value={primaryNexId}
              onChange={(event) => setPrimaryNexId(event.target.value)}
              placeholder="NXP-8VFXVB"
              className="font-mono"
            />
          </label>
          <label className="space-y-1">
            <span className="label-xs">Duplicate · retired</span>
            <Input
              value={duplicateNexId}
              onChange={(event) => setDuplicateNexId(event.target.value)}
              placeholder="NXP-Q5UD78"
              className="font-mono"
            />
          </label>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={runPreview}
            disabled={busy || retiring}
          >
            <ShieldCheck className="size-3.5" />
            Run forensic preview
          </Button>
          <span className="font-mono text-[9px] text-muted-foreground">
            No writes until the final merge confirmation.
          </span>
        </div>
      </div>

      {submitted && preview === undefined ? <LoadingBlock rows={3} /> : null}

      {submitted && preview === null ? (
        <div className="rounded-md border border-border/80 bg-card p-3 text-[11px] text-muted-foreground">
          Operator access is required to read recovery data.
        </div>
      ) : null}

      {submitted && preview?.ok === false ? (
        <div className="rounded-md border border-down/40 bg-down/5 p-3">
          <p className="text-[12px] font-medium">Account not found</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Missing in this deployment: {preview.missing.join(", ") || "unknown"}.
            Nothing was changed.
          </p>
        </div>
      ) : null}

      {submitted && preview?.ok ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={preview.mergeReady ? "up" : "warn"}>
              {preview.mergeReady ? "Merge ready" : "Blocked"}
            </StatusPill>
            <span className="font-mono text-[9px] text-muted-foreground">
              Verified Telegram owner: {preview.identity?.telegramOwnerNexId ?? "not resolved"}
            </span>
          </div>

          <div className="grid gap-2 lg:grid-cols-2">
            {[preview.primary, preview.duplicate].map((account, index) =>
              account ? (
                <div
                  key={account.nexId}
                  className={cn(
                    "rounded-md border bg-card p-3",
                    index === 0 ? "border-up/30" : "border-border/80",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[12px] font-medium">
                        {account.displayName}
                      </p>
                      <p className="font-mono text-[9px] text-muted-foreground">
                        {account.nexId} · {account.user.role ?? "user"}
                      </p>
                    </div>
                    <StatusPill tone={account.telegramLinked ? "signal" : "warn"}>
                      {account.telegramLinked ? "TG linked" : "No TG"}
                    </StatusPill>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <Metric label="Available" value={formatNex(account.balance.availableNex)} />
                    <Metric label="Reserved" value={formatNex(account.balance.reservedNex)} />
                    <Metric label="Ledger net" value={formatNex(account.ledgerNetNex)} />
                    <Metric label="Ledger rows" value={account.ledgerCount} />
                    <Metric label="Mining days" value={account.miningDayCount} />
                    <Metric label="Tasks" value={account.verifiedTaskCount} />
                    <Metric label="Referrals" value={account.referralsInvited} />
                    <Metric label="Deposits" value={account.deposits} />
                    <Metric label="Withdrawals" value={account.withdrawals} />
                  </div>
                  <p className="mt-2 border-t border-border/60 pt-2 font-mono text-[9px] leading-relaxed text-muted-foreground">
                    Auth: {account.authProviders.join(", ") || "none"} · XP {account.xp} · claimed level {account.claimedLevel} · TG verified{" "}
                    {account.telegramVerifiedAt
                      ? formatDateTime(account.telegramVerifiedAt)
                      : " no"}
                  </p>
                </div>
              ) : null,
            )}
          </div>

          <div className="rounded-md border border-border/80 bg-card p-3">
            <p className="label-xs">Ledger reconciliation</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric
                label="Unique NEX"
                value={formatNex(preview.reconciliation?.transferableNex ?? 0)}
                tone="up"
              />
              <Metric
                label="Mining unique"
                value={formatNex(preview.reconciliation?.transferableMiningNex ?? 0)}
              />
              <Metric
                label="Task unique"
                value={formatNex(preview.reconciliation?.transferableTaskNex ?? 0)}
              />
              <Metric
                label="Ref collisions"
                value={preview.reconciliation?.collidedLedgerRows ?? 0}
                tone={(preview.reconciliation?.collidedLedgerRows ?? 0) > 0 ? "warn" : undefined}
              />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
              Only the unique ledger value above changes the primary balance.
              Duplicate mining days, tasks, levels, referral rows and wallet
              entries are reconciled separately; colliding rows are archived,
              never added twice.
            </p>
          </div>

          {preview.blockers.length > 0 ? (
            <div className="rounded-md border border-down/40 bg-down/5 p-3">
              <p className="text-[12px] font-medium text-down">Merge blocked</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] text-muted-foreground">
                {preview.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-md border border-border/80 bg-card p-3">
            <p className="label-xs">Final confirmation</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Input
                value={confirmPrimary}
                onChange={(event) => setConfirmPrimary(event.target.value)}
                placeholder={`Type ${submitted.primaryNexId}`}
                className="font-mono"
              />
              <Input
                value={confirmDuplicate}
                onChange={(event) => setConfirmDuplicate(event.target.value)}
                placeholder={`Type ${submitted.duplicateNexId}`}
                className="font-mono"
              />
            </div>
            <label className="mt-2 flex items-start gap-2 border border-border/70 p-2 text-[10px] leading-relaxed text-muted-foreground">
              <input
                type="checkbox"
                checked={ownershipConfirmed}
                onChange={(event) =>
                  setOwnershipConfirmed(event.target.checked)
                }
                className="mt-0.5 size-3.5 accent-primary"
              />
              <span>
                I verified both NEX IDs belong to the same person, that the
                duplicate owns the verified Telegram identity, and that{" "}
                <span className="font-medium text-foreground">
                  {submitted.primaryNexId}
                </span>{" "}
                must remain canonical.
              </span>
            </label>
            <Textarea
              className="mt-2 min-h-16"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason recorded in the audit log (optional)"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="destructive"
                disabled={
                  busy ||
                  retiring ||
                  !preview.mergeReady ||
                  !ownershipConfirmed ||
                  confirmPrimary.trim() !== submitted.primaryNexId ||
                  confirmDuplicate.trim() !== submitted.duplicateNexId
                }
                onClick={performMerge}
              >
                {busy ? <Spinner /> : <GitMerge className="size-3.5" />}
                Merge duplicate into primary
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-down/40 text-down"
                disabled={
                  busy ||
                  retiring ||
                  !ownershipConfirmed ||
                  confirmPrimary.trim() !== submitted.primaryNexId ||
                  confirmDuplicate.trim() !== submitted.duplicateNexId
                }
                onClick={performRetire}
              >
                {retiring ? <Spinner /> : <Trash2 className="size-3.5" />}
                Retire duplicate only · zero transfer
              </Button>
              <span className="font-mono text-[9px] text-muted-foreground">
                Database transaction · archive + audit · idempotent retry
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function UserTable() {
  const users = useQuery(api.admin.users);
  const updateUser = useMutation(api.admin.updateUser);
  const deleteUser = useMutation(api.admin.deleteUser);
  const [busy, setBusy] = useState<string | null>(null);

  if (!users) return <LoadingBlock rows={4} />;

  const act = async (
    profileId: string,
    payload: {
      restricted?: boolean;
      restrictionReason?: string;
      complianceCleared?: boolean;
    },
  ) => {
    setBusy(profileId);
    try {
      await updateUser({ profileId: profileId as never, ...payload });
      toast.success("Account updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (user: (typeof users)[number]) => {
    const typed = window.prompt(
      `PERMANENT DELETE\n\nThis removes ${user.nexId}, its balance, mining and task history, referrals, withdrawals and deposits. The Telegram sign-in is kept, so the same person can create a fresh NEX account on next launch.\n\nType ${user.nexId} to confirm:`,
    );
    if (typed === null) return;
    if (typed.trim() !== user.nexId) {
      toast.error("The NEX ID did not match. Nothing was deleted.");
      return;
    }
    const reason =
      window.prompt("Optional reason for deleting this account:") ?? "";
    setBusy(user.profileId);
    try {
      const result = await deleteUser({
        profileId: user.profileId as never,
        confirmNexId: typed.trim(),
        reason: reason.trim() || undefined,
      });
      toast.success(
        `${result.nexId} deleted. The user can reopen NEXPOOL to create a new account.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="label-xs">Account base</p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight">
          Users & restrictions
        </h1>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Restricting an account freezes mining, task submission and withdrawals
          immediately. Compliance clearance is required before any payout.
          Deleting an account keeps the Telegram sign-in but permanently removes
          the NEX ID, balance and history so a fresh account can be created.
        </p>
      </div>

      {users.length === 0 ? (
        <EmptyState
          icon={<Users className="size-4" />}
          title="No accounts yet"
          body="Signed-in users are provisioned a NEXPOOL profile, balance and referral code automatically."
        />
      ) : (
        <div className="space-y-2">
          {users.map((user) => (
            <div
              key={user.profileId}
              className="rounded-md border border-border/80 bg-card p-3"
            >
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-[12px] font-medium">
                      {user.displayName}
                    </p>
                    <span className="num text-[9px] text-muted-foreground">
                      {user.nexId}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground">
                    {user.email ?? "Telegram account"} ·{" "}
                    {formatDateTime(user.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {user.restricted ? (
                    <StatusPill tone="down">Restricted</StatusPill>
                  ) : (
                    <StatusPill tone="up">Active</StatusPill>
                  )}
                  <StatusPill tone={user.complianceCleared ? "up" : "warn"}>
                    {user.complianceCleared ? "Compliant" : "Review"}
                  </StatusPill>
                  {user.telegramLinked ? (
                    <StatusPill tone="signal">TG</StatusPill>
                  ) : null}
                  {user.walletAddress ? (
                    <StatusPill tone="gold">TON</StatusPill>
                  ) : null}
                </div>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2 border-t border-border/60 pt-2 sm:grid-cols-6">
                <Metric label="Balance" value={formatNex(user.availableNex)} />
                <Metric label="Reserved" value={formatNex(user.reservedNex)} />
                <Metric label="Tasks" value={user.verifiedTasks} />
                <Metric label="Referrals" value={user.referrals} />
                <Metric label="Qualified" value={user.qualifiedReferrals} tone="up" />
                <Metric label="Payouts" value={user.withdrawals} />
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border/60 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 font-mono text-[8.5px] uppercase tracking-[0.06em]"
                  disabled={busy === user.profileId}
                  onClick={() =>
                    act(user.profileId, {
                      complianceCleared: !user.complianceCleared,
                    })
                  }
                >
                  {busy === user.profileId ? (
                    <Spinner />
                  ) : user.complianceCleared ? (
                    "Revoke compliance"
                  ) : (
                    "Clear compliance"
                  )}
                </Button>
                {user.restricted ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 font-mono text-[8.5px] uppercase tracking-[0.06em]"
                    disabled={busy === user.profileId}
                    onClick={() =>
                      act(user.profileId, {
                        restricted: false,
                        restrictionReason: "",
                      })
                    }
                  >
                    Lift restriction
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 font-mono text-[8.5px] uppercase tracking-[0.06em] text-down"
                    disabled={busy === user.profileId}
                    onClick={() => {
                      const reason = window.prompt(
                        "Reason for restricting this account (shown to the user):",
                      );
                      if (!reason) return;
                      act(user.profileId, {
                        restricted: true,
                        restrictionReason: reason,
                      });
                    }}
                  >
                    <Ban className="size-3" /> Restrict
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 font-mono text-[8.5px] uppercase tracking-[0.06em] text-down"
                  disabled={busy === user.profileId}
                  onClick={() => void remove(user)}
                >
                  {busy === user.profileId ? (
                    <Spinner />
                  ) : (
                    <Trash2 className="size-3" />
                  )}
                  Delete account
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type AdminWithdrawals = NonNullable<
  FunctionReturnType<typeof api.admin.withdrawalsAdmin>
>;
type WithdrawalRow = AdminWithdrawals["rows"][number];

function PayoutQueue() {
  const data = useQuery(api.admin.withdrawalsAdmin);
  const decide = useMutation(api.admin.decideWithdrawal);
  const [hashes, setHashes] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  if (!data) return <LoadingBlock rows={4} />;

  const act = async (
    row: WithdrawalRow,
    action: "review" | "pay" | "reject" | "fail",
  ) => {
    setBusy(row.id);
    try {
      await decide({
        withdrawalId: row.id as never,
        action,
        txHash: hashes[row.id] || undefined,
        note: notes[row.id] || undefined,
      });
      toast.success(`Withdrawal ${action === "pay" ? "confirmed" : action}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="label-xs">Payout desk</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">
            Withdrawal queue
          </h1>
          <p className="mt-1 text-[11px] text-muted-foreground">
            NEX is reserved on request. Confirming a payout requires the real
            transaction hash; rejecting or failing returns NEX to available balance.
          </p>
        </div>
        <div className="flex gap-2">
          <StatusPill tone="warn">{data.pending} pending</StatusPill>
          <StatusPill tone="up">{formatUsd(data.paidUsd)} paid</StatusPill>
        </div>
      </div>

      {data.rows.length === 0 ? (
        <EmptyState
          icon={<Wallet className="size-4" />}
          title="No payout requests"
          body="Requests appear here after a user passes the server eligibility checks."
        />
      ) : (
        <div className="space-y-2">
          {data.rows.map((row) => {
            const settled = ["paid", "rejected", "failed"].includes(row.status);
            return (
              <div
                key={row.id}
                className="rounded-md border border-border/80 bg-card p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="num text-[12px]">
                      {formatNex(row.nexAmount)} NEX → {formatNex(row.tonAmount)} TON
                    </p>
                    <p className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                      {row.nexId} · {row.displayName} ·{" "}
                      {formatDateTime(row.requestedAt)}
                    </p>
                    <p className="num mt-0.5 text-[9px] text-muted-foreground">
                      {row.destination}
                    </p>
                  </div>
                  <StatusPill
                    tone={
                      row.status === "paid"
                        ? "up"
                        : row.status === "rejected" || row.status === "failed"
                          ? "down"
                          : "warn"
                    }
                  >
                    {row.status}
                  </StatusPill>
                </div>

                {row.txHash ? (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <p className="font-mono text-[9px] break-all text-primary">
                      tx {row.txHash}
                    </p>
                    <span
                      className={cn(
                        "font-mono text-[8px] uppercase tracking-[0.08em]",
                        row.chainVerifiedAt ? "text-up" : "text-warn",
                      )}
                    >
                      {row.chainVerifiedAt
                        ? "chain verified"
                        : "hash unverified"}
                    </span>
                  </div>
                ) : null}
                {row.chainVerificationNote ? (
                  <p className="mt-0.5 text-[9px] leading-relaxed text-muted-foreground">
                    {row.chainVerificationNote}
                  </p>
                ) : null}
                {row.note ? (
                  <p className="mt-1 text-[10px] text-muted-foreground">{row.note}</p>
                ) : null}

                {!settled ? (
                  <div className="mt-2 space-y-2 border-t border-border/60 pt-2">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        value={hashes[row.id] ?? ""}
                        onChange={(event) =>
                          setHashes({ ...hashes, [row.id]: event.target.value })
                        }
                        placeholder="TON transaction hash (required to pay)"
                        className="h-8 flex-1 font-mono text-[10px]"
                      />
                      <Input
                        value={notes[row.id] ?? ""}
                        onChange={(event) =>
                          setNotes({ ...notes, [row.id]: event.target.value })
                        }
                        placeholder="Note to user"
                        className="h-8 flex-1 text-[10.5px]"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {row.status === "requested" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 font-mono text-[8.5px] uppercase tracking-[0.06em]"
                          disabled={busy === row.id}
                          onClick={() => act(row, "review")}
                        >
                          Take review
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        className="h-7 gap-1 font-mono text-[8.5px] uppercase tracking-[0.06em]"
                        disabled={busy === row.id || !hashes[row.id]}
                        onClick={() => act(row, "pay")}
                      >
                        {busy === row.id ? <Spinner /> : <Send className="size-3" />}
                        Confirm on-chain
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 font-mono text-[8.5px] uppercase tracking-[0.06em] text-down"
                        disabled={busy === row.id}
                        onClick={() => act(row, "reject")}
                      >
                        Reject & refund
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 font-mono text-[8.5px] uppercase tracking-[0.06em] text-warn"
                        disabled={busy === row.id}
                        onClick={() => act(row, "fail")}
                      >
                        Mark failed
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Broadcast() {
  const broadcast = useMutation(api.admin.broadcast);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel eyebrow="Announcement" title="Broadcast to all accounts">
        <Field label="Title">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Treasury reconciliation complete"
            className="text-[12px]"
          />
        </Field>
        <Field label="Message">
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Only confirmed operational facts. Never announce a payout before the hash exists."
            className="mt-1.5 min-h-28 text-[11.5px]"
          />
        </Field>
        <Button
          className="mt-3 w-full gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em]"
          disabled={sending || title.trim().length < 3 || body.trim().length < 5}
          onClick={async () => {
            setSending(true);
            try {
              const result = await broadcast({ title, body });
              toast.success(`Sent to ${result.recipients} accounts`);
              setTitle("");
              setBody("");
            } catch (error) {
              toast.error(
                error instanceof Error ? error.message : "Broadcast failed.",
              );
            } finally {
              setSending(false);
            }
          }}
        >
          {sending ? <Spinner /> : <Megaphone className="size-3.5" />} Send
          announcement
        </Button>
        <p className="mt-2 text-[9px] leading-relaxed text-muted-foreground">
          Creates an in-app notification for every account and attempts Telegram
          delivery when the identity is linked and a bot token is configured.
        </p>
      </Panel>

      <Panel eyebrow="Compliance reminder" title="Financial communication">
        <ul className="space-y-2.5">
          {[
            "Never announce a withdrawal as paid without an on-chain hash.",
            "Never promise a fixed USD redemption; the target rate is a reference.",
            "Advertising rewards require provider confirmation, not screenshots.",
            "Task rewards require the configured verification workflow.",
            "Operator actions are recorded in the audit log with the actor identity.",
          ].map((line) => (
            <li key={line} className="flex gap-2 text-[11px] leading-relaxed">
              <Check className="mt-0.5 size-3 shrink-0 text-primary" />
              <span className="text-muted-foreground">{line}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function AuditLog() {
  const rows = useQuery(api.admin.auditLog);
  if (!rows) return <LoadingBlock rows={4} />;
  return (
    <div className="space-y-3">
      <div>
        <p className="label-xs">Immutable trail</p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight">Audit log</h1>
      </div>
      <Panel bodyClassName="p-0">
        {rows.length === 0 ? (
          <p className="px-4 py-5 text-[11px] text-muted-foreground">
            No privileged actions recorded.
          </p>
        ) : (
          <ul>
            {rows.map((row) => (
              <li
                key={row.id}
                className="border-b border-border/60 px-3.5 py-2.5 last:border-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-primary">
                    {row.action}
                  </span>
                  <span className="font-mono text-[8.5px] text-muted-foreground">
                    {row.actor}
                  </span>
                  <span className="ml-auto font-mono text-[8.5px] text-muted-foreground">
                    {formatDateTime(row.createdAt)}
                  </span>
                </div>
                <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted-foreground">
                  {row.detail}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
