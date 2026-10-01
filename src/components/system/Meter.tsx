import { cn } from "@/lib/utils";

/**
 * Seat meter: one tick per seat. Filled seats are solid, open seats are
 * outlined in the signal colour — open seats are what builders scan for.
 */
export function SeatMeter({
  filled,
  total,
  showLabel = true,
  className,
}: {
  filled: number;
  total: number | null | undefined;
  showLabel?: boolean;
  className?: string;
}) {
  const hasTotal = typeof total === "number" && total > 0 && total >= filled;
  const seats = hasTotal ? (total as number) : Math.max(filled, 1);
  const capped = Math.min(seats, 8);
  const open = hasTotal ? (total as number) - filled : 0;
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="inline-flex items-center gap-[3px]" aria-hidden>
        {Array.from({ length: capped }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-2.5 w-[7px] rounded-[1.5px]",
              i < filled ? "bg-ink-3" : "ring-1 ring-inset ring-accent-ink/70 bg-accent-soft",
            )}
          />
        ))}
      </span>
      {showLabel && (
        <span className="font-mono text-[12px] text-ink-3 tabular">
          {hasTotal ? `${filled}/${total}` : `${filled}`}
          {open > 0 && <span className="text-accent-ink"> · {open} open</span>}
        </span>
      )}
      <span className="sr-only">
        {hasTotal ? `${filled} of ${total} seats filled` : `${filled} members`}
      </span>
    </span>
  );
}

/** Thin progress bar (profile strength, uploads). */
export function Progress({ value, className, tone = "accent" }: { value: number; className?: string; tone?: "accent" | "ok" | "warn" }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <span
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("block h-1 w-full overflow-hidden rounded-full bg-selected", className)}
    >
      <span
        className={cn(
          "block h-full rounded-full transition-[width] duration-500 ease-out",
          tone === "accent" ? "bg-accent" : tone === "ok" ? "bg-ok" : "bg-warn",
        )}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

