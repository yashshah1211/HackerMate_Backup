import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cn("rounded-xl border border-border-subtle bg-card text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-zinc-700 motion-reduce:transform-none motion-reduce:transition-none", className)} />;
}
export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cn("flex flex-col gap-1.5 p-5", className)} />;
}
export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return <h3 {...props} className={cn("text-base font-semibold tracking-tight", className)} />;
}
export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p {...props} className={cn("text-sm leading-relaxed text-muted", className)} />;
}
export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cn("px-5 pb-5", className)} />;
}
export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cn("flex items-center gap-2 border-t border-border-subtle px-5 py-4", className)} />;
}
