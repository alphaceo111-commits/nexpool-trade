import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Info,
  Lock,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import {
  formatDateTime,
  formatNex,
  formatUsd,
  Panel,
  RequirementRow,
  SectionHeading,
  Spinner,
  StatusPill,
} from "@/components/app/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function Withdraw() {
  const snapshot = useQuery(api.app.snapshot);
  const requestWithdrawal = useMutation(api.wallet.requestWithdrawal);
  const [amountInput, setAmountInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const { withdrawal, config, account, balance } = snapshot;
  const pending = withdrawal.history.find(
    (row) => row.status === "requested" || row.status === "reviewing",
  );
  const amount = Number(amountInput);
  const validNumber = Number.isFinite(amount) && amount > 0;
  const usd = validNumber ? amount * config.nexUsdRate : 0;
  const ton = config.tonUsdRate > 0 ? usd / config.tonUsdRate : 0;
  const feeNex = 0;
  const netTon = ton;

  const formError = !validNumber
    ? null
    : amount < config.minWithdrawNex
      ? `Minimum is ${config.minWithdrawNex} NEX.`
      : amount > balance.availableNex
        ? "Amount exceeds available NEX."
        : null;

  const canSubmit =
    withdrawal.eligible &&
    validNumber &&
    !formError &&
    !pending &&
    !submitting;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await requestWithdrawal({ nexAmount: amount });
      toast.success(
        `${formatNex(result.nexAmount)} NEX reserved · request ${result.status}`,
      );
      setAmountInput("");
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Withdrawal request failed.";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3.5">
      <Link
        to="/app/wallet"
        className="inline-flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3" /> Wallet
      </Link>

      <SectionHeading
        index="05"
        title="Withdraw NEX"
        body="Server-adjudicated payout eligibility. Nothing is approved in the browser."
        action={
          <StatusPill tone={withdrawal.eligible ? "up" : "warn"}>
            {withdrawal.eligible ? "Eligible" : "Blocked"}
          </StatusPill>
        }
      />

      <Panel
        eyebrow="Eligibility"
        title={
          withdrawal.eligible
            ? "All requirements satisfied"
            : `${withdrawal.requirements.filter((row) => row.met).length} of ${withdrawal.requirements.length} requirements met`
        }
        action={
          withdrawal.eligible ? (
            <CheckCircle2 className="size-4 text-up" />
          ) : (
            <Lock className="size-4 text-warn" />
          )
        }
      >
        {withdrawal.requirements.map((requirement) => (
          <RequirementRow
            key={requirement.key}
            label={requirement.label}
            value={requirement.value}
            detail={requirement.detail}
            met={requirement.met}
          />
        ))}
      </Panel>

      {pending ? (
        <div className="rounded-md border border-warn/40 bg-warn/[0.05] p-3.5">
          <div className="flex items-center gap-2">
            <StatusPill tone="warn">
              {pending.status === "requested" ? "Requested" : "In review"}
            </StatusPill>
            <span className="num text-[10px] text-muted-foreground">
              {formatDateTime(pending.requestedAt)}
            </span>
          </div>
          <p className="mt-2 text-[12px] font-medium">
            {formatNex(pending.nexAmount)} NEX · {formatNex(pending.tonAmount)} TON
          </p>
          <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
            Your NEX is reserved while the payout desk reviews the request. The
            status becomes confirmed only after an on-chain transaction hash is
            recorded. You cannot open a second request in the meantime.
          </p>
        </div>
      ) : null}

      <div className="grid gap-3.5 lg:grid-cols-12">
        <Panel className="lg:col-span-7" eyebrow="Payout request" title="Amount">
          {!account.walletAddress ? (
            <div className="mb-3 flex items-start gap-2 rounded-sm border border-warn/40 bg-warn/[0.05] p-2.5">
              <Wallet className="mt-0.5 size-3.5 shrink-0 text-warn" />
              <div className="flex-1">
                <p className="text-[11px] font-medium">No destination wallet</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  A verified TON mainnet address is required before requesting.
                </p>
              </div>
              <Link
                to="/app/wallet"
                className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-primary"
              >
                Connect
              </Link>
            </div>
          ) : (
            <div className="mb-3 flex items-center justify-between rounded-sm border border-border/70 bg-panel/60 px-2.5 py-2">
              <div>
                <p className="label-xs">Destination</p>
                <p className="num mt-0.5 text-[10.5px]">{account.walletAddress}</p>
              </div>
              <StatusPill tone="up">TON</StatusPill>
            </div>
          )}

          <label className="label-xs" htmlFor="nex-amount">
            NEX amount
          </label>
          <div className="mt-1.5 flex gap-2">
            <div className="relative flex-1">
              <Input
                id="nex-amount"
                inputMode="decimal"
                placeholder={`${config.minWithdrawNex.toFixed(2)} minimum`}
                value={amountInput}
                onChange={(event) => {
                  const next = event.target.value;
                  if (next === "" || /^\d*\.?\d{0,6}$/.test(next)) {
                    setAmountInput(next);
                    setError(null);
                  }
                }}
                className="num pr-14 text-[14px]"
                disabled={Boolean(pending) || submitting}
              />
              <button
                type="button"
                className="absolute top-1/2 right-2 -translate-y-1/2 font-mono text-[9px] uppercase tracking-[0.08em] text-primary"
                onClick={() => setAmountInput(String(balance.availableNex))}
                disabled={Boolean(pending)}
              >
                Max
              </button>
            </div>
            <Button
              variant="outline"
              className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em]"
              onClick={() =>
                setAmountInput(
                  String(
                    Math.min(
                      Math.max(config.minWithdrawNex, 0),
                      balance.availableNex,
                    ),
                  ),
                )
              }
              disabled={Boolean(pending)}
            >
              Min
            </Button>
          </div>
          <div className="mt-1.5 flex items-center justify-between font-mono text-[9px] text-muted-foreground">
            <span>Available {formatNex(balance.availableNex)} NEX</span>
            <span>No withdrawal fee</span>
          </div>
          {formError ? (
            <p className="mt-2 text-[10.5px] text-warn">{formError}</p>
          ) : null}

          <div className="mt-3 rounded-sm border border-border/70 bg-background/40 p-3">
            <p className="label-xs">Quote preview</p>
            <div className="mt-2 space-y-1.5">
              {[
                ["NEX amount", `${validNumber ? formatNex(amount) : "0"} NEX`],
                ["Reference rate", `${formatUsd(config.nexUsdRate)} / NEX`],
                ["Estimated USD value", formatUsd(usd)],
                ["TON reference", `${formatUsd(config.tonUsdRate)} / TON`],
                ["Fees", `${feeNex} NEX`],
                ["Estimated payout", `${validNumber ? formatNex(netTon) : "0"} TON`],
              ].map(([label, value], index, rows) => (
                <div
                  key={label}
                  className={cn(
                    "flex items-center justify-between",
                    index === rows.length - 1
                      ? "border-t border-border/60 pt-1.5 font-semibold"
                      : "",
                  )}
                >
                  <span className="text-[10.5px] text-muted-foreground">{label}</span>
                  <span
                    className={cn(
                      "num text-[10.5px]",
                      index === rows.length - 1 ? "text-gold" : "text-foreground",
                    )}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {error ? (
            <p className="mt-2 rounded-sm border border-down/40 bg-down/[0.06] px-2.5 py-2 text-[10.5px] leading-relaxed text-down">
              {error}
            </p>
          ) : null}

          <Button
            className="mt-3 w-full gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em]"
            disabled={!canSubmit}
            onClick={submit}
          >
            {submitting ? (
              <>
                <Spinner /> Submitting request
              </>
            ) : (
              <>
                <ShieldCheck className="size-3.5" /> Request withdrawal
              </>
            )}
          </Button>
          <p className="mt-2 text-center text-[9px] leading-relaxed text-muted-foreground">
            Submitting reserves NEX and queues a review. It does not confirm a
            payout.
          </p>
        </Panel>

        <div className="space-y-3.5 lg:col-span-5">
          <Panel eyebrow="Rules" title="Published redemption policy">
            <div className="space-y-2.5">
              {[
                {
                  label: "Minimum",
                  value: `${config.minWithdrawNex} NEX`,
                },
                {
                  label: "Target value",
                  value: `${formatUsd(config.nexUsdRate)} / NEX`,
                },
                {
                  label: "Qualified referrals",
                  value: `${config.qualifiedReferralTarget} required`,
                },
                {
                  label: "Tasks per referral",
                  value: `${config.referralTaskTarget} verified`,
                },
                {
                  label: "Payout asset",
                  value: "TON mainnet",
                },
                {
                  label: "Fees",
                  value: "0 NEX",
                },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between border-b border-border/60 py-1.5 last:border-0"
                >
                  <span className="text-[11px] text-muted-foreground">
                    {row.label}
                  </span>
                  <span className="num text-[10.5px]">{row.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-sm border border-border/70 bg-panel/60 p-2.5">
              <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 size-3 shrink-0" />
                The $2.50 target is a published reference, not a promise of
                liquidity. Payouts are funded from reconciled pool and advertising
                revenue; the backend checks the pool before allowing a request.
              </p>
            </div>
          </Panel>

          <Panel eyebrow="Account checks" title="Status">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  Compliance
                </span>
                <StatusPill tone={account.complianceCleared ? "up" : "warn"}>
                  {account.complianceCleared ? "Cleared" : "Review pending"}
                </StatusPill>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  Account
                </span>
                <StatusPill tone={account.restricted ? "down" : "up"}>
                  {account.restricted ? "Restricted" : "In good standing"}
                </StatusPill>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  Treasury floor
                </span>
                <span className="num text-[10.5px]">
                  {formatUsd(config.treasuryAvailableUsd)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  Withdrawal desk
                </span>
                <StatusPill tone={config.withdrawalsEnabled ? "up" : "warn"}>
                  {config.withdrawalsEnabled ? "Open" : "Paused"}
                </StatusPill>
              </div>
            </div>
            {account.restricted ? (
              <p className="mt-2 text-[10px] leading-relaxed text-down">
                {account.restrictionReason}
              </p>
            ) : null}
          </Panel>
        </div>
      </div>

      <Panel
        eyebrow="History"
        title="Payout records"
        action={
          <Link
            to="/app/wallet"
            className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-primary"
          >
            Wallet <ArrowUpRight className="size-3" />
          </Link>
        }
        bodyClassName="p-0"
      >
        {withdrawal.history.length === 0 ? (
          <p className="px-4 py-5 text-center text-[11px] text-muted-foreground">
            No payout requests yet.
          </p>
        ) : (
          <ul>
            {withdrawal.history.slice(0, 6).map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between border-b border-border/60 px-4 py-2.5 last:border-0"
              >
                <div>
                  <p className="num text-[11px]">
                    {formatNex(row.nexAmount)} NEX → {formatNex(row.tonAmount)} TON
                  </p>
                  <p className="font-mono text-[9px] text-muted-foreground">
                    {formatDateTime(row.requestedAt)}
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
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
