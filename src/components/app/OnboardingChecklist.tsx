import { Check, ChevronRight, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

/**
 * First-time activation checklist.
 *
 * Every step is derived from server state — a permanent mining lifecycle
 * marker, a linked wallet, a verified task and a qualified referral. Nothing is
 * stored locally, so the checklist is identical on a new device and cannot be
 * completed by tapping it.
 */
export function OnboardingChecklist({
  accountNexId,
  miningStarted,
  walletConnected,
  telegramLinked,
  tasksCompleted,
  referralsQualified,
}: {
  accountNexId: string;
  miningStarted: boolean;
  walletConnected: boolean;
  telegramLinked: boolean;
  tasksCompleted: number;
  referralsQualified: number;
}) {
  const steps = [
    {
      done: miningStarted,
      title: "Start your first mining session",
      detail: "Open Earn → Mining and press Start. Accrual only runs while the app is open.",
      to: "/app/earn/mining",
    },
    {
      done: telegramLinked && walletConnected,
      title: "Verify Telegram and link a TON wallet",
      detail: telegramLinked
        ? "Telegram verified. Link a payout wallet — no seed phrase is ever requested."
        : "Your account is not bound to a verified Telegram identity yet.",
      to: "/app/wallet",
    },
    {
      done: tasksCompleted > 0,
      title: "Complete a sponsored task",
      detail: "Verified sponsor tasks credit NEX and XP. Rewards only after backend verification.",
      to: "/app/earn/tasks",
    },
    {
      done: referralsQualified > 0,
      title: "Invite one eligible user",
      detail: "A referral qualifies through verified participation, not by opening a link.",
      to: "/app/community/referrals",
    },
  ];

  const done = steps.filter((step) => step.done).length;
  if (done === steps.length) return null;

  const next = steps.find((step) => !step.done);
  const pct = Math.round((done / steps.length) * 100);

  return (
    <section className="premium-card relative overflow-hidden rounded-2xl">
      <div className="pointer-events-none absolute -top-16 -right-12 size-40 rounded-full bg-gold/[0.07] blur-2xl" />
      <div className="relative px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="label-xs flex items-center gap-1.5">
              <Sparkles className="size-3 text-gold" />
              Getting started · {accountNexId}
            </p>
            <h2 className="mt-1.5 text-[14.5px] font-semibold tracking-tight">
              {done === 0
                ? "Four steps to activate your account"
                : `${steps.length - done} step${steps.length - done === 1 ? "" : "s"} left`}
            </h2>
          </div>
          <span className="num shrink-0 text-[13px] font-semibold text-gold">
            {done}/{steps.length}
          </span>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        <ul className="mt-3.5 space-y-1.5">
          {steps.map((step) => (
            <li key={step.title}>
              <Link
                to={step.to}
                className={cn(
                  "flex items-start gap-2.5 rounded-xl border px-2.5 py-2 transition-colors",
                  step.done
                    ? "border-transparent text-muted-foreground"
                    : "border-border/70 hover:border-primary/40 hover:bg-secondary/40",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-[1px] flex size-4 shrink-0 items-center justify-center rounded-full border",
                    step.done
                      ? "border-up/50 bg-up/15 text-up"
                      : "border-border bg-card text-muted-foreground",
                  )}
                >
                  {step.done ? (
                    <Check className="size-2.5" />
                  ) : (
                    <span className="size-1 rounded-full bg-current" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-[12px] font-medium",
                      step.done ? "text-muted-foreground line-through" : "text-foreground",
                    )}
                  >
                    {step.title}
                  </span>
                  {!step.done ? (
                    <span className="mt-0.5 block text-[10.5px] leading-relaxed text-muted-foreground">
                      {step.detail}
                    </span>
                  ) : null}
                </span>
                {!step.done ? (
                  <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                ) : null}
              </Link>
            </li>
          ))}
        </ul>

        {next && done > 0 ? (
          <p className="mt-2.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
            Next up · {next.title}
          </p>
        ) : null}
      </div>
    </section>
  );
}
