import { CoinChip, Panel, StatCard } from "@/components/console/parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  FEE_TIERS,
  formatCoin,
  formatDateTime,
  formatNumber,
  formatUsd,
  shortHash,
  timeAgo,
} from "@/lib/nexpool";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Check, CheckCircle2, Loader2, Settings2, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Payouts() {
  const ledger = useQuery(api.pool.payouts);
  const overview = useQuery(api.pool.overview);
  const markPaid = useMutation(api.pool.markPayoutPaid);
  const updateEconomics = useMutation(api.pool.updateEconomics);

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ fee: "1.00", floor: "250", interval: "Every 6 hours" });

  if (!ledger || !overview) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  function openEconomics() {
    setForm({
      fee: overview!.feePercent.toFixed(2),
      floor: String(overview!.payoutThresholdUsd),
      interval: overview!.payoutInterval,
    });
    setOpen(true);
  }

  async function handlePaid(payoutId: Id<"payouts">, miner: string) {
    setPendingId(payoutId);
    try {
      await markPaid({ payoutId });
      toast.success("Settlement broadcast", { description: `Payout to ${miner} marked paid.` });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not settle payout.");
    } finally {
      setPendingId(null);
    }
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    const fee = Number(form.fee);
    const floor = Number(form.floor);
    if (!Number.isFinite(fee) || fee < 0.1 || fee > 5) {
      toast.error("Fee must be between 0.10% and 5.00%.");
      return;
    }
    if (!Number.isFinite(floor) || floor < 10) {
      toast.error("Payout floor must be at least $10.");
      return;
    }
    setSaving(true);
    try {
      await updateEconomics({
        feePercent: fee,
        payoutThresholdUsd: Math.round(floor),
        payoutInterval: form.interval,
      });
      toast.success("Pool economics updated", {
        description: `${fee.toFixed(2)}% take · $${Math.round(floor)} floor · ${form.interval.toLowerCase()}`,
      });
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update economics.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex flex-col gap-3 border border-border bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p className="label-xs">Settlement ledger</p>
          <h2 className="mt-1.5 text-xl font-bold tracking-tight">Revenue in, payouts out.</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {formatUsd(overview.fee30)} of fee revenue booked over 30 days at a{" "}
            {overview.feePercent.toFixed(2)}% take. Payout floor {formatUsd(overview.payoutThresholdUsd)}.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 self-start font-mono text-[11px] uppercase tracking-[0.1em]"
          onClick={openEconomics}
        >
          <Settings2 className="size-3.5" /> Pool economics
        </Button>
      </motion.div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pending queue"
          value={formatUsd(ledger.pendingUsd)}
          hint={`${ledger.pendingCount} miners waiting`}
          delta={{ value: "settle now", direction: "flat" }}
          accent
        />
        <StatCard
          label="Paid · ledger"
          value={formatUsd(ledger.paidUsd)}
          hint={`${ledger.paidCount} settled transfers`}
          delta={{ value: "on chain", direction: "up" }}
        />
        <StatCard
          label="Fee revenue · 30d"
          value={formatUsd(overview.fee30)}
          hint={`${overview.margin.toFixed(2)}% of ${formatUsd(overview.gross30)} mined`}
          delta={{ value: "1.0x take", direction: "up" }}
        />
        <StatCard
          label="Settlement cadence"
          value={overview.payoutInterval.replace("Every ", "")}
          hint={`Floor ${formatUsd(overview.payoutThresholdUsd)} per miner`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08 }}
          className="xl:col-span-2"
        >
          <Panel
            label="Payout queue"
            title="Miner settlements"
            action={
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {ledger.rows.length} entries
              </span>
            }
            bodyClassName="p-0"
          >
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full min-w-[720px] text-[12px]">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    <th className="px-4 py-2.5 text-left font-medium">Miner</th>
                    <th className="px-2 py-2.5 text-left font-medium">Asset</th>
                    <th className="px-2 py-2.5 text-right font-medium">Amount</th>
                    <th className="px-2 py-2.5 text-right font-medium">USD</th>
                    <th className="px-2 py-2.5 text-left font-medium">Requested</th>
                    <th className="px-4 py-2.5 text-right font-medium">Settlement</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.rows.map((row) => (
                    <tr key={row._id} className="border-b border-border/60 last:border-0 hover:bg-secondary/40">
                      <td className="px-4 py-2.5 font-mono text-[11px]">{row.miner}</td>
                      <td className="px-2 py-2.5">
                        <CoinChip coin={row.coin} />
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono text-[11px] tabular-nums">
                        {formatCoin(row.amountCoin)}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono text-[11px] tabular-nums">
                        {formatUsd(row.amountUsd, 2)}
                      </td>
                      <td className="px-2 py-2.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                        {timeAgo(row.requestedAt)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-2">
                          {row.status === "paid" ? (
                            <span
                              className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-up"
                              title={formatDateTime(row.paidAt ?? row.requestedAt)}
                            >
                              <CheckCircle2 className="size-3" />
                              {row.txHash ? shortHash(row.txHash) : "PAID"}
                            </span>
                          ) : (
                            <>
                              <Badge
                                variant="outline"
                                className="rounded-none border-warn/40 font-mono text-[9px] tracking-[0.12em] text-warn"
                              >
                                PENDING
                              </Badge>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1 px-2 font-mono text-[10px] uppercase tracking-[0.1em]"
                                disabled={pendingId === row._id}
                                onClick={() => handlePaid(row._id, row.miner)}
                              >
                                {pendingId === row._id ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <Check className="size-3" />
                                )}
                                Mark paid
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </motion.div>

        <div className="space-y-4">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.12 }}>
            <Panel label="Business model" title="How the desk earns" bodyClassName="space-y-3">
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                NEXPOOL bills a flat fee on the value of every block found. No spread, no
                withdrawal games — the take rate on this page is the take rate on the invoice.
              </p>
              <div className="space-y-2">
                {[
                  ["Fee on block value", `${overview.feePercent.toFixed(2)}%`],
                  ["Gross mined · 30d", formatUsd(overview.gross30)],
                  ["Operator take · 30d", formatUsd(overview.fee30)],
                  ["Payout floor", formatUsd(overview.payoutThresholdUsd)],
                  ["Settlement", overview.payoutInterval],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between border-b border-border/60 pb-2 text-[12px] last:border-0 last:pb-0"
                  >
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono tabular-nums">{value}</span>
                  </div>
                ))}
              </div>
              <div className="border border-primary/30 bg-primary/5 px-3 py-2">
                <p className="label-xs text-primary/80">Monthly run-rate</p>
                <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-primary">
                  {formatUsd(overview.fee30)}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  {formatNumber(overview.blocks30)} blocks settled · {overview.minersTotal} endpoints
                </p>
              </div>
            </Panel>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.16 }}>
            <Panel label="Fee schedule" title="Published tiers" bodyClassName="space-y-2">
              {FEE_TIERS.map((tier) => (
                <div
                  key={tier.name}
                  className={cn(
                    "flex items-center justify-between border px-3 py-2",
                    tier.accent ? "border-primary/40 bg-primary/5" : "border-border",
                  )}
                >
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.12em]">
                      {tier.name}
                    </p>
                    <p className="font-mono text-[10px] text-muted-foreground">{tier.hashrate}</p>
                  </div>
                  <div className="text-right">
                    <p className={cn("font-mono text-sm tabular-nums", tier.accent && "text-primary")}>
                      {tier.fee}
                    </p>
                    <p className="font-mono text-[10px] text-muted-foreground">{tier.payout}</p>
                  </div>
                </div>
              ))}
              <p className="flex items-center gap-1.5 pt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                <Wallet className="size-3" /> Self-serve upgrades land in v2
              </p>
            </Panel>
          </motion.div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="tracking-tight">Pool economics</DialogTitle>
            <DialogDescription>
              These values drive fee revenue, the payout queue and what the bot reports.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="fee" className="label-xs">
                  Fee (%)
                </Label>
                <Input
                  id="fee"
                  type="number"
                  step="0.05"
                  min="0.1"
                  max="5"
                  value={form.fee}
                  onChange={(event) => setForm({ ...form, fee: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="floor" className="label-xs">
                  Payout floor (USD)
                </Label>
                <Input
                  id="floor"
                  type="number"
                  step="10"
                  min="10"
                  value={form.floor}
                  onChange={(event) => setForm({ ...form, floor: event.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="label-xs">Settlement cadence</Label>
              <Select
                value={form.interval}
                onValueChange={(value) => setForm({ ...form, interval: value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Every 2 hours", "Every 6 hours", "Daily"].map((interval) => (
                    <SelectItem key={interval} value={interval}>
                      {interval}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="border border-border bg-panel px-3 py-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
              Example: a {formatUsd(10000)} block pays the desk{" "}
              <span className="text-primary">
                {formatUsd(Number(form.fee || 0) * 100, 2)}
              </span>{" "}
              at {Number(form.fee || 0).toFixed(2)}%.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                Save economics
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
