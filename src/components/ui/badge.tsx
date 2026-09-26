import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums", {
  variants: { variant: {
    default: "border-border-subtle bg-surface text-muted",
    brand: "border-brand-lime/25 bg-brand-lime/10 text-brand-lime",
    success: "border-emerald-400/25 bg-emerald-400/10 text-emerald-400",
    warning: "border-amber-400/25 bg-amber-400/10 text-amber-400",
    error: "border-rose-400/25 bg-rose-400/10 text-rose-400",
    info: "border-cyan-400/25 bg-cyan-400/10 text-cyan-400",
    purple: "border-indigo-400/25 bg-indigo-400/10 text-indigo-300",
  } }, defaultVariants: { variant: "default" },
});

export type BadgeProps = ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { dot?: boolean };
export function Badge({ className, variant, dot = false, children, ...props }: BadgeProps) {
  return <span {...props} className={cn(badgeVariants({ variant }), className)}>
    {dot && <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />}{children}
  </span>;
}

export type FitBadgeProps = Omit<BadgeProps, "variant" | "children"> & { score: number | null | undefined };
export function FitBadge({ score, ...props }: FitBadgeProps) {
  const fit = typeof score === "number" && Number.isFinite(score) ? Math.round(Math.min(100, Math.max(0, score))) : null;
  return <Badge {...props} variant={fit === null || fit < 70 ? "default" : fit >= 90 ? "brand" : "purple"}>
    {fit === null ? "Fit unknown" : `${fit}% fit`}
  </Badge>;
}
