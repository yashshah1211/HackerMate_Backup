"use client";

import { forwardRef, type ComponentProps, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

const fieldBase =
  "w-full rounded-md bg-sunken text-ink placeholder:text-ink-4 ring-1 ring-inset ring-line-strong " +
  "transition-[box-shadow,background-color] duration-150 hover:ring-ink-4 " +
  "focus:outline-none focus-visible:outline-none focus:ring-accent-ink focus:shadow-[0_0_0_3px_var(--hm-accent-soft)] " +
  "disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, ComponentProps<"input"> & { leading?: ReactNode; inputSize?: "md" | "lg" }>(
  function Input({ className, leading, inputSize = "md", ...rest }, ref) {
    const h = inputSize === "lg" ? "h-11 text-[15px]" : "h-[34px] text-[13.5px]";
    if (!leading) return <input ref={ref} className={cn(fieldBase, h, "px-3", className)} {...rest} />;
    return (
      <span className="relative block">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3 [&_svg]:size-4">{leading}</span>
        <input ref={ref} className={cn(fieldBase, h, "pl-8.5 pr-3", className)} {...rest} />
      </span>
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<"textarea">>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(fieldBase, "min-h-24 px-3 py-2 text-[13.5px] leading-relaxed", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, ComponentProps<"select">>(function Select({ className, children, ...rest }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        fieldBase,
        "h-[34px] appearance-none pl-3 pr-8 text-[13.5px] bg-[length:16px] bg-[right_0.5rem_center] bg-no-repeat",
        "bg-[url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%238b8880' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.6' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")]",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
});

export function FieldLabel({ children, htmlFor, hint }: { children: ReactNode; htmlFor?: string; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-2">
      <span className="caps-label text-ink-3">{children}</span>
      {hint && <span className="text-[11.5px] text-ink-4">{hint}</span>}
    </label>
  );
}

/** Search field with a clear button and an optional keyboard hint. */
export function SearchField({
  value,
  onChange,
  placeholder = "Search",
  className,
  autoFocus,
  size = "md",
  label = "Search",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  size?: "md" | "lg";
  label?: string;
}) {
  return (
    <span className={cn("relative block", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
      <input
        type="search"
        aria-label={label}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          fieldBase,
          size === "lg" ? "h-11 text-[15px]" : "h-[34px] text-[13.5px]",
          "pl-8.5 pr-8 [&::-webkit-search-cancel-button]:hidden",
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded text-ink-3 hover:bg-hover hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      )}
    </span>
  );
}

/** Accessible on/off switch. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        // after:-inset-2 gives the 20px track a ~36px touch area without changing its size.
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 after:absolute after:-inset-2 disabled:opacity-50",
        checked ? "bg-accent" : "bg-line-strong",
      )}
    >
      <span
        className={cn(
          "inline-block size-4 rounded-full shadow-sm transition-transform duration-150",
          checked ? "translate-x-[18px] bg-on-accent" : "translate-x-0.5 bg-ink-2",
        )}
      />
    </button>
  );
}

/** Toggleable filter chip (skills, roles). */
export function FilterChip({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        // after:-inset-y-1 extends the 28px chip's touch area to 36px; rows keep their visual density.
        "relative inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-[12.5px] font-medium transition-colors after:absolute after:inset-x-0 after:-inset-y-1",
        active
          ? "bg-ink text-canvas"
          : "bg-raised text-ink-2 ring-1 ring-inset ring-line-strong hover:text-ink hover:ring-ink-4",
      )}
    >
      {children}
      {typeof count === "number" && (
        <span className={cn("font-mono text-[10.5px] tabular", active ? "text-canvas/70" : "text-ink-4")}>{count}</span>
      )}
    </button>
  );
}
