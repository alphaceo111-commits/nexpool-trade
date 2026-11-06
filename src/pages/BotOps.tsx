import { Panel, StatusDot } from "@/components/console/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import { formatTime } from "@/lib/nexpool";
import { cn } from "@/lib/utils";
import { useAction, useMutation, useQuery } from "convex/react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowUpRight,
  Bot,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Radio,
  Send,
  Terminal,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const COMMANDS = [
  { command: "/stats", hint: "hashrate + revenue" },
  { command: "/workers", hint: "fleet status" },
  { command: "/revenue", hint: "business model" },
  { command: "/blocks", hint: "recent finds" },
  { command: "/payouts", hint: "queue" },
  { command: "/alerts", hint: "risk flags" },
  { command: "/help", hint: "command list" },
];

export default function BotOps() {
  const data = useQuery(api.bot.overview);
  const access = useQuery(api.admin.access);
  const runCommand = useMutation(api.bot.runConsoleCommand);
  const updateSettings = useMutation(api.bot.updateSettings);
  const registerWebhook = useAction(api.bot.registerWebhook);

  const [input, setInput] = useState("/stats");
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [registering, setRegistering] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    enabled: true,
    alertOnBlock: true,
    alertOnWorkerOffline: true,
    hashrateFloorPth: "300",
    chatId: "",
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!data || hydrated) return;
    const snapshot = data.settings;
    // Hydrate asynchronously: no synchronous cascading render from the effect.
    queueMicrotask(() => {
      setForm({
        enabled: snapshot.enabled,
        alertOnBlock: snapshot.alertOnBlock,
        alertOnWorkerOffline: snapshot.alertOnWorkerOffline,
        hashrateFloorPth: String(snapshot.hashrateFloorPth),
        chatId: snapshot.chatId,
      });
      setHydrated(true);
    });
  }, [data, hydrated]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [data?.messages.length]);

  if (!data || access === undefined) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!access.isAdmin) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <Bot className="size-5 text-muted-foreground" />
        <p className="text-sm font-semibold">Operator access required</p>
        <p className="max-w-sm text-[12px] leading-relaxed text-muted-foreground">
          The bot desk is restricted to the configured operator account. Open it
          from the NEXPOOL mini app as the operator.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to="/app">Back to NEXPOOL</Link>
        </Button>
      </div>
    );
  }

  const messages = data.messages.slice(-18);

  async function send(text?: string) {
    const command = (text ?? input).trim();
    if (!command || sending) return;
    setSending(true);
    try {
      await runCommand({ text: command });
      setInput("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Command failed.");
    } finally {
      setSending(false);
    }
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await updateSettings({
        enabled: form.enabled,
        alertOnBlock: form.alertOnBlock,
        alertOnWorkerOffline: form.alertOnWorkerOffline,
        hashrateFloorPth: Number(form.hashrateFloorPth) || 0,
        chatId: form.chatId,
      });
      toast.success("Bot settings saved", {
        description: form.enabled ? "Desk bot armed for commands and alerts." : "Desk bot disabled.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function registerWebhookNow() {
    if (registering) return;
    setRegistering(true);
    try {
      const result = await registerWebhook();
      toast.success("Webhook registered", {
        description: `${result.url}${
          result.secretRequired ? " · secret token attached" : ""
        }${
          result.commandsSynced
            ? ` · ${result.commands} commands synced`
            : " · command menu not synced"
        }`,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not register the webhook.",
      );
    } finally {
      setRegistering(false);
    }
  }

  async function copyWebhook() {
    try {
      await navigator.clipboard.writeText(data!.webhookUrl);
      setCopied(true);
      toast.success("Webhook URL copied");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Copy failed — select the URL manually.");
    }
  }

  const status = !data.settings.enabled
    ? { label: "DISABLED", tone: "text-muted-foreground", dot: "offline" as const }
    : data.configured
      ? { label: "LIVE", tone: "text-up", dot: "online" as const }
      : { label: "CONSOLE ONLY", tone: "text-warn", dot: "degraded" as const };

  return (
    <div className="space-y-4">
      <Link
        to="/admin"
        className="flex w-fit items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" /> Operator console
      </Link>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex flex-col gap-3 border border-border bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <div className="flex items-center gap-2">
            <Bot className="size-3.5 text-primary" />
            <p className="label-xs">Telegram desk bot</p>
            <span className={cn("flex items-center gap-1.5 font-mono text-[10px] tracking-[0.12em]", status.tone)}>
              <StatusDot status={status.dot} /> {status.label}
            </span>
          </div>
          <h2 className="mt-1.5 text-xl font-bold tracking-tight">
            The pool desk, in your pocket.
          </h2>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
            One bot, one command set. Stats, fleet health, revenue and the payout queue — answered
            from the same live book the console reads.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em]"
            onClick={copyWebhook}
            disabled={!data.webhookUrl}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            Webhook
          </Button>
          {data.botUsername ? (
            <Button asChild size="sm" className="gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em]">
              <a
                href={`https://t.me/${data.botUsername.replace("@", "")}`}
                target="_blank"
                rel="noreferrer"
              >
                Open bot <ArrowUpRight className="size-3.5" />
              </a>
            </Button>
          ) : null}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.06 }}
          className="xl:col-span-3"
        >
          <Panel
            label="Command console"
            title={<>#{data.botUsername.replace("@", "")}</>}
            action={
              <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <Terminal className="size-3" /> same engine as telegram
              </span>
            }
            bodyClassName="p-0"
          >
            <div ref={scrollRef} className="h-[330px] space-y-2.5 overflow-y-auto bg-background/40 px-4 py-4">
              {messages.map((message) => {
                const outbound = message.direction === "outbound";
                return (
                  <div
                    key={message._id}
                    className={cn("flex", outbound ? "justify-start" : "justify-end")}
                  >
                    <div
                      className={cn(
                        "max-w-[86%] border px-3 py-2",
                        outbound
                          ? "border-border bg-panel"
                          : "border-primary/40 bg-primary/10",
                      )}
                    >
                      <div className="mb-1 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                        <span className={outbound ? "text-primary" : ""}>
                          {outbound ? "nexpool bot" : "owner"}
                        </span>
                        <span>·</span>
                        <span>{message.source}</span>
                        <span>·</span>
                        <span>{formatTime(message.ts)}</span>
                      </div>
                      <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground">
                        {message.text}
                      </pre>
                    </div>
                  </div>
                );
              })}
              {messages.length === 0 && (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  No messages yet. Send /stats to open the tape.
                </p>
              )}
            </div>

            <div className="border-t border-border px-4 py-3">
              <div className="mb-2.5 flex flex-wrap gap-1.5">
                {COMMANDS.map((item) => (
                  <button
                    key={item.command}
                    type="button"
                    onClick={() => {
                      setInput(item.command);
                      void send(item.command);
                    }}
                    disabled={sending}
                    className="border border-border bg-secondary/50 px-2 py-1 font-mono text-[10px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
                    title={item.hint}
                  >
                    {item.command}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
                className="flex items-center gap-2"
              >
                <div className="relative flex-1">
                  <span className="absolute top-1/2 left-2.5 -translate-y-1/2 font-mono text-[11px] text-primary">
                    ›
                  </span>
                  <Input
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="/stats"
                    className="pl-6 font-mono text-[12px]"
                    disabled={sending}
                  />
                </div>
                <Button type="submit" size="sm" disabled={sending || !input.trim()} className="gap-1.5">
                  {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                  Run
                </Button>
              </form>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                Console runs are logged to the same tape as Telegram traffic.
              </p>
            </div>
          </Panel>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="space-y-4 xl:col-span-2"
        >
          <Panel label="Connection" title="Webhook wiring" bodyClassName="space-y-3">
            <div className="flex items-center justify-between border border-border bg-panel px-3 py-2">
              <div className="flex items-center gap-2 font-mono text-[11px]">
                <Radio className={cn("size-3.5", data.configured ? "text-up" : "text-warn")} />
                {data.configured ? "Token detected" : "Token not set"}
              </div>
              <span className={cn("font-mono text-[10px] uppercase tracking-[0.12em]", status.tone)}>
                {status.label}
              </span>
            </div>

            <div>
              <p className="label-xs mb-1.5">Webhook endpoint</p>
              <div className="flex items-stretch gap-1.5">
                <code className="min-w-0 flex-1 truncate border border-border bg-background px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
                  {data.webhookUrl || "Site URL unavailable"}
                </code>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={copyWebhook}
                  disabled={!data.webhookUrl}
                  aria-label="Copy webhook URL"
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                </Button>
              </div>
            </div>

            <Button
              className="w-full gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em]"
              onClick={registerWebhookNow}
              disabled={registering || !data.configured || !data.webhookUrl}
            >
              {registering ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Radio className="size-3.5" />
              )}
              {registering ? "Registering…" : "Register webhook + menu"}
            </Button>

            <div>
              <p className="label-xs mb-1.5 flex items-center gap-1.5">
                <KeyRound className="size-3" /> Required keys
              </p>
              <ul className="space-y-1 font-mono text-[10px] text-muted-foreground">
                <li className="flex items-center justify-between gap-2">
                  <span className="text-foreground/80">TELEGRAM_BOT_TOKEN</span>
                  <span className={data.configured ? "text-up" : "text-warn"}>
                    {data.configured ? "SET" : "MISSING"}
                  </span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span className="text-foreground/80">Webhook authentication</span>
                  <span className="text-up">DERIVED</span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span className="text-foreground/80">TELEGRAM_BOT_USERNAME</span>
                  <span className="text-muted-foreground">{data.botUsername}</span>
                </li>
              </ul>
              <p className="mt-2 border border-border bg-background px-2 py-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                Keys live in the project&apos;s Keys tab. <b>Register webhook</b>{" "}
                calls Telegram&apos;s setWebhook with the endpoint above and a
                secret derived from the bot token, then writes an audit entry.
                Re-running it is safe.
              </p>
            </div>
          </Panel>

          <form onSubmit={handleSave}>
            <Panel
              label="Automation"
              title="Enabled & alerts"
              action={
                <Button type="submit" size="sm" disabled={saving} className="h-7 font-mono text-[10px] uppercase tracking-[0.1em]">
                  {saving ? <Loader2 className="size-3 animate-spin" /> : null}
                  Save
                </Button>
              }
              bodyClassName="space-y-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[12px] font-medium">Desk bot enabled</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    Accept commands from Telegram
                  </p>
                </div>
                <Switch
                  checked={form.enabled}
                  onCheckedChange={(checked) => setForm({ ...form, enabled: checked })}
                  aria-label="Enable bot"
                />
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <div>
                  <p className="text-[12px] font-medium">Alert on block</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    Push every confirmed find
                  </p>
                </div>
                <Switch
                  checked={form.alertOnBlock}
                  onCheckedChange={(checked) => setForm({ ...form, alertOnBlock: checked })}
                  aria-label="Alert on block"
                />
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <div>
                  <p className="text-[12px] font-medium">Alert on worker offline</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    Escalate a missing heartbeat
                  </p>
                </div>
                <Switch
                  checked={form.alertOnWorkerOffline}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, alertOnWorkerOffline: checked })
                  }
                  aria-label="Alert on worker offline"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
                <div className="space-y-1.5">
                  <Label htmlFor="floor" className="label-xs">
                    Hashrate floor
                  </Label>
                  <Input
                    id="floor"
                    type="number"
                    min="0"
                    step="10"
                    value={form.hashrateFloorPth}
                    onChange={(event) => setForm({ ...form, hashrateFloorPth: event.target.value })}
                    className="font-mono text-[12px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="chat" className="label-xs">
                    Owner chat ID
                  </Label>
                  <Input
                    id="chat"
                    placeholder="e.g. 4812..."
                    value={form.chatId}
                    onChange={(event) => setForm({ ...form, chatId: event.target.value })}
                    className="font-mono text-[12px]"
                  />
                </div>
              </div>
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                Alerts fire below {form.hashrateFloorPth || 0} PH/s
              </p>
            </Panel>
          </form>
        </motion.div>
      </div>

      <Panel label="Command reference" title="What the bot answers" bodyClassName="p-0">
        <div className="grid grid-cols-1 divide-y divide-border/60 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-3">
          {COMMANDS.map((item) => (
            <div
              key={item.command}
              className="flex items-center justify-between border-b border-border/60 px-4 py-2.5 last:border-0"
            >
              <span className="font-mono text-[11px] text-primary">{item.command}</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                {item.hint}
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
