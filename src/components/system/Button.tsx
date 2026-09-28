"use client";

import Link from "next/link";
import { forwardRef, type ComponentProps, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "inverse" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium select-none " +
  "transition-[background-color,border-color,color,opacity,transform] duration-150 ease-out " +
  "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45 " +
  "[&_svg]:shrink-0";

const variants: Record<ButtonVariant, string> = {
  // The one action per view that moves the builder forward.
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  // Strong but not "the" action (e.g. Message when already connected).
  inverse: "bg-ink text-canvas hover:opacity-90",
  secondary: "bg-raised text-ink border border-line-strong hover:border-ink-4 hover:bg-overlay",
  ghost: "text-ink-2 hover:text-ink hover:bg-hover",
  danger: "text-bad bg-bad-soft border border-bad/30 hover:border-bad/70",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-[12.5px] rounded-[5px] [&_svg]:size-3.5",
  md: "h-[34px] px-3.5 text-[13px] rounded-md [&_svg]:size-4",
  lg: "h-11 px-5 text-[14px] rounded-[7px] [&_svg]:size-[18px]",
};

export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, icon, iconRight, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, size, className)}
      {...rest}
    >
      {loading ? <LoaderCircle className="animate-spin" aria-hidden /> : icon}
      {children}
      {iconRight}
    </button>
  );
});

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconRight?: ReactNode;
};

export function ButtonLink({ variant = "secondary", size = "md", icon, iconRight, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
      {iconRight}
    </Link>
  );
}

type IconButtonProps = ComponentProps<"button"> & {
  label: string;
  size?: "sm" | "md" | "lg";
  variant?: "ghost" | "secondary";
  badge?: number;
};

const iconSizes = {
  sm: "size-7 rounded-[5px] [&_svg]:size-4",
  md: "size-9 rounded-md [&_svg]:size-[18px]",
  lg: "size-11 rounded-[7px] [&_svg]:size-5",
};

/** Square icon-only button. `label` is required and becomes the accessible name. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = "md", variant = "ghost", badge, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-flex items-center justify-center shrink-0 transition-colors duration-150 active:scale-[0.97]",
        variant === "ghost" ? "text-ink-2 hover:text-ink hover:bg-hover" : "text-ink bg-raised border border-line-strong hover:border-ink-4",
        iconSizes[size],
        className,
      )}
      {...rest}
    >
      {children}
      {badge !== undefined && badge > 0 && <CountBadge value={badge} className="absolute -top-0.5 -right-0.5" />}
    </button>
  );
});

/** Small numeric badge used on nav items and icon buttons. */
export function CountBadge({ value, className }: { value: number; className?: string }) {
  return (
    <span
      className={cn(
        "min-w-4 h-4 px-1 rounded-[4px] bg-accent text-on-accent font-mono text-[10px] font-semibold leading-4 text-center tabular",
        className,
      )}
    >
      {value > 99 ? "99+" : value}
    </span>
  );
}
