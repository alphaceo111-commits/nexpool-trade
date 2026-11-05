import { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import {
  BadgeCheck,
  ChevronRight,
  Globe2,
  HelpCircle,
  Languages,
  Save,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  Wallet,
} from "lucide-react";
import {
  formatDate,
  formatDateTime,
  formatNex,
  initials,
  Panel,
  SectionHeading,
  Spinner,
  StatusPill,
} from "@/components/app/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

const PREFERENCES = [
  { key: "notifyTasks", label: "Task verification results" },
  { key: "notifyMining", label: "Mining limit and resume alerts" },
  { key: "notifyWallet", label: "Withdrawal status" },
  { key: "notifyAnnouncements", label: "Sponsor and platform announcements" },
] as const;

type Snapshot = NonNullable<FunctionReturnType<typeof api.app.snapshot>>;

export default function Profile() {
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

  return <ProfileView snapshot={snapshot} />;
}

function ProfileView({ snapshot }: { snapshot: Snapshot }) {
  const updatePreferences = useMutation(api.app.updatePreferences);
  const reportProblem = useMutation(api.app.reportProblem);
  const { account, balance, config } = snapshot;

  const [displayName, setDisplayName] = useState(account.displayName);
  const [savingName, setSavingName] = useState(false);
  const [prefs, setPrefs] = useState(account.preferences);
  const [savingPref, setSavingPref] = useState<string | null>(null);
  const [language, setLanguage] = useState<"en" | "am">(
    account.language === "am" ? "am" : "en",
  );
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [report, setReport] = useState("");
  const [reportTopic, setReportTopic] = useState("general");
  const [sendingReport, setSendingReport] = useState(false);

  const saveName = async () => {
    setSavingName(true);
    try {
      await updatePreferences({ displayName });
      toast.success("Display name updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save name.");
      setDisplayName(account.displayName);
    } finally {
      setSavingName(false);
    }
  };

  const togglePreference = async (
    key: (typeof PREFERENCES)[number]["key"],
    value: boolean,
  ) => {
    setPrefs((current) => ({ ...current, [key]: value }));
    setSavingPref(key);
    try {
      await updatePreferences({ [key]: value });
    } catch (error) {
      setPrefs((current) => ({ ...current, [key]: !value }));
      toast.error(
        error instanceof Error ? error.message : "Could not save the preference.",
      );
    } finally {
      setSavingPref(null);
    }
  };

  const saveLanguage = async (next: "en" | "am") => {
    setLanguage(next);
    setSavingLanguage(true);
    try {
      await updatePreferences({ language: next });
      toast.success("Language preference saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save language.",
      );
    } finally {
      setSavingLanguage(false);
    }
  };

  const submitReport = async () => {
    setSendingReport(true);
    try {
      await reportProblem({ message: report, topic: reportTopic });
      setReport("");
      toast.success("Report sent to the operator desk");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send report.");
    } finally {
      setSendingReport(false);
    }
  };

  return (
    <div className="space-y-3.5">
      <SectionHeading
        index="09"
        title="Profile & settings"
        body="Account identity, notification routing, policies and support."
      />

      <Panel eyebrow="Account" bodyClassName="p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary font-mono text-sm font-semibold text-gold">
            {account.photoUrl ? (
              <img
                src={account.photoUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="size-full object-cover"
              />
            ) : (
              initials(account.displayName)
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-[14px] font-semibold">
                {account.displayName}
              </p>
              {account.telegramLinked ? (
                <BadgeCheck className="size-3.5 shrink-0 text-primary" />
              ) : null}
            </div>
            <p className="num mt-0.5 text-[10px] text-muted-foreground">
              {account.nexId}
            </p>
            <p className="mt-0.5 font-mono text-[9px] text-muted-foreground">
              Member since {formatDate(account.createdAt)}
            </p>
          </div>
          <StatusPill tone={account.restricted ? "down" : "up"}>
            {account.restricted ? "Restricted" : "Active"}
          </StatusPill>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/70 pt-3">
          <div>
            <p className="label-xs">Telegram</p>
            <p className="mt-1 flex items-center gap-1.5 text-[11px]">
              <Send className="size-3 text-muted-foreground" />
              {account.telegramLinked
                ? account.username
                  ? `@${account.username}`
                  : "Verified identity"
                : "Not linked"}
            </p>
          </div>
          <div>
            <p className="label-xs">Payout wallet</p>
            <p className="mt-1 flex items-center gap-1.5 text-[11px]">
              <Wallet className="size-3 text-muted-foreground" />
              {account.walletAddress
                ? `${account.walletAddress.slice(0, 5)}…${account.walletAddress.slice(-4)}`
                : "Not linked"}
            </p>
          </div>
          <div>
            <p className="label-xs">Balance</p>
            <p className="num mt-1 text-[11px] text-gold">
              {formatNex(balance.totalNex)} NEX
            </p>
          </div>
          <div>
            <p className="label-xs">Compliance</p>
            <p className="mt-1 text-[11px]">
              {account.complianceCleared ? "Cleared" : "Review pending"}
            </p>
          </div>
        </div>
      </Panel>

      {account.restricted ? (
        <div className="rounded-md border border-down/40 bg-down/[0.06] px-3.5 py-3">
          <p className="text-[12px] font-medium">Account restricted</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {account.restrictionReason ||
              "Mining and withdrawals are frozen. Use the report form below to request a review."}
          </p>
        </div>
      ) : null}

      <div className="grid gap-3.5 lg:grid-cols-2">
        <Panel eyebrow="Identity" title="Display name">
          <label className="label-xs" htmlFor="display-name">
            Public display name
          </label>
          <div className="mt-1.5 flex gap-2">
            <Input
              id="display-name"
              value={displayName}
              maxLength={40}
              onChange={(event) => setDisplayName(event.target.value)}
              className="text-[13px]"
            />
            <Button
              size="sm"
              className="shrink-0 gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em]"
              disabled={
                savingName ||
                displayName.trim().length < 2 ||
                displayName.trim() === account.displayName
              }
              onClick={saveName}
            >
              {savingName ? <Spinner /> : <Save className="size-3" />} Save
            </Button>
          </div>
          <p className="mt-1.5 text-[9.5px] text-muted-foreground">
            Visible to users you refer. 2–40 characters. Your Telegram username is
            managed by Telegram, not editable here.
          </p>
        </Panel>

        <Panel eyebrow="Language" title="Interface language">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => saveLanguage("en")}
              disabled={savingLanguage}
              className={cn(
                "flex items-center justify-between rounded-sm border px-2.5 py-2 text-left transition-colors",
                language === "en"
                  ? "border-primary/50 bg-primary/[0.07]"
                  : "border-border/80 bg-secondary/30",
              )}
            >
              <span>
                <span className="block text-[11.5px] font-medium">English</span>
                <span className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground">
                  default · full
                </span>
              </span>
              <Globe2 className="size-3.5 text-primary" />
            </button>
            <button
              type="button"
              onClick={() => saveLanguage("am")}
              disabled={savingLanguage}
              className={cn(
                "flex items-center justify-between rounded-sm border px-2.5 py-2 text-left transition-colors",
                language === "am"
                  ? "border-primary/50 bg-primary/[0.07]"
                  : "border-border/80 bg-secondary/30",
              )}
            >
              <span>
                <span className="block text-[11.5px] font-medium">አማርኛ</span>
                <span className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground">
                  Amharic · beta
                </span>
              </span>
              <Languages className="size-3.5 text-muted-foreground" />
            </button>
          </div>
          <p className="mt-2 text-[9.5px] leading-relaxed text-muted-foreground">
            The preference is stored server-side. v1 interface copy and policies
            remain in English while the Amharic translation is completed.
          </p>
        </Panel>
      </div>

      <Panel
        eyebrow="Notifications"
        title="Delivery preferences"
        action={<SlidersHorizontal className="size-4 text-muted-foreground" />}
      >
        <div className="space-y-1">
          {PREFERENCES.map((preference) => (
            <div
              key={preference.key}
              className="flex items-center justify-between gap-3 border-b border-border/60 py-2.5 last:border-0"
            >
              <div>
                <p className="text-[11.5px] font-medium">{preference.label}</p>
                <p className="mt-0.5 font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground">
                  push {account.telegramLinked ? "· Telegram" : "· no Telegram link"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {savingPref === preference.key ? (
                  <Spinner className="size-3 text-muted-foreground" />
                ) : null}
                <Switch
                  checked={prefs[preference.key]}
                  onCheckedChange={(value) =>
                    togglePreference(preference.key, value)
                  }
                  aria-label={preference.label}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[9.5px] leading-relaxed text-muted-foreground">
          These switches control Telegram push. In-app notification records are
          always kept so financial events stay auditable. Push requires a linked
          Telegram identity and a configured bot token.
        </p>
      </Panel>

      <div className="grid gap-3.5 lg:grid-cols-2">
        <Panel eyebrow="Policies" title="Terms, privacy & rewards">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="terms">
              <AccordionTrigger className="text-[11.5px]">
                Terms of Service
              </AccordionTrigger>
              <AccordionContent className="text-[10.5px] leading-relaxed text-muted-foreground">
                One NEXPOOL account per person. You are responsible for the tasks
                you complete and the wallet you link. Automated abuse, duplicate
                accounts and fake verification attempts result in restriction.
                NEX is a reward unit, not a security or investment product.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="privacy">
              <AccordionTrigger className="text-[11.5px]">
                Privacy Policy
              </AccordionTrigger>
              <AccordionContent className="text-[10.5px] leading-relaxed text-muted-foreground">
                We store the public Telegram profile fields you share, task
                completion records, mining settlements, your linked payout address
                and notification preferences. Private messages, seed phrases and
                private keys are never requested or stored.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="rewards">
              <AccordionTrigger className="text-[11.5px]">
                Reward and redemption policy
              </AccordionTrigger>
              <AccordionContent className="text-[10.5px] leading-relaxed text-muted-foreground">
                Mining accrues at the configured server rate up to{" "}
                {config.dailyLimitNex} NEX per UTC day. The published target value
                is {`$${config.nexUsdRate.toFixed(2)}`} per NEX, but redemption is
                subject to verified activity, compliance checks and funding of the
                reward pool. It is not a guaranteed exchange rate.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="fees">
              <AccordionTrigger className="text-[11.5px]">
                Fees and withdrawal conditions
              </AccordionTrigger>
              <AccordionContent className="text-[10.5px] leading-relaxed text-muted-foreground">
                Minimum withdrawal is {config.minWithdrawNex} NEX and requires{" "}
                {config.qualifiedReferralTarget} qualified referrals, each with{" "}
                {config.referralTaskTarget} verified tasks. NEXPOOL charges no
                platform withdrawal fee; the operator covers TON network fees.
                Requests may be paused when the treasury or compliance review is
                incomplete.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </Panel>

        <Panel
          eyebrow="Support"
          title="Report a problem"
          action={<HelpCircle className="size-4 text-muted-foreground" />}
        >
          <label className="label-xs" htmlFor="report-topic">
            Topic
          </label>
          <select
            id="report-topic"
            value={reportTopic}
            onChange={(event) => setReportTopic(event.target.value)}
            className="mt-1.5 h-9 w-full rounded-sm border border-input bg-transparent px-2.5 text-[11.5px] outline-none focus-visible:border-ring"
          >
            <option value="general">General question</option>
            <option value="mining">Mining balance</option>
            <option value="task">Task verification</option>
            <option value="referral">Referral progress</option>
            <option value="withdrawal">Withdrawal</option>
            <option value="security">Security or account access</option>
          </select>
          <label className="label-xs mt-3 block" htmlFor="report-body">
            What happened?
          </label>
          <Textarea
            id="report-body"
            value={report}
            onChange={(event) => setReport(event.target.value)}
            placeholder="Include the NEX amount, task name or transaction hash where relevant."
            className="mt-1.5 min-h-20 text-[11.5px]"
            maxLength={2000}
          />
          <div className="mt-1 flex items-center justify-between">
            <span className="font-mono text-[8.5px] text-muted-foreground">
              {report.length}/2000
            </span>
            <Button
              size="sm"
              className="gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em]"
              disabled={sendingReport || report.trim().length < 10}
              onClick={submitReport}
            >
              {sendingReport ? <Spinner /> : <Send className="size-3" />} Send report
            </Button>
          </div>
          <p className="mt-2 text-[9px] leading-relaxed text-muted-foreground">
            Reports are written to the operator audit trail. Financial corrections
            are only made after backend review — never from a chat message alone.
          </p>
        </Panel>
      </div>

      <Panel eyebrow="Sections" title="Wallet & support shortcuts">
        <div className="grid gap-1 sm:grid-cols-3">
          {[
            { to: "/app/deposit", label: "Deposit", hint: "Buy NEX with TON" },
            { to: "/app/history", label: "History", hint: "Ledger and payouts" },
            { to: "/app/help", label: "Help & support", hint: "Rules and FAQ" },
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center justify-between gap-2 rounded-sm border border-border/70 px-2.5 py-2 transition-colors hover:border-primary/40 hover:bg-secondary/40"
            >
              <span className="min-w-0">
                <span className="block text-[12px] font-medium">{item.label}</span>
                <span className="block font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">
                  {item.hint}
                </span>
              </span>
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </Panel>

      <Panel eyebrow="Security" title="Session and access">
        <div className="space-y-2">
          <div className="flex items-center justify-between border-b border-border/60 py-1.5">
            <span className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
              <ShieldCheck className="size-3.5" /> Wallet keys
            </span>
            <span className="text-[10.5px]">Never requested</span>
          </div>
          <div className="flex items-center justify-between border-b border-border/60 py-1.5">
            <span className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
              <UserRound className="size-3.5" /> Session
            </span>
            <span className="num text-[10px]">
              {account.telegramLinked
                ? `Telegram ${formatDateTime(account.createdAt)}`
                : "Convex auth session"}
            </span>
          </div>
        </div>
        <Link
          to="/admin"
          className="mt-3 flex items-center justify-between rounded-sm border border-warn/40 bg-warn/[0.05] px-2.5 py-2"
        >
          <span className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-warn">
            <ShieldCheck className="size-3.5" /> Operator console
            {account.isAdmin ? null : (
              <span className="text-muted-foreground">· not claimed</span>
            )}
          </span>
          <ChevronRight className="size-3.5 text-warn" />
        </Link>
        <p className="mt-3 font-mono text-[9px] leading-relaxed uppercase tracking-[0.1em] text-muted-foreground">
          This session is tied to your Telegram account. Close the mini app to
          end it — reopening returns you to the same NEXPOOL account.
        </p>
      </Panel>

      <p className="pb-2 text-center font-mono text-[8.5px] uppercase leading-relaxed tracking-[0.12em] text-muted-foreground">
        NEXPOOL v1 · server-side mining, verification and payout controls
        <br />
        Target value {`$${config.nexUsdRate.toFixed(2)}`} per NEX · not a guarantee
      </p>
    </div>
  );
}
