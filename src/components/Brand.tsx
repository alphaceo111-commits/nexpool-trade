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
      <rect x="5" y="15" width="4" height="8" fill="currentColor" />
      <rect x="12" y="10" width="4" height="13" fill="currentColor" opacity="0.7" />
      <rect x="19" y="5" width="4" height="18" fill="currentColor" />
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
