"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const noopSubscribe = () => () => {};

/** True once mounted on the client (portals need document.body). */
function useMounted() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** Closes on Escape, locks page scroll, restores focus to the opener. */
function useOverlayBehaviour(open: boolean, onClose: () => void, panelRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => {
      const target = panelRef.current?.querySelector<HTMLElement>("[data-autofocus]") || panelRef.current;
      target?.focus({ preventScroll: true });
    }, 30);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
      opener?.focus?.({ preventScroll: true });
    };
  }, [open, onClose, panelRef]);
}

/**
 * Dialog: centred on desktop, bottom sheet on mobile. For confirmations and
 * short forms. Anything long belongs on a page.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const mounted = useMounted();
  const panelRef = useRef<HTMLDivElement>(null);
  useOverlayBehaviour(open, onClose, panelRef);
  if (!mounted) return null;
  const maxW = { sm: "sm:max-w-sm", md: "sm:max-w-md", lg: "sm:max-w-xl" }[size];

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-[var(--hm-scrim)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ type: "spring", stiffness: 520, damping: 40 }}
            className={cn(
              "relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-xl border border-line bg-overlay shadow-pop outline-none sm:rounded-xl",
              maxW,
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 pb-3.5 pt-4">
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
                {description && <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{description}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-1.5 -mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>
            {children && <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>}
            {footer && (
              <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/**
 * Sheet: slides from the right on desktop and from the bottom on mobile. For
 * inbox, filters, team switching — context you peek at and dismiss.
 */
export function Sheet({
  open,
  onClose,
  title,
  headerExtra,
  children,
  footer,
  side = "right",
  width = 440,
  label,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  headerExtra?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  side?: "right" | "left";
  width?: number;
  label?: string;
}) {
  const mounted = useMounted();
  const panelRef = useRef<HTMLDivElement>(null);
  useOverlayBehaviour(open, onClose, panelRef);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  if (!mounted) return null;

  const fromX = side === "right" ? "100%" : "-100%";
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90]">
          <motion.div
            className="absolute inset-0 bg-[var(--hm-scrim)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            initial={isDesktop ? { x: fromX } : { y: "100%" }}
            animate={isDesktop ? { x: 0 } : { y: 0 }}
            exit={isDesktop ? { x: fromX } : { y: "100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 42 }}
            style={isDesktop ? { width: `min(${width}px, 100vw)` } : undefined}
            className={cn(
              "absolute flex flex-col bg-overlay shadow-pop outline-none",
              isDesktop
                ? cn("inset-y-0 border-line", side === "right" ? "right-0 border-l" : "left-0 border-r")
                : "inset-x-0 bottom-0 max-h-[86dvh] rounded-t-xl border-t border-line",
            )}
          >
            {!isDesktop && <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-line-strong" aria-hidden />}
            {(title || headerExtra) && (
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 md:px-5">
                <div className="min-w-0 text-[15px] font-semibold text-ink">{title}</div>
                <div className="flex items-center gap-1">
                  {headerExtra}
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="inline-flex size-8 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
            {footer && <div className="border-t border-line px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-5">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Subscribe to a media query (SSR-safe; false on the server). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export type MenuItem =
  | { type?: "item"; label: string; icon?: ReactNode; onSelect: () => void; tone?: "default" | "danger"; hint?: ReactNode; disabled?: boolean }
  | { type: "separator" }
  | { type: "label"; label: string };

/**
 * Menu: small anchored list of actions (account, overflow "…"). Keyboard:
 * arrows move, Enter selects, Escape closes.
 */
export function Menu({
  trigger,
  items,
  align = "end",
  side = "bottom",
  className,
  header,
  scrollableItems,
}: {
  trigger: (props: { open: boolean; toggle: () => void; ref: React.Ref<HTMLButtonElement> }) => ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
  side?: "bottom" | "top" | "right";
  className?: string;
  header?: ReactNode;
  scrollableItems?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const els = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)") || []);
        if (!els.length) return;
        const idx = els.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === "ArrowDown" ? (idx + 1) % els.length : (idx - 1 + els.length) % els.length;
        els[next]?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => listRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus(), 20);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open]);

  const position =
    side === "right"
      ? cn("left-full ml-2", align === "end" ? "bottom-0" : "top-0")
      : side === "top"
        ? cn("bottom-full mb-2", align === "end" ? "right-0" : "left-0")
        : cn("top-full mt-1.5", align === "end" ? "right-0" : "left-0");

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      {trigger({ open, toggle: () => setOpen((o) => !o), ref: triggerRef })}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={listRef}
            role="menu"
            initial={{ opacity: 0, y: side === "top" ? 4 : -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.14, ease: [0.2, 0.8, 0.2, 1] }}
            className={cn(
              "absolute z-[80] min-w-[220px] overflow-hidden rounded-lg border border-line bg-overlay p-1 shadow-pop",
              position,
            )}
          >
            {header}
            <div className={scrollableItems ? "max-h-[50dvh] overflow-y-auto overscroll-contain scrollbar-none" : undefined}>
              {items.map((item, i) => {
                if (item.type === "separator") return <div key={i} className="my-1 h-px bg-line" />;
                if (item.type === "label")
                  return (
                    <div key={i} className="px-2.5 pb-1 pt-2 caps-label text-ink-4">
                      {item.label}
                    </div>
                  );
                return (
                  <button
                    key={i}
                    role="menuitem"
                    type="button"
                    disabled={item.disabled}
                    onClick={() => {
                      close();
                      item.onSelect();
                    }}
                    className={cn(
                      "flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] outline-none transition-colors disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0",
                      item.tone === "danger"
                        ? "text-bad hover:bg-bad-soft focus-visible:bg-bad-soft"
                        : "text-ink-2 hover:bg-hover hover:text-ink focus-visible:bg-hover focus-visible:text-ink",
                    )}
                  >
                    {item.icon && <span className="text-ink-3">{item.icon}</span>}
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.hint && <span className="text-[12px] text-ink-4">{item.hint}</span>}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

