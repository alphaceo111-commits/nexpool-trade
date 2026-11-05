import { Button } from "@/components/ui/button";
import {
  LoadingBlock,
  Panel,
  SectionHeading,
  Spinner,
  StatusPill,
  formatDateTime,
  formatNex,
} from "@/components/app/parts";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  Flame,
  Lock,
  Trophy,
  Zap,
} from "lucide-react";

export default function Levels() {
  const progress = useQuery(api.levels.progress);
  const claimLevel = useMutation(api.levels.claim);
  const [claiming, setClaiming] = useState<number | null>(null);

  if (!progress) return <LoadingBlock rows={5} />;

  const next = progress.nextLevel;
  const floorXp = next
    ? (progress.levels.find((row) => row.level === progress.highestClaimed)
        ?.xpRequired ?? 0)
    : progress.xp;
  const span = next ? Math.max(1, next.xpRequired - floorXp) : 1;
  const pct = next
    ? Math.min(100, Math.max(0, Math.round(((progress.xp - floorXp) / span) * 100)))
    : 100;

  const handleClaim = async (level: number) => {
    setClaiming(level);
    try {
      const result = await claimLevel({ level });
      toast.success(
        `Level ${result.level} claimed · +${formatNex(result.rewardNex)} NEX`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Level claim rejected.",
      );
    } finally {
      setClaiming(null);
    }
  };

  return (
    <div className="space-y-3">
      <SectionHeading
        index="05"
        title="Progression ladder"
        body="XP comes only from backend-verified activity. Each level must be claimed in order, pays once, and adds a permanent mining-speed step."
        action={
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link to="/app">
              <ArrowLeft className="size-3" /> Dashboard
            </Link>
          </Button>
        }
      />

      <Panel
        eyebrow="Current standing"
        title={progress.currentName}
        action={
          <StatusPill tone={next?.claimable ? "up" : "gold"}>
            Level {progress.highestClaimed} / 10
          </StatusPill>
        }
        bodyClassName="p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <div>
            <p className="label-xs">Lifetime XP</p>
            <p className="num gold-glow mt-1 text-[36px] leading-none font-semibold text-gold">
              {progress.xp.toLocaleString("en-US")}
            </p>
          </div>
          <div className="mb-1 grid gap-1">
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              {next
                ? `${Math.min(progress.xp, next.xpRequired).toLocaleString("en-US")} / ${next.xpRequired.toLocaleString("en-US")} XP`
                : "Ladder complete"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {next
                ? next.claimable
                  ? `Level ${next.level} — ${next.name} is ready to claim.`
                  : `${next.xpMissing.toLocaleString("en-US")} XP to Level ${next.level} — ${next.name}.`
                : "Every level claimed. Legend status held."}
            </p>
          </div>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border">
          <div
            className="h-full bg-primary transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="mt-4 grid gap-2 border-t border-border/70 pt-3 sm:grid-cols-3">
          <div>
            <p className="label-xs">Base rate</p>
            <p className="num mt-1 text-[12px]">{formatNex(progress.baseRateNexPerHour)} NEX/h</p>
          </div>
          <div>
            <p className="label-xs">Level speed bonus</p>
            <p className="num mt-1 text-[12px] text-up">
              +{formatNex(progress.speedBonusNexPerHour)} NEX/h
            </p>
          </div>
          <div>
            <p className="label-xs">Effective rate</p>
            <p className="num mt-1 text-[12px]">
              {formatNex(progress.baseRateNexPerHour + progress.speedBonusNexPerHour)} NEX/h
            </p>
          </div>
        </div>
      </Panel>

      <Panel
        eyebrow="Ten levels"
        title="Difficulty ladder"
        action={<StatusPill tone="muted">Server-verified XP</StatusPill>}
        bodyClassName="p-0"
      >
        <ul>
          {progress.levels.map((level) => {
            const claimable = level.state === "claimable";
            const claimed = level.state === "claimed";
            const locked = level.state === "locked";
            return (
              <li
                key={level.level}
                className={cn(
                  "border-b border-border/60 px-3.5 py-3 last:border-0",
                  claimable && "bg-primary/[0.045]",
                  locked && "opacity-55",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm border font-mono text-[11px] font-semibold",
                      claimed
                        ? "border-up/40 bg-up/10 text-up"
                        : claimable
                          ? "border-primary/50 bg-primary/10 text-primary"
                          : "border-border/80 bg-secondary/40 text-muted-foreground",
                    )}
                  >
                    {claimed ? <Check className="size-3.5" /> : level.level}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[12.5px] font-medium">
                        Level {level.level} — {level.name}
                      </p>
                      {claimed ? (
                        <StatusPill tone="up" dot={false}>
                          Claimed
                        </StatusPill>
                      ) : claimable ? (
                        <StatusPill tone="signal">Ready</StatusPill>
                      ) : locked ? (
                        <span className="inline-flex items-center gap-1 font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">
                          <Lock className="size-2.5" /> Claim earlier levels
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                      {level.xpRequired.toLocaleString("en-US")} XP required ·{" "}
                      {formatNex(level.rewardNex)} NEX reward
                      {level.speedBonusNexPerHour > 0
                        ? ` · +${formatNex(level.speedBonusNexPerHour)} NEX/h`
                        : ""}
                    </p>
                    {claimed && level.claimedAt ? (
                      <p className="mt-0.5 font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground">
                        Claimed {formatDateTime(level.claimedAt)}
                      </p>
                    ) : null}
                  </div>

                  <div className="shrink-0">
                    {claimable ? (
                      <Button
                        size="sm"
                        className="gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em]"
                        disabled={claiming !== null}
                        onClick={() => void handleClaim(level.level)}
                      >
                        {claiming === level.level ? (
                          <Spinner />
                        ) : (
                          <Trophy className="size-3" />
                        )}
                        Claim
                      </Button>
                    ) : claimed ? (
                      <BadgeCheck className="size-4 text-up" />
                    ) : (
                      <span className="num font-mono text-[10px] text-muted-foreground">
                        {locked ? "—" : `${Math.max(0, level.xpRequired - progress.xp).toLocaleString("en-US")} XP`}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Zap className="size-3 text-primary" /> Verified tasks pay the XP shown on
          each campaign
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Flame className="size-3 text-gold" /> Qualified referrals add 250 XP
        </span>
      </div>
    </div>
  );
}
