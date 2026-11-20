import { useOnlineStatus } from "@/hooks/use-online-status";
import { WifiOff } from "lucide-react";

/**
 * Persistent, quiet notice while the device has no connection. Balances stay
 * readable from the last snapshot; mining heartbeats and payments resume when
 * the connection returns, and Convex reconnects on its own.
 */
export function ConnectionBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-warn/30 bg-warn/[0.07]"
    >
      <div className="mx-auto flex w-full max-w-[1180px] items-start gap-2.5 px-4 py-2.5 lg:px-8">
        <WifiOff className="mt-0.5 size-3.5 shrink-0 text-warn" />
        <p className="text-[11px] leading-relaxed text-foreground/90">
          <span className="font-medium">You're offline.</span>{" "}
          <span className="text-muted-foreground">
            Your last confirmed balance stays visible. Mining heartbeats and
            payments resume automatically when the connection returns.
          </span>
        </p>
      </div>
    </div>
  );
}
