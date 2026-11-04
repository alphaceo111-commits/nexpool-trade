import { TonConnectUIProvider } from "@tonconnect/ui-react";
import type { ReactNode } from "react";
import { Component } from "react";
import { Link } from "react-router";
import { TON_MANIFEST_URL } from "@/lib/ton";

/**
 * Isolates the TON Connect SDK so a provider failure cannot blank the app, and
 * keeps the wallet manifest in one place for the wallet and deposit screens.
 */
class TonSdkBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="rounded-md border border-warn/40 bg-warn/[0.05] p-4">
          <p className="text-[12.5px] font-medium">TON Connect unavailable</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            The wallet SDK could not start in this client. Balances and history
            remain readable; reopen the app or use a Telegram or browser client
            that supports TON Connect.
          </p>
          <Link
            to="/app"
            className="mt-2 inline-block font-mono text-[9px] uppercase tracking-[0.1em] text-primary"
          >
            Back to dashboard
          </Link>
        </div>
      );
    }
    return this.props.children;
  }
}

export function TonConnectShell({ children }: { children: ReactNode }) {
  return (
    <TonSdkBoundary>
      <TonConnectUIProvider manifestUrl={TON_MANIFEST_URL}>
        {children}
      </TonConnectUIProvider>
    </TonSdkBoundary>
  );
}
