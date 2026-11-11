import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import {
  BookOpen,
  ChevronDown,
  CircleHelp,
  LifeBuoy,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { formatNex } from "@/components/app/parts";
import {
  Metric,
  Panel,
  SectionHeading,
  Spinner,
  StatusPill,
} from "@/components/app/parts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FAQ = [
  {
    q: "How does mining actually accrue?",
    a: "Normal mining accrues on server time. While the Mini App is open, presence heartbeats confirm the session. With background mining unlocked, the backend also reconciles the absence from the last server credit up to the entitlement expiry. It enforces the 0.000006000 NEX normal daily cap and writes the confirmed ledger total. The ledger is authoritative.",
  },
  {
    q: "How do the verified ad unlocks work?",
    a: "Background mining is one entitlement: 10 verified Monetag views unlock the configured window. The 5-hour extension is a separate entitlement: after the normal cap is reached, 20 separate verified views unlock the extension bucket. Ad opens and clicks never count. Each server-issued challenge needs a secret-authenticated Monetag postback with a valued event; a forged or replayed client completion cannot move progress.",
  },
  {
    q: "Why hasn't my referral counted?",
    a: "A referral only counts toward withdrawal eligibility after it completes the required number of distinct verified tasks. Invitations, link clicks and unverified accounts never count.",
  },
  {
    q: "Why is my withdrawal unavailable?",
    a: "Payouts require the minimum NEX balance, the qualified-referral target, a linked TON destination, cleared compliance and enough treasury liquidity. The Withdraw tab lists each requirement and what is still missing.",
  },
  {
    q: "How are task rewards verified?",
    a: "The backend verifies membership through the Telegram Bot API, provider callbacks for sponsored ads, or operator review. A tap alone never completes a task, and repeated claims for the same campaign are rejected.",
  },
  {
    q: "What happens if verification fails?",
    a: "The completion is marked rejected with the reason, no reward posts, and nothing is deducted from you. You can retry the task if the campaign is still active.",
  },
  {
    q: "What exactly is NEX?",
    a: "NEX is an in-app reward unit. Its USD reference value is shown for transparency only — redemption depends on the funded reward pool and is never guaranteed.",
  },
  {
    q: "Can I deposit crypto?",
    a: "Yes, when TON deposits are open. The Deposit section locks a 30-minute quote and shows the treasury address plus a required payment reference (memo). NEX is credited only after the backend verifies the transfer on-chain. If the operator has not configured the treasury wallet, the section reports deposits offline and issues no address.",
  },
];

const RULES = [
  "Rewards are credited only after backend verification; nothing is simulated.",
  "Mining uses server time and stops at the 0.000006000 NEX normal daily cap.",
  "Background mining requires 10 verified ads; the extra 5 hours requires 20 separate verified ads.",
  "Referral and task bonuses can never push the total rate above 2× the base rate.",
  "Withdrawals reserve funds atomically and are paid only after the operator reconciles treasury and compliance.",
  "Self-referrals, duplicate accounts and forged verification callbacks are rejected and audited.",
  "The operator can pause mining, tasks or payouts; paused services accrue nothing.",
];

export default function Help() {
  const snapshot = useQuery(api.app.snapshot);
  const reportProblem = useMutation(api.app.reportProblem);
  const [topic, setTopic] = useState("general");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    try {
      await reportProblem({ topic, message });
      setSent(true);
      setMessage("");
      toast.success("Report received", {
        description: "The operator desk reviews reports before any financial change.",
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not send the report.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-3">
      <SectionHeading
        index="10"
        title="Help & support"
        body="Rules, answers and a direct line to the operator desk."
        action={<StatusPill tone="up">Backend-checked</StatusPill>}
      />

      <Panel eyebrow="Rules on this deployment" title="What actually applies">
        {!snapshot ? (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Spinner /> Reading live configuration…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric
                label="Daily cap"
                value={formatNex(snapshot.config.dailyLimitNex)}
                sub="NEX / UTC day"
              />
              <Metric
                label="Withdraw minimum"
                value={snapshot.config.minWithdrawNex.toFixed(2)}
                sub="NEX"
              />
              <Metric
                label="Qualified referrals"
                value={`${snapshot.referrals.qualified}/${snapshot.referrals.target}`}
                sub="Required for payouts"
              />
              <Metric
                label="Tasks per referral"
                value={snapshot.referrals.taskTarget}
                sub="Must be verified"
              />
            </div>

            <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
              <ServiceRow
                label="Mining engine"
                open={snapshot.config.miningEnabled}
              />
              <ServiceRow
                label="Withdrawal desk"
                open={snapshot.config.withdrawalsEnabled}
              />
            </div>

            <ul className="mt-3 space-y-1.5 border-t border-border/70 pt-3">
              {RULES.map((rule) => (
                <li key={rule} className="flex gap-2 text-[11.5px] leading-relaxed">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  <span className="text-muted-foreground">{rule}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      <Panel
        eyebrow="FAQ"
        title="Common questions"
        action={<CircleHelp className="size-4 text-muted-foreground" />}
        bodyClassName="p-0"
      >
        <ul className="divide-y divide-border/60">
          {FAQ.map((item) => (
            <li key={item.q}>
              <details className="group px-4 py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[12px] font-medium">
                  {item.q}
                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
                  {item.a}
                </p>
              </details>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel eyebrow="Support" title="Report a problem">
        {sent ? (
          <div className="rounded-sm border border-up/30 bg-up/[0.06] p-3">
            <p className="flex items-center gap-2 text-[12px] font-medium">
              <Sparkles className="size-3.5 text-up" /> Report received
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              It is in the operator audit trail and a notification was written to
              your account. You can send another report below.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em]"
              onClick={() => setSent(false)}
            >
              Send another
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-2.5">
            <div className="flex flex-wrap gap-1">
              {["general", "mining", "tasks", "referrals", "wallet"].map(
                (item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setTopic(item)}
                    className={cn(
                      "rounded-sm border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] transition-colors",
                      topic === item
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border/70 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {item}
                  </button>
                ),
              )}
            </div>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Describe what happened. Include amounts and times if relevant — never share seed phrases or private keys."
              className="w-full resize-none rounded-sm border border-border bg-background px-2.5 py-2 text-[12px] leading-relaxed outline-none placeholder:text-muted-foreground/70 focus:border-primary/50"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                {message.trim().length}/2000 · audited
              </span>
              <Button
                type="submit"
                size="sm"
                className="gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em]"
                disabled={sending || message.trim().length < 10}
              >
                {sending ? <Spinner /> : <Send className="size-3.5" />}
                {sending ? "Sending…" : "Send report"}
              </Button>
            </div>
          </form>
        )}
      </Panel>

      <div className="grid gap-2 sm:grid-cols-2">
        <Link
          to="/app/history"
          className="flex items-center gap-2.5 rounded-md border border-border/80 bg-card px-3 py-3 transition-colors hover:border-primary/40"
        >
          <BookOpen className="size-4 text-primary" />
          <span>
            <span className="block text-[12px] font-medium">Transaction history</span>
            <span className="block font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
              Ledger and payouts
            </span>
          </span>
        </Link>
        <Link
          to="/app/profile"
          className="flex items-center gap-2.5 rounded-md border border-border/80 bg-card px-3 py-3 transition-colors hover:border-primary/40"
        >
          <LifeBuoy className="size-4 text-primary" />
          <span>
            <span className="block text-[12px] font-medium">Account & notifications</span>
            <span className="block font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
              Telegram profile settings
            </span>
          </span>
        </Link>
      </div>
    </div>
  );
}

function ServiceRow({ label, open }: { label: string; open: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-sm border border-border/70 px-2.5 py-1.5">
      <span className="text-[11.5px] text-muted-foreground">{label}</span>
      <StatusPill tone={open ? "up" : "warn"}>
        {open ? "Open" : "Paused"}
      </StatusPill>
    </div>
  );
}
