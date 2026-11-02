import { Brand, BrandMark } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { rememberReferral } from "@/lib/telegram";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Bot,
  Check,
  ChevronRight,
  Coins,
  Gauge,
  ListChecks,
  Lock,
  Menu,
  Pickaxe,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

const NAV = [
  { href: "#engine", label: "Engine" },
  { href: "#tasks", label: "Tasks" },
  { href: "#referrals", label: "Referrals" },
  { href: "#payouts", label: "Payouts" },
];

const TAPE = [
  ["NEX / TARGET", "$2.50", "text-gold"],
  ["DAILY CAP", "2.00 NEX", "text-foreground"],
  ["MIN WITHDRAW", "1.00 NEX", "text-foreground"],
  ["QUALIFICATION", "10 refs × 3 tasks", "text-primary"],
  ["SETTLEMENT", "SERVER-SIDE", "text-up"],
  ["PAYOUT", "TON MAINNET", "text-foreground"],
  ["AD REWARDS", "PROVIDER-CONFIRMED", "text-warn"],
];

const FEATURES = [
  {
    icon: Gauge,
    index: "01",
    title: "Accrual the backend owns",
    body: "Mining is derived from server timestamps, the configured rate and a per-UTC-day cap. Refresh, airplane mode or a changed device clock cannot mint NEX.",
  },
  {
    icon: ListChecks,
    index: "02",
    title: "Tasks that must verify",
    body: "Telegram membership is checked through getChatMember, ad completions through a provider API. A click alone is never a payout.",
  },
  {
    icon: Users,
    index: "03",
    title: "Referrals that must qualify",
    body: "Each invited account needs three verified tasks before it counts. Clicks, joins and abandoned invites never move the withdrawal gate.",
  },
  {
    icon: Coins,
    index: "04",
    title: "One ledger, no theatre",
    body: "Mining, task rewards, payout holds and refunds all post to a single server ledger. Displayed balances are read from confirmed rows.",
  },
  {
    icon: ShieldCheck,
    index: "05",
    title: "Payouts gated on both sides",
    body: "The backend checks balance, qualified referrals, wallet, compliance and treasury liquidity. The operator still signs the transfer.",
  },
  {
    icon: Bot,
    index: "06",
    title: "Bot + mini app, one book",
    body: "Telegram notifications follow confirmed events. The bot validates Mini App initData with the bot token before linking identity.",
  },
];

const TASK_TYPES = [
  {
    title: "Join a sponsor channel",
    verification: "getChatMember",
    body: "The bot must be an admin in the sponsor chat. Membership is re-checked at verification time.",
  },
  {
    title: "Watch a sponsored placement",
    verification: "provider API",
    body: "A configured advertising verifier posts the completion back to the backend. No screenshot uploads.",
  },
  {
    title: "Start a sponsor bot",
    verification: "operator review",
    body: "No standard verification API exists, so the task waits for a human decision — visibly pending.",
  },
  {
    title: "Public social action",
    verification: "operator review",
    body: "Queued with a note. Rewards are credited only after the operator confirms the action.",
  },
];

export default function Landing() {
  const { isAuthenticated, isLoading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [params] = useSearchParams();
  const primaryTo = isAuthenticated ? "/app" : "/auth?returnTo=%2Fapp";

  useEffect(() => {
    rememberReferral(params.get("ref"));
  }, [params]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1240px] items-center justify-between px-4 sm:px-6">
          <Link to="/" aria-label="NEXPOOL home">
            <Brand subtitle="MINING REWARDS" />
          </Link>
          <nav className="hidden items-center gap-7 md:flex">
            {NAV.map((link) => (
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
            <span className="hidden items-center gap-1.5 border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground lg:flex">
              <span className="size-1.5 animate-signal-pulse rounded-full bg-up" />
              engine live
            </span>
            <Button
              asChild
              size="sm"
              className="gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em]"
            >
              <Link to={primaryTo}>
                {isAuthenticated ? "Open app" : "Start mining"}
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
              {NAV.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="border-b border-border/60 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground"
                >
                  {link.label}
                </a>
              ))}
              <Link
                to={primaryTo}
                onClick={() => setMenuOpen(false)}
                className="py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-primary"
              >
                {isAuthenticated ? "Open mini app" : "Start mining"}
              </Link>
            </div>
          </motion.div>
        ) : null}
      </header>

      <Ticker />

      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 terminal-grid opacity-40" />
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[440px] w-[780px] -translate-x-1/2 rounded-full bg-primary/[0.08] blur-[130px]" />
        <div className="relative mx-auto grid w-full max-w-[1240px] grid-cols-1 items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-12 lg:py-20">
          <motion.div
            className="lg:col-span-6"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="border border-primary/40 bg-primary/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
                v1 · telegram mini app
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                NEX rewards · verified only
              </span>
            </div>
            <h1 className="mt-5 text-[38px] leading-[1.02] font-bold tracking-tight sm:text-5xl lg:text-[58px]">
              Mine NEX.
              <br />
              <span className="relative inline-block text-gold">
                Verified, or not at all.
                <span className="absolute -bottom-1 left-0 h-[3px] w-full bg-gold/40" />
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-[14.5px] leading-relaxed text-muted-foreground">
              A mining rewards desk built like a trading book: a server-calculated
              rate, a hard daily cap, sponsor tasks that independently verify, and
              payouts that wait for a real transaction hash.
            </p>
            <div className="mt-7 flex flex-col gap-2 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="gap-2 font-mono text-[12px] uppercase tracking-[0.12em]"
              >
                <Link to={primaryTo}>
                  {isLoading
                    ? "Loading session"
                    : isAuthenticated
                      ? "Open the mini app"
                      : "Open a mining account"}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="gap-2 font-mono text-[12px] uppercase tracking-[0.12em]"
              >
                <a href="#engine">
                  <Gauge className="size-4" /> Inspect the engine
                </a>
              </Button>
            </div>
            <div className="mt-8 grid max-w-lg grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 sm:grid-cols-4">
              {[
                ["Target", "$2.50"],
                ["Daily cap", "2.00 NEX"],
                ["Min payout", "1.00 NEX"],
                ["Gate", "10 × 3"],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="label-xs">{label}</p>
                  <p className="num mt-1 text-[13px]">{value}</p>
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
              <span className="absolute top-0 left-0 h-[2px] w-24 bg-gold" />
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em]">
                  <Gauge className="size-3.5 text-primary" />
                  nexpool / engine schematic
                </div>
                <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                  <span className="size-1.5 animate-signal-pulse rounded-full bg-up" />
                  server rate
                </span>
              </div>

              <div className="relative px-4 py-4">
                <div className="flex items-center gap-4">
                  <div className="relative flex size-[92px] shrink-0 items-center justify-center">
                    <span className="mining-ring" />
                    <span className="mining-ring" style={{ animationDelay: "1.3s" }} />
                    <svg viewBox="0 0 100 100" className="size-[92px] -rotate-90">
                      <circle
                        cx="50"
                        cy="50"
                        r="41"
                        fill="none"
                        stroke="var(--secondary)"
                        strokeWidth="4"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r="41"
                        fill="none"
                        stroke="var(--signal)"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeDasharray="150 258"
                      />
                    </svg>
                    <div className="absolute text-center">
                      <p className="label-xs">engine</p>
                      <p className="num text-[13px] font-semibold text-primary">ON</p>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="label-xs">Published rate stack</p>
                    <p className="num mt-1 text-2xl font-semibold text-gold">
                      0.5000
                      <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                        NEX/h base
                      </span>
                    </p>
                    <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                      task + referral bonuses applied server-side
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-2 border-t border-border pt-3">
                  {[
                    ["BASE RATE", "0.50 NEX / h", "configurable"],
                    ["TASK BONUS", "per verified task", "campaign-defined"],
                    ["REFERRAL BONUS", "+0.02 NEX / h each", "after 3 tasks"],
                    ["DAILY CAP", "2.00 NEX", "00:00 UTC reset"],
                  ].map(([label, value, note]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between font-mono text-[10px]"
                    >
                      <span className="tracking-[0.08em] text-muted-foreground">
                        {label}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="tabular-nums text-foreground">{value}</span>
                        <span className="hidden text-[8px] uppercase tracking-[0.08em] text-muted-foreground sm:inline">
                          {note}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
                  <div className="border border-border bg-panel px-2.5 py-2">
                    <p className="label-xs">Settlement</p>
                    <p className="mt-1 flex items-center gap-1 font-mono text-[10px] text-up">
                      <Lock className="size-2.5" /> backend only
                    </p>
                  </div>
                  <div className="border border-border bg-panel px-2.5 py-2">
                    <p className="label-xs">Withdraw gate</p>
                    <p className="mt-1 font-mono text-[10px] text-gold">
                      1 NEX + 10 qualified
                    </p>
                  </div>
                </div>
                <p className="mt-2 font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">
                  schematic of published rules · not an account balance
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section id="engine" className="border-b border-border">
        <div className="mx-auto w-full max-w-[1240px] px-4 py-16 sm:px-6 lg:py-20">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div className="max-w-2xl">
              <p className="label-xs">01 — engine</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                The rate lives on the server.
              </h2>
            </div>
            <p className="max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">
              Every NEX number in the app is derived from a backend row: confirmed
              balances, settled mining entries and verified completions. No screen
              invents a reward.
            </p>
          </div>

          <div className="mt-9 grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              {
                k: "accrual",
                title: "Server-timestamped accrual",
                body: "The engine multiplies elapsed server time by base + task + referral speed, then caps each UTC day. The live counter is cosmetic; settlement is transactional.",
                rows: [
                  ["from", "max(lastSettledAt, miningEnabledAt)"],
                  ["rate", "base + tasks + referrals"],
                  ["cap", "dailyLimitNex / day"],
                ],
              },
              {
                k: "bonuses",
                title: "Bonuses from verified rows",
                body: "Task speed comes from verified completions on active campaigns. Referral speed comes from qualified referrals only — each with three verified tasks.",
                rows: [
                  ["task bonus", "per verified task"],
                  ["referral", "+0.02 NEX/h"],
                  ["cap", "10 qualifying refs"],
                ],
              },
              {
                k: "limits",
                title: "Honest limit handling",
                body: "At the cap, mining reports Daily Limit Reached and stops. The next UTC day opens a fresh allowance. Time until reset is computed from server timestamps.",
                rows: [
                  ["status", "Active / Paused / Limit"],
                  ["reset", "00:00 UTC"],
                  ["manual claim", "none required"],
                ],
              },
            ].map((card, index) => (
              <motion.div
                key={card.k}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.06 }}
                className="border border-border bg-card p-4"
              >
                <p className="label-xs">{String(index + 1).padStart(2, "0")} / engine</p>
                <h3 className="mt-2 text-[14px] font-semibold tracking-tight">
                  {card.title}
                </h3>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                  {card.body}
                </p>
                <div className="mt-3 border-t border-border pt-2.5">
                  {card.rows.map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-center justify-between py-0.5 font-mono text-[9px]"
                    >
                      <span className="uppercase tracking-[0.08em] text-muted-foreground">
                        {k}
                      </span>
                      <span className="text-foreground/80">{v}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="tasks" className="border-b border-border bg-panel/20">
        <div className="mx-auto grid w-full max-w-[1240px] grid-cols-1 gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-start lg:py-20">
          <div>
            <p className="label-xs">02 — marketplace</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Sponsor attention.
              <br />
              <span className="text-primary">Pay for completion.</span>
            </h2>
            <p className="mt-4 max-w-lg text-[13.5px] leading-relaxed text-muted-foreground">
              Tasks are grouped by category and carry a NEX reward, a mining-speed
              bonus, or both. Each one names its verification method before the user
              starts — no mystery buttons.
            </p>

            <div className="mt-6 space-y-2">
              {TASK_TYPES.map((task) => (
                <div
                  key={task.title}
                  className="flex items-start gap-3 border border-border bg-card px-3.5 py-3"
                >
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center border border-primary/30 bg-primary/10">
                    <BadgeCheck className="size-3 text-primary" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-x-2">
                      <p className="text-[12px] font-medium">{task.title}</p>
                      <span className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">
                        {task.verification}
                      </span>
                    </div>
                    <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
                      {task.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="border border-border bg-card"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em]">
                published rule set
              </span>
              <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-muted-foreground">
                v1
              </span>
            </div>
            <div className="divide-y divide-border">
              {[
                ["Tasks available to users", "Sponsor campaigns with live targets"],
                ["Reward on submit", "Nothing"],
                ["Reward on click", "Nothing"],
                ["Reward after verification", "NEX + speed bonus"],
                ["Advertising source", "Configured provider only"],
                ["Unverifiable tasks", "Marked unavailable, not paid"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-[11px] text-muted-foreground">{k}</span>
                  <span className="text-right font-mono text-[9.5px] tracking-[0.02em]">
                    {v}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-start gap-2 border-t border-border bg-panel/60 px-4 py-3">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                If a Telegram token or ad provider is missing, the task is honestly
                marked unavailable. It is never quietly paid from a click.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      <section id="referrals" className="border-b border-border">
        <div className="mx-auto w-full max-w-[1240px] px-4 py-16 sm:px-6 lg:py-20">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div className="max-w-2xl">
              <p className="label-xs">03 — referrals</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                A referral is a task record, not a click.
              </h2>
            </div>
            <p className="max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">
              Qualified referrals carry speed and unlock the withdrawal gate. The
              backend counts verified tasks per invited account.
            </p>
          </div>

          <div className="mt-9 grid grid-cols-1 gap-3 lg:grid-cols-12">
            <div className="border border-border bg-card p-4 lg:col-span-7">
              <div className="flex items-center justify-between">
                <div>
                  <p className="label-xs">Qualified referrals</p>
                  <p className="num mt-1 text-2xl font-semibold">
                    7<span className="text-sm text-muted-foreground">/10</span>
                  </p>
                </div>
                <span className="border border-primary/40 bg-primary/10 px-2 py-1 font-mono text-[8.5px] uppercase tracking-[0.12em] text-primary">
                  example state
                </span>
              </div>
              <div className="mt-3 flex gap-1">
                {Array.from({ length: 10 }).map((_, index) => (
                  <div
                    key={index}
                    className={cn(
                      "flex h-8 flex-1 items-center justify-center border font-mono text-[8px]",
                      index < 7
                        ? "border-up/50 bg-up/15 text-up"
                        : "border-border bg-secondary/30 text-muted-foreground",
                    )}
                  >
                    {index < 7 ? <Check className="size-3" /> : index + 1}
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-3">
                <div>
                  <p className="label-xs">Qualified</p>
                  <p className="mt-1 text-[11px] text-up">
                    7 referrals · each 3/3 tasks
                  </p>
                </div>
                <div>
                  <p className="label-xs">Not counted</p>
                  <p className="mt-1 text-[11px] text-warn">
                    3 referrals still in progress
                  </p>
                </div>
                <div>
                  <p className="label-xs">Speed added</p>
                  <p className="num mt-1 text-[11px] text-gold">
                    +0.14 NEX/h
                  </p>
                </div>
                <div>
                  <p className="label-xs">Gate</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    3 more to unlock withdrawal
                  </p>
                </div>
              </div>
              <p className="mt-2 font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">
                illustrative qualification ladder · not live account data
              </p>
            </div>

            <div className="border border-border bg-card p-4 lg:col-span-5">
              <p className="label-xs">Qualification rules</p>
              <ul className="mt-2 space-y-2.5">
                {[
                  "Three verified tasks per invited account.",
                  "A link click or join request counts for nothing.",
                  "Only qualified referrals add mining speed.",
                  "Only qualified referrals count toward withdrawal.",
                  "Self-referral and referral loops are rejected.",
                ].map((line) => (
                  <li key={line} className="flex gap-2 text-[11px] leading-relaxed">
                    <ChevronRight className="mt-0.5 size-3 shrink-0 text-primary" />
                    <span className="text-muted-foreground">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="payouts" className="border-b border-border bg-panel/20">
        <div className="mx-auto grid w-full max-w-[1240px] grid-cols-1 gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-20">
          <div>
            <p className="label-xs">04 — payouts</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Eligibility is public.
              <br />
              <span className="text-gold">Approval is not automatic.</span>
            </h2>
            <p className="mt-4 max-w-lg text-[13.5px] leading-relaxed text-muted-foreground">
              A withdrawal request has to clear six server checks before it joins
              the queue. NEX is reserved immediately; it is only reported as paid
              when an independently verified TON transaction hash is recorded.
            </p>

            <div className="mt-6 space-y-2">
              {[
                ["Balance", "At least 1.00 NEX available"],
                ["Referrals", "10 qualified, 3 verified tasks each"],
                ["Destination", "Linked TON mainnet address"],
                ["Liquidity", "Funded reward pool covers the payout"],
                ["Compliance", "Account cleared, not restricted"],
                ["Service", "Withdrawal desk open"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center gap-2 border-b border-border/70 py-2 last:border-0"
                >
                  <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10">
                    <Check className="size-2.5 text-primary" />
                  </span>
                  <span className="text-[11.5px] text-muted-foreground">{label}</span>
                  <span className="ml-auto text-right font-mono text-[9.5px]">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-gold/30 bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-gold">
                redemption policy
              </span>
              <Lock className="size-3.5 text-gold" />
            </div>
            <div className="p-4">
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                NEXPOOL publishes a{" "}
                <span className="text-foreground">$2.50 target value per NEX</span>{" "}
                and quotes payouts in TON at the operator&apos;s reference rate. That
                target is a reference, not a promise of liquidity.
              </p>
              <div className="mt-4 border border-border/70 bg-panel/60 p-3">
                <p className="font-mono text-[9px] uppercase leading-relaxed tracking-[0.1em] text-muted-foreground">
                  payout order of operations
                </p>
                <ol className="mt-2 space-y-1.5">
                  {[
                    "Backend re-checks every rule and reserves NEX.",
                    "Request enters the operator review queue.",
                    "Operator verifies treasury and compliance.",
                    "Transfer is broadcast and its hash recorded.",
                    "User sees Confirmed only with that hash.",
                  ].map((line, index) => (
                    <li key={line} className="flex gap-2 text-[10.5px]">
                      <span className="num text-[8px] text-gold">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="text-muted-foreground">{line}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <p className="mt-3 flex items-start gap-1.5 text-[9.5px] leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3 shrink-0 text-primary" />
                NEXPOOL never asks for a seed phrase or private key. Only a public
                TON address is linked.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-[1240px] px-4 py-16 sm:px-6 lg:py-20">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="label-xs">05 — build</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                Six systems. One book.
              </h2>
            </div>
            <p className="max-w-sm text-[12px] leading-relaxed text-muted-foreground">
              The mini app is a compact financial dashboard, not a toy. Each screen
              reads the same Convex backend that authorizes every mutation.
            </p>
          </div>

          <div className="mt-9 grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: (index % 3) * 0.06 }}
                className="group relative bg-card p-5 transition-colors hover:bg-panel"
              >
                <div className="flex items-start justify-between">
                  <feature.icon className="size-4 text-primary" />
                  <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground">
                    {feature.index}
                  </span>
                </div>
                <h3 className="mt-4 text-[14px] font-semibold tracking-tight">
                  {feature.title}
                </h3>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                  {feature.body}
                </p>
                <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-primary transition-all duration-300 group-hover:w-full" />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 terminal-grid opacity-30" />
        <div className="relative mx-auto flex w-full max-w-[1240px] flex-col items-start justify-between gap-6 px-4 py-16 sm:px-6 lg:flex-row lg:items-center lg:py-20">
          <div>
            <p className="label-xs">account access</p>
            <h2 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
              The engine is up. Bring your own account.
            </h2>
            <p className="mt-2 max-w-xl text-[13px] text-muted-foreground">
              New accounts start at zero NEX — no welcome balance, no simulated
              rewards. Mining begins from the backend timestamp, and every later
              credit has a ledger entry.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="gap-2 font-mono text-[12px] uppercase tracking-[0.12em]"
            >
              <Link to={primaryTo}>
                {isAuthenticated ? "Open mini app" : "Create mining account"}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="gap-2 font-mono text-[12px] uppercase tracking-[0.12em]"
            >
              <a href="#engine">
                <Pickaxe className="size-4" /> Review the rules
              </a>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-4 py-7 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2.5">
            <BrandMark className="size-6 text-primary" />
            <div>
              <p className="font-mono text-[11px] font-bold tracking-[0.18em]">
                NEXPOOL
              </p>
              <p className="font-mono text-[8px] uppercase tracking-[0.24em] text-muted-foreground">
                mining rewards desk
              </p>
            </div>
          </div>
          <p className="max-w-lg font-mono text-[9px] leading-relaxed uppercase tracking-[0.08em] text-muted-foreground">
            v1 · NEX is a verified reward unit, not an investment. Target value is
            subject to redemption policy, compliance review and funded liquidity.
            Mining returns are variable.
          </p>
          <div className="flex items-center gap-4 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
            <a href="#engine" className="hover:text-foreground">
              Engine
            </a>
            <a href="#payouts" className="hover:text-foreground">
              Policy
            </a>
            <Link to={primaryTo} className="text-primary">
              {isAuthenticated ? "App" : "Sign in"}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Ticker() {
  const items = [...TAPE, ...TAPE];
  return (
    <div className="relative overflow-hidden border-y border-border bg-panel/60">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-background to-transparent" />
      <div className="flex w-max animate-ticker gap-8 px-6 py-2.5 hover:[animation-play-state:paused]">
        {items.map(([label, value, tone], index) => (
          <div
            key={`${label}-${index}`}
            className="flex items-center gap-2 font-mono text-[10px]"
          >
            <span className="size-1.5 bg-primary/60" />
            <span className="tracking-[0.1em] text-muted-foreground">{label}</span>
            <span className={cn("tabular-nums", tone)}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
