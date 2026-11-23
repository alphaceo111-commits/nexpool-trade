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
import { InviteAllCard } from "@/components/app/InviteAllCard";
import { Button } from "@/components/ui/button";
import { openExternal } from "@/lib/telegram";
import { cn } from "@/lib/utils";

const STATUS_META = {
  pending: { label: "Pending", tone: "muted" as const },
  in_progress: { label: "In progress", tone: "warn" as const },
  qualified: { label: "Qualified", tone: "up" as const },
  rejected: { label: "Rejected", tone: "down" as const },
};

export default function Referrals() {
  const snapshot = useQuery(api.app.snapshot);
  const summary = useQuery(api.referrals.summary);

  if (!snapshot || summary === undefined) {
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

  const config = snapshot.config;
  const account = snapshot.account;
  const fallback = snapshot.referrals;
  const data = summary ?? {
    code: account.referralCode,
    rows: fallback.rows,
    total: fallback.total,
    qualified: fallback.qualified,
    pending: fallback.pending ?? 0,
    inProgress: fallback.inProgress ?? 0,
    rejected: fallback.rejected ?? 0,
    incomplete: fallback.incomplete,
    target: fallback.target,
    taskTarget: fallback.taskTarget,
    bonusPerReferral: config.referralBonusNexPerHour,
    bonusCap: config.referralBonusCap,
    bonusNexPerHour: fallback.bonusNexPerHour,
    shares: { total: 0, lastAt: null },
    rewards: [],
  };
  const link = account.referralLink;
  const share = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(
    "Mine NEX on NEXPOOL — verified tasks and qualified referrals only. No purchase required.",
  )}`;
  const rewardHistory = data.rewards.length
    ? data.rewards
    : snapshot.ledger.filter((row) => row.kind === "referral");

  const events = data.rows
    .flatMap((row) => {
      const list: Array<{
        key: string;
        label: string;
        detail: string;
        at: number;
        tone: "muted" | "up";
      }> = [
        {
          key: `${row.id}:join`,
          label: `${row.displayName} joined`,
          detail: `Telegram ID ${row.telegramId ?? "pending link"} · ${STATUS_META[row.status].label}`,
          at: row.joinedAt,
          tone: "muted",
        },
      ];
      if (row.qualifiedAt) {
        list.push({
          key: `${row.id}:qualified`,
          label: `${row.displayName} qualified`,
          detail: `${row.requiredTasks} verified tasks complete · +${formatNex(row.speedContribution)} NEX/h`,
          at: row.qualifiedAt,
          tone: "up",
        });
      }
      return list;
    })
    .sort((a, b) => b.at - a.at)
    .slice(0, 8);

  return (
    <div className="space-y-3.5">
      <SectionHeading
        index="Network"
        title="Referral desk"
        body={`Everyone who starts with your link is recorded immediately. Only referrals with ${data.taskTarget} verified tasks count toward withdrawal eligibility.`}
        action={
          <StatusPill tone={data.qualified >= data.target ? "up" : "muted"}>
            {data.qualified}/{data.target}
          </StatusPill>
        }
      />

      <InviteAllCard
        link={link}
        displayName={account.displayName}
        qualified={data.qualified}
        pending={data.pending}
        inProgress={data.inProgress}
        taskTarget={data.taskTarget}
        shares={data.shares}
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          {
            label: "Invited",
            value: data.total,
            sub: "joined accounts",
            tone: "default" as const,
          },
          {
            label: "Qualified",
            value: data.qualified,
            sub: `${data.taskTarget} verified tasks`,
            tone: "up" as const,
          },
          {
            label: "Pending",
            value: data.pending,
            sub: "no tasks yet",
            tone: "muted" as const,
          },
          {
            label: "In progress",
            value: data.inProgress,
            sub: "1–2 tasks done",
            tone: "warn" as const,
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
        <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/50 px-2.5 py-2">
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
            value={data.code}
            label={`Code ${data.code}`}
            className="w-full"
          />
        </div>
        <p className="mt-2.5 text-[10px] leading-relaxed text-muted-foreground">
          The link opens @NEXPOOLBOT with your code. The backend records the
          invited Telegram ID the moment they press Start — before the Mini App,
          mining, or any task. A referral qualifies only after {data.taskTarget}{" "}
          distinct tasks are verified.
        </p>
      </Panel>

      <Panel
        eyebrow="Withdrawal gate"
        title={`${data.qualified} of ${data.target} qualified referrals`}
      >
        <div className="flex gap-1">
          {Array.from({ length: data.target }).map((_, index) => {
            const filled = index < data.qualified;
            return (
              <div
                key={index}
                className={cn(
                  "flex h-7 flex-1 items-center justify-center rounded-xl border text-[8px]",
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
            {data.qualified >= data.target
              ? "Referral requirement satisfied. Balance, wallet, liquidity and compliance checks still apply."
              : `${data.target - data.qualified} more qualified referrals needed for the withdrawal gate.`}
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
            value={`+${formatNex(data.bonusPerReferral)} NEX/h`}
            sub="server-applied"
            tone="gold"
          />
          <Metric
            label="Current referral bonus"
            value={`+${formatNex(data.bonusNexPerHour)} NEX/h`}
            sub={`cap ${data.bonusCap} referrals`}
          />
        </div>
      </Panel>

      <Panel
        eyebrow="Referral book"
        title="Invited miners"
        action={
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
            {data.total} total · {data.total - data.qualified} pending
          </span>
        }
        bodyClassName="p-0"
      >
        {data.rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<UserPlus className="size-4" />}
              title="No referrals yet"
              body="Share your link. When a friend presses Start on the bot, they appear here immediately as Pending — even before they open the Mini App."
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
            {data.rows.map((row) => {
              const meta = STATUS_META[row.status];
              return (
                <li
                  key={row.id}
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
                        {row.telegramId
                          ? `Telegram ID ${row.telegramId}`
                          : row.username
                            ? `@${row.username}`
                            : "Telegram link pending"}
                        {" · joined "}
                        {formatDate(row.joinedAt)}
                      </p>
                    </div>
                    <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
                  </div>

                  <div className="mt-2.5 flex items-center gap-3 pl-10">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between font-mono text-[9px]">
                        <span className="text-muted-foreground">
                          {row.verifiedTasks}/{row.requiredTasks} tasks verified
                        </span>
                        <span
                          className={
                            row.qualified ? "text-up" : "text-muted-foreground"
                          }
                        >
                          {row.qualified
                            ? `+${formatNex(row.speedContribution)} NEX/h`
                            : row.status === "rejected"
                              ? "no bonus"
                              : "no bonus yet"}
                        </span>
                      </div>
                      <ProgressBar
                        value={row.verifiedTasks}
                        max={row.requiredTasks}
                        tone={row.qualified ? "up" : "warn"}
                        className="mt-1"
                      />
                      {row.rejectionReason ? (
                        <p className="mt-1 font-mono text-[8.5px] text-down">
                          {row.rejectionReason}
                        </p>
                      ) : null}
                    </div>
                    <span className="flex shrink-0 items-center gap-1 font-mono text-[8px] uppercase tracking-[0.08em] text-muted-foreground">
                      <Clock3 className="size-2.5" />
                      {row.status === "pending"
                        ? "waiting"
                        : row.status === "in_progress"
                          ? "mining tasks"
                          : row.status === "qualified"
                            ? "active"
                            : "closed"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <div className="grid gap-3.5 lg:grid-cols-2">
        <Panel eyebrow="Referral history" title="Join & qualification events" bodyClassName="p-0">
          {events.length === 0 ? (
            <div className="px-4 py-6">
              <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                <Gift className="size-3.5" /> No referral events yet. A join is
                recorded the moment someone starts the bot with your code.
              </p>
            </div>
          ) : (
            <ul>
              {events.map((event) => (
                <li
                  key={event.key}
                  className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[11.5px]">{event.label}</p>
                    <p className="truncate font-mono text-[9px] text-muted-foreground">
                      {event.detail} · {formatDate(event.at)}
                    </p>
                  </div>
                  <StatusPill tone={event.tone}>
                    {event.tone === "up" ? "Qualified" : "Joined"}
                  </StatusPill>
                </li>
              ))}
            </ul>
          )}
          {rewardHistory.length > 0 ? (
            <div className="border-t border-border/70 px-4 py-2.5">
              <p className="label-xs mb-1.5">NEX referral credits</p>
              {rewardHistory.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between py-1"
                >
                  <p className="text-[10.5px] text-muted-foreground">
                    {row.memo}
                  </p>
                  <span className="num text-[10.5px] text-gold">
                    +{formatNex(row.amountNex)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </Panel>

        <Panel eyebrow="Qualification rules" title="What counts">
          <ul className="space-y-2.5">
            {[
              `A join is recorded immediately, before the Mini App opens. It stays Pending until ${data.taskTarget} distinct verified tasks.`,
              "One verified task moves the referral to In Progress; the third moves it to Qualified automatically.",
              "Qualified referrals add mining speed and count toward the withdrawal gate. Pending referrals never do.",
              "A Telegram account can be attributed to exactly one inviter. Self-referrals, loops and duplicate updates are rejected.",
              "The inviter is notified when the referral joins and when it qualifies, after the backend commits the event.",
            ].map((rule, index) => (
              <li key={index} className="flex gap-2 text-[11px] leading-relaxed">
                <span className="num mt-0.5 shrink-0 text-[9px] text-primary">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="text-muted-foreground">{rule}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-border/70 bg-panel/60 p-2.5">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Attribution uses the verified Telegram ID, never a username. The
              desk exposes the invited Telegram ID only to the inviter and never
              exposes private account data.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
