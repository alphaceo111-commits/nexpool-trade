import { api } from "@/convex/_generated/api";
import { useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Ban,
  Check,
  Coins,
  Copy,
  ExternalLink,
  Info,
  Link2,
  Lock,
  ShieldAlert,
  Wallet as WalletIcon,
} from "lucide-react";
import {
  CopyButton,
  EmptyState,
  formatDateTime,
  formatNex,
  formatUsd,
  Metric,
  Panel,
  SectionHeading,
  Spinner,
  StatusPill,
} from "@/components/app/parts";
import { TonConnectShell } from "@/components/app/TonConnectShell";
import { Button } from "@/components/ui/button";
import { TON_EXPLORER_ADDRESS, TON_EXPLORER_TX } from "@/lib/ton";
import { cn } from "@/lib/utils";
import { openExternal } from "@/lib/telegram";

const STATUS_TONE: Record<
  string,
  { tone: "up" | "warn" | "down" | "muted" | "gold"; label: string }
> = {
  requested: { tone: "warn", label: "Requested" },
  reviewing: { tone: "warn", label: "In review" },
  paid: { tone: "up", label: "Confirmed" },
  rejected: { tone: "down", label: "Rejected" },
  failed: { tone: "down", label: "Failed" },
};

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

export default function WalletPage() {
  return (
    <TonConnectShell>
      <Wallet />
    </TonConnectShell>
  );
}

function Wallet() {
  const snapshot = useQuery(api.app.snapshot);
  const connectWallet = useMutation(api.wallet.connectWallet);
  const disconnectWallet = useMutation(api.wallet.disconnectWallet);
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const [busy, setBusy] = useState(false);
  const syncing = useRef(false);

  useEffect(() => {
    if (!wallet || !snapshot) return;
    if (wallet.account.chain !== "-239") return;
    if (snapshot.account.walletAddress === wallet.account.address) return;
    if (syncing.current) return;
    syncing.current = true;
    connectWallet({
      address: wallet.account.address,
      network: "mainnet",
      app: wallet.device.appName,
    })
      .then(() => toast.success("TON wallet linked"))
      .catch((error) =>
        toast.error(
          error instanceof Error ? error.message : "Could not link the wallet.",
        ),
      )
      .finally(() => {
        syncing.current = false;
      });
  }, [wallet, snapshot, connectWallet]);

  if (!snapshot) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-md border border-border/60 bg-card/60"
          />
        ))}
      </div>
    );
  }

  const { balance, config, account, withdrawal, mining } = snapshot;
  const usd = balance.totalNex * config.nexUsdRate;
  const lifetime =
    balance.lifetimeMinedNex + balance.lifetimeTaskNex + balance.lifetimeAdNex;
  const pendingWithdrawal = withdrawal.history.find(
    (row) => row.status === "requested" || row.status === "reviewing",
  );
  const metCount = withdrawal.requirements.filter((row) => row.met).length;

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      await disconnectWallet();
      if (wallet) await tonConnectUI.disconnect();
      toast.success("Payout wallet unlinked");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not unlink the wallet.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3.5">
      <SectionHeading
        index="Wallet"
        title="Your wallet"
        body="Confirmed NEX, target valuation, payout readiness and the verified TON destination."
        action={
          <StatusPill tone={withdrawal.eligible ? "up" : "warn"}>
            {withdrawal.eligible ? "Withdrawals open" : `${metCount}/${withdrawal.requirements.length} checks`}
          </StatusPill>
        }
      />

      <section className="premium-card card-sheen relative overflow-hidden rounded-3xl p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-gold/[0.09] blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="label-xs">Portfolio balance</p>
            <div className="mt-2 flex flex-wrap items-end gap-2.5">
              <p className="num gold-ink text-[38px] font-semibold leading-none tracking-[-0.055em] sm:text-[62px]">
                {formatNex(balance.totalNex)}
              </p>
              <span className="mb-1.5 text-[11px] font-semibold text-muted-foreground">NEX</span>
            </div>
            <p className="mt-3 num text-[14px] font-medium">
              ≈ {formatUsd(usd)}{" "}
              <span className="font-sans text-[10px] font-medium tracking-normal text-muted-foreground">
                at {formatUsd(config.nexUsdRate)} / NEX target
              </span>
            </p>
            <p className="mt-2 max-w-md text-[10.5px] leading-relaxed text-muted-foreground">
              Target valuation only. Redemption depends on the published reward
              policy and the funded payout pool; it is not guaranteed cash.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusPill tone={withdrawal.eligible ? "up" : "warn"}>
              {withdrawal.eligible ? "Withdrawal ready" : `${metCount}/${withdrawal.requirements.length} checks`}
            </StatusPill>
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <Link to="/app/deposit"><ArrowDownToLine className="size-3.5" /> Deposit</Link>
              </Button>
              <Button asChild size="sm" className="gap-1.5">
                <Link to="/app/withdraw"><ArrowUpRight className="size-3.5" /> Withdraw</Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="relative mt-6 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-border/60 pt-5 sm:grid-cols-3 lg:grid-cols-5">
          <Metric label="Available" value={formatNex(balance.availableNex)} sub="confirmed, spendable" />
          <Metric label="Accruing" value={formatNex(mining.projectedAccrualNex)} sub="unsettled window" tone="up" />
          <Metric label="Reserved" value={formatNex(balance.reservedNex)} sub="withdrawal review" tone="warn" />
          <Metric label="Lifetime" value={formatNex(lifetime)} sub="mined + tasks + ads" tone="gold" />
          <Metric label="Ad rewards" value={formatNex(balance.lifetimeAdNex)} sub="lifetime confirmed" tone="gold" />
        </div>
      </section>

      <div className="grid gap-3.5 lg:grid-cols-12">
        <Panel
          className="lg:col-span-7"
          eyebrow="TON Connect"
          title="Payout destination"
          action={
            <StatusPill tone={account.walletAddress ? "up" : "muted"}>
              {account.walletAddress ? "Linked" : "Not linked"}
            </StatusPill>
          }
        >
          {account.walletAddress ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-border/70 bg-panel/60 p-3">
                <div className="flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-xl border border-gold/30 bg-gold/10">
                    <WalletIcon className="size-4 text-gold" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="num truncate text-[12px]">
                      {shortAddress(account.walletAddress)}
                    </p>
                    <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                      TON mainnet · {account.walletApp ?? "TON Connect"}
                    </p>
                  </div>
                  <CopyButton value={account.walletAddress} label="Copy" />
                </div>
                <div className="mt-2.5 flex items-center justify-between border-t border-border/60 pt-2">
                  <span className="text-[10px] text-muted-foreground">
                    Linked {account.walletConnectedAt ? formatDateTime(account.walletConnectedAt) : "—"}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      openExternal(`${TON_EXPLORER_ADDRESS}${account.walletAddress}`)
                    }
                    className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.08em] text-primary"
                  >
                    Explorer <ExternalLink className="size-2.5" />
                  </button>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/[0.05] p-2.5">
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-warn" />
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  A linked address is not proof of ownership. Payouts are reviewed
                  and signed by the operator; NEXPOOL never asks for a seed phrase
                  or private key.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em]"
                onClick={handleDisconnect}
                disabled={busy || Boolean(pendingWithdrawal)}
              >
                {busy ? <Spinner /> : <Ban className="size-3" />} Unlink wallet
              </Button>
              {pendingWithdrawal ? (
                <p className="text-center text-[9.5px] text-muted-foreground">
                  Destination is locked while a withdrawal is under review.
                </p>
              ) : null}
            </div>
          ) : (
            <div>
              <EmptyState
                icon={<Link2 className="size-4" />}
                title="No payout wallet linked"
                body="Connect a TON wallet with TON Connect. Only a public address is shared — never keys."
                action={
                  <Button
                    className="gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em]"
                    onClick={() => tonConnectUI.openModal()}
                  >
                    <WalletIcon className="size-3.5" /> Connect TON wallet
                  </Button>
                }
              />
              {wallet && wallet.account.chain !== "-239" ? (
                <p className="mt-2 text-center font-mono text-[9.5px] uppercase tracking-[0.08em] text-warn">
                  Wallet is on testnet ({wallet.account.chain}). Switch to mainnet.
                </p>
              ) : null}
            </div>
          )}
        </Panel>

        <Panel
          className="lg:col-span-5"
          eyebrow="Withdrawal readiness"
          title={withdrawal.eligible ? "Eligible for review" : "Requirements pending"}
        >
          <div className="space-y-2">
            {withdrawal.requirements.map((item) => (
              <div key={item.key} className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex size-3.5 shrink-0 items-center justify-center rounded-full border",
                    item.met
                      ? "border-up/50 bg-up/15 text-up"
                      : "border-warn/40 bg-warn/10 text-warn",
                  )}
                >
                  {item.met ? (
                    <Check className="size-2" />
                  ) : (
                    <span className="size-0.5 rounded-full bg-current" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-[10.5px] text-muted-foreground">
                  {item.label}
                </span>
                <span
                  className={cn(
                    "num shrink-0 text-[9px]",
                    item.met ? "text-up" : "text-warn",
                  )}
                >
                  {item.met ? "OK" : "PENDING"}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <Link
              to="/app/deposit"
              className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground transition-colors hover:border-primary/40"
            >
              <ArrowDownToLine className="size-3.5" /> Deposit
            </Link>
            <Link
              to="/app/withdraw"
              className="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-primary font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-primary-foreground transition-opacity hover:opacity-90"
            >
              {withdrawal.eligible ? "Withdraw" : "Eligibility"}
              <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
          <p className="mt-2 text-center text-[9px] leading-relaxed text-muted-foreground">
            Eligibility is computed server-side. The operator still performs the
            final compliance and liquidity checks.
          </p>
        </Panel>
      </div>

      <div className="grid gap-3.5 lg:grid-cols-12">
        <Panel
          className="lg:col-span-7"
          eyebrow="Withdrawal history"
          title="Payout records"
          action={
            <Link
              to="/app/history"
              className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-primary"
            >
              History <ArrowUpRight className="size-3" />
            </Link>
          }
          bodyClassName="p-0"
        >
          {withdrawal.history.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<Coins className="size-4" />}
                title="No withdrawals yet"
                body="Payout requests and their independently confirmed transaction hashes appear here."
              />
            </div>
          ) : (
            <ul>
              {withdrawal.history.map((row) => {
                const meta = STATUS_TONE[row.status] ?? STATUS_TONE.requested;
                return (
                  <li
                    key={row.id}
                    className="border-b border-border/60 px-3.5 py-2.5 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="num text-[11.5px]">
                          {formatNex(row.nexAmount)} NEX
                          <span className="ml-1.5 font-mono text-[9px] text-muted-foreground">
                            → {formatNex(row.tonAmount)} TON
                          </span>
                        </p>
                        <p className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                          {formatDateTime(row.requestedAt)} ·{" "}
                          {shortAddress(row.destination)}
                        </p>
                      </div>
                      <StatusPill tone={meta.tone} dot={row.status === "paid"}>
                        {meta.label}
                      </StatusPill>
                    </div>
                    {row.txHash ? (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            openExternal(`${TON_EXPLORER_TX}${row.txHash}`)
                          }
                          className="flex items-center gap-1 font-mono text-[9px] text-primary"
                        >
                          <ExternalLink className="size-2.5" />{" "}
                          {row.txHash.slice(0, 14)}…
                        </button>
                        <span
                          className={cn(
                            "font-mono text-[8px] uppercase tracking-[0.08em]",
                            row.chainVerifiedAt ? "text-up" : "text-warn",
                          )}
                        >
                          {row.chainVerifiedAt
                            ? "chain verified"
                            : "hash recorded · unverified"}
                        </span>
                      </div>
                    ) : null}
                    {row.chainVerificationNote ? (
                      <p className="mt-0.5 text-[9px] leading-relaxed text-muted-foreground">
                        {row.chainVerificationNote}
                      </p>
                    ) : null}
                    {row.note ? (
                      <p className="mt-1 text-[9.5px] leading-relaxed text-muted-foreground">
                        {row.note}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel className="lg:col-span-5" eyebrow="TON deposits" title="On-chain settlement">
          <div className="flex items-start gap-2.5 rounded-xl border border-border/70 bg-panel/50 p-3">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              TON paid from Telegram Wallet goes to the NEXPOOL treasury. NEX is
              credited only after the backend verifies the transfer on-chain and
              matches its payment reference — never from a screenshot or claim.
              Open Deposit to lock a quote or check the current capability.
            </p>
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-border/70 bg-panel/50 p-3">
            <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Only the operator can broadcast a payout, and only after the request
              passes review. A requested withdrawal reserves NEX and is not shown
              as paid until a transaction hash is recorded.
            </p>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-3">
            <span className="label-xs">Reward ledger</span>
            <span className="num text-[10px] text-muted-foreground">
              {snapshot.ledger.length} entries
            </span>
          </div>
          <ul className="mt-1.5 max-h-44 space-y-1.5 overflow-y-auto">
            {snapshot.ledger.slice(0, 8).map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[10px] text-muted-foreground">
                  {row.memo}
                </span>
                <span
                  className={cn(
                    "num shrink-0 text-[9.5px]",
                    row.amountNex >= 0 ? "text-up" : "text-down",
                  )}
                >
                  {row.amountNex >= 0 ? "+" : ""}
                  {formatNex(row.amountNex)}
                </span>
              </li>
            ))}
            {snapshot.ledger.length === 0 ? (
              <li className="text-[10px] text-muted-foreground">
                No confirmed movements yet.
              </li>
            ) : null}
          </ul>
        </Panel>
      </div>

      <div className="flex items-center gap-2 rounded-md border border-border/70 bg-panel/50 px-3 py-2.5">
        <Copy className="size-3.5 shrink-0 text-muted-foreground" />
        <p className="text-[9.5px] leading-relaxed text-muted-foreground">
          Network: TON mainnet. Payout amounts use the operator&apos;s TON
          reference rate of {formatUsd(config.tonUsdRate)} at request time. Rates
          can move before settlement; the recorded request keeps its quoted rate.
        </p>
      </div>
    </div>
  );
}
