import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { HMMark } from "@/components/shell/HMMark";
import { cn } from "@/lib/utils";

/**
 * Bare-route frame for onboarding. Mirrors the V2 login page exactly:
 * brand lockup header, bg-canvas, 1280px container and mono footer strip.
 */
export function OnboardingFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-[100dvh] flex-col bg-canvas text-ink", className)}>
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center justify-between gap-4 px-5 md:px-8">
          <Link href="/" className="flex items-center gap-2 rounded-md" aria-label="HackerMate home">
            <HMMark size={28} className="rounded-[7px]" />
            <span className="font-display text-[16px] font-bold tracking-[-0.02em] text-ink [font-variation-settings:'wdth'_90]">HackerMate</span>
          </Link>
          <Link
            href="/"
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-ink-3 transition-colors hover:bg-hover hover:text-ink"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to home
          </Link>
        </div>
      </header>

      {children}

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-2 px-5 py-4 font-mono text-[12px] text-ink-3 md:px-8">
          <span>HackerMate · Team operating system for hackathons</span>
          <span className="flex gap-4">
            <Link href="/terms" className="hover:text-ink">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-ink">
              Privacy
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

/**
 * Numbered form section in the landing's pipeline language: mono `01/03`
 * index + caps label on the left, fields on the right (stacked on mobile).
 */
export function FormStep({
  n,
  total,
  label,
  title,
  description,
  aside,
  children,
  id,
}: {
  n: number;
  total: number;
  label: string;
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  id: string;
}) {
  const pad = (v: number) => String(v).padStart(2, "0");
  return (
    <section aria-labelledby={`${id}-title`} className="grid grid-cols-1 gap-4 border-t border-line py-7 md:grid-cols-[200px_minmax(0,1fr)] md:gap-8">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[11.5px] text-ink-3 tabular">
            {pad(n)}/{pad(total)}
          </span>
          <span className="caps-label text-ink-3">{label}</span>
        </div>
        <h2 id={`${id}-title`} className="mt-2 text-[15px] font-semibold text-ink">
          {title}
        </h2>
        {description && <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{description}</p>}
        {aside && <div className="mt-2">{aside}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** Field label with a readable Required / Optional marker. */
export function OnboardingLabel({
  children,
  htmlFor,
  id,
  required = false,
}: {
  children: ReactNode;
  htmlFor?: string;
  id?: string;
  required?: boolean;
}) {
  return (
    <label id={id} htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-2">
      <span className="caps-label text-ink-3">{children}</span>
      <span className={cn("text-[11.5px]", required ? "text-accent-ink" : "text-ink-3")}>{required ? "Required" : "Optional"}</span>
    </label>
  );
}
