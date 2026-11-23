import { useState } from "react";
import { useMutation } from "convex/react";
import {
  Check,
  Copy,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Panel, StatusPill } from "@/components/app/parts";
import { openExternal } from "@/lib/telegram";
import { cn } from "@/lib/utils";

const CONSENT_KEY = "nexpool.invite.consent.v1";

function consentSeen() {
  try {
    return window.localStorage.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberConsent() {
  try {
    window.localStorage.setItem(CONSENT_KEY, "1");
  } catch {
    // Consent still applies for this session if storage is unavailable.
  }
}

type Props = {
  link: string;
  displayName: string;
  qualified: number;
  pending: number;
  inProgress: number;
  taskTarget: number;
  shares: { total: number; lastAt: number | null };
};

/**
 * Consent-based "invite all" flow.
 *
 * Telegram does not expose a user's address book to Mini Apps, and a bot cannot
 * message contacts on the user's behalf. The only supported bulk path is
 * Telegram's own share sheet, where the user selects recipients personally. We
 * prepare the message server-side, record that the sheet was opened, and never
 * claim a delivery Telegram did not confirm.
 */
export function InviteAllCard({
  link,
  displayName,
  qualified,
  pending,
  inProgress,
  taskTarget,
  shares,
}: Props) {
  const recordShare = useMutation(api.referrals.recordShareOpen);
  const [showConsent, setShowConsent] = useState(
    () => !consentSeen(),
  );
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = displayName.trim() || "A NEXPOOL miner";
  const invitation = `🚀 ${name} invited you to NEXPOOL!\n\nJoin NEXPOOL, explore its features, complete tasks and earn rewards.\n\n🎁 Register using your friend's personal invitation link:\n${link}`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(
    link,
  )}&text=${encodeURIComponent(
    `🚀 ${name} invited you to NEXPOOL!\n\nJoin NEXPOOL, explore its features, complete tasks and earn rewards.\n\n🎁 Register using your friend's personal invitation link:`,
  )}`;

  const openShare = async () => {
    setError(null);
    setShowConsent(false);
    rememberConsent();
    try {
      await recordShare({ method: "share_sheet" });
    } catch {
      // Analytics must never block the user from inviting.
    }
    try {
      openExternal(shareUrl);
      setOpenedAt(Date.now());
    } catch {
      setError("Telegram could not open the share sheet. Copy the message instead.");
    }
  };

  const copyInvitation = async () => {
    setError(null);
    try {
      await navigator.clipboard.writeText(invitation);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
      await recordShare({ method: "copy" });
    } catch {
      setError("Clipboard access was blocked. Select the text below and copy it manually.");
    }
  };

  return (
    <Panel
      eyebrow="One tap"
      title="Invite all contacts"
      action={
        <StatusPill tone={shares.total > 0 ? "up" : "muted"}>
          {shares.total} share{shares.total === 1 ? "" : "s"}
        </StatusPill>
      }
      bodyClassName="space-y-3"
    >
      {showConsent ? (
        <div className="space-y-2.5">
          <div className="flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/[0.05] px-3 py-2.5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="space-y-1.5 text-[10.5px] leading-relaxed text-foreground/90">
              <p className="font-medium text-foreground">
                Telegram does not let apps read your contact list.
              </p>
              <p className="text-muted-foreground">
                No permission prompt can change that, and NEXPOOL will not send
                messages from your account. Instead, the next step opens
                Telegram&apos;s own share sheet, where you pick the chats and
                groups that receive your invitation — you can select several at
                once, and nothing is sent until you confirm.
              </p>
              <p className="text-muted-foreground">
                Every invitation carries your permanent referral link. A
                registration is recorded only if someone opens that link and
                starts the bot.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              className="gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em]"
              onClick={openShare}
            >
              <Send className="size-3.5" /> Continue to Telegram
            </Button>
            <Button
              type="button"
              variant="outline"
              className="font-mono text-[10px] uppercase tracking-[0.1em]"
              onClick={() => setShowConsent(false)}
            >
              Not now
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              className="gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em]"
              onClick={openShare}
            >
              <Users className="size-3.5" /> Invite all contacts
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em]"
              onClick={copyInvitation}
            >
              {copied ? <Check className="size-3.5 text-up" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy invitation"}
            </Button>
          </div>

          <div className="rounded-xl border border-border/70 bg-background/50 p-3">
            <p className="label-xs">Invitation preview</p>
            <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-relaxed text-foreground/90">
              {invitation}
            </p>
          </div>

          {openedAt ? (
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Share sheet opened. Telegram does not report who received it, so a
              share is counted here but never treated as a joined referral —
              those appear when someone actually starts with your link.
            </p>
          ) : (
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              You choose the recipients in Telegram. Your link is the same for
              everyone, so attribution stays exact and duplicates are rejected by
              the backend.
            </p>
          )}

          <button
            type="button"
            onClick={() => setShowConsent(true)}
            className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            How sharing works
          </button>
        </>
      )}

      {error ? (
        <p className="text-[10px] leading-relaxed text-warn">{error}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 pt-2.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
        <span>{qualified} qualified</span>
        <span>{inProgress} in progress</span>
        <span>{pending} pending</span>
        <span>needs {taskTarget} verified tasks</span>
        <span className={cn(shares.total > 0 && "text-foreground/80")}>
          {shares.total} share{shares.total === 1 ? "" : "s"} opened
        </span>
      </div>
    </Panel>
  );
}
