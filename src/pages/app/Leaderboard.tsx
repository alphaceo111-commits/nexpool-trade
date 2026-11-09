import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { Crown, Medal, ShieldCheck, Trophy, Users } from "lucide-react";
import { useState } from "react";
import {
  EmptyState,
  formatNex,
  initials,
  Panel,
  SectionHeading,
  StatusPill,
} from "@/components/app/parts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { key: "earners", label: "Top earners" },
  { key: "miners", label: "Top miners" },
  { key: "inviters", label: "Top inviters" },
  { key: "active", label: "Most active" },
  { key: "tasks", label: "Task completers" },
  { key: "levels", label: "Highest level" },
] as const;

const PERIODS = [
  { key: "daily", label: "Today" },
  { key: "weekly", label: "7 days" },
  { key: "monthly", label: "30 days" },
  { key: "all", label: "All time" },
] as const;

type Category = (typeof CATEGORIES)[number]["key"];
type Period = (typeof PERIODS)[number]["key"];

const NEX_CATEGORIES = new Set<Category>(["earners", "miners"]);

function formatValue(category: Category, value: number) {
  return NEX_CATEGORIES.has(category)
    ? `${formatNex(value)} NEX`
    : value.toLocaleString("en-US");
}

const MEDAL = ["text-gold", "text-muted-foreground", "text-warn"];
const PAGE_SIZE = 25;

export default function Leaderboard() {
  const [category, setCategory] = useState<Category>("earners");
  const [period, setPeriod] = useState<Period>("all");
  const [offset, setOffset] = useState(0);
  const data = useQuery(api.leaderboard.rankings, {
    category,
    period,
    limit: PAGE_SIZE,
    offset,
  });

  return (
    <div className="space-y-3.5">
      <SectionHeading
        index="06"
        title="Leaderboard"
        body="Rankings are computed on the backend from confirmed activity. Pending, failed and reversed rewards never count."
        action={<StatusPill tone="signal">Live</StatusPill>}
      />

      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setCategory(item.key);
              setOffset(0);
            }}
            className={cn(
              "rounded-sm border px-2.5 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em] transition-colors",
              category === item.key
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {PERIODS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setPeriod(item.key);
              setOffset(0);
            }}
            className={cn(
              "rounded-sm border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] transition-colors",
              period === item.key
                ? "border-gold/50 bg-gold/10 text-gold"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
          {data ? `${data.total} ranked` : "loading"}
        </span>
      </div>

      <Panel
        eyebrow={data?.valueLabel ?? "Ranking"}
        title={
          CATEGORIES.find((item) => item.key === category)?.label ?? "Ranking"
        }
        action={
          data?.me?.rank ? (
            <StatusPill tone="gold">You · #{data.me.rank}</StatusPill>
          ) : (
            <StatusPill tone="muted">Unranked</StatusPill>
          )
        }
        bodyClassName="p-0"
      >
        {!data ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-12 animate-pulse rounded-sm border border-border/50 bg-secondary/30"
              />
            ))}
          </div>
        ) : data.rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Trophy className="size-4" />}
              title="No ranked accounts yet"
              body="Confirmed mining, verified tasks, qualified referrals and claimed levels create a ranking. Nothing is seeded or simulated."
            />
          </div>
        ) : (
          <ul>
            {data.rows.map((row) => (
              <li
                key={row.profileId}
                className={cn(
                  "flex items-center gap-2.5 border-b border-border/60 px-3.5 py-2.5 last:border-0",
                  row.isMe && "bg-primary/[0.06]",
                  row.rank <= 3 && "bg-gradient-to-r from-gold/[0.04] to-transparent",
                )}
              >
                <span
                  className={cn(
                    "num flex w-7 shrink-0 items-center justify-center text-[11px] font-semibold",
                    row.rank <= 3 ? MEDAL[row.rank - 1] : "text-muted-foreground",
                  )}
                >
                  {row.rank === 1 ? (
                    <Crown className="size-4" />
                  ) : row.rank <= 3 ? (
                    <Medal className="size-3.5" />
                  ) : (
                    row.rank
                  )}
                </span>
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
                  <p className="truncate text-[12px] font-medium">
                    {row.displayName}
                    {row.isMe ? (
                      <span className="ml-1.5 font-mono text-[8px] uppercase tracking-[0.1em] text-primary">
                        you
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate font-mono text-[9px] text-muted-foreground">
                    {row.username ? `@${row.username} · ` : ""}
                    {row.secondary}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={cn(
                      "num text-[12px] font-semibold",
                      NEX_CATEGORIES.has(category) ? "text-gold" : "text-foreground",
                    )}
                  >
                    {formatValue(category, row.value)}
                  </p>
                  <p className="font-mono text-[8px] uppercase tracking-[0.08em] text-muted-foreground">
                    level {row.level}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {data && data.total > 0 ? (
          <div className="flex items-center justify-between gap-2 border-t border-border/60 p-2.5">
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-[10px] uppercase tracking-[0.1em]"
              onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
              disabled={offset === 0}
            >
              Previous
            </Button>
            <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
              {offset + 1}–{Math.min(offset + data.rows.length, data.total)} of{" "}
              {data.total}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-[10px] uppercase tracking-[0.1em]"
              onClick={() => setOffset((value) => value + PAGE_SIZE)}
              disabled={offset + data.rows.length >= data.total}
            >
              Next
            </Button>
          </div>
        ) : null}
      </Panel>

      <Panel eyebrow="Your position" title={data?.me?.nexId ?? "Your ranking"}>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-sm border border-primary/40 bg-primary/10 text-primary">
            <Users className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold">
              #{data?.me?.rank ?? "—"} · {data?.me?.displayName ?? "NEX miner"}
            </p>
            <p className="truncate font-mono text-[9.5px] text-muted-foreground">
              {data?.me?.secondary ?? "Complete verified activity to enter the ranking."}
            </p>
          </div>
          <p className="num shrink-0 text-sm font-semibold text-gold">
            {data?.me
              ? formatValue(category, data.me.value)
              : "—"}
          </p>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-sm border border-border/70 bg-panel/60 p-2.5">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            {data?.privacy ??
              "Only public profile fields are shown. Telegram IDs are never exposed."}{" "}
            Rankings use server timestamps and deterministic tie-breaking; a user
            cannot submit a score.
          </p>
        </div>
      </Panel>
    </div>
  );
}
