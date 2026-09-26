"use client";

import { createContext, useContext, useEffect, useId, useRef, type ComponentProps, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const DialogContext = createContext<{ titleId: string; descriptionId: string } | null>(null);
function useDialog() {
  const context = useContext(DialogContext);
  if (!context) throw new Error("Dialog headings must be rendered inside Dialog");
  return context;
}
export type DialogProps = Omit<ComponentProps<"dialog">, "open" | "onClose" | "title"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Always provide a title to give the dialog an accessible name. */
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
};

export function Dialog({ open, onOpenChange, title, description, footer, children, className, closeLabel = "Close dialog", onCancel, onClick, ...props }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const reduced = useReducedMotion();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!open) { if (dialog.open) dialog.close(); return; }
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  return <DialogContext.Provider value={{ titleId: `${id}-title`, descriptionId: `${id}-description` }}>
    <dialog {...props} ref={ref} aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-description` : undefined}
      className={cn("fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-border-subtle bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/65 backdrop:backdrop-blur-sm", className)}
      onCancel={event => { onCancel?.(event); if (!event.defaultPrevented) { event.preventDefault(); onOpenChange(false); } }}
      onClose={() => { if (open && !ref.current?.open) onOpenChange(false); }}
      onClick={event => {
        onClick?.(event);
        if (event.defaultPrevented || event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onOpenChange(false);
      }}>
      {open && <motion.div initial={reduced ? false : { opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}>
        <DialogHeader className="relative pr-14">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
          <button type="button" aria-label={closeLabel} onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 grid size-8 place-items-center rounded-md text-muted hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand-lime">
            <X aria-hidden="true" className="size-4" />
          </button>
        </DialogHeader>
        <DialogContent>{children}</DialogContent>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </motion.div>}
    </dialog>
  </DialogContext.Provider>;
}
export function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cn("space-y-1.5 border-b border-border-subtle p-5", className)} />;
}
export function DialogTitle({ className, ...props }: ComponentProps<"h2">) {
  const { titleId } = useDialog();
  return <h2 {...props} id={titleId} className={cn("text-lg font-semibold tracking-tight", className)} />;
}
export function DialogDescription({ className, ...props }: ComponentProps<"p">) {
  const { descriptionId } = useDialog();
  return <p {...props} id={descriptionId} className={cn("text-sm leading-relaxed text-muted", className)} />;
}
export function DialogContent({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cn("p-5", className)} />;
}
export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cn("flex flex-wrap justify-end gap-2 border-t border-border-subtle bg-surface/50 p-5", className)} />;
}
