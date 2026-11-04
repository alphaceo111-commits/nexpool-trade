import { cn } from "@/lib/utils";

/** NEXPOOL mark: three ascending pool "shares" inside a terminal square. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 28"
      className={cn("size-7 shrink-0", className)}
      aria-hidden="true"
    >
      <rect x="0.5" y="0.5" width="27" height="27" stroke="currentColor" opacity="0.35" />
      <rect x="5" y="15" width="4" height="8" rx="0.6" fill="currentColor" />
      <rect x="12" y="10" width="4" height="13" rx="0.6" fill="currentColor" opacity="0.65" />
      <rect x="19" y="5" width="4" height="18" rx="0.6" fill="currentColor" />
      <circle cx="21" cy="3.1" r="1" fill="currentColor" />
      <path d="M5 25.2h18" stroke="currentColor" strokeOpacity="0.3" strokeWidth="0.8" strokeLinecap="round" />
    </svg>
  );
}

export function Brand({
  className,
  subtitle = "POOL DESK",
  compact = false,
}: {
  className?: string;
  subtitle?: string | null;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <BrandMark className="text-primary" />
      <div className="leading-none">
        <div
          className={cn(
            "font-mono font-bold tracking-[0.16em] text-foreground",
            compact ? "text-sm" : "text-base",
          )}
        >
          NEXPOOL
        </div>
        {subtitle ? (
          <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.32em] text-muted-foreground">
            {subtitle}
          </div>
        ) : null}
      </div>
    </div>
  );
}
