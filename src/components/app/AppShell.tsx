import { BrandMark } from "@/components/Brand";
import { MiningPopupsProvider } from "@/components/app/MiningPopups";
import { LoadingBlock, StatusPill, formatNex } from "@/components/app/parts";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import {
  getTelegram,
  initTelegram,
  peekReferral,
  rememberReferral,
  takeReferral,
  telegramStartParam,
} from "@/lib/telegram";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Bell,
  CircleHelp,
  History as HistoryIcon,
  House,
  Pickaxe,
  ShieldCheck,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";

/** The primary tabs shown in the mobile bottom bar. */
const NAV = [
  { to: "/app", label: "Home", icon: House, end: true },
  { to: "/app/earn", label: "Earn", icon: Pickaxe, end: false },
  { to: "/app/community", label: "Community", icon: Users, end: false },
  { to: "/app/wallet", label: "Wallet", icon: Wallet, end: false },
  { to: "/app/profile", label: "Profile", icon: UserRound, end: false },
];

/** Sections that open from Home, Wallet or Profile rather than the bottom bar. */
const ACCOUNT_NAV = [
  { to: "/app/deposit", label: "Deposit", icon: ArrowDownToLine },
  { to: "/app/withdraw", label: "Withdraw", icon: ArrowUpRight },
  { to: "/app/history", label: "History", icon: HistoryIcon },
  { to: "/app/help", label: "Help & support", icon: CircleHelp },
  { to: "/app/notifications", label: "Notifications", icon: Bell },
  { to: "/admin", label: "Operator console", icon: ShieldCheck },
];

const TITLES: Record<string, string> = {
  "/app": "Home",
  "/app/earn": "Earn",
  "/app/earn/mining": "Mining engine",
  "/app/earn/tasks": "Tasks & missions",
  "/app/community": "Community",
  "/app/community/referrals": "Referral desk",
  "/app/community/levels": "Levels & achievements",
  "/app/community/leaderboard": "Leaderboards",
  "/app/wallet": "Wallet",
  "/app/deposit": "Deposit",
  "/app/withdraw": "Withdraw",
  "/app/history": "History",
  "/app/help": "Help & support",
  "/app/profile": "Profile",
  "/app/notifications": "Notifications",
};

function MiningPill({ state }: { state: string }) {
  if (state === "ACTIVE" || state === "BACKGROUND_ACTIVE")
    return <StatusPill tone="up">Mining live</StatusPill>;
  if (state === "CAP_REACHED")
    return <StatusPill tone="gold">Daily cap</StatusPill>;
  if (state === "PAUSED") return <StatusPill tone="down">Paused</StatusPill>;
  return <StatusPill tone="muted">Mining idle</StatusPill>;
}

function SidebarBody() {
  const snapshot = useQuery(api.app.snapshot);

  return (
    <div className="flex h-full flex-col bg-sidebar/95">
      <div className="flex h-[76px] items-center gap-2.5 px-5">
        <span className="flex size-9 items-center justify-center rounded-xl border border-primary/25 bg-primary/10">
          <BrandMark className="text-primary" />
        </span>
        <div className="leading-none">
          <p className="font-display text-[15px] font-bold tracking-[0.16em]">
            NEXPOOL
          </p>
          <p className="mt-1.5 font-mono text-[8px] uppercase tracking-[0.2em] text-muted-foreground">
            rewards account
          </p>
        </div>
        <span className="ml-auto size-2 animate-signal-pulse rounded-full bg-up" />
      </div>

      <div className="mx-3 rounded-2xl border border-border/70 bg-card/70 px-4 py-4">
        <p className="label-xs">Portfolio balance</p>
        <p className="num gold-ink mt-2 text-[27px] font-semibold leading-none">
          {snapshot ? formatNex(snapshot.balance.totalNex) : "—"}
          <span className="ml-1.5 font-sans text-[10px] font-medium tracking-normal text-muted-foreground">
            NEX
          </span>
        </p>
        <div className="mt-3 flex items-center gap-1.5">
          {snapshot ? <MiningPill state={snapshot.mining.state} /> : null}
          <span className="font-mono text-[8.5px] text-muted-foreground">
            {snapshot?.account.nexId ?? ""}
          </span>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
        <p className="label-xs px-3 pb-2">Main</p>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold transition-all",
                isActive
                  ? "bg-white/[0.07] text-foreground"
                  : "text-muted-foreground hover:bg-white/[0.035] hover:text-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg border transition-colors",
                    isActive
                      ? "border-primary/25 bg-primary/12 text-primary"
                      : "border-transparent text-muted-foreground",
                  )}
                >
                  <item.icon className="size-4" />
                </span>
                {item.label}
                {isActive ? (
                  <span className="ml-auto size-1.5 rounded-full bg-primary" aria-hidden="true" />
                ) : null}
              </>
            )}
          </NavLink>
        ))}

        <p className="label-xs px-3 pt-6 pb-2">Account</p>
        {ACCOUNT_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[12px] font-medium transition-all",
                isActive
                  ? "bg-white/[0.055] text-foreground"
                  : "text-muted-foreground hover:bg-white/[0.035] hover:text-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={cn(
                    "size-4",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )}
                />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.035] px-2.5 py-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gold/25 bg-gold/10 font-mono text-[10px] font-semibold text-gold">
            {snapshot?.account.photoUrl ? (
              <img
                src={snapshot.account.photoUrl}
                alt={snapshot.account.displayName}
                referrerPolicy="no-referrer"
                className="size-full object-cover"
              />
            ) : (
              (snapshot?.account.displayName.slice(0, 2).toUpperCase() ?? "NX")
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11.5px] font-medium">
              {snapshot?.account.displayName ?? "NEX miner"}
            </p>
            <p className="truncate font-mono text-[9px] text-muted-foreground">
              {snapshot?.account.username
                ? `@${snapshot.account.username}`
                : snapshot?.account.nexId}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AppShell() {
  const location = useLocation();
  const snapshot = useQuery(api.app.snapshot);
  const ensure = useMutation(api.app.ensure);
  const heartbeatMining = useMutation(api.app.heartbeatMining);
  const stopMining = useMutation(api.app.stopMining);
  const linkTelegram = useAction(api.telegram.linkTelegram);
  const booting = useRef(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const bootstrap = async () => {
    const startParam = telegramStartParam();
    const urlRef = new URLSearchParams(window.location.search).get("ref");
    const code = startParam || urlRef || takeReferral() || peekReferral();
    // Keep the code across a slow Telegram handshake or an auth retry; it is
    // consumed by the backend's idempotent referral record, not by the UI.
    if (code) rememberReferral(code);
    await ensure({
      referralCode: code ?? undefined,
    });
    // Opening NEXPOOL does not authorize mining. The user must press Start
    // Mining in Earn, even after a new UTC day resets the daily allowance.
  };

  useEffect(() => {
    initTelegram();
    if (booting.current) return;
    booting.current = true;
    bootstrap()
      .catch((error) => {
        setBootError(
          error instanceof Error ? error.message : "Could not open your account.",
        );
      })
      .finally(() => setRetrying(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const miningLive = Boolean(
    !snapshot?.mining.manuallyPaused &&
      (snapshot?.mining.sessionActive ||
        snapshot?.mining.extensionActive ||
        snapshot?.mining.backgroundSessionPending),
  );
  useEffect(() => {
    if (!miningLive) return;
    if (document.visibilityState === "visible") {
      heartbeatMining().catch(() => undefined);
    }
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      heartbeatMining().catch(() => undefined);
    }, 30_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        heartbeatMining().catch(() => undefined);
      } else {
        stopMining().catch(() => undefined);
      }
    };
    const onPageHide = () => {
      stopMining().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [heartbeatMining, miningLive, stopMining]);

  // Keeps the NEXPOOL profile bound to the verified Telegram identity. It
  // retries while the session settles and stops as soon as the snapshot reports
  // a linked telegramId, so name, @handle and avatar always come from Telegram.
  const telegramLinked = snapshot?.account.telegramLinked ?? false;
  useEffect(() => {
    if (telegramLinked) return;
    const initData = getTelegram()?.initData;
    if (!initData) return;
    let cancelled = false;
    let tries = 0;
    const attempt = async () => {
      tries += 1;
      try {
        await linkTelegram({ initData });
      } catch {
        /* session not visible to the action yet */
      }
      if (!cancelled && tries < 5) {
        window.setTimeout(attempt, 500 * tries);
      }
    };
    void attempt();
    return () => {
      cancelled = true;
    };
  }, [linkTelegram, telegramLinked]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [location.pathname]);

  const retry = () => {
    setRetrying(true);
    setBootError(null);
    bootstrap()
      .catch((error) =>
        setBootError(error instanceof Error ? error.message : "Still unavailable."),
      )
      .finally(() => setRetrying(false));
  };

  if (!snapshot) {
    return (
      <div className="min-h-[100dvh] bg-background">
        <div className="mx-auto w-full max-w-[1120px] px-4 py-8">
          <div className="mb-5 flex items-center gap-2">
            <BrandMark className="text-primary" />
            <span className="font-mono text-xs tracking-[0.2em]">NEXPOOL</span>
          </div>
          {bootError ? (
            <div className="rounded-md border border-warn/40 bg-warn/5 p-4">
              <p className="text-[13px] font-medium">Account bootstrap failed</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                {bootError}
              </p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Backend: Convex · nothing was simulated
              </p>
              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                onClick={retry}
                disabled={retrying}
              >
                {retrying ? "Retrying…" : "Retry bootstrap"}
              </Button>
            </div>
          ) : (
            <LoadingBlock rows={4} />
          )}
        </div>
      </div>
    );
  }

  const title = TITLES[location.pathname] ?? "NEXPOOL";

  return (
    <MiningPopupsProvider>
      <div className="min-h-[100dvh] bg-background text-foreground">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] border-r border-sidebar-border lg:block">
        <SidebarBody />
      </aside>

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-30 nav-blur safe-top">
          <div className="mx-auto flex h-[62px] w-full max-w-[1180px] items-center gap-2.5 px-4 lg:h-[72px] lg:px-8">
            <div className="flex items-center gap-2.5 lg:hidden">
              <span className="flex size-8 items-center justify-center rounded-xl border border-primary/25 bg-primary/10">
                <BrandMark className="size-4 text-primary" />
              </span>
              <span className="font-display text-[12px] font-bold tracking-[0.17em]">
                NEXPOOL
              </span>
            </div>
            <div className="hidden min-w-0 items-center gap-4 lg:flex">
              <span className="text-[15px] font-semibold tracking-tight">
                {title}
              </span>
              <span className="h-4 w-px bg-border" />
              <span className="num text-[12px] font-medium text-gold">
                {formatNex(snapshot.balance.totalNex)} NEX
              </span>
            </div>
            <span className="ml-auto flex items-center gap-2">
              <MiningPill state={snapshot.mining.state} />
            </span>
            <span className="hidden rounded-full border border-border/80 bg-white/[0.02] px-2.5 py-1 font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground sm:block">
              {snapshot.account.nexId}
            </span>
            <NavLink
              to="/app/notifications"
              aria-label="Notifications"
              className="relative flex size-9 items-center justify-center rounded-full border border-border/80 bg-white/[0.02] text-muted-foreground transition-colors hover:text-foreground"
            >
              <Bell className="size-4" />
              {snapshot.notifications.unread > 0 ? (
                <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary font-mono text-[8px] font-bold text-primary-foreground ring-2 ring-background">
                  {Math.min(9, snapshot.notifications.unread)}
                </span>
              ) : null}
            </NavLink>
            <NavLink
              to="/app/profile"
              aria-label="Profile"
              className="flex size-9 items-center justify-center overflow-hidden rounded-full border border-gold/25 bg-gold/10 font-mono text-[9px] font-semibold text-gold transition-opacity hover:opacity-80"
            >
              {snapshot.account.photoUrl ? (
                <img
                  src={snapshot.account.photoUrl}
                  alt={snapshot.account.displayName}
                  referrerPolicy="no-referrer"
                  className="size-full object-cover"
                />
              ) : (
                snapshot.account.displayName.slice(0, 2).toUpperCase()
              )}
            </NavLink>
          </div>
        </header>

        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto w-full max-w-[1180px] px-4 pt-5 pb-32 sm:px-5 lg:px-8 lg:pt-8 lg:pb-14"
        >
          <Outlet />
        </motion.main>
      </div>

        <nav
          aria-label="Main navigation"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 nav-blur bottom-nav lg:hidden"
        >
          <div className="mx-auto grid max-w-xl grid-cols-5 px-2">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "relative flex flex-col items-center gap-1 rounded-2xl py-2.5 text-[9px] font-semibold transition-all",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        "flex h-7 min-w-10 items-center justify-center rounded-full transition-all",
                        isActive ? "bg-primary/12" : "bg-transparent",
                      )}
                    >
                      <item.icon className="size-[19px]" strokeWidth={isActive ? 2.2 : 1.8} />
                    </span>
                    <span className="tracking-[0.01em]">{item.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </MiningPopupsProvider>
  );
}
