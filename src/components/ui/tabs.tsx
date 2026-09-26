"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type ComponentProps } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

type TabsContextValue = { value: string; select: (value: string) => void; id: string };
const TabsContext = createContext<TabsContextValue | null>(null);
function useTabs() {
  const context = useContext(TabsContext);
  if (!context) throw new Error("Tab primitives must be rendered inside Tabs");
  return context;
}
export type TabsProps = Omit<ComponentProps<"div">, "defaultValue"> & {
  value?: string; defaultValue?: string; onValueChange?: (value: string) => void;
};
export function Tabs({ value, defaultValue = "", onValueChange, children, ...props }: TabsProps) {
  const [internal, setInternal] = useState(defaultValue);
  const id = useId();
  return <TabsContext.Provider value={{ id, value: value ?? internal, select: (next) => {
    if (value === undefined) setInternal(next);
    onValueChange?.(next);
  } }}><div {...props}>{children}</div></TabsContext.Provider>;
}
export function TabsList({ className, onKeyDown, ref: forwardedRef, ...props }: ComponentProps<"div">) {
  const tabs = useTabs();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!tabs.value) ref.current?.querySelector<HTMLButtonElement>('[role="tab"]:not(:disabled)')?.click();
  }, [tabs]);
  return <div {...props} ref={node => {
    ref.current = node;
    if (typeof forwardedRef === "function") return forwardedRef(node);
    if (forwardedRef) forwardedRef.current = node;
  }} role="tablist" aria-orientation="horizontal"
    className={cn("relative isolate inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-border-subtle bg-surface p-1", className)}
    onKeyDown={(event) => {
      onKeyDown?.(event);
      if (event.defaultPrevented || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'))
        .filter(tab => tab.closest('[role="tablist"]') === event.currentTarget);
      const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
      if (current < 0 || !tabs.length) return;
      event.preventDefault();
      const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
      const step = event.key === "ArrowRight" ? (rtl ? -1 : 1) : (rtl ? 1 : -1);
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + step + tabs.length) % tabs.length;
      tabs[next].focus();
      tabs[next].click();
    }} />;
}
export type TabsTriggerProps = ComponentProps<"button"> & { value: string };
export function TabsTrigger({ value, children, className, onClick, ...props }: TabsTriggerProps) {
  const tabs = useTabs();
  const reduced = useReducedMotion();
  const active = tabs.value === value;
  const key = encodeURIComponent(value);
  return <button {...props} type="button" role="tab" id={`${tabs.id}-tab-${key}`}
    aria-controls={`${tabs.id}-panel-${key}`} aria-selected={active} tabIndex={active ? 0 : -1}
    onClick={event => { onClick?.(event); if (!event.defaultPrevented) tabs.select(value); }}
    className={cn("relative shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-lime disabled:cursor-not-allowed disabled:opacity-40", active ? "text-foreground" : "text-muted hover:text-foreground", className)}>
    {active && <motion.span aria-hidden="true" layoutId={`${tabs.id}-indicator`}
      transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 35 }}
      className="absolute inset-0 z-0 rounded-full border border-border-hover bg-card shadow-sm" />}
    <span className="relative z-10">{children}</span>
  </button>;
}
export type TabsContentProps = ComponentProps<"div"> & { value: string };
export function TabsContent({ value, className, ...props }: TabsContentProps) {
  const tabs = useTabs();
  const key = encodeURIComponent(value);
  return <div {...props} role="tabpanel" id={`${tabs.id}-panel-${key}`} aria-labelledby={`${tabs.id}-tab-${key}`}
    hidden={tabs.value !== value} tabIndex={0}
    className={cn("mt-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-lime", className)} />;
}
