import { Metric, Panel, StatusPill } from "@/components/app/parts";

type Streak = {
  current: number;
  best: number;
  totalDays: number;
  qualifiedToday: boolean;
  nextMilestone: number | null;
  daysToNextMilestone: number | null;
};

/**
 * Server-derived streak. Every number comes from `app.snapshot`, which counts
 * qualifying ledger credits — there is no client-side counter and no way to
 * advance it by opening the app.
 */
export function StreakCard({ streak }: { streak: Streak }) {
  const progress =
    streak.nextMilestone && streak.nextMilestone > 0
      ? Math.min(100, Math.round((streak.current / streak.nextMilestone) * 100))
      : 100;

  return (
    <Panel
      eyebrow="Consistency"
      title={
        streak.current > 0
          ? `${streak.current}-day streak`
          : "Start your streak"
      }
      action={
        <StatusPill tone={streak.qualifiedToday ? "up" : "warn"}>
          {streak.qualifiedToday ? "Counted today" : "Not counted today"}
        </StatusPill>
      }
      bodyClassName="space-y-3"
    >
      <div className="grid grid-cols-3 gap-2">
        <Metric label="Current" value={streak.current} sub="days" />
        <Metric label="Best" value={streak.best} sub="past year" />
        <Metric label="Qualifying" value={streak.totalDays} sub="days" />
      </div>

      {streak.nextMilestone ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
            <span>
              {streak.daysToNextMilestone} {streak.daysToNextMilestone === 1 ? "day" : "days"} to {streak.nextMilestone}
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : (
        <p className="text-[10.5px] leading-relaxed text-muted-foreground">
          You have reached every current milestone. Keep the run going.
        </p>
      )}

      <p className="text-[10px] leading-relaxed text-muted-foreground">
        A day counts when the backend credits real participation: a settled
        mining session, a verified mission, a rewarded ad or a qualified
        referral. {streak.qualifiedToday ? "Today already counts." : "Nothing has counted yet today."} Opening
        the app never adds a day.
      </p>
    </Panel>
  );
}
