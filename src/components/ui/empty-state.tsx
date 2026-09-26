import type { ComponentProps, ReactNode } from "react";
import { Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type EmptyStateProps = Omit<ComponentProps<"div">, "title"> & {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
};
export function EmptyState({ icon: Icon = Inbox, title, description, action, className, ...props }: EmptyStateProps) {
  return <div {...props} className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
    <div className="mb-4 grid size-12 place-items-center rounded-xl border border-border-subtle bg-surface text-muted">
      <Icon aria-hidden="true" className="size-5" />
    </div>
    <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
    {description && <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">{description}</p>}
    {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
  </div>;
}
