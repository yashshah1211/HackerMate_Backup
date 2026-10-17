"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };

/** A single-choice popup, scoped to discovery rather than changing shared action menus. */
export function DiscoveryDropdown({
  id, label, value, options, onChange, compact = false,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly Option[];
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  const selected = options.find(option => option.value === value);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const initialIndex = useRef(0);
  const focusedOnOpen = useRef(false);
  const listId = `${id}-options`;

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  };
  const show = (index = Math.max(0, options.findIndex(option => option.value === value))) => {
    initialIndex.current = index;
    focusedOnOpen.current = false;
    setPosition(null);
    setOpen(true);
  };
  const onKey = (event: KeyboardEvent<HTMLElement>) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        show(event.key === "ArrowUp" ? options.length - 1 : undefined);
      }
      return;
    }
    if (event.key === "Escape") {
      // Consume this before the parent filter Sheet's document-level Escape handler.
      event.preventDefault(); event.stopPropagation(); close();
    } else if (event.key === "Tab") {
      // Restore the trigger before native Tab advances through the surrounding form.
      close();
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[role=option]") || []);
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
        : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.scrollIntoView({ block: "nearest" });
      items[next]?.focus({ preventScroll: true });
    }
  };

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = triggerRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const gap = 6, margin = 8;
      const below = Math.max(0, window.innerHeight - anchor.bottom - gap - margin);
      const above = Math.max(0, anchor.top - gap - margin);
      const maxHeight = Math.min(360, Math.max(below, above));
      const height = Math.min(maxHeight, options.length * 36 + 8);
      const width = Math.min(Math.max(anchor.width, 220), window.innerWidth - margin * 2);
      setPosition({ width, maxHeight,
        left: Math.max(margin, Math.min(compact ? anchor.right - width : anchor.left, window.innerWidth - width - margin)),
        top: below >= height ? anchor.bottom + gap : Math.max(margin, anchor.top - gap - height),
      });
    };
    const outside = (event: PointerEvent) => {
      if (!triggerRef.current?.contains(event.target as Node) && !listRef.current?.contains(event.target as Node)) setOpen(false);
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open, options.length, compact]);

  useEffect(() => {
    if (!open || !position || focusedOnOpen.current) return;
    // Reveal the selected row, then focus after the browser has painted that scroll.
    let focusFrame = 0;
    const frame = window.requestAnimationFrame(() => {
      const item = listRef.current?.querySelectorAll<HTMLButtonElement>("[role=option]")[initialIndex.current];
      item?.scrollIntoView({ block: "nearest" });
      focusFrame = window.requestAnimationFrame(() => {
        item?.focus({ preventScroll: true });
        if (item && document.activeElement === item) focusedOnOpen.current = true;
      });
    });
    return () => { window.cancelAnimationFrame(frame); window.cancelAnimationFrame(focusFrame); };
  }, [open, position]);

  return (
    <div className={compact ? "w-[min(260px,34vw)] min-w-[185px]" : "w-full"}>
        <button
          id={id}
          ref={triggerRef}
          type="button"
          aria-label={`${label}: ${selected?.label ?? value}`}
          aria-haspopup="listbox"
          aria-controls={open ? listId : undefined}
          aria-expanded={open}
          onClick={() => open ? close() : show()}
          onKeyDown={onKey}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-3 rounded-md px-3 text-left text-[13.5px] text-ink",
            "bg-sunken ring-1 ring-inset ring-line-strong transition-colors hover:bg-raised hover:ring-ink-4",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink",
            open && "bg-raised ring-accent-ink",
          )}
        >
          <span className="min-w-0 truncate">{selected?.label ?? value}</span>
          <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-ink-3 transition-transform duration-150", open && "rotate-180 text-ink")} />
        </button>
      {open && createPortal(
        <div id={listId} ref={listRef} role="listbox" aria-label={label} onKeyDown={onKey}
          style={{ ...position, visibility: position ? "visible" : "hidden" }}
          className="fixed z-[110] overflow-y-auto overscroll-contain rounded-lg border border-line bg-overlay p-1 shadow-pop">
          {options.map(option => <button key={option.value} type="button" role="option" tabIndex={-1}
            aria-selected={option.value === value} title={option.label}
            onClick={() => { close(); onChange(option.value); }}
            className="flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] text-ink-2 outline-none hover:bg-hover focus-visible:bg-hover focus-visible:text-ink">
            {option.value === value ? <Check aria-hidden className="size-4 shrink-0" /> : <span aria-hidden className="size-4 shrink-0" />}
            <span className="min-w-0 truncate">{option.label}</span>
          </button>)}
        </div>, document.body,
      )}
    </div>
  );
}
