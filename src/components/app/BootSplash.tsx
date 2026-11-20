import { BrandMark } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

const STAGES = [
  {
    label: "Connecting securely to Telegram",
    detail: "Signed initData only — no password is ever entered.",
  },
  {
    label: "Verifying your NEXPOOL account",
    detail: "Your existing balance, history and referrals are preserved.",
  },
  {
    label: "Preparing your dashboard",
    detail: "Essential figures first, charts and rankings after.",
  },
];

/**
 * Branded startup for NEXPOOL.
 *
 * Deliberately lightweight: CSS gradients and opacity/transform animation only,
 * no images, no extra JavaScript, no artificial minimum duration. It is mounted
 * while the real session and account are being established, so a fast device
 * sees it for a blink and a slow one gets an honest account of what is happening.
 */
export function BootSplash({
  stage,
  detail,
  error,
  offline,
  onRetry,
  retrying,
}: {
  stage: 0 | 1 | 2;
  detail?: string;
  error?: string | null;
  offline?: boolean;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <main
      className="safe-top safe-bottom relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-background px-5 py-10"
      aria-busy={!error}
    >
      <div className="terminal-grid pointer-events-none absolute inset-0 opacity-30" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[-18%] left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-primary/[0.10] blur-[110px] mining-breathe"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-30%] right-[-20%] h-[420px] w-[420px] rounded-full bg-gold/[0.05] blur-[120px]"
      />

      <div className="relative w-full max-w-[360px]">
        <div className="flex flex-col items-center text-center">
          <div className="relative flex size-[92px] items-center justify-center">
            <span aria-hidden="true" className="mining-ring" />
            <span
              aria-hidden="true"
              className="absolute inset-[10px] rounded-full border border-primary/20"
            />
            <span className="flex size-[62px] items-center justify-center rounded-full border border-primary/30 bg-primary/[0.08] shadow-[0_0_44px_-16px_color-mix(in_oklab,var(--primary)_70%,transparent)]">
              <BrandMark className="size-7 text-primary" />
            </span>
          </div>

          <p className="mt-5 font-display text-[19px] font-bold tracking-[0.22em] text-foreground">
            NEXPOOL
          </p>
          <p className="mt-1.5 font-mono text-[8px] uppercase tracking-[0.34em] text-muted-foreground">
            mining terminal
          </p>

          <div
            aria-hidden="true"
            className="heartbeat-wave mt-5 flex h-4 items-end gap-[3px] text-primary/70"
          >
            {[0, 1, 2, 3, 4, 5, 6].map((bar) => (
              <span
                key={bar}
                style={{ animationDelay: `${bar * 130}ms`, height: 14 }}
              />
            ))}
          </div>

          <p className="mt-5 text-[13px] font-medium text-foreground/90">
            Welcome back to your mining account
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {detail ??
              "Your NEX balance, mining session and ledger are loaded from the NEXPOOL backend."}
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-border/80 bg-card/70 px-4 py-3.5">
          {error ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2.5">
                <WifiOff className="mt-0.5 size-4 shrink-0 text-warn" />
                <div className="min-w-0">
                  <p className="text-[12.5px] font-medium">
                    {offline
                      ? "You're offline"
                      : "NEXPOOL couldn't finish opening"}
                  </p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                    {error}
                  </p>
                </div>
              </div>
              {onRetry ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={onRetry}
                  disabled={retrying}
                >
                  {retrying ? "Retrying…" : "Try again"}
                </Button>
              ) : null}
              <p className="font-mono text-[8.5px] uppercase leading-relaxed tracking-[0.12em] text-muted-foreground/80">
                No new account is created and no balance is changed while this
                screen is shown.
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {STAGES.map((item, index) => {
                const done = index < stage;
                const active = index === stage;
                return (
                  <li key={item.label} className="flex items-start gap-2.5">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-[5px] size-1.5 shrink-0 rounded-full",
                        done
                          ? "bg-up"
                          : active
                            ? "animate-signal-pulse bg-primary"
                            : "bg-border",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-[11.5px] leading-tight",
                          done || active
                            ? "text-foreground"
                            : "text-muted-foreground/60",
                        )}
                      >
                        {item.label}
                      </p>
                      {active ? (
                        <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                          {offline
                            ? "Waiting for your connection to return…"
                            : item.detail}
                        </p>
                      ) : null}
                    </div>
                    {done ? (
                      <span className="mt-[1px] font-mono text-[8px] uppercase tracking-[0.1em] text-up">
                        ready
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between font-mono text-[8px] uppercase tracking-[0.16em] text-muted-foreground">
          <span>server-authoritative mining</span>
          <span>{offline ? "offline" : "secure session"}</span>
        </div>
      </div>
    </main>
  );
}

/**
 * Shell-shaped placeholder shown once the account exists but the first
 * snapshot has not arrived. It mirrors the real layout so nothing jumps when
 * figures replace the blocks.
 */
export function DashboardSkeleton() {
  return (
    <div className="min-h-[100dvh] bg-background">
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
          <span className="ml-auto h-5 w-16 animate-pulse rounded-full bg-white/[0.05]" />
          <span className="size-9 animate-pulse rounded-full border border-border/80 bg-card/60" />
        </div>
      </header>
      <div className="mx-auto w-full max-w-[1180px] space-y-4 px-4 pt-5 pb-32 sm:px-5 lg:px-8 lg:pt-8">
        <div className="flex items-center gap-3">
          <span className="size-11 animate-pulse rounded-full bg-card/70" />
          <div className="space-y-2">
            <span className="block h-4 w-40 animate-pulse rounded bg-card/70" />
            <span className="block h-2.5 w-24 animate-pulse rounded bg-card/50" />
          </div>
        </div>
        <div className="h-[236px] animate-pulse rounded-3xl border border-border/60 bg-card/50" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-64 animate-pulse rounded-2xl border border-border/60 bg-card/40" />
          <div className="h-64 animate-pulse rounded-2xl border border-border/60 bg-card/40" />
        </div>
        <p className="text-center font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          Loading your confirmed balances…
        </p>
      </div>
    </div>
  );
}
