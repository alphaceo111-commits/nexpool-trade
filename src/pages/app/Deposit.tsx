import { beginCell } from "@ton/core";
import {
  TonConnectButton,
  useTonConnectUI,
  useTonWallet,
} from "@tonconnect/ui-react";
import { useAction, useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import {
  ArrowDownToLine,
  Ban,
  Check,
  ChevronDown,
  Clock,
  ExternalLink,
  Gauge,
  History as HistoryIcon,
  ListChecks,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import {
  CopyButton,
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
import { DepositTimeline } from "@/components/app/DepositTimeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { friendlyError } from "@/lib/errors";
import { openExternal } from "@/lib/telegram";
import { TON_EXPLORER_TX } from "@/lib/ton";
import { cn } from "@/lib/utils";

type DepositIntent = {
  id: Id<"deposits">;
  memo: string;
  address: string;
  tonAmount: number;
  nanoAmount: string;
  quotedNex: number;
  expiresAt: number;
};

type DepositRow = DepositIntent & {
  status: "pending" | "confirmed" | "failed";
  receivedTon?: number;
  creditedNex?: number;
  txHash?: string;
  createdAt: number;
  paidAt?: number;
  note?: string;
  expired: boolean;
};

const SOURCE_ICON = {
  mining: Gauge,
  task: ListChecks,
  referral: Users,
} as const;

const SOURCE_TO = {
  mining: "/app/earn/mining",
  task: "/app/earn/tasks",
  referral: "/app/community/referrals",
} as const;

const MINI_APP_TON = "TON mainnet";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

function statusTone(row: DepositRow): "up" | "warn" | "down" | "muted" {
  if (row.status === "confirmed") return "up";
  if (row.status === "failed") return "down";
  return row.expired ? "muted" : "warn";
}

function statusLabel(row: DepositRow) {
  if (row.status === "confirmed") return "Confirmed";
  if (row.status === "failed") return "Failed";
  return row.expired ? "Quote expired" : "Awaiting payment";
}

export default function DepositPage() {
  return (
    <TonConnectShell>
      <Deposit />
    </TonConnectShell>
  );
}

function Deposit() {
  const status = useQuery(api.payments.status);
  const createDeposit = useMutation(api.payments.createDeposit);
  const verifyDeposit = useAction(api.payments.verifyDeposit);
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const [amount, setAmount] = useState("5");
  const [intent, setIntent] = useState<DepositIntent | null>(null);
  const [busy, setBusy] = useState<"create" | "verify" | null>(null);
  // Only set when this browser observed the wallet approval, so the deposit
  // timeline never claims a payment that was not actually sent.
  const [submitted, setSubmitted] = useState<Record<string, number>>({});
  const [openId, setOpenId] = useState<string | null>(null);

  if (!status) {
    return (
      <div className="space-y-3">
        <SectionHeading
          index="Deposits"
          title="Deposit"
          body="Buy NEX with TON from your Telegram Wallet."
        />
        <Panel>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Spinner /> Reading deposit capability from the backend…
          </div>
        </Panel>
      </div>
    );
  }

  const parsed = Number(amount);
  const amountValid =
    Number.isFinite(parsed) &&
    parsed >= status.minTon &&
    parsed <= status.maxTon;
  const estimateNex = amountValid ? parsed * status.nexPerTon : 0;

  const createQuote = async (): Promise<DepositIntent> => {
    const result = await createDeposit({ tonAmount: parsed });
    const quote: DepositIntent = {
      id: result.id,
      memo: result.memo,
      address: result.address,
      tonAmount: result.tonAmount,
      nanoAmount: result.nanoAmount,
      quotedNex: result.quotedNex,
      expiresAt: result.expiresAt,
    };
    setIntent(quote);
    return quote;
  };

  const checkDeposit = async (id: Id<"deposits">, quiet = false) => {
    const result = await verifyDeposit({ depositId: id });
    if (quiet) return result;
    if (result.status === "confirmed") {
      toast.success(`${formatNex(result.creditedNex)} NEX credited to your balance`);
      setIntent(null);
    } else if (result.status === "failed") {
      toast.error(
        "That payment could not be verified. Contact support with the transaction hash.",
      );
    } else {
      toast.info(
        "No matching TON transfer yet. If you just paid, NEXPOOL keeps checking automatically.",
      );
    }
    return result;
  };

  const poll = async (quote: DepositIntent) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await checkDeposit(quote.id, true);
      if (result.status === "confirmed") {
        toast.success(`${formatNex(result.creditedNex)} NEX credited to your balance`);
        setIntent(null);
        return;
      }
      if (result.status === "failed") {
        toast.error(
          "That payment could not be verified. Contact support with the transaction hash.",
        );
        return;
      }
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
    toast.info(
      "Transfer sent. Verification is still running — your NEX is credited automatically once the blockchain check completes, even if you close NEXPOOL.",
      { duration: 8000 },
    );
  };

  const sendQuote = async (quote: DepositIntent) => {
    if (!wallet) {
      await tonConnectUI.openModal();
      return;
    }
    if (wallet.account.chain !== "-239") {
      toast.error("Switch your wallet to TON mainnet, then pay again.");
      return;
    }
    if (Date.now() > quote.expiresAt) {
      toast.info("That quote expired. Create a new one to pay.");
      setIntent(null);
      return;
    }

    setBusy("create");
    try {
      const payload = beginCell()
        .storeUint(0, 32)
        .storeStringTail(quote.memo)
        .endCell()
        .toBoc()
        .toString("base64");
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [
          {
            address: quote.address,
            amount: quote.nanoAmount,
            payload,
          },
        ],
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? friendlyError(error)
          : "The transfer was not sent. Nothing was charged.",
      );
      setBusy(null);
      return;
    }

    setSubmitted((previous) => ({ ...previous, [quote.id]: Date.now() }));
    setBusy("verify");
    toast.success("Transfer sent. Checking TON for your payment reference…");
    try {
      await poll(quote);
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(null);
    }
  };

  const handlePay = async () => {
    if (!status.enabled) return;
    if (!amountValid) {
      toast.error(`Enter a TON amount between ${status.minTon} and ${status.maxTon}.`);
      return;
    }
    if (!wallet) {
      setBusy("create");
      try {
        await tonConnectUI.openModal();
      } finally {
        setBusy(null);
      }
      return;
    }
    setBusy("create");
    let quote: DepositIntent;
    try {
      quote = await createQuote();
    } catch (error) {
      toast.error(friendlyError(error));
      setBusy(null);
      return;
    }
    setBusy(null);
    await sendQuote(quote);
  };

  return (
    <div className="space-y-3">
      <SectionHeading
        index="Deposits"
        title="Deposit"
        body="Buy NEX with TON from your Telegram Wallet. Credited only after on-chain verification."
        action={
          <StatusPill tone={status.enabled ? "up" : "warn"}>
            {status.enabled ? "Deposits open" : "Deposits offline"}
          </StatusPill>
        }
      />

      {!status.enabled ? (
        <Panel eyebrow="Capability" title="TON deposits are offline">
          <div className="flex gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-warn/40 bg-warn/[0.08] text-warn">
              <Ban className="size-4" />
            </div>
            <div className="min-w-0 space-y-2">
              <p className="text-[12.5px] leading-relaxed text-foreground/90">
                {status.reason}
              </p>
              <p className="font-mono text-[9.5px] uppercase leading-relaxed tracking-[0.1em] text-muted-foreground">
                No address is issued while the rail is closed, and no transfer is
                credited by the app.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Metric label="Network" value={MINI_APP_TON} sub="No address issued" />
            <Metric
              label="Minimum"
              value={`${status.minTon} TON`}
              sub="Per deposit once open"
            />
            <Metric
              label="Reserved NEX"
              value={`${status.reservedNex.toFixed(4)}`}
              sub="Held for payouts"
            />
          </div>
        </Panel>
      ) : (
        <>
          <Panel
            eyebrow="Buy NEX"
            title="TON → NEX"
            action={
              <StatusPill tone="gold">
                1 TON = {status.nexPerTon.toFixed(4)} NEX
              </StatusPill>
            }
          >
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="deposit-amount"
                  className="label-xs mb-1.5 block"
                >
                  Amount to pay
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="deposit-amount"
                      inputMode="decimal"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      className="num pr-14 text-[15px]"
                      placeholder="5"
                    />
                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                      TON
                    </span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[1, 5, 10, 25, 50].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAmount(String(preset))}
                      className={cn(
                        "rounded-xl border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.1em] transition-colors",
                        amount === String(preset)
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border/70 text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                      )}
                    >
                      {preset} TON
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/70 bg-secondary/20 p-3">
                <Metric
                  label="You pay"
                  value={`${amountValid ? parsed.toFixed(2) : "—"} TON`}
                  sub={
                    amountValid
                      ? `≈ ${formatUsd(parsed * status.reference.tonUsdRate)}`
                      : "Enter an amount"
                  }
                />
                <Metric
                  label="You receive"
                  value={`${estimateNex.toFixed(4)} NEX`}
                  sub={
                    amountValid
                      ? `≈ ${formatUsd(estimateNex * status.reference.nexUsdRate)}`
                      : "Quote locks on pay"
                  }
                  tone="up"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 px-3 py-2.5">
                <span className="flex items-center gap-2 text-[11.5px]">
                  <Wallet className="size-3.5 text-primary" />
                  {wallet ? (
                    <span className="num">{shortAddress(wallet.account.address)}</span>
                  ) : (
                    <span className="text-muted-foreground">
                      Telegram Wallet not connected
                    </span>
                  )}
                </span>
                {wallet ? (
                  <StatusPill tone="up">TON Connect</StatusPill>
                ) : (
                  <TonConnectButton />
                )}
              </div>

              <Button
                type="button"
                size="lg"
                onClick={handlePay}
                disabled={busy !== null || !amountValid}
                className="w-full gap-2 font-mono text-[10px] uppercase tracking-[0.12em]"
              >
                {busy === "verify" ? (
                  <>
                    <Spinner className="size-3.5" /> Verifying payment
                  </>
                ) : (
                  <>
                    <ArrowDownToLine className="size-4" />
                    {!wallet
                      ? "Connect Telegram Wallet"
                      : busy === "create"
                        ? "Opening wallet…"
                        : `Pay ${amountValid ? parsed.toFixed(2) : ""} TON`}
                  </>
                )}
              </Button>

              <p className="text-[10.5px] leading-relaxed text-muted-foreground">
                The quote is locked for 30 minutes. Your transfer must include the
                reference shown next and go to the NEXPOOL treasury on TON mainnet.
                NEX is credited automatically after the backend verifies the
                transaction — never from a screenshot or claim.
              </p>
            </div>
          </Panel>

          {intent ? (
            <Panel
              eyebrow="Payment reference"
              title={`Send ${intent.tonAmount.toFixed(2)} TON`}
              action={
                <StatusPill tone="warn">
                  <Clock className="size-2.5" /> Expires{" "}
                  {formatDateTime(intent.expiresAt)}
                </StatusPill>
              }
            >
              <div className="space-y-3">
                <div className="rounded-xl border border-primary/30 bg-primary/[0.05] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="label-xs">Comment / memo (required)</p>
                      <p className="num mt-1 text-[15px] font-semibold tracking-[0.08em] text-primary">
                        {intent.memo}
                      </p>
                    </div>
                    <CopyButton value={intent.memo} label="Copy" />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 rounded-xl border border-border/70 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="label-xs">Treasury address · TON mainnet</p>
                    <p className="num mt-0.5 truncate text-[11.5px]">
                      {intent.address}
                    </p>
                  </div>
                  <CopyButton value={intent.address} label="Copy" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Metric
                    label="Amount"
                    value={`${intent.tonAmount.toFixed(2)} TON`}
                    sub={`≈ ${formatUsd(intent.tonAmount * status.reference.tonUsdRate)}`}
                  />
                  <Metric
                    label="Quoted NEX"
                    value={formatNex(intent.quotedNex)}
                    sub="At the locked rate"
                    tone="up"
                  />
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    onClick={() => sendQuote(intent)}
                    disabled={busy !== null || status.serverNow > intent.expiresAt}
                    className="gap-2 font-mono text-[10px] uppercase tracking-[0.1em]"
                  >
                    <Wallet className="size-3.5" /> Send with Telegram Wallet
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setBusy("verify");
                      checkDeposit(intent.id)
                        .catch((error) =>
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Could not check the payment.",
                          ),
                        )
                        .finally(() => setBusy(null));
                    }}
                    disabled={busy !== null}
                    className="gap-2 font-mono text-[10px] uppercase tracking-[0.1em]"
                  >
                    {busy === "verify" ? <Spinner /> : <ShieldCheck className="size-3.5" />}
                    Check payment
                  </Button>
                </div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  Pay the exact amount with the memo above. Other amounts are
                  credited at the actual received value, and payments without the
                  memo cannot be matched automatically.
                </p>
              </div>
            </Panel>
          ) : null}
        </>
      )}

      {status.deposits.length > 0 ? (
        <Panel
          eyebrow="Deposits"
          title="Recent TON payments"
          bodyClassName="p-0"
          action={
            <Link
              to="/app/history"
              className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:text-foreground"
            >
              <HistoryIcon className="size-3" /> Full history
            </Link>
          }
        >
          <ul className="divide-y divide-border/60">
            {status.deposits.map((row) => {
              const deposit = row as DepositRow;
              return (
                <li key={row.id} className="px-3.5 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="num text-[13px] font-semibold">
                        {deposit.tonAmount.toFixed(2)} TON
                        {deposit.status === "confirmed" && deposit.creditedNex ? (
                          <span className="ml-2 text-[11px] font-normal text-up">
                            +{formatNex(deposit.creditedNex)} NEX
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                        {deposit.memo} · {formatDateTime(deposit.createdAt)}
                      </p>
                    </div>
                    <StatusPill tone={statusTone(deposit)}>
                      {statusLabel(deposit)}
                    </StatusPill>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setOpenId(openId === deposit.id ? null : deposit.id)
                    }
                    aria-expanded={openId === deposit.id}
                    className="mt-2 inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ChevronDown
                      className={cn(
                        "size-3 transition-transform",
                        openId === deposit.id && "rotate-180",
                      )}
                    />
                    {openId === deposit.id ? "Hide status" : "Track payment"}
                  </button>

                  {openId === deposit.id ? (
                    <DepositTimeline
                      row={deposit}
                      submittedAt={submitted[deposit.id]}
                    />
                  ) : null}

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {deposit.status === "confirmed" && deposit.txHash ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 px-2 font-mono text-[9px] uppercase tracking-[0.1em]"
                        onClick={() =>
                          openExternal(`${TON_EXPLORER_TX}${deposit.txHash}`)
                        }
                      >
                        <ExternalLink className="size-3" /> TON transaction
                      </Button>
                    ) : null}
                    {deposit.status === "confirmed" ? (
                      <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-up">
                        <Check className="size-3" /> Ledger-backed
                      </span>
                    ) : null}
                    {deposit.status === "pending" && !deposit.expired ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 font-mono text-[9px] uppercase tracking-[0.1em]"
                          onClick={() =>
                            setIntent({
                              id: deposit.id,
                              memo: deposit.memo,
                              address: deposit.address,
                              tonAmount: deposit.tonAmount,
                              nanoAmount: deposit.nanoAmount,
                              quotedNex: deposit.quotedNex,
                              expiresAt: deposit.expiresAt,
                            })
                          }
                        >
                          Open quote
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 font-mono text-[9px] uppercase tracking-[0.1em]"
                          disabled={busy !== null}
                          onClick={() => {
                            setBusy("verify");
                            checkDeposit(deposit.id)
                              .catch((error) =>
                                toast.error(
                                  error instanceof Error
                                    ? error.message
                                    : "Could not check the payment.",
                                ),
                              )
                              .finally(() => setBusy(null));
                          }}
                        >
                          Check
                        </Button>
                      </>
                    ) : null}
                    {deposit.note ? (
                      <span className="text-[10px] text-muted-foreground">
                        {deposit.note}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="border-t border-border/60 px-3.5 py-2.5 text-[10px] leading-relaxed text-muted-foreground">
            NEXPOOL checks the treasury every few minutes and whenever this page
            opens. A verified payment credits your balance and ledger
            automatically — no screenshot and no manual claim.
          </p>
        </Panel>
      ) : null}

      <div className="grid gap-3.5 lg:grid-cols-2">
        <Panel eyebrow="Pricing" title="Reference rates">
          <div className="grid grid-cols-2 gap-2">
            <Metric
              label="TON reference"
              value={formatUsd(status.reference.tonUsdRate)}
              sub="Per 1 TON"
            />
            <Metric
              label="NEX reference"
              value={formatUsd(status.reference.nexUsdRate)}
              sub="Per 1 NEX"
              tone="gold"
            />
            <Metric
              label="NEX per TON"
              value={status.nexPerTon.toFixed(4)}
              sub="At current references"
              tone="up"
            />
            <Metric
              label="Reserved NEX"
              value={formatNex(status.reservedNex)}
              sub="Held for payouts"
              tone="warn"
            />
          </div>
          <p className="mt-3 text-[10.5px] leading-relaxed text-muted-foreground">
            Deposits are priced from the operator's published TON and NEX
            references. The rate is locked for 30 minutes per quote. NEX is a
            reward unit, not a security; redemption stays subject to the
            withdrawal rules.
          </p>
        </Panel>

        {status.enabled ? (
          <Panel eyebrow="Other credits" title="NEX without a deposit">
            <div className="space-y-1.5">
              {status.sources.map((source) => {
                const Icon =
                  SOURCE_ICON[source.kind as keyof typeof SOURCE_ICON] ?? Users;
                const to = SOURCE_TO[source.kind as keyof typeof SOURCE_TO] ?? "/app";
                return (
                  <Link
                    key={source.kind}
                    to={to}
                    className="flex items-center justify-between rounded-xl border border-border/70 px-2.5 py-2 transition-colors hover:border-primary/40 hover:bg-secondary/40"
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
            <p className="mt-3 text-[10.5px] leading-relaxed text-muted-foreground">
              Mining, verified tasks and referral bonuses are credited by the same
              backend ledger as deposits, so every balance agrees with the ledger
              history.
            </p>
          </Panel>
        ) : (
          <Panel eyebrow="Wallet" title="Payout destination">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
                <Wallet className="size-3.5" /> Linked wallet
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
                Link a TON wallet in the Wallet tab. A linked wallet is a payout
                destination and never creates a balance by itself.
              </p>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
}
