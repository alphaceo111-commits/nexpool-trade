import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  Activity,
  Bot,
  Cpu,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { Brand } from "@/components/Brand";
import { StatusDot } from "@/components/console/parts";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const NAV = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/dashboard/workers", label: "Workers", icon: Cpu, end: false },
  { to: "/dashboard/payouts", label: "Payouts", icon: Wallet, end: false },
  { to: "/dashboard/bot", label: "Bot desk", icon: Bot, end: false },
];

const TITLES: Record<string, { title: string; kicker: string }> = {
  "/dashboard": { title: "Pool overview", kicker: "Operator desk" },
  "/dashboard/workers": { title: "Worker fleet", kicker: "Telemetry" },
  "/dashboard/payouts": { title: "Settlement & revenue", kicker: "Ledger" },
  "/dashboard/bot": { title: "Telegram desk bot", kicker: "Automation" },
};

function UtcClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
      {now.toISOString().slice(11, 19)} UTC
    </span>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const bot = useQuery(api.bot.overview);
  const initials = (user?.name || user?.email || "OP")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex h-14 items-center border-b border-sidebar-border px-4">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="transition-opacity hover:opacity-80"
          aria-label="NEXPOOL home"
        >
          <Brand subtitle="POOL DESK" />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 p-2">
        <p className="label-xs px-2 pt-2 pb-2">Operations</p>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "group relative flex items-center gap-2.5 border-l-2 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors",
                isActive
                  ? "border-primary bg-sidebar-accent text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={cn("size-3.5", isActive ? "text-primary" : "text-muted-foreground")}
                />
                {item.label}
                {isActive ? (
                  <span className="ml-auto size-1 bg-primary" aria-hidden="true" />
                ) : null}
              </>
            )}
          </NavLink>
        ))}

        <div className="mt-5 border-t border-sidebar-border pt-4">
          <p className="label-xs px-2 pb-2">Desk status</p>
          <div className="mx-2 space-y-2 border border-sidebar-border bg-panel px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Pool
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[10px] text-up">
                <StatusDot status="live" /> SYNCED
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Bot
              </span>
              <span
                className={cn(
                  "flex items-center gap-1.5 font-mono text-[10px]",
                  bot?.settings.enabled && bot?.configured
                    ? "text-up"
                    : bot?.settings.enabled
                      ? "text-warn"
                      : "text-muted-foreground",
                )}
              >
                <StatusDot
                  status={
                    bot?.settings.enabled
                      ? bot?.configured
                        ? "online"
                        : "degraded"
                      : "offline"
                  }
                />
                {bot?.settings.enabled ? (bot?.configured ? "LIVE" : "CONSOLE") : "OFF"}
              </span>
            </div>
          </div>
        </div>
      </nav>

      <div className="border-t border-sidebar-border p-2">
        <div className="flex items-center gap-2 px-1 py-1">
          <div className="flex size-8 items-center justify-center border border-sidebar-border bg-panel font-mono text-[11px] font-semibold text-primary">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-medium">
              {user?.name || "Pool owner"}
            </p>
            <p className="truncate font-mono text-[10px] text-muted-foreground">
              {user?.email || "owner desk"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Sign out"
            className="text-muted-foreground hover:text-destructive"
            onClick={async () => {
              await signOut();
              navigate("/");
            }}
          >
            <LogOut className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ConsoleLayout() {
  const location = useLocation();
  const seed = useMutation(api.pool.seedDemo);
  const seeded = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const meta = TITLES[location.pathname] ?? TITLES["/dashboard"];

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    seed().catch((error) => {
      console.warn("Seed skipped:", error);
    });
  }, [seed]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[236px] border-r border-sidebar-border lg:block">
        <SidebarBody />
      </aside>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-[264px] border-sidebar-border p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Console navigation</SheetTitle>
          </SheetHeader>
          <SidebarBody onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="lg:pl-[236px]">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            aria-label="Open navigation"
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="size-4" />
          </Button>
          <div className="min-w-0">
            <p className="label-xs hidden sm:block">{meta.kicker}</p>
            <h1 className="truncate text-sm font-semibold tracking-tight">{meta.title}</h1>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-1.5 border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:flex">
              <StatusDot status="live" /> feed live
            </span>
            <span className="hidden border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-primary md:block">
              1.00% fee
            </span>
            <UtcClock />
            <Activity className="hidden size-3.5 text-muted-foreground sm:block" />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] px-4 py-5 lg:px-6 lg:py-6">
          <Outlet />
        </main>

        <footer className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-3 px-4 pb-6 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground lg:px-6">
          <span>NEXPOOL operator console · v1</span>
          <span className="flex items-center gap-1.5">
            <Loader2 className="size-3" /> synced with pool
          </span>
        </footer>
      </div>
    </div>
  );
}
