import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { COIN_COLORS, FEE_TIERS, MARKET } from "@/lib/nexpool";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  ChevronRight,
  Cpu,
  Gauge,
  LineChart,
  Menu,
  ShieldCheck,
  Terminal,
  Wallet,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

const HERO_SERIES = [
  292, 288, 301, 296, 310, 305, 318, 312, 325, 320, 316, 328, 335, 330, 344,
  338, 331, 342, 349, 345, 352, 348, 356, 361, 355, 347, 353, 349, 358, 352,
  362,
];

const FEATURES = [
  {
    icon: Gauge,
    index: "01",
    title: "Live pool telemetry",
    body: "Intraday hashrate, per-worker reject rates and uptime in one tape. Degraded rigs surface before they cost you a block.",
  },
  {
    icon: Wallet,
    index: "02",
    title: "Settlement you control",
    body: "Payout queue with a hard floor, four-asset ledger and a one-click mark-paid flow. Every entry carries its tx hash.",
  },
  {
    icon: LineChart,
    index: "03",
    title: "Fee economics, marked daily",
    body: "The take rate is the business model. See gross mined, fee revenue and run-rate without rebuilding a spreadsheet.",
  },
  {
    icon: Bot,
    index: "04",
    title: "Telegram desk bot",
    body: "Seven commands over the same live book: /stats, /workers, /revenue, /blocks, /payouts, /alerts, /help.",
  },
  {
    icon: Cpu,
    index: "05",
    title: "Multi-coin routing",
    body: "BTC, KAS, LTC and ETC workers under one registry, with allocation split visible at a glance.",
  },
  {
    icon: ShieldCheck,
    index: "06",
    title: "No spread, no games",
    body: "Published fee tiers. No withdrawal fees, no hidden hashprice markup, no token to buy before you can operate.",
  },
];

const TAPE = [
  { time: "12:41", text: "BTC block 873,412 confirmed", value: "$294,125", tone: "up" },
  { time: "12:18", text: "kas-calgary-01 reject rate normalised", value: "0.22%", tone: "muted" },
  { time: "11:52", text: "Settlement batch #4821 broadcast", value: "4 payouts", tone: "muted" },
  { time: "10:07", text: "etc-sing-01 heartbeat missed", value: "47m", tone: "down" },
];

function buildPath(values: number[], width: number, height: number) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - min) / span) * (height - 12) - 6;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `M${points.join(" L")}`;
}

function Ticker() {
  const items = [...MARKET, ...MARKET];
  return (
    <div className="relative overflow-hidden border-y border-border bg-panel/60">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-background to-transparent" />
      <div className="flex w-max animate-ticker gap-8 px-6 py-2.5 hover:[animation-play-state:paused]">
        {items.map((coin, index) => (
          <div key={`${coin.symbol}-${index}`} className="flex items-center gap-2 font-mono text-[11px]">
            <span className="size-1.5" style={{ backgroundColor: coin.color }} />
            <span className="tracking-[0.1em] text-muted-foreground">{coin.pair}</span>
            <span className="tabular-nums text-foreground">
              {coin.price >= 1000
                ? coin.price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                : coin.price.toFixed(4)}
            </span>
            <span
              className={cn(
                "tabular-nums",
                coin.change > 0 ? "text-up" : coin.change < 0 ? "text-down" : "text-muted-foreground",
              )}
            >
              {coin.change > 0 ? "+" : ""}
              {coin.change.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Landing() {
  const { isAuthenticated, isLoading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const primaryTo = isAuthenticated ? "/dashboard" : "/auth?returnTo=%2Fdashboard";
  const path = buildPath(HERO_SERIES, 480, 132);

  const navLinks = [
    { href: "#operations", label: "Operations" },
    { href: "#bot", label: "Bot desk" },
    { href: "#economics", label: "Economics" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* NAV */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1240px] items-center justify-between px-4 sm:px-6">
          <Link to="/" aria-label="NEXPOOL home">
            <Brand subtitle="MINING INFRASTRUCTURE" />
          </Link>
          <nav className="hidden items-center gap-7 md:flex">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground lg:flex">
              <span className="size-1.5 animate-signal-pulse rounded-full bg-up" /> pool live
            </span>
            {!isAuthenticated && !isLoading ? (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="hidden font-mono text-[11px] uppercase tracking-[0.12em] sm:inline-flex"
              >
                <Link to="/auth">Sign in</Link>
              </Button>
            ) : null}
            <Button
              asChild
              size="sm"
              className="gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em]"
            >
              <Link to={primaryTo}>
                {isAuthenticated ? "Open console" : "Run the desk"}
                <ArrowUpRight className="size-3.5" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              aria-label="Toggle menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
            </Button>
          </div>
        </div>
        {menuOpen ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            className="border-t border-border bg-background md:hidden"
          >
            <div className="flex flex-col px-4 py-2">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="border-b border-border/60 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground"
                >
                  {link.label}
                </a>
              ))}
              {!isAuthenticated ? (
                <Link
                  to="/auth"
                  onClick={() => setMenuOpen(false)}
                  className="py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-primary"
                >
                  Sign in
                </Link>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </header>

      <Ticker />

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 terminal-grid opacity-40" />
        <div className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />
        <div className="relative mx-auto grid w-full max-w-[1240px] grid-cols-1 items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-12 lg:py-20">
          <motion.div
            className="lg:col-span-6"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="border border-primary/40 bg-primary/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
                v1 · operator build
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                multi-coin mining pool
              </span>
            </div>
            <h1 className="mt-5 text-[38px] leading-[1.02] font-bold tracking-tight sm:text-5xl lg:text-[56px]">
              Run your pool
              <br />
              like a{" "}
              <span className="relative inline-block text-primary">
                trading desk
                <span className="absolute -bottom-1 left-0 h-[3px] w-full bg-primary/40" />
              </span>
              .
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
              NEXPOOL is the operator console for a real mining business: hashrate marked live,
              settlement controlled to the cent, a published fee take, and a Telegram bot that
              answers from the same book. No token, no spread, no theatre.
            </p>
            <div className="mt-7 flex flex-col gap-2 sm:flex-row">
              <Button asChild size="lg" className="gap-2 font-mono text-[12px] uppercase tracking-[0.12em]">
                <Link to={primaryTo}>
                  {isAuthenticated ? "Open operator console" : "Launch the operator console"}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="gap-2 font-mono text-[12px] uppercase tracking-[0.12em]"
              >
                <a href="#bot">
                  <Bot className="size-4" /> See the bot
                </a>
              </Button>
            </div>
            <div className="mt-7 grid max-w-lg grid-cols-3 gap-3 border-t border-border pt-4">
              {[
                ["Fee", "1.00%"],
                ["Payout floor", "$250"],
                ["Settlement", "6h"],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="label-xs">{label}</p>
                  <p className="mt-1 font-mono text-base tabular-nums">{value}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            className="lg:col-span-6"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="relative border border-border bg-card">
              <span className="absolute top-0 left-0 h-[2px] w-24 bg-primary" />
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em]">
                  <Terminal className="size-3.5 text-primary" />
                  nexpool / pool book
                </div>
                <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-up">
                  <span className="size-1.5 animate-signal-pulse rounded-full bg-up" /> live
                </span>
              </div>

              <div className="px-4 pt-4">
                <p className="label-xs">Pool hashrate</p>
                <div className="mt-1 flex flex-wrap items-end gap-2">
                  <span className="font-mono text-3xl leading-none font-semibold tabular-nums">
                    348.6
                  </span>
                  <span className="font-mono text-sm text-muted-foreground">PH/s</span>
                  <span className="ml-auto font-mono text-[11px] text-up">+2.41% 24h</span>
                </div>
                <svg viewBox="0 0 480 132" className="mt-3 h-[132px] w-full" aria-hidden="true">
                  <defs>
                    <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#c6f24e" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="#c6f24e" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[0, 1, 2, 3].map((line) => (
                    <line
                      key={line}
                      x1="0"
                      x2="480"
                      y1={line * 44}
                      y2={line * 44}
                      stroke="var(--grid)"
                      strokeDasharray="2 5"
                    />
                  ))}
                  <path d={`${path} L480,132 L0,132 Z`} fill="url(#heroFill)" />
                  <path d={path} fill="none" stroke="#c6f24e" strokeWidth="1.8" />
                  <circle
                    cx="480"
                    cy={path.split("L").slice(-1)[0]?.split(",")[1]}
                    r="3"
                    fill="#c6f24e"
                  />
                </svg>
                <div className="flex justify-between font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                  <span>-24h</span>
                  <span>-12h</span>
                  <span>now</span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 divide-x divide-border border-t border-border">
                {[
                  ["Fee 30d", "$11,482"],
                  ["Blocks 30d", "61"],
                  ["Take", "1.00%"],
                ].map(([label, value]) => (
                  <div key={label} className="px-3 py-2.5">
                    <p className="label-xs">{label}</p>
                    <p className="mt-1 font-mono text-sm tabular-nums">{value}</p>
                  </div>
                ))}
              </div>

              <div className="border-t border-border px-4 py-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="label-xs">Desk tape</p>
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                    block ledger
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {TAPE.map((row) => (
                    <li key={row.text} className="flex items-center gap-2 font-mono text-[10px]">
                      <span className="text-muted-foreground">{row.time}</span>
                      <span className="truncate text-foreground/80">{row.text}</span>
                      <span
                        className={cn(
                          "ml-auto shrink-0 tabular-nums",
                          row.tone === "up"
                            ? "text-up"
                            : row.tone === "down"
                              ? "text-down"
                              : "text-muted-foreground",
                        )}
                      >
                        {row.value}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
              <span>reference console · demo book</span>
              <span className="flex items-center gap-1.5">
                <span className="size-1 bg-primary" /> 8/9 workers hashing
              </span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* STATS */}
      <section className="border-b border-border bg-panel/30">
        <div className="mx-auto grid w-full max-w-[1240px] grid-cols-2 divide-x divide-border px-4 sm:px-6 lg:grid-cols-4">
          {[
            ["Pool hashrate", "348.6 PH/s", "4 coins routed"],
            ["30d fee revenue", "$11,482", "1.00% flat take"],
            ["Blocks settled", "61", "last 30 days"],
            ["Fleet uptime", "99.2%", "8 of 9 active"],
          ].map(([label, value, note], index) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.05 }}
              className={cn("px-3 py-5 sm:px-5", index > 1 && "border-t border-border lg:border-t-0")}
            >
              <p className="label-xs">{label}</p>
              <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums sm:text-2xl">{value}</p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                {note}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* OPERATIONS */}
      <section id="operations" className="border-b border-border">
        <div className="mx-auto w-full max-w-[1240px] px-4 py-16 sm:px-6 lg:py-20">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div className="max-w-xl">
              <p className="label-xs">01 — operations</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                The whole desk. One screen.
              </h2>
            </div>
            <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
              Built for the person who owns the pool: hashrate, fleet, settlement and fee revenue
              share one ledger, so the numbers cannot disagree with each other.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: (index % 3) * 0.06 }}
                className="group relative bg-card p-5 transition-colors hover:bg-panel"
              >
                <div className="flex items-start justify-between">
                  <feature.icon className="size-4 text-primary" />
                  <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground">
                    {feature.index}
                  </span>
                </div>
                <h3 className="mt-4 text-[15px] font-semibold tracking-tight">{feature.title}</h3>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                  {feature.body}
                </p>
                <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-primary transition-all duration-300 group-hover:w-full" />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* BOT */}
      <section id="bot" className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 hatch opacity-[0.15]" />
        <div className="relative mx-auto grid w-full max-w-[1240px] grid-cols-1 gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-20">
          <div>
            <p className="label-xs">02 — automation</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Your pool answers in Telegram.
            </h2>
            <p className="mt-4 max-w-lg text-[14px] leading-relaxed text-muted-foreground">
              Point the webhook once and the desk bot reads the same Convex book as the console.
              Ask for stats on the move, pull the payout queue before you approve a batch, or let
              it ping you when a rig drops below the hashrate floor.
            </p>

            <ul className="mt-6 space-y-2.5">
              {[
                "Secure webhook with an optional secret header",
                "Seven commands, one shared command engine",
                "Console mirror so you can test without a token",
                "Block and worker-offline alerts to the owner chat",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-[13px]">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>

            <div className="mt-7 flex flex-wrap gap-1.5">
              {["/stats", "/workers", "/revenue", "/blocks", "/payouts", "/alerts", "/help"].map(
                (command) => (
                  <span
                    key={command}
                    className="border border-border bg-card px-2 py-1 font-mono text-[10px] text-muted-foreground"
                  >
                    {command}
                  </span>
                ),
              )}
            </div>

            <Button asChild className="mt-7 gap-2 font-mono text-[11px] uppercase tracking-[0.12em]">
              <Link to={primaryTo}>
                Open the bot console <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55 }}
            className="relative mx-auto w-full max-w-md"
          >
            <div className="border border-border bg-card">
              <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
                <div className="flex size-8 items-center justify-center border border-primary/40 bg-primary/10">
                  <Bot className="size-4 text-primary" />
                </div>
                <div className="leading-tight">
                  <p className="text-[12px] font-semibold">NEXPOOL desk</p>
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-up">
                    online · bot
                  </p>
                </div>
                <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                  telegram
                </span>
              </div>
              <div className="space-y-2.5 px-4 py-4">
                <div className="ml-auto w-fit max-w-[80%] border border-primary/40 bg-primary/10 px-3 py-2 font-mono text-[11px]">
                  /stats
                </div>
                <div className="w-fit max-w-[92%] border border-border bg-panel px-3 py-2">
                  <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap">{`NEXPOOL · DESK SNAPSHOT
Hashrate   348.6 PH/s
Workers    8/9 active
Fee 30d    $11,482 · 1.00%
Blocks 30d 61
Pending    $3,141 across 4 miners`}</pre>
                </div>
                <div className="ml-auto w-fit max-w-[80%] border border-primary/40 bg-primary/10 px-3 py-2 font-mono text-[11px]">
                  /alerts
                </div>
                <div className="w-fit max-w-[92%] border border-border bg-panel px-3 py-2">
                  <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap">{`NEXPOOL · ALERTS
• OFFLINE etc-sing-01
• DEGRADED farm-tex-04 (reject 1.86%)`}</pre>
                </div>
              </div>
              <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
                <span className="flex-1 border border-border bg-background px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
                  /stats
                </span>
                <span className="flex size-7 items-center justify-center bg-primary text-primary-foreground">
                  <ArrowUpRight className="size-3.5" />
                </span>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
              <span>signed webhook · owner only</span>
              <span className="flex items-center gap-1.5">
                <span className="size-1 bg-primary" /> same book
              </span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ECONOMICS */}
      <section id="economics" className="border-b border-border">
        <div className="mx-auto w-full max-w-[1240px] px-4 py-16 sm:px-6 lg:py-20">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="label-xs">03 — economics</p>
              <h2 className="mt-2 max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">
                A fee, not a fantasy.
              </h2>
            </div>
            <p className="max-w-sm font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-muted-foreground">
              one line of revenue · published rate · settled on chain
            </p>
          </div>

          <div className="mt-9 grid grid-cols-1 gap-3 md:grid-cols-3">
            {FEE_TIERS.map((tier, index) => (
              <motion.div
                key={tier.name}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: index * 0.07 }}
                className={cn(
                  "relative border p-5",
                  tier.accent
                    ? "border-primary/50 bg-primary/[0.04]"
                    : "border-border bg-card",
                )}
              >
                {tier.accent ? (
                  <span className="absolute top-0 right-0 bg-primary px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-primary-foreground">
                    current desk
                  </span>
                ) : null}
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {tier.name}
                </p>
                <p
                  className={cn(
                    "mt-3 font-mono text-4xl font-semibold tabular-nums",
                    tier.accent ? "text-primary" : "text-foreground",
                  )}
                >
                  {tier.fee}
                </p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  per block value
                </p>
                <div className="mt-5 space-y-1.5 border-t border-border pt-4 text-[12px]">
                  <p className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Hashrate</span>
                    <span className="font-mono">{tier.hashrate}</span>
                  </p>
                  <p className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Settlement</span>
                    <span className="font-mono">{tier.payout}</span>
                  </p>
                  <p className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Withdrawal fee</span>
                    <span className="font-mono text-primary">none</span>
                  </p>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="mt-3 flex flex-col gap-2 border border-border bg-panel px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-muted-foreground">
              projected run-rate · 348.6 PH/s · $11,482 monthly take
            </p>
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-primary">
              <ChevronRight className="size-3.5" /> fee changes are logged to the desk tape
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 terminal-grid opacity-30" />
        <div className="relative mx-auto flex w-full max-w-[1240px] flex-col items-start justify-between gap-6 px-4 py-16 sm:px-6 lg:flex-row lg:items-center lg:py-20">
          <div>
            <p className="label-xs">operator access</p>
            <h2 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
              The book is open. Take the desk.
            </h2>
            <p className="mt-2 max-w-xl text-[13px] text-muted-foreground">
              Sign in with your email and the seeded pool book loads on first entry. Every worker,
              payout and bot answer is yours to operate.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild size="lg" className="gap-2 font-mono text-[12px] uppercase tracking-[0.12em]">
              <Link to={primaryTo}>
                {isAuthenticated ? "Open console" : "Enter the console"}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="gap-2 font-mono text-[12px] uppercase tracking-[0.12em]"
            >
              <a href="#economics">Review pricing</a>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-4 py-7 sm:px-6 md:flex-row md:items-center md:justify-between">
          <Brand subtitle="POOL DESK" compact />
          <p className="max-w-md font-mono text-[10px] leading-relaxed uppercase tracking-[0.1em] text-muted-foreground">
            NEXPOOL v1 · operator console · reference rates and seeded ledger for demonstration.
            Mining returns are variable and not guaranteed.
          </p>
          <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <a href="#operations" className="hover:text-foreground">
              Operations
            </a>
            <a href="#bot" className="hover:text-foreground">
              Bot
            </a>
            <Link to={primaryTo} className="text-primary">
              Console
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
