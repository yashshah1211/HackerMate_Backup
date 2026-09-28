import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const widths = {
  default: "max-w-[1240px]",
  narrow: "max-w-[920px]",
  wide: "max-w-[1480px]",
  full: "max-w-none",
};

/**
 * Page frame for V2 routes. Renders the <main> landmark with `data-v2` so the
 * shell's legacy <main> compatibility rule does not apply.
 */
export function Page({
  children,
  width = "default",
  className,
  flush = false,
}: {
  children: ReactNode;
  width?: keyof typeof widths;
  className?: string;
  /** Remove horizontal padding (for full-bleed layouts such as the workspace). */
  flush?: boolean;
}) {
  return (
    <main
      data-v2
      className={cn(
        "mx-auto w-full",
        widths[width],
        !flush && "px-4 pb-28 md:px-8 md:pb-16",
        className,
      )}
    >
      {children}
    </main>
  );
}

/**
 * Page header: display title + optional meta line, actions and section tabs.
 * The hairline under it anchors the page; there is no hero.
 */
export function PageHeader({
  eyebrow,
  title,
  meta,
  actions,
  tabs,
  className,
  leading,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
  className?: string;
  leading?: ReactNode;
}) {
  return (
    <header className={cn("pt-5 md:pt-8", tabs ? "border-b border-line" : "pb-5 md:pb-6", className)}>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          {leading}
          <div className="min-w-0">
            {eyebrow && <div className="mb-1.5 caps-label text-ink-3">{eyebrow}</div>}
            <h1
              data-v2-heading
              className="font-display text-[26px] font-semibold leading-[1.1] tracking-[-0.025em] text-ink md:text-[32px] [font-variation-settings:'wdth'_92]"
            >
              {title}
            </h1>
            {meta && <div className="mt-1.5 text-[13.5px] text-ink-3">{meta}</div>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {tabs && <div className="mt-4 md:mt-5">{tabs}</div>}
    </header>
  );
}

/**
 * Section: a labelled block of content. Sections are separated by space and a
 * header row — not by boxes. Pass `boxed` only when the content needs a frame.
 */
export function Section({
  title,
  count,
  action,
  children,
  className,
  boxed = false,
  description,
  id,
}: {
  title: ReactNode;
  count?: number | string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  boxed?: boolean;
  description?: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className={cn("min-w-0", className)} aria-labelledby={id ? `${id}-title` : undefined}>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 shrink-0 items-baseline gap-2">
          <h2 id={id ? `${id}-title` : undefined} className="truncate text-[13.5px] font-semibold text-ink">
            {title}
          </h2>
          {count !== undefined && <span className="font-mono text-[11.5px] text-ink-4 tabular">{count}</span>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
      {description && <p className="-mt-1.5 mb-3 text-[12.5px] text-ink-3">{description}</p>}
      {boxed ? <div className="rounded-lg border border-line bg-raised">{children}</div> : children}
    </section>
  );
}

/** Quiet "View all →" link used in section headers. */
export function SectionLink({ href, children = "View all" }: { href: string; children?: ReactNode }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-3 transition-colors hover:text-ink">
      {children}
      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

/** Numeric fact with a mono label. Only for real data — never decorative. */
export function Stat({ label, value, hint, className }: { label: string; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="caps-label text-ink-3">{label}</div>
      <div className="mt-1 font-display text-[22px] font-semibold leading-none tracking-[-0.02em] text-ink tabular">{value}</div>
      {hint && <div className="mt-1 text-[12px] text-ink-3">{hint}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] bg-selected px-1 font-mono text-[10.5px] text-ink-3 ring-1 ring-inset ring-line-strong">
      {children}
    </kbd>
  );
}

/** Framed surface for dense content (tables, composers, side panels). */
export function Panel({ children, className, as: As = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "aside" }) {
  return <As className={cn("rounded-lg border border-line bg-raised", className)}>{children}</As>;
}

/** Hairline-separated list. Rows handle their own padding. */
export function List({ children, className, stagger = false }: { children: ReactNode; className?: string; stagger?: boolean }) {
  return (
    <ul className={cn("divide-y divide-line", className)} data-stagger={stagger || undefined}>
      {children}
    </ul>
  );
}
