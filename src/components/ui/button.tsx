"use client";

import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border text-sm font-semibold transition-[color,background-color,border-color,box-shadow,transform] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-lime active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "border-brand-lime/40 bg-brand-lime text-[#08080a] shadow-[0_0_16px_-6px_rgba(180,244,97,0.4)] hover:bg-[#c4fa83]",
        secondary: "border-border-subtle bg-[var(--surface-3)] text-foreground hover:border-border-hover hover:bg-[var(--surface-4)]",
        outline: "border-border-subtle bg-transparent text-foreground hover:border-border-hover hover:bg-surface",
        ghost: "border-transparent bg-transparent text-muted hover:bg-surface hover:text-foreground",
        danger: "border-rose-400/20 bg-rose-600 text-white hover:bg-rose-700",
      },
      size: {
        xs: "h-7 px-2.5 text-xs", sm: "h-8 px-3 text-xs", md: "h-10 px-4",
        lg: "h-12 px-6 text-base", icon: "size-10 p-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants> & {
  loading?: boolean;
  loadingLabel?: string;
};

export function Button({ className, variant, size, loading = false, loadingLabel = "Loading", disabled, children, type = "button", ...props }: ButtonProps) {
  return (
    <button {...props} type={type} disabled={disabled || loading} aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size }), className)}>
      {loading && <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
      {children}
      {loading && <span role="status" className="sr-only">{loadingLabel}</span>}
    </button>
  );
}
