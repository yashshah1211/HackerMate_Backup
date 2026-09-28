import { cn } from "@/lib/utils";

/** Compact brand mark for the rail and mobile bar: a lime tile with "hm". */
export function HMMark({ className, size = 36 }: { className?: string; size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[9px] bg-accent font-display font-extrabold leading-none tracking-[-0.06em] text-on-accent",
        "[font-variation-settings:'wdth'_85]",
        className,
      )}
    >
      hm
    </span>
  );
}
