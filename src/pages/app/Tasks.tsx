import { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  Ban,
  Bot,
  Check,
  ChevronRight,
  Clock,
  ExternalLink,
  ListChecks,
  Loader2,
  Megaphone,
  Radio,
  Send,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import {
  EmptyState,
  formatDateTime,
  formatNex,
  SectionHeading,
  Spinner,
  StatusPill,
} from "@/components/app/parts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { openExternal } from "@/lib/telegram";

type TaskFeed = NonNullable<FunctionReturnType<typeof api.app.taskFeed>>;
type TaskRow = TaskFeed[number];
type Category = TaskRow["category"] | "all";

const CATEGORIES: { key: Category; label: string }[] = [
  { key: "all", label: "All tasks" },
  { key: "advertisement", label: "Advertisements" },
  { key: "join_channel", label: "Join channel" },
  { key: "join_group", label: "Join group" },
  { key: "sponsor_bot", label: "Sponsor bot" },
  { key: "social", label: "Social" },
];

const CATEGORY_META: Record<
  TaskRow["category"],
  { label: string; icon: typeof Users }
> = {
  advertisement: { label: "Advertisement", icon: Megaphone },
  join_channel: { label: "Join channel", icon: Send },
  join_group: { label: "Join group", icon: Users },
  sponsor_bot: { label: "Sponsor bot", icon: Bot },
  social: { label: "Social task", icon: Radio },
};

const VERIFICATION_LABEL: Record<TaskRow["verification"], string> = {
  telegram_channel: "Telegram channel membership",
  telegram_group: "Telegram group membership",
  telegram_bot: "Sponsor bot start event",
  provider_ad: "Advertising provider event",
  in_app_ad: "Server-timed sponsored view",
  social: "Public social action",
  manual: "Operator review",
};

function targetUrl(task: TaskRow) {
  const target = task.target?.trim();
  if (!target) return null;
  if (/^https?:\/\//.test(target)) return target;
  if (target.startsWith("@")) return `https://t.me/${target.slice(1)}`;
  if (/^[A-Za-z0-9_]{4,}$/.test(target) && task.verification.startsWith("telegram")) {
    return `https://t.me/${target}`;
  }
  return null;
}

function taskState(task: TaskRow) {
  const completion = task.completion;
  if (completion?.status === "verified") return "completed" as const;
  if (completion?.status === "pending") return "pending" as const;
  if (completion?.status === "unavailable") return "unavailable" as const;
  if (completion?.status === "rejected") return "rejected" as const;
  if (task.expired) return "expired" as const;
  if (task.status === "paused") return "paused" as const;
  return "available" as const;
}

export default function Tasks() {
  const feed = useQuery(api.app.taskFeed);
  const snapshot = useQuery(api.app.snapshot);
  const [category, setCategory] = useState<Category>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    status: "verified" | "rejected" | "pending" | "unavailable";
    message: string;
  } | null>(null);
  // Local ticker that mirrors the backend-timed sponsored view.
  const [viewStart, setViewStart] = useState<number | null>(null);
  const [clock, setClock] = useState(() => Date.now());

  const submit = useMutation(api.tasks.submit);
  const verify = useAction(api.tasks.verifyTask);

  const selected = feed?.find((task) => task.id === selectedId) ?? null;

  useEffect(() => {
    if (viewStart === null) return;
    const id = window.setInterval(() => setClock(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [viewStart]);

  if (!feed || !snapshot) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-md border border-border/60 bg-card/60"
          />
        ))}
      </div>
    );
  }

  const visible = feed.filter(
    (task) => category === "all" || task.category === category,
  );
  const openTasks = feed.filter((task) => taskState(task) === "available");

  const openTask = (task: TaskRow) => {
    setSelectedId(task.id);
    setResult(null);
    setViewStart(null);
  };

  const startSpot = async (task: TaskRow) => {
    setBusy(true);
    setResult(null);
    try {
      await submit({ taskId: task.id });
      setViewStart(Date.now());
      setClock(Date.now());
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not start the spot.";
      setResult({ status: "unavailable", message });
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const adTask = selected?.verification === "in_app_ad";
  const adSeconds = selected?.minViewSeconds ?? 15;
  const adWatched =
    viewStart === null
      ? 0
      : Math.min(adSeconds, Math.floor((clock - viewStart) / 1000));
  const adRemaining = Math.max(0, adSeconds - adWatched);

  const runVerify = async (task: TaskRow) => {
    setBusy(true);
    setResult(null);
    try {
      if (task.verification === "manual" || task.verification === "social") {
        await submit({ taskId: task.id });
        setResult({
          status: "pending",
          message:
            "Submitted for operator review. The reward is credited only after the sponsor action is confirmed.",
        });
        toast.info("Task submitted for review");
      } else {
        const response = await verify({ taskId: task.id });
        setResult(response);
        if (response.status === "verified") {
          toast.success(
            response.rewardNex
              ? `Verified · +${formatNex(response.rewardNex)} NEX`
              : "Task verified",
          );
        } else if (response.status === "unavailable") {
          toast.error(response.message);
        } else if (response.status === "rejected") {
          toast.warning(response.message);
        } else {
          toast.info(response.message);
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Verification request failed.";
      setResult({ status: "unavailable", message });
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3.5">
      <SectionHeading
        index="03"
        title="Task centre"
        body="Rewards and speed bonuses land only after server-side verification."
        action={
          <span className="hidden font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground sm:block">
            {snapshot.tasks.completed} completed
          </span>
        }
      />

      <div className="grid grid-cols-3 divide-x divide-border/70 rounded-md border border-border/80 bg-card">
        <div className="px-3 py-2.5">
          <p className="label-xs">Available</p>
          <p className="num mt-1 text-sm text-foreground">{openTasks.length}</p>
        </div>
        <div className="px-3 py-2.5">
          <p className="label-xs">Pending</p>
          <p className="num mt-1 text-sm text-warn">{snapshot.tasks.pending}</p>
        </div>
        <div className="px-3 py-2.5">
          <p className="label-xs">Completed</p>
          <p className="num mt-1 text-sm text-up">{snapshot.tasks.completed}</p>
        </div>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0">
        <div className="flex w-max gap-1.5">
          {CATEGORIES.map((item) => {
            const count =
              item.key === "all"
                ? feed.length
                : feed.filter((task) => task.category === item.key).length;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setCategory(item.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em] transition-colors",
                  category === item.key
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border/80 bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
                <span className="text-[8px] opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {snapshot.account.telegramLinked ? null : (
        <div className="flex items-start gap-2.5 rounded-md border border-warn/40 bg-warn/[0.05] px-3.5 py-3">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Telegram is not linked to this account. Channel and group tasks cannot
            be verified until the mini app validates your Telegram initData with the
            NEXPOOL bot.
          </p>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="size-4" />}
          title={
            feed.length === 0 ? "No campaigns live yet" : "No tasks in this category"
          }
          body={
            feed.length === 0
              ? "Sponsor campaigns appear here once an operator publishes them with a real verification target. NEXPOOL does not pay for unverified clicks."
              : "Try another category — new sponsor tasks are published by the operator desk."
          }
          action={
            category !== "all" ? (
              <Button size="sm" variant="outline" onClick={() => setCategory("all")}>
                View all tasks
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-2.5 md:grid-cols-2">
          {visible.map((task) => {
            const meta = CATEGORY_META[task.category];
            const state = taskState(task);
            return (
              <article
                key={task.id}
                className="relative overflow-hidden rounded-md border border-border/80 bg-card"
              >
                <div className="p-3.5">
                  <div className="flex items-start gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-border bg-secondary/50 text-muted-foreground">
                      <meta.icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-muted-foreground">
                        {task.sponsor}
                      </p>
                      <h3 className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug font-medium">
                        {task.title}
                      </h3>
                    </div>
                    <StatePill state={state} />
                  </div>

                  <p className="mt-2 line-clamp-2 text-[10.5px] leading-relaxed text-muted-foreground">
                    {task.description}
                  </p>

                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[9px] uppercase tracking-[0.06em]">
                    <span className="text-gold">
                      +{formatNex(task.rewardNex)} NEX
                    </span>
                    {task.speedBonusNexPerHour > 0 ? (
                      <span className="text-primary">
                        +{formatNex(task.speedBonusNexPerHour)} NEX/h
                      </span>
                    ) : null}
                    <span className="text-muted-foreground">{meta.label}</span>
                    {task.expiresAt ? (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="size-2.5" />
                        {formatDateTime(task.expiresAt)}
                      </span>
                    ) : null}
                  </div>

                  {task.completion?.note ? (
                    <p className="mt-2 line-clamp-2 rounded-sm border border-border/60 bg-panel/60 px-2 py-1.5 text-[9.5px] leading-relaxed text-muted-foreground">
                      {task.completion.note}
                    </p>
                  ) : null}
                </div>

                <button
                  type="button"
                  disabled={
                    state === "completed" ||
                    state === "expired" ||
                    state === "paused" ||
                    (state === "pending" && task.verification !== "in_app_ad")
                  }
                  onClick={() => openTask(task)}
                  className={cn(
                    "flex w-full items-center justify-between border-t border-border/70 px-3.5 py-2.5 font-mono text-[9.5px] uppercase tracking-[0.1em] transition-colors",
                    state === "completed"
                      ? "bg-up/[0.06] text-up"
                      : state === "expired" || state === "paused"
                        ? "text-muted-foreground"
                        : state === "pending"
                          ? "text-warn"
                          : "text-primary hover:bg-primary/[0.06]",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {state === "completed" ? (
                      <>
                        <Check className="size-3" /> Completed
                      </>
                    ) : state === "pending" ? (
                      <>
                        <Loader2 className="size-3 animate-spin" /> Pending verification
                      </>
                    ) : state === "expired" ? (
                      <>
                        <Ban className="size-3" /> Expired
                      </>
                    ) : state === "paused" ? (
                      <>
                        <Ban className="size-3" /> Paused by sponsor
                      </>
                    ) : state === "unavailable" ? (
                      <>
                        <ShieldAlert className="size-3" /> Verification unavailable
                      </>
                    ) : state === "rejected" ? (
                      <>Retry task</>
                    ) : (
                      <>
                        <Sparkles className="size-3" /> Start task
                      </>
                    )}
                  </span>
                  <ChevronRight className="size-3.5" />
                </button>
              </article>
            );
          })}
        </div>
      )}

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
            setResult(null);
            setViewStart(null);
          }
        }}
      >
        <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-md">
          {selected ? (
            <>
              <DialogHeader>
                <p className="label-xs">
                  {selected.sponsor} · {CATEGORY_META[selected.category].label}
                </p>
                <DialogTitle className="pr-4 text-base leading-snug">
                  {selected.title}
                </DialogTitle>
                <DialogDescription className="text-[11.5px] leading-relaxed">
                  {selected.description}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-sm border border-gold/30 bg-gold/[0.06] px-2.5 py-2">
                  <p className="label-xs">Reward</p>
                  <p className="num mt-0.5 text-sm text-gold">
                    +{formatNex(selected.rewardNex)} NEX
                  </p>
                </div>
                <div className="rounded-sm border border-border bg-panel/60 px-2.5 py-2">
                  <p className="label-xs">Speed bonus</p>
                  <p className="num mt-0.5 text-sm text-primary">
                    +{formatNex(selected.speedBonusNexPerHour)} NEX/h
                  </p>
                </div>
              </div>

              <div>
                <p className="label-xs mb-1.5">Instructions</p>
                <ol className="space-y-1.5">
                  {selected.instructions.map((line, index) => (
                    <li key={index} className="flex gap-2 text-[11.5px] leading-relaxed">
                      <span className="num mt-0.5 shrink-0 text-[9px] text-primary">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="text-muted-foreground">{line}</span>
                    </li>
                  ))}
                  {selected.target && targetUrl(selected) ? (
                    <li className="flex gap-2 text-[11.5px]">
                      <span className="num mt-0.5 shrink-0 text-[9px] text-primary">
                        {String(selected.instructions.length + 1).padStart(2, "0")}
                      </span>
                      <button
                        type="button"
                        onClick={() => openExternal(targetUrl(selected)!)}
                        className="flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                      >
                        Open {selected.target} <ExternalLink className="size-3" />
                      </button>
                    </li>
                  ) : null}
                </ol>
              </div>

              <div className="rounded-sm border border-border/70 bg-panel/60 p-2.5">
                <p className="label-xs">Verification requirement</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {VERIFICATION_LABEL[selected.verification]} —{" "}
                  {selected.verificationNote}
                </p>
              </div>

              {result ? (
                <div
                  className={cn(
                    "rounded-sm border px-3 py-2.5 text-[11px] leading-relaxed",
                    result.status === "verified"
                      ? "border-up/40 bg-up/[0.08] text-up"
                      : result.status === "rejected"
                        ? "border-down/40 bg-down/[0.08] text-down"
                        : "border-warn/40 bg-warn/[0.06] text-warn",
                  )}
                >
                  <p className="flex items-center gap-1.5 font-medium">
                    {result.status === "verified" ? (
                      <BadgeCheck className="size-3.5" />
                    ) : (
                      <ShieldAlert className="size-3.5" />
                    )}
                    {result.status === "verified"
                      ? "Verified by the backend"
                      : result.status === "rejected"
                        ? "Not confirmed"
                        : result.status === "pending"
                          ? "Awaiting confirmation"
                          : "Verification unavailable"}
                  </p>
                  <p className="mt-1 opacity-90">{result.message}</p>
                </div>
              ) : null}

              <div className="flex flex-col gap-2">
                {adTask ? (
                  <>
                    <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                      <span>Server-timed view</span>
                      <span className="num text-primary">
                        {adWatched}s / {adSeconds}s
                      </span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-border">
                      <div
                        className="h-full bg-primary transition-[width] duration-500"
                        style={{ width: `${(adWatched / adSeconds) * 100}%` }}
                      />
                    </div>
                  </>
                ) : null}
                {targetUrl(selected) && !adTask ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em]"
                    onClick={() => openExternal(targetUrl(selected)!)}
                  >
                    <ExternalLink className="size-3.5" /> Open sponsor
                  </Button>
                ) : null}
                <Button
                  type="button"
                  className="w-full gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em]"
                  disabled={
                    busy ||
                    taskState(selected) === "completed" ||
                    taskState(selected) === "expired" ||
                    taskState(selected) === "paused" ||
                    (adTask && viewStart !== null && adRemaining > 0)
                  }
                  onClick={() => {
                    if (adTask && viewStart === null) {
                      void startSpot(selected);
                    } else {
                      void runVerify(selected);
                    }
                  }}
                >
                  {busy ? (
                    <>
                      <Spinner /> Checking with server
                    </>
                  ) : taskState(selected) === "completed" ? (
                    <>
                      <Check className="size-3.5" /> Completed
                    </>
                  ) : adTask && viewStart === null ? (
                    <>
                      <Megaphone className="size-3.5" /> Start sponsored spot
                    </>
                  ) : adTask && adRemaining > 0 ? (
                    <>
                      <Clock className="size-3.5" /> Spot playing · {adRemaining}s
                    </>
                  ) : adTask ? (
                    <>
                      <BadgeCheck className="size-3.5" /> Claim reward
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="size-3.5" />
                      {selected.verification === "manual" || selected.verification === "social"
                        ? "Submit for review"
                        : "Verify completion"}
                    </>
                  )}
                </Button>
                <p className="text-center text-[9.5px] leading-relaxed text-muted-foreground">
                  Clicking verify never pays out on its own. NEX is credited only
                  when the backend or an operator confirms the real completion.
                </p>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatePill({ state }: { state: ReturnType<typeof taskState> }) {
  if (state === "completed") return <StatusPill tone="up">Done</StatusPill>;
  if (state === "pending") return <StatusPill tone="warn">Pending</StatusPill>;
  if (state === "unavailable") return <StatusPill tone="down">Blocked</StatusPill>;
  if (state === "rejected") return <StatusPill tone="down">Rejected</StatusPill>;
  if (state === "expired" || state === "paused")
    return <StatusPill tone="muted">{state}</StatusPill>;
  return <StatusPill tone="gold">Reward</StatusPill>;
}
