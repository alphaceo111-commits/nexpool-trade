import { CoinChip, Panel, Sparkline, StatCard, StatusDot } from "@/components/console/parts";
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
import { cn } from "@/lib/utils";
import { formatPth, timeAgo } from "@/lib/nexpool";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Cpu, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type WorkerStatus = "online" | "degraded" | "offline";

const STATUS_LABEL: Record<WorkerStatus, string> = {
  online: "ONLINE",
  degraded: "DEGRADED",
  offline: "OFFLINE",
};

export default function Workers() {
  const workers = useQuery(api.pool.workers);
  const addWorker = useMutation(api.pool.addWorker);
  const setWorkerStatus = useMutation(api.pool.setWorkerStatus);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    coin: "BTC",
    hashrate: "",
    region: "eu-central",
  });

  if (!workers) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const active = workers.filter((w) => w.status !== "offline");
  const totalTh = active.reduce((sum, w) => sum + w.hashrateTh, 0);
  const online = workers.filter((w) => w.status === "online");
  const degraded = workers.filter((w) => w.status === "degraded");
  const offline = workers.filter((w) => w.status === "offline");
  const avgReject =
    online.length > 0
      ? online.reduce((sum, w) => sum + w.rejectRate, 0) / online.length
      : 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const hashrate = Number(form.hashrate);
    if (!form.name.trim()) {
      toast.error("Give the worker a name.");
      return;
    }
    if (!Number.isFinite(hashrate) || hashrate <= 0) {
      toast.error("Enter a hashrate above zero.");
      return;
    }
    setSaving(true);
    try {
      await addWorker({
        name: form.name,
        coin: form.coin as "BTC" | "LTC" | "KAS" | "ETC",
        hashrateTh: Math.round(hashrate * 1000),
        region: form.region,
      });
      toast.success("Worker joined the pool", {
        description: `${form.name.trim().toLowerCase().replace(/\s+/g, "-")} · ${form.coin} · ${hashrate} PH/s`,
      });
      setOpen(false);
      setForm({ name: "", coin: "BTC", hashrate: "", region: "eu-central" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add worker.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatus(workerId: Id<"workers">, status: WorkerStatus) {
    setPendingId(workerId);
    try {
      await setWorkerStatus({ workerId, status });
      toast.success(`Worker marked ${status}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Status update failed.");
    } finally {
      setPendingId(null);
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
          <p className="label-xs">Fleet telemetry</p>
          <h2 className="mt-1.5 text-xl font-bold tracking-tight">
            {workers.length} worker endpoints on the book.
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Point each rig at the pool, then track rejects, uptime and coin allocation here.
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5 self-start font-mono text-[11px] uppercase tracking-[0.1em]"
          onClick={() => setOpen(true)}
        >
          <Plus className="size-3.5" /> Add worker
        </Button>
      </motion.div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Fleet hashrate"
          value={formatPth(totalTh / 1000)}
          hint={`${active.length} hashing endpoints`}
          spark={workers.map((w) => w.hashrateTh)}
          accent
        />
        <StatCard label="Online" value={`${online.length}`} hint={`${degraded.length} degraded · ${offline.length} offline`} />
        <StatCard label="Avg reject" value={`${avgReject.toFixed(2)}%`} hint="Averaged across online workers" delta={{ value: "target < 1%", direction: avgReject < 1 ? "up" : "down" }} />
        <StatCard label="Top worker" value={workers[0] ? workers[0].name : "—"} hint={workers[0] ? `${formatPth(workers[0].hashrateTh / 1000)} · ${workers[0].region}` : "No workers yet"} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.06 }}
      >
        <Panel
          label="Worker registry"
          title="Telemetry board"
          action={
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <StatusDot status="live" /> polling
            </span>
          }
          bodyClassName="p-0"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[12px]">
              <thead>
                <tr className="border-b border-border font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-medium">Worker</th>
                  <th className="px-2 py-2.5 text-left font-medium">Coin</th>
                  <th className="px-2 py-2.5 text-right font-medium">Hashrate</th>
                  <th className="px-2 py-2.5 text-right font-medium">Reject</th>
                  <th className="px-2 py-2.5 text-left font-medium">Region</th>
                  <th className="px-2 py-2.5 text-left font-medium">Last ping</th>
                  <th className="px-4 py-2.5 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((worker) => (
                  <tr key={worker._id} className="border-b border-border/60 last:border-0 hover:bg-secondary/40">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "size-1.5",
                            worker.status === "online"
                              ? "bg-up"
                              : worker.status === "degraded"
                                ? "bg-warn"
                                : "bg-down",
                          )}
                        />
                        <span className="font-mono text-[12px]">{worker.name}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5">
                      <CoinChip coin={worker.coin} />
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                      {formatPth(worker.hashrateTh / 1000)}
                    </td>
                    <td
                      className={cn(
                        "px-2 py-2.5 text-right font-mono tabular-nums",
                        worker.rejectRate > 1 ? "text-warn" : "text-muted-foreground",
                      )}
                    >
                      {worker.rejectRate.toFixed(2)}%
                    </td>
                    <td className="px-2 py-2.5 font-mono text-[11px] text-muted-foreground">
                      {worker.region}
                    </td>
                    <td className="px-2 py-2.5 font-mono text-[11px] text-muted-foreground">
                      {timeAgo(worker.lastSeen)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Select
                        value={worker.status}
                        onValueChange={(value) => handleStatus(worker._id, value as WorkerStatus)}
                        disabled={pendingId === worker._id}
                      >
                        <SelectTrigger
                          className={cn(
                            "ml-auto h-7 w-[126px] border-border bg-panel font-mono text-[10px] tracking-[0.1em]",
                            worker.status === "offline" && "text-down",
                            worker.status === "degraded" && "text-warn",
                            worker.status === "online" && "text-up",
                          )}
                          size="sm"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(["online", "degraded", "offline"] as WorkerStatus[]).map((status) => (
                            <SelectItem key={status} value={status} className="font-mono text-[11px]">
                              {STATUS_LABEL[status]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
                {workers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      No workers registered yet. Add your first endpoint.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel label="Allocation" title="Checks & balances" className="lg:col-span-2" bodyClassName="space-y-3">
          <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
            <Cpu className="size-3.5" /> Hashrate split across {workers.length} endpoints
          </div>
          <div className="flex h-3 w-full overflow-hidden border border-border">
            {workers
              .filter((w) => w.status !== "offline")
              .map((worker) => (
                <div
                  key={worker._id}
                  title={`${worker.name} · ${formatPth(worker.hashrateTh / 1000)}`}
                  style={{ width: `${(worker.hashrateTh / totalTh) * 100}%` }}
                  className={cn(
                    "h-full border-r border-background/60 last:border-0",
                    worker.coin === "BTC" && "bg-warn/80",
                    worker.coin === "KAS" && "bg-chart-2/80",
                    worker.coin === "LTC" && "bg-chart-5/80",
                    worker.coin === "ETC" && "bg-primary/80",
                  )}
                />
              ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            {["BTC", "KAS", "LTC", "ETC"].map((coin) => (
              <span key={coin} className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "size-1.5",
                    coin === "BTC" && "bg-warn",
                    coin === "KAS" && "bg-chart-2",
                    coin === "LTC" && "bg-chart-5",
                    coin === "ETC" && "bg-primary",
                  )}
                />
                {coin}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 sm:grid-cols-3">
            <div>
              <p className="label-xs">Workers</p>
              <p className="mt-1 font-mono text-sm tabular-nums">{workers.length}</p>
            </div>
            <div>
              <p className="label-xs">Avg hashrate</p>
              <p className="mt-1 font-mono text-sm tabular-nums">
                {formatPth(workers.length > 0 ? totalTh / workers.length / 1000 : 0)}
              </p>
            </div>
            <div>
              <p className="label-xs">Under 1% reject</p>
              <p className="mt-1 font-mono text-sm tabular-nums">
                {online.filter((w) => w.rejectRate < 1).length}/{online.length}
              </p>
            </div>
          </div>
        </Panel>

        <Panel label="Hashrate by endpoint" title="Distribution" bodyClassName="space-y-3">
          <Sparkline points={workers.map((w) => w.hashrateTh / 1000)} className="h-14" />
          <div className="space-y-2">
            {workers.slice(0, 5).map((worker) => (
              <div key={worker._id} className="flex items-center justify-between gap-2 font-mono text-[11px]">
                <span className="truncate text-muted-foreground">{worker.name}</span>
                <span className="tabular-nums">{formatPth(worker.hashrateTh / 1000)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="tracking-tight">Add worker endpoint</DialogTitle>
            <DialogDescription>
              Register a rig or farm. It starts reporting as soon as the first share lands.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="worker-name" className="label-xs">
                Worker name
              </Label>
              <Input
                id="worker-name"
                placeholder="rig-ams-05"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                autoComplete="off"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="label-xs">Coin</Label>
                <Select
                  value={form.coin}
                  onValueChange={(value) => setForm({ ...form, coin: value })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["BTC", "KAS", "LTC", "ETC"].map((coin) => (
                      <SelectItem key={coin} value={coin}>
                        {coin}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="worker-hashrate" className="label-xs">
                  Hashrate (PH/s)
                </Label>
                <Input
                  id="worker-hashrate"
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="12.5"
                  value={form.hashrate}
                  onChange={(event) => setForm({ ...form, hashrate: event.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="label-xs">Region</Label>
              <Select
                value={form.region}
                onValueChange={(value) => setForm({ ...form, region: value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    "eu-central",
                    "eu-north",
                    "us-east",
                    "ca-west",
                    "ap-south",
                    "ap-southeast",
                  ].map((region) => (
                    <SelectItem key={region} value={region}>
                      {region}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="font-mono text-[11px] uppercase tracking-[0.1em]">
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                Register worker
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
