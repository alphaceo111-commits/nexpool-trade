import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { Link } from "react-router";
import {
  ArrowUpRight,
  BadgeCheck,
  Check,
  Clock3,
  Gift,
  Link2,
  Send,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import {
  CopyButton,
  EmptyState,
  formatDate,
  formatNex,
  initials,
  Metric,
  Panel,
  ProgressBar,
  SectionHeading,
  StatusPill,
} from "@/components/app/parts";
import { Button } from "@/components/ui/button";
import { openExternal } from "@/lib/telegram";
import { cn } from "@/lib/utils";

export default function Referrals() {
  const snapshot = useQuery(api.app.snapshot);

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

  const { referrals, account, config } = snapshot;
  const link = `${window.location.origin}/?ref=${account.referralCode}`;
  const share = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(
    "Mine NEX on NEXPOOL — verified tasks and qualified referrals only. No purchase required.",
  )}`;
  const rewardHistory = snapshot.ledger.filter((row) => row.kind === "referral");

  return (
    <div className="space-y-3.5">
      <SectionHeading
        index="04"
        title="Referral desk"
        body={`Only referrals with ${config.referralTaskTarget} verified tasks count toward withdrawal eligibility.`}
        action={
          <StatusPill tone={referrals.qualified >= config.qualifiedReferralTarget ? "up" : "muted"}>
            {referrals.qualified}/{config.qualifiedReferralTarget}
          </StatusPill>
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          {
            label: "Invited",
            value: referrals.total,
            sub: "joined accounts",
            tone: "default" as const,
          },
          {
            label: "Qualified",
            value: referrals.qualified,
            sub: `${config.referralTaskTarget} tasks each`,
            tone: "up" as const,
          },
          {
            label: "In progress",
            value: referrals.incomplete,
            sub: "not counted yet",
            tone: "warn" as const,
          },
          {
            label: "Speed bonus",
            value: `+${formatNex(referrals.bonusNexPerHour)}`,
            sub: "NEX / hour",
            tone: "gold" as const,
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-md border border-border/80 bg-card px-3 py-2.5"
          >
            <p className="label-xs">{stat.label}</p>
            <p
              className={cn(
                "num mt-1 text-lg font-semibold",
                stat.tone === "up"
                  ? "text-up"
                  : stat.tone === "warn"
                    ? "text-warn"
                    : stat.tone === "gold"
                      ? "text-gold"
                      : "text-foreground",
              )}
            >
              {stat.value}
            </p>
            <p className="mt-0.5 font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground">
              {stat.sub}
            </p>
          </div>
        ))}
      </div>

      <Panel eyebrow="Your referral link" title="Invite a miner">
        <div className="flex items-center gap-2 rounded-sm border border-border/70 bg-background/50 px-2.5 py-2">
          <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
          <p className="num min-w-0 flex-1 truncate text-[10.5px] text-foreground">
            {link}
          </p>
          <CopyButton value={link} label="Copy" />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            className="gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em]"
            onClick={() => openExternal(share)}
          >
            <Send className="size-3.5" /> Share on Telegram
          </Button>
          <CopyButton
            value={account.referralCode}
            label={`Code ${account.referralCode}`}
            className="w-full"
          />
        </div>
        <p className="mt-2.5 text-[10px] leading-relaxed text-muted-foreground">
          Your code is applied at sign-up. A referral qualifies only after the
          backend verifies {config.referralTaskTarget} completed tasks — a click or
          a join request alone is not enough.
        </p>
      </Panel>

      <Panel
        eyebrow="Withdrawal gate"
        title={`${referrals.qualified} of ${config.qualifiedReferralTarget} qualified referrals`}
      >
        <div className="flex gap-1">
          {Array.from({ length: config.qualifiedReferralTarget }).map((_, index) => {
            const filled = index < referrals.qualified;
            return (
              <div
                key={index}
                className={cn(
                  "flex h-7 flex-1 items-center justify-center rounded-sm border text-[8px]",
                  filled
                    ? "border-up/50 bg-up/15 text-up"
                    : "border-border/70 bg-secondary/30 text-muted-foreground",
                )}
              >
                {filled ? <Check className="size-3" /> : index + 1}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {referrals.qualified >= config.qualifiedReferralTarget
              ? "Referral requirement satisfied. Balance, wallet, liquidity and compliance checks still apply."
              : `${config.qualifiedReferralTarget - referrals.qualified} more qualified referrals needed for the withdrawal gate.`}
          </p>
          <Link
            to="/app/withdraw"
            className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-primary"
          >
            Full rules <ArrowUpRight className="size-3" />
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/70 pt-3">
          <Metric
            label="Bonus per qualified"
            value={`+${formatNex(config.referralBonusNexPerHour)} NEX/h`}
            sub="server-applied"
            tone="gold"
          />
          <Metric
            label="Bonus cap"
            value={`${config.referralBonusCap} referrals`}
            sub={`max +${formatNex(config.referralBonusCap * config.referralBonusNexPerHour)} NEX/h`}
          />
        </div>
      </Panel>

      <Panel
        eyebrow="Referral book"
        title="Invited miners"
        action={
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
            {referrals.total} total
          </span>
        }
        bodyClassName="p-0"
      >
        {referrals.rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<UserPlus className="size-4" />}
              title="No referrals yet"
              body="Share your link. When a friend signs up, they appear here with live task progress — only qualified referrals add mining speed."
              action={
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => openExternal(share)}
                >
                  <Send className="size-3" /> Share invite
                </Button>
              }
            />
          </div>
        ) : (
          <ul>
            {referrals.rows.map((row) => (
              <li
                key={row.profileId}
                className="border-b border-border/60 px-3.5 py-3 last:border-0"
              >
                <div className="flex items-start gap-2.5">
                  <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary font-mono text-[10px] text-muted-foreground">
                    {row.photoUrl ? (
                      <img
                        src={row.photoUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="size-full object-cover"
                      />
                    ) : (
                      initials(row.displayName)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-[12px] font-medium">
                        {row.displayName}
                      </p>
                      {row.qualified ? (
                        <BadgeCheck className="size-3 shrink-0 text-primary" />
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground">
                      {row.username ? `@${row.username}` : "Telegram handle private"}
                      {" · joined "}
                      {formatDate(row.joinedAt)}
                    </p>
                  </div>
                  <StatusPill tone={row.qualified ? "up" : "warn"}>
                    {row.qualified ? "Qualified" : "In progress"}
                  </StatusPill>
                </div>

                <div className="mt-2.5 flex items-center gap-3 pl-10">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between font-mono text-[9px]">
                      <span className="text-muted-foreground">
                        {row.verifiedTasks}/{row.requiredTasks} tasks verified
                      </span>
                      <span
                        className={row.qualified ? "text-up" : "text-muted-foreground"}
                      >
                        {row.qualified
                          ? `+${formatNex(row.speedContribution)} NEX/h`
                          : "no bonus yet"}
                      </span>
                    </div>
                    <ProgressBar
                      value={row.verifiedTasks}
                      max={row.requiredTasks}
                      tone={row.qualified ? "up" : "warn"}
                      className="mt-1"
                    />
                  </div>
                  <span className="flex shrink-0 items-center gap-1 font-mono text-[8px] uppercase tracking-[0.08em] text-muted-foreground">
                    <Clock3 className="size-2.5" />
                    {row.qualified ? "active" : "pending"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-3.5 lg:grid-cols-2">
        <Panel eyebrow="Referral rewards" title="Credit history" bodyClassName="p-0">
          {rewardHistory.length === 0 ? (
            <div className="px-4 py-6">
              <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                <Gift className="size-3.5" /> No NEX referral bonuses have been
                credited. Qualified referrals increase mining speed; they do not
                mint a separate balance.
              </p>
            </div>
          ) : (
            <ul>
              {rewardHistory.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between border-b border-border/60 px-4 py-2.5 last:border-0"
                >
                  <div>
                    <p className="text-[11.5px]">{row.memo}</p>
                    <p className="font-mono text-[9px] text-muted-foreground">
                      {formatDate(row.createdAt)}
                    </p>
                  </div>
                  <span className="num text-[11px] text-gold">
                    +{formatNex(row.amountNex)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel eyebrow="Qualification rules" title="What counts">
          <ul className="space-y-2.5">
            {[
              `${config.referralTaskTarget} tasks must be verified by the backend for each invited account.`,
              "Joining with a link only creates an in-progress referral — it adds no speed and no withdrawal progress.",
              "Only qualified referrals count toward the withdrawal gate; the counter is visible above.",
              "Self-referrals and referral loops are rejected by the backend.",
              "Speed bonuses are applied automatically to the server mining rate, capped by the operator.",
            ].map((rule, index) => (
              <li key={index} className="flex gap-2 text-[11px] leading-relaxed">
                <span className="num mt-0.5 shrink-0 text-[9px] text-primary">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="text-muted-foreground">{rule}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-start gap-2 rounded-sm border border-border/70 bg-panel/60 p-2.5">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Referral profiles show only public Telegram identity fields. Private
              account data is never exposed to the referrer.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
