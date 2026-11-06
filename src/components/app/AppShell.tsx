import { BrandMark } from "@/components/Brand";
import { LoadingBlock, StatusPill, formatNex } from "@/components/app/parts";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import {
  getTelegram,
  initTelegram,
  peekReferral,
  takeReferral,
  telegramStartParam,
} from "@/lib/telegram";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Bell,
  CircleHelp,
  Gauge,
  History as HistoryIcon,
  LayoutDashboard,
  ListChecks,
  ShieldCheck,
  Trophy,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";

/** The five primary tabs — the only items in the mobile bottom bar. */
const NAV = [
  { to: "/app", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/app/mining", label: "Mining", icon: Gauge, end: false },
  { to: "/app/tasks", label: "Tasks", icon: ListChecks, end: false },
  { to: "/app/levels", label: "Levels", icon: Trophy, end: false },
  { to: "/app/referrals", label: "Referrals", icon: Users, end: false },
  { to: "/app/wallet", label: "Wallet", icon: Wallet, end: false },
];

/** Sections that open from Home, Wallet or Profile rather than the bottom bar. */
const ACCOUNT_NAV = [
  { to: "/app/deposit", label: "Deposit", icon: ArrowDownToLine },
  { to: "/app/withdraw", label: "Withdraw", icon: ArrowUpRight },
  { to: "/app/history", label: "History", icon: HistoryIcon },
  { to: "/app/help", label: "Help & support", icon: CircleHelp },
  { to: "/app/notifications", label: "Notifications", icon: Bell },
  { to: "/app/profile", label: "Profile", icon: UserRound },
  { to: "/admin", label: "Operator console", icon: ShieldCheck },
];

const TITLES: Record<string, string> = {
  "/app": "Dashboard",
  "/app/mining": "Mining engine",
  "/app/tasks": "Task centre",
  "/app/levels": "Progression",
  "/app/referrals": "Referral desk",
  "/app/wallet": "Wallet",
  "/app/deposit": "Deposit",
  "/app/withdraw": "Withdraw",
  "/app/history": "History",
  "/app/help": "Help & support",
  "/app/profile": "Profile",
  "/app/notifications": "Notifications",
};

function MiningPill({
  status,
}: {
  status: "active" | "paused" | "limit" | "restricted";
}) {
  if (status === "active")
    return <StatusPill tone="up">Mining live</StatusPill>;
  if (status === "limit") return <StatusPill tone="warn">Daily cap</StatusPill>;
  if (status === "restricted")
    return <StatusPill tone="down">Restricted</StatusPill>;
  return <StatusPill tone="muted">Paused</StatusPill>;
}

function SidebarBody() {
  const snapshot = useQuery(api.app.snapshot);

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-4">
        <BrandMark className="text-primary" />
        <div className="leading-none">
          <p className="font-mono text-[13px] font-bold tracking-[0.18em]">
            NEXPOOL
          </p>
          <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.28em] text-muted-foreground">
            rewards desk
          </p>
        </div>
        <span className="ml-auto size-1.5 animate-signal-pulse rounded-full bg-up" />
      </div>

      <div className="border-b border-sidebar-border px-4 py-3.5">
        <p className="label-xs">Confirmed balance</p>
        <p className="num mt-1 text-xl font-semibold text-gold">
          {snapshot ? formatNex(snapshot.balance.totalNex) : "—"}
          <span className="ml-1 font-mono text-[10px] text-muted-foreground">
            NEX
          </span>
        </p>
        <div className="mt-2 flex items-center gap-1.5">
          {snapshot ? <MiningPill status={snapshot.mining.status} /> : null}
          <span className="font-mono text-[9px] text-muted-foreground">
            {snapshot?.account.nexId ?? ""}
          </span>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        <p className="label-xs px-2 pt-2 pb-2">Mining account</p>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "group relative flex items-center gap-2.5 rounded-sm border-l-2 px-3 py-2.5 font-mono text-[10.5px] uppercase tracking-[0.12em] transition-colors",
                isActive
                  ? "border-primary bg-sidebar-accent text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={cn(
                    "size-3.5",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )}
                />
                {item.label}
                {isActive ? (
                  <span className="ml-auto size-1 bg-primary" aria-hidden="true" />
                ) : null}
              </>
            )}
          </NavLink>
        ))}

        <p className="label-xs px-2 pt-4 pb-2">Account</p>
        {ACCOUNT_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "group relative flex items-center gap-2.5 rounded-sm border-l-2 px-3 py-2.5 font-mono text-[10.5px] uppercase tracking-[0.12em] transition-colors",
                isActive
                  ? "border-primary bg-sidebar-accent text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={cn(
                    "size-3.5",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )}
                />
                {item.label}
              </>
            )}
          </NavLink>
        ))}

      </nav>

      <div className="border-t border-sidebar-border p-2">
        <div className="flex items-center gap-2 px-1 py-1">
          <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden border border-sidebar-border bg-panel font-mono text-[10px] font-semibold text-gold">
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
  const startMining = useMutation(api.app.startMining);
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
    await ensure({
      referralCode: code ?? undefined,
    });
    // Mining runs only while this Mini App is open and visible. Starting here
    // also prevents a closed app from earning the time it was away.
    await startMining().catch(() => undefined);
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

  useEffect(() => {
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
  }, [heartbeatMining, stopMining]);

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
    <div className="min-h-[100dvh] bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] border-r border-sidebar-border lg:block">
        <SidebarBody />
      </aside>

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-30 border-b border-border/80 nav-blur safe-top">
          <div className="mx-auto flex h-12 w-full max-w-[1120px] items-center gap-3 px-4 lg:h-14 lg:px-7">
            <div className="flex items-center gap-2 lg:hidden">
              <BrandMark className="size-5 text-primary" />
              <span className="font-mono text-[11px] font-bold tracking-[0.18em]">
                NEXPOOL
              </span>
            </div>
            <div className="hidden min-w-0 items-center gap-3 lg:flex">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {title}
              </span>
              <span className="h-3 w-px bg-border" />
              <span className="num text-[11px] text-gold">
                {formatNex(snapshot.balance.totalNex)} NEX
              </span>
            </div>
            <span className="ml-auto flex items-center gap-2 lg:hidden">
              <MiningPill status={snapshot.mining.status} />
            </span>
            <span className="hidden lg:flex">
              <MiningPill status={snapshot.mining.status} />
            </span>
            <span className="num ml-1 hidden border border-border px-2 py-1 text-[9px] uppercase tracking-[0.1em] text-muted-foreground sm:block">
              {snapshot.account.nexId}
            </span>
            <NavLink
              to="/app/notifications"
              aria-label="Notifications"
              className="relative flex size-8 items-center justify-center rounded-sm border border-border/80 text-muted-foreground transition-colors hover:text-foreground"
            >
              <Bell className="size-3.5" />
              {snapshot.notifications.unread > 0 ? (
                <span className="absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-primary font-mono text-[8px] font-bold text-primary-foreground">
                  {Math.min(9, snapshot.notifications.unread)}
                </span>
              ) : null}
            </NavLink>
            <NavLink
              to="/app/profile"
              aria-label="Profile"
              className="flex size-8 items-center justify-center overflow-hidden rounded-sm border border-border/80 font-mono text-[9px] font-semibold text-gold transition-colors hover:text-foreground lg:hidden"
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

        <main className="mx-auto w-full max-w-[1120px] px-4 pt-4 pb-28 sm:px-5 lg:px-7 lg:pt-6 lg:pb-12">
          <Outlet />
        </main>
      </div>

      <nav
        aria-label="Main navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 nav-blur bottom-nav lg:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-6">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "relative flex flex-col items-center gap-1 py-2 transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive ? (
                    <span className="absolute top-0 h-[2px] w-6 rounded-full bg-primary" />
                  ) : null}
                  <item.icon className="size-[18px]" />
                  <span className="font-mono text-[8.5px] uppercase tracking-[0.08em]">
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
