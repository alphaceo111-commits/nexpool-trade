import { Brand } from "@/components/Brand";
import {
  EmptyState,
  formatDateTime,
  LoadingBlock,
  Panel,
  Spinner,
  StatusPill,
} from "@/components/app/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Bot,
  CalendarClock,
  CheckCircle2,
  Clock,
  Hash,
  Link2,
  Megaphone,
  Play,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type CenterOverview = NonNullable<
  FunctionReturnType<typeof api.telegramControl.overview>
>;
type Destination = CenterOverview["destinations"][number];
type Post = CenterOverview["posts"][number];
type Delivery = CenterOverview["deliveries"][number];
type CommandRow = { command: string; description: string };

const PERMISSION_LABELS = [
  ["canPostMessages", "Post"],
  ["canEditMessages", "Edit"],
  ["canDeleteMessages", "Delete"],
  ["canChangeInfo", "Chat info"],
  ["canInviteUsers", "Invite"],
  ["canPinMessages", "Pin"],
  ["canRestrictMembers", "Restrict"],
  ["canPromoteMembers", "Promote"],
  ["canManageTopics", "Topics"],
] as const;

const TABS = [
  { key: "overview", label: "Overview", icon: Bot },
  { key: "profile", label: "Bot profile", icon: ShieldCheck },
  { key: "commands", label: "Commands", icon: Hash },
  { key: "destinations", label: "Groups & channels", icon: Users },
  { key: "composer", label: "Composer", icon: Megaphone },
  { key: "automations", label: "Automations", icon: CalendarClock },
  { key: "reports", label: "Publishing reports", icon: Send },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function TelegramCenter() {
  const access = useQuery(api.admin.access);
  const isAdmin = access?.isAdmin === true;
  const overview = useQuery(
    api.telegramControl.overview,
    isAdmin ? {} : "skip",
  );
  const commandDefaults = useQuery(
    api.telegramControl.defaultCommands,
    isAdmin ? {} : "skip",
  );
  const botInfoAction = useAction(api.telegramControl.botInfo);
  const updateProfile = useAction(api.telegramControl.updateBotProfile);
  const publishCommands = useAction(api.telegramControl.publishCommands);
  const addDestination = useAction(api.telegramControl.addDestination);
  const checkDestination = useAction(api.telegramControl.checkDestination);
  const removeDestination = useMutation(
    api.telegramControl.removeDestination,
  );
  const publishPost = useAction(api.telegramControl.publishPost);

  const [tab, setTab] = useState<TabKey>("overview");
  const [botInfo, setBotInfo] = useState<
    Awaited<ReturnType<typeof botInfoAction>> | null
  >(null);
  const [botBusy, setBotBusy] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: "",
    description: "",
    shortDescription: "",
  });
  const [profileSaving, setProfileSaving] = useState(false);

  const [commandRows, setCommandRows] = useState<CommandRow[]>([]);
  const [commandsHydrated, setCommandsHydrated] = useState(false);
  const [commandsSaving, setCommandsSaving] = useState(false);

  const [chatId, setChatId] = useState("");
  const [addingDestination, setAddingDestination] = useState(false);
  const [checkingChat, setCheckingChat] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [parseMode, setParseMode] = useState<"HTML" | "MarkdownV2" | "none">(
    "HTML",
  );
  const [selectedDestinations, setSelectedDestinations] = useState<string[]>(
    [],
  );
  const [scheduledAt, setScheduledAt] = useState("");
  const [publishing, setPublishing] = useState(false);

  const loadBot = async () => {
    setBotBusy(true);
    try {
      const result = await botInfoAction();
      setBotInfo(result);
      setProfileForm({
        name: result.name.ok ? result.name.value.name : "",
        description: result.description.ok
          ? result.description.value.description
          : "",
        shortDescription: result.shortDescription.ok
          ? result.shortDescription.value.short_description
          : "",
      });
      if (!result.me.ok) toast.error(result.me.error);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not reach Telegram.",
      );
    } finally {
      setBotBusy(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    // The Telegram status is intentionally fetched once per page visit.
    const id = window.setTimeout(() => {
      void loadBot();
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  useEffect(() => {
    if (!commandDefaults || commandsHydrated) return;
    queueMicrotask(() => {
      setCommandRows(
        commandDefaults.map((row) => ({
          command: row.command,
          description: row.description,
        })),
      );
      setCommandsHydrated(true);
    });
  }, [commandDefaults, commandsHydrated]);

  if (access === undefined) return <LoadingBlock rows={4} />;
  if (!access.isAdmin) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <ShieldCheck className="size-6 text-muted-foreground" />
        <p className="text-sm font-semibold">Operator access required</p>
        <p className="max-w-md text-[12px] leading-relaxed text-muted-foreground">
          The Telegram Control Center is protected by the same server-side
          operator check as the admin console.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to="/app">Back to NEXPOOL</Link>
        </Button>
      </div>
    );
  }
  if (!overview) return <LoadingBlock rows={5} />;

  const saveProfile = async () => {
    setProfileSaving(true);
    try {
      const result = await updateProfile({
        name: profileForm.name,
        description: profileForm.description,
        shortDescription: profileForm.shortDescription,
      });
      toast.success(`Telegram confirmed: ${result.updated.join(", ")}`);
      await loadBot();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Telegram rejected the update.",
      );
    } finally {
      setProfileSaving(false);
    }
  };

  const saveCommands = async () => {
    setCommandsSaving(true);
    try {
      const result = await publishCommands({ commands: commandRows });
      toast.success(`${result.commands} commands published to Telegram`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Command sync failed.",
      );
    } finally {
      setCommandsSaving(false);
    }
  };

  const connectDestination = async () => {
    setAddingDestination(true);
    try {
      const result = await addDestination({ chatId });
      setChatId("");
      toast.success(`${result.title} connected · bot ${result.botStatus}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Telegram rejected the chat.",
      );
    } finally {
      setAddingDestination(false);
    }
  };

  const recheck = async (destination: Destination) => {
    setCheckingChat(destination.chatId);
    try {
      const result = await checkDestination({ chatId: destination.chatId });
      if (result.ok && result.info) {
        toast.success(`${result.info.title} rechecked with Telegram`);
      } else if (!result.ok) {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Permission check failed.",
      );
    } finally {
      setCheckingChat(null);
    }
  };

  const remove = async (destination: Destination) => {
    try {
      await removeDestination({ chatId: destination.chatId });
      toast.success(`${destination.title} disconnected`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Remove failed.");
    }
  };

  const toggleDestination = (id: string) => {
    setSelectedDestinations((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  };

  const submitPost = async () => {
    setPublishing(true);
    try {
      const result = await publishPost({
        title,
        text,
        parseMode,
        chatIds: selectedDestinations,
        scheduledAt: scheduledAt
          ? new Date(scheduledAt).getTime()
          : undefined,
      });
      toast.success(
        result.status === "scheduled"
          ? "Post scheduled. Each destination has its own delivery record."
          : "Publishing started. Check Publishing reports for per-destination results.",
      );
      setTitle("");
      setText("");
      setScheduledAt("");
      setSelectedDestinations([]);
      setTab("reports");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Telegram did not accept the post.",
      );
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-30 border-b border-border/80 nav-blur safe-top">
        <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center gap-3 px-4 lg:px-6">
          <Link to="/admin" className="flex items-center gap-2">
            <Brand subtitle="TELEGRAM CONTROL CENTER" compact />
          </Link>
          <span className="ml-auto hidden items-center gap-1.5 border border-primary/40 bg-primary/[0.06] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-primary sm:flex">
            <ShieldCheck className="size-3" /> server-authorized
          </span>
          <Link
            to="/app"
            className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> Mini app
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1280px] px-3 py-4 lg:px-6">
        <div className="-mx-3 overflow-x-auto px-3 no-scrollbar">
          <div className="flex w-max gap-1 border-b border-border/70 pb-2">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-sm border px-2.5 py-2 font-mono text-[9.5px] uppercase tracking-[0.1em] transition-colors",
                  tab === item.key
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-transparent text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                )}
              >
                <item.icon className="size-3.5" />
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          {tab === "overview" ? (
            <OverviewTab
              overview={overview}
              botInfo={botInfo}
              botBusy={botBusy}
              onRefresh={loadBot}
            />
          ) : null}
          {tab === "profile" ? (
            <Panel
              eyebrow="Bot profile"
              title="Telegram-confirmed profile"
              action={
                <Button
                  size="sm"
                  onClick={saveProfile}
                  disabled={profileSaving}
                  className="gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em]"
                >
                  {profileSaving ? <Spinner /> : <CheckCircle2 className="size-3.5" />}
                  Save
                </Button>
              }
              bodyClassName="space-y-3"
            >
              {botInfo && !botInfo.me.ok ? (
                <p className="border border-down/40 bg-down/[0.05] p-2 text-[11px] text-down">
                  {botInfo.me.error}
                </p>
              ) : null}
              <Field label="Bot display name">
                <Input
                  value={profileForm.name}
                  maxLength={64}
                  onChange={(event) =>
                    setProfileForm({ ...profileForm, name: event.target.value })
                  }
                />
              </Field>
              <Field label="Description">
                <Textarea
                  value={profileForm.description}
                  maxLength={512}
                  onChange={(event) =>
                    setProfileForm({
                      ...profileForm,
                      description: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Short description">
                <Textarea
                  value={profileForm.shortDescription}
                  maxLength={120}
                  onChange={(event) =>
                    setProfileForm({
                      ...profileForm,
                      shortDescription: event.target.value,
                    })
                  }
                />
              </Field>
              <div className="grid gap-2 border-t border-border/70 pt-3 sm:grid-cols-2">
                <InfoLine
                  label="Username"
                  value={
                    botInfo?.me.ok
                      ? `@${botInfo.me.value.username ?? "not set"}`
                      : "Unavailable"
                  }
                />
                <InfoLine
                  label="Bot id"
                  value={botInfo?.me.ok ? String(botInfo.me.value.id) : "—"}
                />
              </div>
              <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
                Telegram does not allow changing the bot username through the
                Bot API. Use BotFather for a username change. These fields only
                report success after Telegram confirms the setter.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={loadBot}
                disabled={botBusy}
                className="gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em]"
              >
                {botBusy ? <Spinner /> : <RefreshCw className="size-3.5" />}
                Reload from Telegram
              </Button>
            </Panel>
          ) : null}
          {tab === "commands" ? (
            <Panel
              eyebrow="Command manager"
              title="Publish the Telegram menu"
              action={
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCommandRows((rows) => [
                        ...rows,
                        { command: "new_command", description: "Description" },
                      ])
                    }
                    className="gap-1 font-mono text-[10px] uppercase"
                  >
                    <Plus className="size-3" /> Add
                  </Button>
                  <Button
                    size="sm"
                    onClick={saveCommands}
                    disabled={commandsSaving}
                    className="gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em]"
                  >
                    {commandsSaving ? <Spinner /> : <Send className="size-3.5" />}
                    Publish
                  </Button>
                </div>
              }
              bodyClassName="space-y-2"
            >
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Commands are validated before publishing. Admin commands are
                permission-protected and are not added to the public menu.
              </p>
              {commandRows.map((row, index) => (
                <div
                  key={`${row.command}-${index}`}
                  className="grid gap-2 border border-border/70 bg-panel/40 p-2 sm:grid-cols-[150px_1fr_32px]"
                >
                  <Input
                    value={row.command}
                    onChange={(event) =>
                      setCommandRows((rows) =>
                        rows.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, command: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder="command"
                    className="font-mono text-[11px]"
                  />
                  <Input
                    value={row.description}
                    onChange={(event) =>
                      setCommandRows((rows) =>
                        rows.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, description: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder="description"
                    className="text-[11px]"
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      setCommandRows((rows) =>
                        rows.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    aria-label={`Remove ${row.command}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </Panel>
          ) : null}
          {tab === "destinations" ? (
            <div className="space-y-3">
              <Panel
                eyebrow="Connect destination"
                title="Add a group or channel"
                bodyClassName="space-y-2"
              >
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={chatId}
                    onChange={(event) => setChatId(event.target.value)}
                    placeholder="@channelusername or -100… chat id"
                    className="font-mono text-[11px]"
                  />
                  <Button
                    onClick={connectDestination}
                    disabled={addingDestination || !chatId.trim()}
                    className="gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em]"
                  >
                    {addingDestination ? <Spinner /> : <Link2 className="size-3.5" />}
                    Check & connect
                  </Button>
                </div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  The bot must already be a member. Adding it to a channel does
                  not automatically grant posting rights; the permission map
                  below is read directly from Telegram.
                </p>
              </Panel>
              {overview.destinations.length === 0 ? (
                <EmptyState
                  icon={<Users className="size-4" />}
                  title="No destinations connected"
                  body="Connect a test group or channel where @NEXPOOLBOT is already a member."
                />
              ) : (
                overview.destinations.map((destination) => (
                  <Panel
                    key={destination.chatId}
                    eyebrow={destination.type}
                    title={destination.title}
                    action={
                      <div className="flex items-center gap-1.5">
                        <StatusPill
                          tone={
                            destination.status === "connected" ? "up" : "down"
                          }
                        >
                          {destination.status}
                        </StatusPill>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={checkingChat === destination.chatId}
                          onClick={() => recheck(destination)}
                          className="gap-1 font-mono text-[9px] uppercase"
                        >
                          {checkingChat === destination.chatId ? (
                            <Spinner />
                          ) : (
                            <RefreshCw className="size-3" />
                          )}
                          Check
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => remove(destination)}
                          aria-label={`Disconnect ${destination.title}`}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    }
                    bodyClassName="space-y-3"
                  >
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <InfoLine
                        label="Chat id"
                        value={destination.chatId}
                      />
                      <InfoLine
                        label="Bot status"
                        value={destination.botStatus}
                      />
                      <InfoLine
                        label="Admin"
                        value={destination.isAdmin ? "yes" : "no"}
                      />
                      <InfoLine
                        label="Members"
                        value={
                          destination.memberCount === undefined
                            ? "unknown"
                            : String(destination.memberCount)
                        }
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {PERMISSION_LABELS.map(([key, label]) => (
                        <span
                          key={key}
                          className={cn(
                            "border px-1.5 py-1 font-mono text-[9px] uppercase tracking-[0.08em]",
                            destination.permissions[key]
                              ? "border-up/40 bg-up/[0.06] text-up"
                              : "border-border bg-secondary/40 text-muted-foreground",
                          )}
                        >
                          {label}: {destination.permissions[key] ? "available" : "not available"}
                        </span>
                      ))}
                    </div>
                    <p className="font-mono text-[9px] text-muted-foreground">
                      Last checked {formatDateTime(destination.lastCheckedAt)}
                      {destination.lastError
                        ? ` · ${destination.lastError}`
                        : ""}
                    </p>
                  </Panel>
                ))
              )}
            </div>
          ) : null}
          {tab === "composer" ? (
            <div className="grid gap-3 lg:grid-cols-12">
              <Panel
                className="lg:col-span-7"
                eyebrow="Universal publisher"
                title="Compose once"
                bodyClassName="space-y-3"
              >
                <Field label="Internal title">
                  <Input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Launch announcement"
                  />
                </Field>
                <Field label="Message text">
                  <Textarea
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="Write the post exactly as Telegram should receive it."
                    className="min-h-40 font-mono text-[11.5px]"
                    maxLength={4096}
                  />
                </Field>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Formatting">
                    <select
                      value={parseMode}
                      onChange={(event) =>
                        setParseMode(
                          event.target.value as "HTML" | "MarkdownV2" | "none",
                        )
                      }
                      className="h-9 w-full rounded-sm border border-input bg-transparent px-2 text-[11px] outline-none focus-visible:border-ring"
                    >
                      <option value="HTML">HTML</option>
                      <option value="MarkdownV2">MarkdownV2</option>
                      <option value="none">Plain text</option>
                    </select>
                  </Field>
                  <Field label="Schedule (local time, optional)">
                    <Input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(event) => setScheduledAt(event.target.value)}
                      className="text-[11px]"
                    />
                  </Field>
                </div>
                <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
                  {text.length}/4096 · Telegram validates formatting at send
                  time. A rejected destination is recorded as failed; it is not
                  reported as published.
                </p>
                <Button
                  onClick={submitPost}
                  disabled={publishing || !text.trim()}
                  className="w-full gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em]"
                >
                  {publishing ? <Spinner /> : <Send className="size-3.5" />}
                  {scheduledAt ? "Schedule post" : "Publish now"}
                </Button>
              </Panel>
              <Panel
                className="lg:col-span-5"
                eyebrow="Destinations"
                title={`${selectedDestinations.length} selected`}
                bodyClassName="space-y-2"
              >
                {overview.destinations.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    No groups or channels connected. Add one first.
                  </p>
                ) : (
                  overview.destinations.map((destination) => {
                    const selected = selectedDestinations.includes(
                      destination.chatId,
                    );
                    const canPost = destination.permissions.canPostMessages;
                    return (
                      <button
                        key={destination.chatId}
                        type="button"
                        disabled={!canPost}
                        onClick={() => toggleDestination(destination.chatId)}
                        className={cn(
                          "flex w-full items-center gap-2 border p-2 text-left transition-colors",
                          selected
                            ? "border-primary/50 bg-primary/10"
                            : "border-border/70 bg-panel/40 hover:bg-secondary/40",
                          !canPost && "cursor-not-allowed opacity-50",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center border",
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border",
                          )}
                        >
                          {selected ? <CheckCircle2 className="size-3" /> : null}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[11.5px] font-medium">
                            {destination.title}
                          </span>
                          <span className="block font-mono text-[9px] text-muted-foreground">
                            {destination.type} ·{" "}
                            {canPost ? "posting available" : "no posting permission"}
                          </span>
                        </span>
                      </button>
                    );
                  })
                )}
              </Panel>
            </div>
          ) : null}
          {tab === "automations" ? (
            <AutomationsTab
              destinations={overview.destinations}
              posts={overview.posts}
            />
          ) : null}
          {tab === "reports" ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric label="Posts" value={overview.counts.posts} />
                <Metric label="Delivered" value={overview.counts.sent} />
                <Metric label="Failed" value={overview.counts.failed} />
                <Metric
                  label="Partial"
                  value={overview.counts.partial}
                  tone="warn"
                />
              </div>
              {overview.posts.length === 0 ? (
                <EmptyState
                  icon={<Megaphone className="size-4" />}
                  title="No posts yet"
                  body="Publish or schedule a post to create per-destination delivery records."
                />
              ) : (
                overview.posts.map((post) => (
                  <PostReport
                    key={post._id}
                    post={post}
                    deliveries={overview.deliveries.filter(
                      (row) => row.postId === post._id,
                    )}
                  />
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function OverviewTab({
  overview,
  botInfo,
  botBusy,
  onRefresh,
}: {
  overview: CenterOverview;
  botInfo: FunctionReturnType<typeof api.telegramControl.botInfo> | null;
  botBusy: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-12">
        <Panel
          className="lg:col-span-7"
          eyebrow="Connection"
          title="Telegram bot"
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={botBusy}
              className="gap-1 font-mono text-[9px] uppercase"
            >
              {botBusy ? <Spinner /> : <RefreshCw className="size-3" />}
              Refresh
            </Button>
          }
          bodyClassName="space-y-3"
        >
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center border border-primary/40 bg-primary/10 text-primary">
              <Bot className="size-4" />
            </span>
            <div>
              <p className="text-[13px] font-semibold">
                {botInfo?.me.ok
                  ? botInfo.me.value.first_name
                  : botBusy
                    ? "Checking Telegram…"
                    : "Telegram unavailable"}
              </p>
              <p className="font-mono text-[10px] text-muted-foreground">
                {botInfo?.me.ok
                  ? `@${botInfo.me.value.username ?? "username not set"}`
                  : botInfo?.me.error ?? "No live getMe result yet."}
              </p>
            </div>
            <span className="ml-auto">
              <StatusPill tone={botInfo?.me.ok ? "up" : "warn"}>
                {botInfo?.me.ok ? "live" : "unknown"}
              </StatusPill>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-border/70 pt-3">
            <InfoLine
              label="Webhook"
              value={
                botInfo?.webhook.ok
                  ? botInfo.webhook.value.url ?? "not registered"
                  : "unavailable"
              }
            />
            <InfoLine
              label="Pending updates"
              value={
                botInfo?.webhook.ok
                  ? String(botInfo.webhook.value.pending_update_count ?? 0)
                  : "—"
              }
            />
          </div>
          {botInfo?.webhook.ok && botInfo.webhook.value.last_error_message ? (
            <p className="border border-warn/40 bg-warn/[0.05] p-2 text-[10px] text-warn">
              {botInfo.webhook.value.last_error_message}
            </p>
          ) : null}
        </Panel>
        <Panel
          className="lg:col-span-5"
          eyebrow="Publishing"
          title="Delivery state"
          bodyClassName="space-y-2"
        >
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Groups" value={overview.counts.groups} />
            <Metric label="Channels" value={overview.counts.channels} />
            <Metric label="Scheduled" value={overview.counts.scheduled} />
            <Metric label="Failed" value={overview.counts.failed} tone="warn" />
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Only destinations whose Telegram permission check says posting is
            available can be selected in the composer. Reports are generated
            from Telegram responses, not optimistic UI state.
          </p>
        </Panel>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Posts recorded" value={overview.counts.posts} />
        <Metric label="Sent deliveries" value={overview.counts.sent} tone="up" />
        <Metric label="Partial posts" value={overview.counts.partial} tone="warn" />
        <Metric label="Connected chats" value={overview.counts.destinations} />
      </div>
    </div>
  );
}

function PostReport({ post, deliveries }: { post: Post; deliveries: Delivery[] }) {
  return (
    <Panel
      eyebrow={`${post.status.replace(/_/g, " ")} · ${post.parseMode}`}
      title={post.title}
      action={
        <StatusPill
          tone={
            post.status === "published"
              ? "up"
              : post.status === "failed"
                ? "down"
                : post.status === "partially_published"
                  ? "warn"
                  : "muted"
          }
        >
          {post.status}
        </StatusPill>
      }
      bodyClassName="space-y-2"
    >
      <p className="line-clamp-2 whitespace-pre-wrap text-[11px] text-muted-foreground">
        {post.text}
      </p>
      <div className="flex flex-wrap gap-3 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
        <span>created {formatDateTime(post.createdAt)}</span>
        {post.scheduledAt ? (
          <span className="flex items-center gap-1">
            <Clock className="size-3" /> {formatDateTime(post.scheduledAt)}
          </span>
        ) : null}
        <span>{deliveries.length} destinations</span>
      </div>
      <div className="divide-y divide-border/60 border-t border-border/60">
        {deliveries.map((delivery) => (
          <div
            key={delivery._id}
            className="flex flex-wrap items-center gap-2 py-2"
          >
            <span className="min-w-0 flex-1 truncate text-[11px]">
              {delivery.destinationTitle}
            </span>
            <span className="font-mono text-[9px] text-muted-foreground">
              {delivery.chatId}
            </span>
            <StatusPill
              tone={
                delivery.status === "sent"
                  ? "up"
                  : delivery.status === "failed"
                    ? "down"
                    : "muted"
              }
            >
              {delivery.status}
            </StatusPill>
            <span className="font-mono text-[9px] text-muted-foreground">
              attempts {delivery.attempts}
              {delivery.telegramMessageId
                ? ` · msg ${delivery.telegramMessageId}`
                : ""}
            </span>
            {delivery.error ? (
              <span className="w-full text-[10px] text-down">
                {delivery.error}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </Panel>
  );
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/**
 * Automated publishing: every post is rendered from confirmed backend data by
 * a code-defined template. The operator controls the destination, the UTC slot
 * and whether the run is published immediately or held as a draft.
 */
function AutomationsTab({
  destinations,
  posts,
}: {
  destinations: Destination[];
  posts: Post[];
}) {
  const catalog = useQuery(api.publishing.templates);
  const automations = useQuery(api.publishing.listAutomations);
  const segments = useQuery(api.publishing.segmentCounts);
  const upsert = useMutation(api.publishing.upsertAutomation);
  const removeAutomation = useMutation(api.publishing.deleteAutomation);
  const runNow = useAction(api.publishing.runNow);
  const sendSegment = useAction(api.publishing.sendSegment);
  const approvePost = useAction(api.publishing.approvePost);

  const [templateKey, setTemplateKey] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">(
    "daily",
  );
  const [hourUtc, setHourUtc] = useState(9);
  const [minuteUtc, setMinuteUtc] = useState(0);
  const [weekday, setWeekday] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [requireApproval, setRequireApproval] = useState(false);
  const [targets, setTargets] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [busyRow, setBusyRow] = useState<string | null>(null);

  const [segment, setSegment] = useState("all_linked");
  const [limit, setLimit] = useState(100);
  const [sending, setSending] = useState(false);

  const preview = useQuery(
    api.publishing.preview,
    templateKey ? { templateKey } : "skip",
  );
  const selected = catalog?.templates.find((row) => row.key === templateKey);

  const chooseTemplate = (key: string) => {
    setTemplateKey(key);
    const found = catalog?.templates.find((row) => row.key === key);
    if (!found) return;
    setFrequency(found.frequency);
    setHourUtc(found.hourUtc);
    setMinuteUtc(found.minuteUtc);
  };

  const toggleTarget = (chatId: string) =>
    setTargets((current) =>
      current.includes(chatId)
        ? current.filter((id) => id !== chatId)
        : [...current, chatId],
    );

  const save = async () => {
    if (!selected) return;
    if (targets.length === 0) {
      toast.error("Select at least one destination.");
      return;
    }
    setSaving(true);
    try {
      await upsert({
        templateKey: selected.key,
        enabled: true,
        destinationIds: targets,
        frequency,
        hourUtc,
        minuteUtc,
        weekday: frequency === "weekly" ? weekday : undefined,
        dayOfMonth: frequency === "monthly" ? dayOfMonth : undefined,
        requireApproval,
      });
      toast.success(`${selected.label} scheduled.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not schedule.");
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (row: NonNullable<typeof automations>[number]) => {
    setBusyRow(row.id);
    try {
      await upsert({
        id: row.id,
        templateKey: row.templateKey,
        enabled: !row.enabled,
        destinationIds: row.destinationIds,
        frequency: row.frequency,
        hourUtc: row.hourUtc,
        minuteUtc: row.minuteUtc,
        weekday: row.weekday ?? undefined,
        dayOfMonth: row.dayOfMonth ?? undefined,
        requireApproval: row.requireApproval,
      });
      toast.success(row.enabled ? "Schedule paused." : "Schedule resumed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed.");
    } finally {
      setBusyRow(null);
    }
  };

  const run = async (id: NonNullable<typeof automations>[number]["id"]) => {
    setBusyRow(id);
    try {
      const result = (await runNow({ id })) as { status: string };
      if (result.status === "queued") {
        toast.success("Post queued for every destination.");
      } else if (result.status === "no-data") {
        toast.info("This template has no confirmed data to publish yet.");
      } else {
        toast.info("Nothing was published.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Run failed.");
    } finally {
      setBusyRow(null);
    }
  };

  const sendToSegment = async () => {
    if (
      !window.confirm(
        `Send a private bot message to the "${segment}" segment (up to ${limit} accounts)?\n\nTelegram only delivers to accounts that started the bot. Every unavailable chat is recorded as a failed delivery.`,
      )
    ) {
      return;
    }
    setSending(true);
    try {
      const result = (await sendSegment({ segment, limit })) as { queued: number };
      toast.success(`${result.queued} private messages queued.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Segment send failed.");
    } finally {
      setSending(false);
    }
  };

  const drafts = posts.filter((post) => post.status === "draft");

  const approve = async (postId: Post["_id"]) => {
    setBusyRow(postId);
    try {
      await approvePost({ postId });
      toast.success("Draft approved and queued for delivery.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Approval failed.");
    } finally {
      setBusyRow(null);
    }
  };

  return (
    <div className="space-y-3">
      {drafts.length > 0 ? (
        <Panel
          eyebrow="Needs approval"
          title={`${drafts.length} draft${drafts.length === 1 ? "" : "s"} waiting`}
          action={<StatusPill tone="warn">held</StatusPill>}
          bodyClassName="space-y-2"
        >
          {drafts.map((post) => (
            <div
              key={post._id}
              className="border border-warn/40 bg-warn/[0.04] p-2.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[11.5px] font-medium">
                    {post.title}
                  </p>
                  <p className="font-mono text-[9px] text-muted-foreground">
                    {post.templateKey ?? "manual"} ·{" "}
                    {post.destinationIds.length} destinations · created{" "}
                    {formatDateTime(post.createdAt)}
                  </p>
                </div>
                <Button
                  size="sm"
                  className="gap-1 font-mono text-[9px] uppercase"
                  disabled={busyRow === post._id}
                  onClick={() => void approve(post._id)}
                >
                  {busyRow === post._id ? <Spinner /> : <Send className="size-3" />}
                  Approve
                </Button>
              </div>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-muted-foreground">
                {post.text}
              </p>
            </div>
          ))}
        </Panel>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-12">
        <Panel
          className="lg:col-span-7"
          eyebrow="Automated post engine"
          title={`${automations?.length ?? 0} recurring schedules`}
          bodyClassName="space-y-2"
        >
          {!automations || automations.length === 0 ? (
            <EmptyState
              icon={<CalendarClock className="size-4" />}
              title="No automated posts yet"
              body="Schedule a template on the right. Every post is generated from confirmed mining, task, referral and payout records — never from placeholder numbers."
            />
          ) : (
            automations.map((row) => (
              <div
                key={row.id}
                className="border border-border/70 bg-panel/40 p-2.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[11.5px] font-medium">
                      {row.label}
                    </p>
                    <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground">
                      {row.frequency}
                      {row.frequency === "weekly" && row.weekday !== null
                        ? ` · ${WEEKDAYS[row.weekday]}`
                        : ""}
                      {row.frequency === "monthly" && row.dayOfMonth !== null
                        ? ` · day ${row.dayOfMonth}`
                        : ""}
                      {" · "}
                      {String(row.hourUtc).padStart(2, "0")}:
                      {String(row.minuteUtc).padStart(2, "0")} UTC ·{" "}
                      {row.destinationIds.length} destination
                      {row.destinationIds.length === 1 ? "" : "s"}
                      {row.requireApproval ? " · draft mode" : ""}
                    </p>
                    <p className="font-mono text-[9px] text-muted-foreground">
                      next {formatDateTime(row.nextRunAt)}
                      {row.lastRunAt
                        ? ` · last ${formatDateTime(row.lastRunAt)}`
                        : ""}
                    </p>
                    {row.lastError ? (
                      <p className="mt-1 text-[10px] text-warn">{row.lastError}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusPill tone={row.enabled ? "up" : "muted"}>
                      {row.enabled ? "enabled" : "paused"}
                    </StatusPill>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 gap-1 px-1.5 font-mono text-[8px] uppercase"
                      disabled={busyRow === row.id}
                      onClick={() => void toggleEnabled(row)}
                    >
                      {row.enabled ? "Pause" : "Resume"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 gap-1 px-1.5 font-mono text-[8px] uppercase text-primary"
                      disabled={busyRow === row.id}
                      onClick={() => void run(row.id)}
                    >
                      <Play className="size-3" /> Run
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 gap-1 px-1.5 font-mono text-[8px] uppercase text-down"
                      disabled={busyRow === row.id}
                      onClick={() => void removeAutomation({ id: row.id })}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            A run is idempotent per scheduled slot, so overlapping cron ticks
            cannot double-post. If a template has no confirmed data, it skips the
            slot instead of inventing numbers.
          </p>
        </Panel>

        <Panel
          className="lg:col-span-5"
          eyebrow="New schedule"
          title={selected ? selected.label : "Pick a template"}
          bodyClassName="space-y-3"
        >
          <Field label="Template">
            <select
              value={templateKey}
              onChange={(event) => chooseTemplate(event.target.value)}
              className="h-9 w-full rounded-sm border border-input bg-transparent px-2 text-[11px] outline-none focus-visible:border-ring"
            >
              <option value="">Select a template…</option>
              {(catalog?.categories ?? []).map((category) => (
                <optgroup key={category.key} label={category.label}>
                  {(catalog?.templates ?? [])
                    .filter((row) => row.category === category.key)
                    .map((row) => (
                      <option key={row.key} value={row.key}>
                        {row.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </Field>

          {selected ? (
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              {selected.description}
            </p>
          ) : null}

          <div className="grid grid-cols-3 gap-2">
            <Field label="Frequency">
              <select
                value={frequency}
                onChange={(event) =>
                  setFrequency(event.target.value as "daily" | "weekly" | "monthly")
                }
                className="h-9 w-full rounded-sm border border-input bg-transparent px-2 text-[11px] outline-none focus-visible:border-ring"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </Field>
            <Field label="Hour (UTC)">
              <Input
                type="number"
                min={0}
                max={23}
                value={hourUtc}
                onChange={(event) => setHourUtc(Number(event.target.value))}
                className="num text-[11px]"
              />
            </Field>
            <Field label="Minute">
              <Input
                type="number"
                min={0}
                max={59}
                value={minuteUtc}
                onChange={(event) => setMinuteUtc(Number(event.target.value))}
                className="num text-[11px]"
              />
            </Field>
          </div>

          {frequency === "weekly" ? (
            <Field label="Weekday">
              <select
                value={weekday}
                onChange={(event) => setWeekday(Number(event.target.value))}
                className="h-9 w-full rounded-sm border border-input bg-transparent px-2 text-[11px] outline-none focus-visible:border-ring"
              >
                {WEEKDAYS.map((label, index) => (
                  <option key={label} value={index}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          {frequency === "monthly" ? (
            <Field label="Day of month (1–28)">
              <Input
                type="number"
                min={1}
                max={28}
                value={dayOfMonth}
                onChange={(event) => setDayOfMonth(Number(event.target.value))}
                className="num text-[11px]"
              />
            </Field>
          ) : null}

          <label className="flex items-start gap-2 border border-border/70 p-2 text-[10px] leading-relaxed text-muted-foreground">
            <input
              type="checkbox"
              checked={requireApproval}
              onChange={(event) => setRequireApproval(event.target.checked)}
              className="mt-0.5 size-3.5 accent-primary"
            />
            <span>
              Hold each run as a draft. The post is recorded but nothing is sent
              until you review it.
            </span>
          </label>

          <div>
            <p className="label-xs mb-1.5">Destinations</p>
            {destinations.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                No groups or channels connected yet.
              </p>
            ) : (
              <div className="space-y-1.5">
                {destinations.map((destination) => {
                  const checked = targets.includes(destination.chatId);
                  const canPost = destination.permissions.canPostMessages;
                  return (
                    <button
                      key={destination.chatId}
                      type="button"
                      disabled={!canPost}
                      onClick={() => toggleTarget(destination.chatId)}
                      className={cn(
                        "flex w-full items-center gap-2 border p-2 text-left transition-colors",
                        checked
                          ? "border-primary/50 bg-primary/10"
                          : "border-border/70 bg-panel/40 hover:bg-secondary/40",
                        !canPost && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center border",
                          checked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border",
                        )}
                      >
                        {checked ? <CheckCircle2 className="size-3" /> : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[11px]">
                        {destination.title}
                      </span>
                      <span className="font-mono text-[8.5px] uppercase text-muted-foreground">
                        {destination.type}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {preview ? (
            <div className="border border-border/70 bg-background/60 p-2.5">
              <p className="label-xs">Live preview</p>
              <p className="mt-1 whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-muted-foreground">
                {preview.available
                  ? preview.text
                  : "This template has no confirmed data yet. It will skip the slot rather than publish empty numbers."}
              </p>
            </div>
          ) : null}

          <Button
            onClick={() => void save()}
            disabled={saving || !selected || targets.length === 0}
            className="w-full gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em]"
          >
            {saving ? <Spinner /> : <CalendarClock className="size-3.5" />}
            Schedule template
          </Button>
        </Panel>
      </div>

      <Panel
        eyebrow="Private bot messages"
        title="Targeted segments"
        bodyClassName="space-y-3"
      >
        <div className="grid gap-2 sm:grid-cols-3">
          <Field label="Segment">
            <select
              value={segment}
              onChange={(event) => setSegment(event.target.value)}
              className="h-9 w-full rounded-sm border border-input bg-transparent px-2 text-[11px] outline-none focus-visible:border-ring"
            >
              {(segments?.segments ?? []).map((row) => (
                <option key={row.key} value={row.key}>
                  {row.label} · {segments?.counts[row.key] ?? 0}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Recipient cap">
            <Input
              type="number"
              min={1}
              max={500}
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
              className="num text-[11px]"
            />
          </Field>
          <div className="flex items-end">
            <Button
              onClick={() => void sendToSegment()}
              disabled={sending}
              className="w-full gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em]"
            >
              {sending ? <Spinner /> : <Send className="size-3.5" />}
              Send to segment
            </Button>
          </div>
        </div>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          A bot can only message accounts that started it. Every recipient is
          recorded as its own delivery, so an unreachable chat shows up as failed
          instead of silently disappearing.
        </p>
      </Panel>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="label-xs">{label}</span>
      {children}
    </label>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="label-xs">{label}</p>
      <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
        {value}
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn" | "up";
}) {
  return (
    <div className="border border-border/70 bg-panel/40 px-3 py-2">
      <p className="label-xs">{label}</p>
      <p
        className={cn(
          "num mt-1 text-lg font-semibold",
          tone === "warn" ? "text-warn" : tone === "up" ? "text-up" : "",
        )}
      >
        {value}
      </p>
    </div>
  );
}
