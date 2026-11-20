import { BrandMark } from "@/components/Brand";
import { BootSplash } from "@/components/app/BootSplash";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { friendlyError } from "@/lib/errors";
import { getTelegram, initTelegram } from "@/lib/telegram";
import { useAuthActions } from "@convex-dev/auth/react";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

const STEPS = [
  "Reading Telegram session",
  "Validating initData signature",
  "Opening mining account",
];

/**
 * NEXPOOL is a Telegram Mini App: there is no landing page and no email form.
 * The app opens straight into the account of the Telegram user who launched
 * it. The backend validates Telegram's initData HMAC before any session is
 * created, so the identity cannot be spoofed from the client.
 *
 * Outside Telegram (browser preview) there is no initData, so the gate opens a
 * real anonymous backend session instead of showing a dead screen. When the
 * same build runs inside Telegram it signs in with the verified Telegram
 * account instead.
 */
export function TelegramSessionGate({ children }: { children: ReactNode }) {
  const online = useOnlineStatus();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.currentUser);
  const { signIn, signOut } = useAuthActions();
  const linkTelegram = useAction(api.telegram.linkTelegram);
  const telegramPresent = Boolean(getTelegram());
  const attempted = useRef<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    initTelegram();
  }, []);

  useEffect(() => {
    if (isLoading) return;
    const initData = getTelegram()?.initData ?? "";
    // Do not silently keep or create an anonymous account when this page is
    // running inside Telegram but the webview did not provide signed initData.
    // A real Telegram-auth session without initData can still use the app;
    // an anonymous one must stop here so the linking failure is visible.
    if (telegramPresent && !initData) {
      if (!isAuthenticated || !user || user.isAnonymous) return;
    }
    if (isAuthenticated && user !== null) {
      if (user === undefined) return;
      // An anonymous preview session that is now running inside Telegram is
      // replaced by the verified Telegram account.
      if (!user?.isAnonymous || !initData) return;
    }

    const key = isAuthenticated
      ? `upgrade:${initData}`
      : `signin:${attempt}:${initData ? "telegram" : "preview"}`;
    if (attempted.current === key) return;
    attempted.current = key;

    setError(null);
    setStep(initData ? 1 : 0);
    const timer = window.setTimeout(() => setStep(2), 700);

    const linkWithRetry = async () => {
      // This action writes the verified Telegram profile onto the current
      // NEXPOOL account and attaches the Telegram auth account. It is retried
      // while a freshly created session propagates.
      let lastReason =
        "The verified Telegram identity could not be attached to this account.";
      for (let attemptIndex = 0; attemptIndex < 6; attemptIndex += 1) {
        try {
          const result = await linkTelegram({ initData });
          if (result.linked) return;
          lastReason = result.reason ?? lastReason;
        } catch (cause) {
          lastReason = cause instanceof Error ? cause.message : lastReason;
        }
        await new Promise((resolve) =>
          window.setTimeout(resolve, 400 * (attemptIndex + 1)),
        );
      }
      throw new Error(`Telegram account linking failed: ${lastReason}`);
    };

    // The auth JWT can outlive the NEXPOOL user row after a canonical merge.
    // Clear that stale session and sign in again so the Telegram numeric ID
    // resolves to the surviving profile instead of rendering a profileless app.
    if (isAuthenticated && user === null) {
      if (!initData) return;
      const key = `recover:${initData}`;
      if (attempted.current === key) return;
      attempted.current = key;
      setError(null);
      setStep(2);
      window.clearTimeout(timer);
      signOut()
        .then(() => signIn("telegram", { initData }))
        .then(linkWithRetry)
        .catch((cause: unknown) =>
          setError(
            cause instanceof Error
              ? cause.message
              : "The recovered account could not be restored.",
          ),
        );
      return;
    }

    const flow = initData
      ? isAuthenticated && user?.isAnonymous
        ? // Attach the verified Telegram auth account to the current anonymous
          // user. Do not sign in first: that would create a new NEX ID and
          // orphan this account. The linked account is used on future sign-ins.
          linkWithRetry()
        : signIn("telegram", { initData }).then(linkWithRetry)
      : signIn("anonymous");

    flow
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Telegram sign-in could not be completed.",
        ),
      )
      .finally(() => window.clearTimeout(timer));

    return () => window.clearTimeout(timer);
  }, [
    isLoading,
    isAuthenticated,
    user,
    attempt,
    signIn,
    signOut,
    linkTelegram,
    telegramPresent,
  ]);

  const missingTelegramSession =
    !isLoading && telegramPresent && !getTelegram()?.initData;

  if (
    missingTelegramSession &&
    (!isAuthenticated || user?.isAnonymous)
  ) {
    return (
      <SessionScreen
        eyebrow="AUTH · TELEGRAM"
        title="Telegram session missing"
        body="This page is running inside Telegram, but Telegram did not provide signed initData. Open NEXPOOL from @NEXPOOLBOT's menu button or its Open App button instead of a copied browser link."
        footer={
          <div className="space-y-2">
            <Button className="w-full" onClick={() => window.location.reload()}>
              Retry Telegram launch
            </Button>
            <p className="font-mono text-[10px] leading-relaxed uppercase tracking-[0.1em] text-muted-foreground">
              No anonymous account or balance is created while this is unresolved.
            </p>
          </div>
        }
      />
    );
  }

  const staleSession = !isLoading && isAuthenticated && user === null;
  if (staleSession && !getTelegram()?.initData) {
    return (
      <SessionScreen
        eyebrow="AUTH · RECOVERY"
        title="Session no longer has an account"
        body="This session belonged to an account that was reconciled into another NEXPOOL account. Reopen NEXPOOL from @NEXPOOLBOT so the verified Telegram identity can open your canonical account."
        footer={
          <div className="space-y-2">
            <Button className="w-full" onClick={() => window.location.reload()}>
              Reopen Telegram session
            </Button>
            <p className="font-mono text-[10px] leading-relaxed uppercase tracking-[0.1em] text-muted-foreground">
              No new account is created from a stale session.
            </p>
          </div>
        }
      />
    );
  }

  if (staleSession) {
    return (
      <SessionScreen
        eyebrow="AUTH · RECOVERY"
        title="Restoring your canonical account"
        body="The verified Telegram numeric ID is opening the surviving NEXPOOL account and retiring this old session."
        footer={
          <div className="h-0.5 w-full overflow-hidden bg-border">
            <div className="h-full w-1/3 animate-signal-pulse bg-primary" />
          </div>
        }
      />
    );
  }

  if (error) {
    return (
      <SessionScreen
        eyebrow="AUTH · FAILED"
        title="Telegram handshake failed"
        body={friendlyError(error)}
        footer={
          <div className="space-y-2">
            <Button
              className="w-full"
              onClick={() => {
                attempted.current = null;
                setError(null);
                setAttempt((value) => value + 1);
              }}
            >
              Retry handshake
            </Button>
            <p className="font-mono text-[10px] leading-relaxed uppercase tracking-[0.1em] text-muted-foreground">
              Open NEXPOOL from your Telegram bot so a signed initData payload
              is present. Browser tabs have no Telegram identity.
            </p>
          </div>
        }
      />
    );
  }

  if (isLoading || !isAuthenticated || user === undefined) {
    // Progressive, honest startup: the branded screen names the real handshake
    // stage. It never shortens authentication to make the UI appear faster.
    const stageIndex = Math.min(2, Math.max(0, step)) as 0 | 1 | 2;
    return (
      <BootSplash
        stage={stageIndex}
        offline={!online}
        detail={
          !online
            ? "NEXPOOL is waiting for your connection. Your account is untouched."
            : STEPS[stageIndex]
        }
      />
    );
  }

  return children;
}

function SessionScreen({
  eyebrow,
  title,
  body,
  footer,
}: {
  eyebrow: string;
  title: string;
  body: string;
  footer: ReactNode;
}) {
  return (
    <main className="safe-top safe-bottom relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-background px-5 py-10">
      <div className="terminal-grid pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <BrandMark className="size-8 text-primary" />
          <div className="leading-none">
            <p className="font-mono text-sm font-bold tracking-[0.18em]">
              NEXPOOL
            </p>
            <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.3em] text-muted-foreground">
              mining terminal
            </p>
          </div>
          <span className="ml-auto flex items-center gap-1.5 border border-border px-2 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-muted-foreground">
            <Loader2 className="size-2.5 animate-spin text-primary" />
            live
          </span>
        </div>

        <div className="border border-border bg-card/80 p-4">
          <p className="label-xs text-primary">{eyebrow}</p>
          <h1 className="mt-2 text-[17px] leading-tight font-semibold">
            {title}
          </h1>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
            {body}
          </p>
          <div className="mt-4 border-t border-border pt-3">{footer}</div>
        </div>

        <div className="mt-3 flex items-center justify-between font-mono text-[8px] uppercase tracking-[0.16em] text-muted-foreground">
          <span>server-authoritative mining</span>
          <span>v1</span>
        </div>
      </div>
    </main>
  );
}
