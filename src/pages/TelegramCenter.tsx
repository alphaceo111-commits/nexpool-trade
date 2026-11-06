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
  CheckCircle2,
  Clock,
  Hash,
  Link2,
  Megaphone,
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
