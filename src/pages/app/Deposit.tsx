import { BadgeCheck, Ban, Coins, Gauge, ListChecks, Users, Wallet } from "lucide-react";
import { Link } from "react-router";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import {
  formatDateTime,
  formatUsd,
  Metric,
  Panel,
  SectionHeading,
  Spinner,
  StatusPill,
} from "@/components/app/parts";
import { Button } from "@/components/ui/button";

const SOURCE_ICON = {
  mining: Gauge,
  task: ListChecks,
  referral: Users,
} as const;

const SOURCE_TO = {
  mining: "/app/mining",
  task: "/app/tasks",
  referral: "/app/referrals",
} as const;

export default function Deposit() {
  const status = useQuery(api.app.depositStatus);

  if (!status) {
    return (
      <div className="space-y-3">
        <SectionHeading index="06" title="Deposit" body="How NEX enters your account." />
        <Panel>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Spinner /> Reading deposit capability from the backend…
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <SectionHeading
        index="06"
        title="Deposit"
        body="Crediting instructions and verification status for this account."
        action={
          <StatusPill tone={status.enabled ? "up" : "warn"}>
            {status.enabled ? "Deposits open" : "Deposits closed"}
          </StatusPill>
        }
      />

      <Panel eyebrow="Capability" title="External deposits are not enabled">
        <div className="flex gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-warn/40 bg-warn/[0.08] text-warn">
            <Ban className="size-4" />
          </div>
          <div className="min-w-0 space-y-2">
            <p className="text-[12.5px] leading-relaxed text-foreground/90">
              {status.reason}
            </p>
            <p className="font-mono text-[9.5px] uppercase leading-relaxed tracking-[0.1em] text-muted-foreground">
              No deposit address is issued, and no transfer is credited by the
              app. Anything claiming otherwise is not NEXPOOL.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Metric label="Supported assets" value="None" sub="Awaiting rails" />
          <Metric label="Supported networks" value="None" sub="No address issued" />
          <Metric
            label="Reserved NEX"
            value={`${status.reservedNex.toFixed(4)}`}
            sub="Held for payouts"
          />
        </div>
      </Panel>

      <Panel eyebrow="Where NEX comes from" title="Verified credit sources">
        <div className="space-y-1.5">
          {status.sources.map((source) => {
            const Icon = SOURCE_ICON[source.kind as keyof typeof SOURCE_ICON] ?? Coins;
            const to = SOURCE_TO[source.kind as keyof typeof SOURCE_TO] ?? "/app";
            return (
              <Link
                key={source.kind}
                to={to}
                className="flex items-center justify-between rounded-sm border border-border/70 px-2.5 py-2 transition-colors hover:border-primary/40 hover:bg-secondary/40"
              >
                <span className="flex items-center gap-2 text-[12px]">
                  <Icon className="size-3.5 text-primary" />
                  {source.label}
                </span>
                <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                  Ledger-backed
                </span>
              </Link>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Every credit is written to your ledger by the backend after it verifies
          the underlying activity. The mini app and the Telegram bot read the same
          records, so balances always agree.
        </p>
      </Panel>

      <Panel eyebrow="Settlement" title="Reference value and destination">
        <div className="grid grid-cols-2 gap-2">
          <Metric
            label="Reference rate"
            value={formatUsd(status.reference.nexUsdRate)}
            sub="Per 1 NEX · not a guarantee"
          />
          <Metric
            label="TON reference"
            value={formatUsd(status.reference.tonUsdRate)}
            sub="Per 1 TON"
          />
        </div>

        <div className="mt-3 rounded-sm border border-border/70 bg-secondary/20 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
              <Wallet className="size-3.5" /> Destination wallet
            </span>
            <StatusPill tone={status.wallet.connected ? "up" : "warn"}>
              {status.wallet.connected ? "Linked" : "Not linked"}
            </StatusPill>
          </div>
          {status.wallet.connected ? (
            <div className="mt-2 space-y-0.5">
              <p className="num truncate text-[11px]">{status.wallet.address}</p>
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                {status.wallet.network}
                {status.wallet.connectedAt
                  ? ` · linked ${formatDateTime(status.wallet.connectedAt)}`
                  : ""}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Connect a TON wallet in the Wallet tab. A linked wallet is only a
              payout destination — it never creates a balance.
            </p>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline" size="sm" className="gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em]">
            <Link to="/app/wallet">
              <Wallet className="size-3.5" /> Open wallet
            </Link>
          </Button>
          <Button asChild size="sm" className="gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em]">
            <Link to="/app/mining">
              <BadgeCheck className="size-3.5" /> Start earning
            </Link>
          </Button>
        </div>
      </Panel>
    </div>
  );
}
