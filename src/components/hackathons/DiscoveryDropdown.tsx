"use client";

import { Check, ChevronDown } from "lucide-react";
import { Menu } from "@/components/system";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };

/** Keyboard-friendly dark menu, preserving the existing discovery URL behavior. */
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
  return (
    <Menu
      align={compact ? "end" : "start"}
      scrollableItems
      className={compact ? "w-[min(260px,34vw)] min-w-[185px]" : "w-full"}
      trigger={({ open, toggle, ref }) => (
        <button
          id={id}
          ref={ref}
          type="button"
          aria-label={`${label}: ${selected?.label ?? value}`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={toggle}
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
      )}
      items={options.map(option => ({
        label: option.label,
        icon: option.value === value ? <Check aria-hidden /> : <span aria-hidden className="size-4" />,
        onSelect: () => onChange(option.value),
      }))}
    />
  );
}
