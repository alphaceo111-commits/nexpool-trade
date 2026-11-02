import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bell,
  CheckCheck,
  Coins,
  ListChecks,
  Megaphone,
  Users,
} from "lucide-react";
import {
  EmptyState,
  formatDateTime,
  LoadingBlock,
  Panel,
  SectionHeading,
  Spinner,
  StatusPill,
} from "@/components/app/parts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";

const KIND_META = {
  task: { icon: ListChecks, label: "Task", tone: "signal" as const },
  mining: { icon: Coins, label: "Mining", tone: "gold" as const },
  referral: { icon: Users, label: "Referral", tone: "up" as const },
  wallet: { icon: Coins, label: "Wallet", tone: "warn" as const },
  announcement: { icon: Megaphone, label: "Platform", tone: "muted" as const },
};

export default function Notifications() {
  const feed = useQuery(api.notifications.list);
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const [busy, setBusy] = useState<string | null>(null);

  if (!feed) return <LoadingBlock rows={5} />;

  const handleRead = async (id: string, read: boolean) => {
    if (read) return;
    setBusy(id);
    try {
      await markRead({ notificationId: id as never });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update.");
    } finally {
      setBusy(null);
    }
  };

  const handleAll = async () => {
    setBusy("all");
    try {
      await markAllRead();
      toast.success("All notifications marked read");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3.5">
      <Link
        to="/app"
        className="inline-flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3" /> Dashboard
      </Link>

      <SectionHeading
        index="07"
        title="Notifications"
        body="Confirmed mining, task, referral and payout events."
        action={
          feed.unread > 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 font-mono text-[9px] uppercase tracking-[0.08em]"
              onClick={handleAll}
              disabled={busy === "all"}
            >
              {busy === "all" ? <Spinner /> : <CheckCheck className="size-3" />}
              Read all
            </Button>
          ) : (
            <StatusPill tone="up">All read</StatusPill>
          )
        }
      />

      <Panel eyebrow="Inbox" title={`${feed.unread} unread`} bodyClassName="p-0">
        {feed.rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Bell className="size-4" />}
              title="Inbox empty"
              body="Mining cap alerts, task verification results, qualified referrals and withdrawal updates will arrive here."
            />
          </div>
        ) : (
          <ul>
            {feed.rows.map((notification) => {
              const meta = KIND_META[notification.kind];
              return (
                <li
                  key={notification.id}
                  className={cn(
                    "border-b border-border/60 last:border-0",
                    !notification.read && "bg-primary/[0.025]",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => handleRead(notification.id, notification.read)}
                    className="flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors hover:bg-secondary/30"
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-sm border",
                        meta.tone === "gold"
                          ? "border-gold/30 bg-gold/10 text-gold"
                          : meta.tone === "up"
                            ? "border-up/30 bg-up/10 text-up"
                            : meta.tone === "warn"
                              ? "border-warn/30 bg-warn/10 text-warn"
                              : "border-border bg-secondary/50 text-muted-foreground",
                      )}
                    >
                      <meta.icon className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[12px] font-medium">
                          {notification.title}
                        </p>
                        {!notification.read ? (
                          <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                        ) : null}
                      </div>
                      <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
                        {notification.body}
                      </p>
                      <p className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground">
                        {meta.label} · {formatDateTime(notification.createdAt)}
                      </p>
                    </div>
                    {busy === notification.id ? (
                      <Spinner className="mt-1 size-3 text-muted-foreground" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <p className="text-center text-[9px] leading-relaxed text-muted-foreground">
        Telegram delivery uses the linked bot identity. In-app entries remain the
        authoritative record even when Telegram delivery fails.
      </p>
    </div>
  );
}
