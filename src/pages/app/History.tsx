import { useQuery } from "convex/react";
import { Link } from "react-router";
import { useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Coins,
  Gauge,
  ListChecks,
  Receipt,
  RefreshCw,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import {
  EmptyState,
  formatDateTime,
  Metric,
  Panel,
  SectionHeading,
  Spinner,
  StatusPill,
} from "@/components/app/parts";
import { cn } from "@/lib/utils";
import { openExternal } from "@/lib/telegram";
import { TON_EXPLORER_TX } from "@/lib/ton";

const KINDS = [
  { key: "all", label: "All" },
  { key: "mining", label: "Mining" },
  { key: "task", label: "Tasks" },
  { key: "referral", label: "Referrals" },
  { key: "deposit", label: "Deposits" },
  { key: "withdrawal", label: "Withdrawals" },
  { key: "refund", label: "Refunds" },
  { key: "adjustment", label: "Adjustments" },
] as const;

type Kind = (typeof KINDS)[number]["key"];

const KIND_META = {
  mining: { icon: Gauge, label: "Mining accrual" },
  task: { icon: ListChecks, label: "Task reward" },
  referral: { icon: Users, label: "Referral bonus" },
  deposit: { icon: ArrowDownLeft, label: "TON deposit" },
  withdrawal: { icon: ArrowUpRight, label: "Withdrawal" },
  refund: { icon: RefreshCw, label: "Refund" },
  adjustment: { icon: SlidersHorizontal, label: "Adjustment" },
} as const;

const WITHDRAW_TONE: Record<
  string,
  { tone: "up" | "warn" | "down" | "muted"; label: string }
> = {
  requested: { tone: "warn", label: "Requested" },
  reviewing: { tone: "warn", label: "In review" },
  paid: { tone: "up", label: "Confirmed" },
  rejected: { tone: "down", label: "Rejected" },
  failed: { tone: "down", label: "Failed" },
};

export default function History() {
  const [kind, setKind] = useState<Kind>("all");
  const history = useQuery(api.app.history, {
    kind: kind === "all" ? undefined : kind,
    limit: 120,
  });

  const totals = useMemo(() => {
    if (!history) return { credited: 0, debited: 0 };
    return history.rows.reduce(
      (acc, row) => {
        if (row.amountNex >= 0) acc.credited += row.amountNex;
        else acc.debited += Math.abs(row.amountNex);
        return acc;
      },
      { credited: 0, debited: 0 },
    );
  }, [history]);

  return (
    <div className="space-y-3">
      <SectionHeading
        index="08"
        title="History"
        body="Every NEX movement recorded by the backend ledger."
        action={
          <Link
            to="/app/wallet"
            className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground"
          >
            <ArrowDownLeft className="size-3" /> Wallet
          </Link>
        }
      />

      <div className="-mx-1 overflow-x-auto px-1 no-scrollbar">
        <div className="flex w-max gap-1">
          {KINDS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setKind(item.key)}
              className={cn(
                "rounded-sm border px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] transition-colors",
                kind === item.key
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/70 text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric
          label="Credited"
          value={`+${totals.credited.toFixed(4)}`}
          sub="In this view"
          tone="up"
        />
        <Metric
          label="Debited"
          value={`-${totals.debited.toFixed(4)}`}
          sub="In this view"
          tone="down"
        />
        <Metric
          label="Lifetime mined"
          value={history ? history.lifetime.minedNex.toFixed(4) : "—"}
          sub="NEX"
        />
        <Metric
          label="Lifetime tasks"
          value={history ? history.lifetime.taskNex.toFixed(4) : "—"}
          sub="NEX"
        />
      </div>

      <Panel
        eyebrow="Ledger"
        title={`${history ? history.rows.length : 0} entries`}
        bodyClassName="p-0"
      >
        {!history ? (
          <div className="flex items-center gap-2 p-4 text-[11px] text-muted-foreground">
            <Spinner /> Loading the ledger…
          </div>
        ) : history.rows.length === 0 ? (
          <div className="p-3">
            <EmptyState
              icon={<Receipt className="size-4" />}
              title="No entries in this view"
              body="Mining accruals, verified task rewards and referral bonuses appear here the moment the backend posts them."
              action={
                <Link
                  to="/app/mining"
                  className="font-mono text-[9px] uppercase tracking-[0.1em] text-primary"
                >
                  Start mining
                </Link>
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {history.rows.map((row) => {
              const meta =
                KIND_META[row.kind as keyof typeof KIND_META] ?? {
                  icon: Coins,
                  label: row.kind,
                };
              return (
                <li key={row.id} className="flex items-start gap-2.5 px-4 py-2.5">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-sm border border-border/70 bg-secondary/40 text-muted-foreground">
                    <meta.icon className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium">{row.memo}</p>
                    <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                      {meta.label} · {formatDateTime(row.createdAt)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        "num text-[12px] font-semibold",
                        row.amountNex >= 0 ? "text-up" : "text-down",
                      )}
                    >
                      {row.amountNex >= 0 ? "+" : "−"}
                      {Math.abs(row.amountNex).toFixed(4)}
                    </p>
                    <p className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">
                      NEX
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel
        eyebrow="Payouts"
        title={`${history ? history.withdrawals.length : 0} withdrawal records`}
        bodyClassName="p-0"
      >
        {!history || history.withdrawals.length === 0 ? (
          <p className="p-4 text-[11.5px] leading-relaxed text-muted-foreground">
            No withdrawal requests yet. Eligibility requires the minimum balance,
            qualified referrals and a linked TON destination.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {history.withdrawals.map((row) => {
              const meta = WITHDRAW_TONE[row.status] ?? {
                tone: "muted" as const,
                label: row.status,
              };
              return (
                <li key={row.id} className="space-y-1 px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="num text-[12px] font-medium">
                      {row.nexAmount.toFixed(4)} NEX
                      <span className="ml-1.5 font-mono text-[9px] text-muted-foreground">
                        ≈ {row.usdValue.toFixed(2)} USD
                      </span>
                    </span>
                    <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                    <span>{formatDateTime(row.requestedAt)}</span>
                    <span>· {row.network}</span>
                    <span className="truncate">
                      · {row.destination.slice(0, 6)}…{row.destination.slice(-6)}
                    </span>
                  </div>
                  {row.txHash ? (
                    <button
                      type="button"
                      onClick={() => openExternal(`${TON_EXPLORER_TX}${row.txHash}`)}
                      className="font-mono text-[9px] uppercase tracking-[0.08em] text-primary hover:underline"
                    >
                      View transaction ↗
                    </button>
                  ) : (
                    <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                      No on-chain hash yet
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <p className="pb-2 text-center font-mono text-[8.5px] uppercase leading-relaxed tracking-[0.12em] text-muted-foreground">
        Reference value {history ? `$${(history.nexUsdRate).toFixed(2)}` : "—"} per
        NEX · redemption depends on the funded pool
      </p>
    </div>
  );
}
