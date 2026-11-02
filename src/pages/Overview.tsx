import { CoinChip, Panel, Sparkline, StatCard, StatusDot } from "@/components/console/parts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import {
  COIN_COLORS,
  formatDay,
  formatPth,
  formatUsd,
  timeAgo,
} from "@/lib/nexpool";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { ArrowUpRight, Loader2, Send } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

const chartConfig = {
  feeUsd: { label: "Fee revenue", color: "var(--signal)" },
  grossUsd: { label: "Gross mined", color: "var(--chart-2)" },
} satisfies ChartConfig;

const fade = {
  hidden: { opacity: 0, y: 10 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export default function Overview() {
  const data = useQuery(api.pool.overview);
  const [range, setRange] = useState<7 | 30>(30);

  if (!data) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const successfulBlocks = data.recentBlocks.filter((b) => b.status === "confirmed").length;
  const series = data.series.slice(-range).map((point) => ({
    ...point,
    label: formatDay(point.day),
  }));
  const maxCoin = data.coinMix[0];

  return (
    <div className="space-y-4">
      <motion.div
        initial="hidden"
        animate="show"
        custom={0}
        variants={fade}
        className="flex flex-col gap-3 border border-border bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <div className="flex items-center gap-2">
            <StatusDot status="live" />
            <p className="label-xs">30-day operating book · live</p>
          </div>
          <h2 className="mt-1.5 text-xl font-bold tracking-tight sm:text-2xl">
            Every share marked to market.
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {formatPth(data.hashratePth)} pointed at the pool · {data.feePercent.toFixed(2)}% take ·
            settlement {data.payoutInterval.toLowerCase()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild className="font-mono text-[11px] uppercase tracking-[0.1em]">
            <Link to="/dashboard/bot">
              <Send className="size-3.5" /> Bot desk
            </Link>
          </Button>
          <Button size="sm" asChild className="font-mono text-[11px] uppercase tracking-[0.1em]">
            <Link to="/dashboard/payouts">
              Settle payouts <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </motion.div>

      <motion.div
        initial="hidden"
        animate="show"
        custom={1}
        variants={fade}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label="Pool hashrate"
          value={formatPth(data.hashratePth)}
          hint={`${data.samples.length} samples / 24h`}
          delta={{ value: "2.4%", direction: "up" }}
          spark={data.samples.map((s) => s.hashratePth)}
          accent
        />
        <StatCard
          label="Workers active"
          value={
            <span>
              {data.minersOnline}
              <span className="text-muted-foreground">/{data.minersTotal}</span>
            </span>
          }
          hint={`${data.uptime.toFixed(0)}% fleet uptime · ${data.rejectAvg.toFixed(2)}% reject`}
        />
        <StatCard
          label="Fee revenue · 30d"
          value={formatUsd(data.fee30)}
          hint={`${data.margin.toFixed(2)}% of ${formatUsd(data.gross30)} mined`}
          delta={{ value: "8.1%", direction: "up" }}
        />
        <StatCard
          label="Pending payouts"
          value={formatUsd(data.pendingPayoutUsd)}
          hint={`${data.pendingPayoutCount} miners queued · floor ${formatUsd(data.payoutThresholdUsd)}`}
          delta={{ value: "next batch", direction: "flat" }}
        />
      </motion.div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <motion.div
          initial="hidden"
          animate="show"
          custom={2}
          variants={fade}
          className="xl:col-span-2"
        >
          <Panel
            label="Fee revenue"
            title="Operator take, marked daily"
            action={
              <div className="flex border border-border">
                {([7, 30] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setRange(option)}
                    className={cn(
                      "px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors",
                      range === option
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option}d
                  </button>
                ))}
              </div>
            }
            bodyClassName="px-2 pt-4 pb-2 sm:px-4"
          >
            <ChartContainer config={chartConfig} className="aspect-auto h-[268px] w-full">
              <AreaChart data={series} margin={{ left: 0, right: 8, top: 6, bottom: 0 }}>
                <defs>
                  <linearGradient id="feeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--signal)" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="var(--signal)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--grid)" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  minTickGap={28}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10, fontFamily: "var(--font-mono)" }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tickFormatter={(value: number) => `$${Math.round(value / 100) / 10}K`}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10, fontFamily: "var(--font-mono)" }}
                />
                <ChartTooltip
                  cursor={{ stroke: "var(--grid)" }}
                  content={<ChartTooltipContent indicator="line" />}
                />
                <Area
                  type="monotone"
                  dataKey="feeUsd"
                  stroke="var(--signal)"
                  strokeWidth={1.6}
                  fill="url(#feeFill)"
                  activeDot={{ r: 3, fill: "var(--signal)", stroke: "var(--background)" }}
                />
              </AreaChart>
            </ChartContainer>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-2 pt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <span>{data.blocks30} blocks settled in window</span>
              <span className="text-up">
                run-rate {formatUsd((data.fee30 / 30) * 30)} / 30d
              </span>
            </div>
          </Panel>
        </motion.div>

        <motion.div initial="hidden" animate="show" custom={3} variants={fade}>
          <Panel label="Live telemetry" title="Intraday hashrate" bodyClassName="space-y-4">
            <div>
              <div className="flex items-end justify-between">
                <div className="font-mono text-2xl font-semibold tabular-nums">
                  {formatPth(
                    data.samples[data.samples.length - 1]?.hashratePth ?? data.hashratePth,
                  )}
                </div>
                <span className="flex items-center gap-1 font-mono text-[10px] text-up">
                  <StatusDot status="live" /> streaming
                </span>
              </div>
              <Sparkline
                points={data.samples.map((s) => s.hashratePth)}
                className="mt-2 h-16"
              />
              <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
                <span>{data.samples.length}h window</span>
                <span>
                  {data.samples[data.samples.length - 1]?.miners ?? data.minersOnline} miners
                </span>
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <p className="label-xs mb-2">Hashrate mix</p>
              <div className="space-y-2">
                {data.coinMix.map((coin) => (
                  <div key={coin.coin}>
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="size-1.5"
                          style={{ backgroundColor: COIN_COLORS[coin.coin] }}
                        />
                        {coin.coin}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {coin.hashratePth.toFixed(1)} · {coin.share.toFixed(0)}%
                      </span>
                    </div>
                    <div className="mt-1 h-1 w-full bg-secondary">
                      <div
                        className="h-full"
                        style={{
                          width: `${coin.share}%`,
                          backgroundColor: COIN_COLORS[coin.coin],
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
              <div className="border border-border bg-panel px-2.5 py-2">
                <p className="label-xs">Fee 30d</p>
                <p className="mt-1 font-mono text-sm tabular-nums">{formatUsd(data.fee30)}</p>
              </div>
              <div className="border border-border bg-panel px-2.5 py-2">
                <p className="label-xs">Take rate</p>
                <p className="mt-1 font-mono text-sm tabular-nums text-primary">
                  {data.feePercent.toFixed(2)}%
                </p>
              </div>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              {maxCoin ? `${maxCoin.coin} leads the book at ${maxCoin.share.toFixed(0)}%` : "No hashrate reported"}
            </p>
          </Panel>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <motion.div initial="hidden" animate="show" custom={4} variants={fade} className="xl:col-span-2">
          <Panel
            label="Block ledger"
            title="Recent finds"
            action={
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {successfulBlocks} confirmed
              </span>
            }
            bodyClassName="p-0"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    <th className="px-4 py-2 text-left font-medium">Coin</th>
                    <th className="px-2 py-2 text-left font-medium">Height</th>
                    <th className="px-2 py-2 text-right font-medium">Reward</th>
                    <th className="px-2 py-2 text-right font-medium">Value</th>
                    <th className="px-2 py-2 text-left font-medium">Finder</th>
                    <th className="px-4 py-2 text-right font-medium">Found</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentBlocks.map((block) => (
                    <tr key={block._id} className="border-b border-border/60 last:border-0 hover:bg-secondary/40">
                      <td className="px-4 py-2.5">
                        <CoinChip coin={block.coin} />
                      </td>
                      <td className="px-2 py-2.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                        {block.height.toLocaleString()}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono text-[11px] tabular-nums">
                        {block.reward}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono text-[11px] tabular-nums">
                        {formatUsd(block.usdValue)}
                      </td>
                      <td className="px-2 py-2.5 font-mono text-[11px] text-muted-foreground">
                        {block.finder}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                        {timeAgo(block.foundAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </motion.div>

        <motion.div initial="hidden" animate="show" custom={5} variants={fade}>
          <Panel label="Activity" title="Desk tape" bodyClassName="p-0">
            <ul className="divide-y divide-border/60">
              {data.events.slice(0, 7).map((event) => (
                <li key={event._id} className="flex gap-2.5 px-4 py-2.5">
                  <span
                    className={cn(
                      "mt-1 h-full w-0.5 shrink-0",
                      event.severity === "success"
                        ? "bg-up"
                        : event.severity === "warn"
                          ? "bg-warn"
                          : "bg-border",
                    )}
                  />
                  <div className="min-w-0">
                    <p className="text-[12px] leading-snug">{event.message}</p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      {event.kind} · {timeAgo(event.ts)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </motion.div>
      </div>
    </div>
  );
}
