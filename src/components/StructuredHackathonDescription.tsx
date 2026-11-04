"use client";

import { useMemo } from "react";
import { ChevronDown, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { descriptionInlines, parseHackathonDescription, type DescriptionBlock, type DescriptionSection } from "@/lib/hackathons/description";

interface StructuredHackathonDescriptionProps {
  description: string | null | undefined;
  className?: string;
}

function InlineText({ text }: { text: string }) {
  return descriptionInlines(text).map((part, index) => part.href ? (
    <a key={index} href={part.href} target="_blank" rel="noopener noreferrer"
      className="rounded-sm text-ink underline decoration-ink-4 underline-offset-4 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--hm-focus)]">
      {part.text}<span className="sr-only"> (opens in a new tab)</span>
    </a>
  ) : <span key={index}>{part.text}</span>);
}

function Block({ block }: { block: DescriptionBlock }) {
  if (block.kind === "paragraph") return <p className="whitespace-pre-wrap"><InlineText text={block.text} /></p>;
  if (block.kind === "facts") return (
    <dl className="divide-y divide-line border-y border-line">
      {block.items.map((item, index) => <div key={index} className="grid min-w-0 gap-1 py-3 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)] sm:gap-5">
        <dt className="text-[13px] font-medium text-ink-3">{item.label}</dt>
        <dd className="min-w-0 text-ink"><InlineText text={item.text} /></dd>
      </div>)}
    </dl>
  );
  const List = block.ordered ? "ol" : "ul";
  return <List className={cn("space-y-2.5 pl-5 marker:text-ink-3", block.ordered ? "list-decimal" : "list-disc")}
    start={block.ordered ? block.items[0]?.value : undefined}>
    {block.items.map((item, index) => <li key={index} value={block.ordered ? item.value : undefined} className="pl-1"><InlineText text={item.text} /></li>)}
  </List>;
}

function SectionContent({ section }: { section: DescriptionSection }) {
  return <div className="space-y-4">{section.blocks.map((block, index) => <Block key={index} block={block} />)}</div>;
}

export default function StructuredHackathonDescription({ description, className }: StructuredHackathonDescriptionProps) {
  const sections = useMemo(() => parseHackathonDescription(description), [description]);
  if (!sections.length) return <p className={cn("py-1 text-sm leading-7 text-ink-3", className)}>The organizer hasn’t provided a detailed description yet.</p>;

  return <div className={cn("min-w-0 max-w-[72ch] space-y-8 text-[14.5px] leading-[1.85] text-ink-2 [overflow-wrap:anywhere] sm:text-[15px]", className)}>
    {sections.map((section, index) => {
      const criticalHeading = section.title && /mandatory|required|compulsory|warning|important notice/i.test(section.title);
      if (section.collapsible) return <details key={index} className="group border-y border-line py-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--hm-focus)] [&::-webkit-details-marker]:hidden">
          <h3 className="text-[16px] leading-6">{section.title}</h3>
          <span className="flex shrink-0 items-center gap-2 text-[12px] font-normal text-ink-3"><span className="group-open:hidden">Read details</span><span className="hidden group-open:inline">Show less</span><ChevronDown className="size-4 group-open:rotate-180" aria-hidden /></span>
        </summary>
        <div className="pt-5"><SectionContent section={section} /></div>
      </details>;
      return <section key={index} className={cn("min-w-0", criticalHeading && "border-l-2 border-warn pl-4 sm:pl-5")}>
        {section.title && <h3 className={cn("mb-3 flex items-start gap-2.5 text-[16px] font-semibold leading-7 text-ink", criticalHeading && "text-warn")}>
          {criticalHeading && <CircleAlert className="mt-1 size-4 shrink-0" aria-hidden />}
          <InlineText text={section.title} />
        </h3>}
        <SectionContent section={section} />
      </section>;
    })}
  </div>;
}
