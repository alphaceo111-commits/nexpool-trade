import { Check, Clock, ExternalLink } from "lucide-react";
import { formatDateTime, formatNex } from "@/components/app/parts";
import { TON_EXPLORER_TX } from "@/lib/ton";
import { openExternal } from "@/lib/telegram";
import { cn } from "@/lib/utils";

export type DepositTimelineRow = {
  status: "pending" | "confirmed" | "failed";
  createdAt: number;
  expiresAt: number;
  memo: string;
  address: string;
  tonAmount: number;
  quotedNex: number;
  txHash?: string;
  receivedTon?: number;
  creditedNex?: number;
  note?: string;
  expired: boolean;
};

type Stage = {
  key: string;
  label: string;
  detail: string;
  state: "done" | "active" | "waiting" | "failed";
  at?: number;
};

/**
 * The four real states of a NEXPOOL TON deposit. Every completed step is backed
 * by a server field on the deposit row — nothing here is animated ahead of the
 * backend. `submittedAt` is only supplied when this browser saw the wallet
 * approval, so the second step never claims a payment that was not sent.
 */
function stagesFor(row: DepositTimelineRow, submittedAt?: number): Stage[] {
  const observedPayment = Boolean(submittedAt || row.txHash || row.receivedTon);

  const verification: Stage = row.status === "confirmed"
    ? {
        key: "verify",
        label: "Blockchain verification",
        detail:
          row.receivedTon !== undefined
            ? `${row.receivedTon} TON matched to reference ${row.memo} on TON mainnet.`
            : "Payment matched to your deposit reference.",
        state: "done",
      }
    : row.status === "failed"
      ? {
          key: "verify",
          label: "Blockchain verification",
          detail:
            row.note ??
            "This payment could not be verified against the treasury.",
          state: "failed",
        }
      : row.expired
        ? {
            key: "verify",
            label: "Blockchain verification",
            detail:
              "The quote expired before a matching payment arrived. Nothing was credited.",
            state: "waiting",
          }
        : {
            key: "verify",
            label: "Blockchain verification",
            detail:
              "NEXPOOL checks the treasury automatically. A matching transfer is credited without you keeping this screen open.",
            state: "active",
          };

  return [
    {
      key: "created",
      label: "Deposit request created",
      detail: `${row.tonAmount.toFixed(2)} TON · ref ${row.memo} · quote locked until ${formatDateTime(row.expiresAt)}`,
      state: "done",
      at: row.createdAt,
    },
    {
      key: "submitted",
      label: "Payment sent from your wallet",
      detail: observedPayment
        ? "A transfer carrying your deposit reference reached the treasury address."
        : row.expired
          ? "No transfer was recorded before the quote expired."
          : "Waiting for a transfer with the reference above.",
      state: observedPayment ? "done" : row.expired ? "waiting" : "active",
      at: submittedAt,
    },
    verification,
    {
      key: "credited",
      label: "NEX balance credited",
      detail:
        row.status === "confirmed"
          ? `+${formatNex(row.creditedNex ?? row.quotedNex)} NEX committed to your ledger.`
          : row.status === "failed"
            ? "No credit was made."
            : "Your balance updates after verification succeeds.",
      state: row.status === "confirmed" ? "done" : "waiting",
    },
  ];
}

export function DepositTimeline({
  row,
  submittedAt,
}: {
  row: DepositTimelineRow;
  submittedAt?: number;
}) {
  const stages = stagesFor(row, submittedAt);

  return (
    <div className="mt-3 rounded-xl border border-border/70 bg-secondary/20 p-3">
      <ol className="space-y-0">
        {stages.map((stage, index) => {
          const last = index === stages.length - 1;
          return (
            <li key={stage.key} className="flex gap-2.5">
              <div className="flex flex-col items-center">
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-[3px] flex size-4 shrink-0 items-center justify-center rounded-full border",
                    stage.state === "done"
                      ? "border-up/50 bg-up/15 text-up"
                      : stage.state === "active"
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : stage.state === "failed"
                          ? "border-down/50 bg-down/10 text-down"
                          : "border-border bg-card text-muted-foreground",
                  )}
                >
                  {stage.state === "done" ? (
                    <Check className="size-2.5" />
                  ) : stage.state === "failed" ? (
                    <span className="size-1 rounded-full bg-current" />
                  ) : stage.state === "active" ? (
                    <span className="size-1 animate-signal-pulse rounded-full bg-current" />
                  ) : (
                    <Clock className="size-2.5" />
                  )}
                </span>
                {!last ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "my-0.5 w-px flex-1",
                      stage.state === "done" ? "bg-up/30" : "bg-border/70",
                    )}
                  />
                ) : null}
              </div>
              <div className={cn("min-w-0 flex-1", last ? "pb-0" : "pb-3")}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <p
                    className={cn(
                      "text-[11.5px] font-medium leading-tight",
                      stage.state === "waiting"
                        ? "text-muted-foreground"
                        : "text-foreground",
                    )}
                  >
                    {stage.label}
                  </p>
                  {stage.at ? (
                    <span className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground">
                      {formatDateTime(stage.at)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
                  {stage.detail}
                </p>
                {stage.key === "verify" && row.txHash ? (
                  <button
                    type="button"
                    onClick={() => openExternal(`${TON_EXPLORER_TX}${row.txHash}`)}
                    className="mt-1.5 inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.08em] text-primary hover:underline"
                  >
                    <ExternalLink className="size-2.5" />
                    {row.txHash.slice(0, 10)}…{row.txHash.slice(-6)}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
