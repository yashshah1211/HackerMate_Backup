import type { ReactNode } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Empty states say what's missing and offer the one next step. No
 * illustrations, no cheerleading.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
  align = "start",
  className,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  align?: "start" | "center";
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border border-dashed border-line-strong",
        compact ? "px-4 py-4" : "px-5 py-6",
        align === "center" ? "flex-col items-center text-center" : "items-start",
        className,
      )}
    >
      {icon && (
        <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-selected text-ink-3 [&_svg]:size-4">
          {icon}
        </span>
      )}
      <div className={cn("min-w-0", align === "center" && "flex flex-col items-center")}>
        <p className="text-[13.5px] font-semibold text-ink">{title}</p>
        {body && <p className="mt-0.5 max-w-prose text-[13px] leading-relaxed text-ink-3">{body}</p>}
        {action && <div className="mt-3 flex flex-wrap items-center gap-2">{action}</div>}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("hm-skeleton block rounded-[4px]", className)} />;
}

/** Placeholder list: avatar + two lines per row. */
export function SkeletonRows({ rows = 4, avatar = "circle", className }: { rows?: number; avatar?: "circle" | "square" | "none"; className?: string }) {
  return (
    <div className={cn("divide-y divide-line", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          {avatar !== "none" && <Skeleton className={cn("size-9 shrink-0", avatar === "circle" ? "rounded-full" : "rounded-[7px]")} />}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-2.5 w-2/3" />
          </div>
          <Skeleton className="h-7 w-20 rounded-md" />
        </div>
      ))}
    </div>
  );
}

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return <LoaderCircle role="status" aria-label={label} className={cn("size-4 animate-spin text-ink-3", className)} />;
}

/** Inline error that keeps the real reason visible (never a silent empty state). */
export function ErrorNotice({
  title = "Couldn't load this",
  detail,
  onRetry,
  className,
}: {
  title?: string;
  detail?: string | null;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3 rounded-lg bg-bad-soft px-4 py-3 ring-1 ring-inset ring-bad/25", className)} role="alert">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-ink">{title}</p>
        {detail && <p className="mt-0.5 break-words font-mono text-[12.5px] text-ink-3">{detail}</p>}
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 text-[12.5px] font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
          Retry
        </button>
      )}
    </div>
  );
}

/** Full-page centred loader for route-level suspense. */
export function PageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <span className="inline-flex items-center gap-2 caps-label text-ink-3">
        <Spinner className="text-accent-ink" label={label} />
        {label}
      </span>
    </div>
  );
}

