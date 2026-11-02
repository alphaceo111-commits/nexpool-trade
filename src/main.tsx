import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { TelegramSessionGate } from "@/components/TelegramSessionGate";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { initTelegram } from "@/lib/telegram";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import "./index.css";

// Lazy load route components for better code splitting
const AppShell = lazy(() => import("./components/app/AppShell"));
const Home = lazy(() => import("./pages/app/Home"));
const MiningPage = lazy(() => import("./pages/app/Mining"));
const TasksPage = lazy(() => import("./pages/app/Tasks"));
const ReferralsPage = lazy(() => import("./pages/app/Referrals"));
const WalletPage = lazy(() => import("./pages/app/Wallet"));
const WithdrawPage = lazy(() => import("./pages/app/Withdraw"));
const ProfilePage = lazy(() => import("./pages/app/Profile"));
const NotificationsPage = lazy(() => import("./pages/app/Notifications"));
const AdminPage = lazy(() => import("./pages/Admin"));
const BotOpsPage = lazy(() => import("./pages/BotOps"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in the browser runtime). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[Preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-3 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);



function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}


initTelegram();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <ConvexAuthProvider client={convex}>
        <BrowserRouter>
          <RouteSyncer />
          <Suspense fallback={<RouteLoading />}>
            <TelegramSessionGate>
              <Routes>
                {/* Telegram Mini App: no landing page, no sign-in form. */}
                <Route path="/" element={<Navigate to="/app" replace />} />
                <Route path="/auth" element={<Navigate to="/app" replace />} />
                <Route path="/app" element={<AppShell />}>
                  <Route index element={<Home />} />
                  <Route path="mining" element={<MiningPage />} />
                  <Route path="tasks" element={<TasksPage />} />
                  <Route path="referrals" element={<ReferralsPage />} />
                  <Route path="wallet" element={<WalletPage />} />
                  <Route path="withdraw" element={<WithdrawPage />} />
                  <Route path="profile" element={<ProfilePage />} />
                  <Route path="notifications" element={<NotificationsPage />} />
                </Route>
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/admin/bot" element={<BotOpsPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </TelegramSessionGate>
          </Suspense>
        </BrowserRouter>
        <Toaster />
      </ConvexAuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
