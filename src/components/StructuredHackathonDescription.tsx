"use client";
import { createElement, useMemo, type ReactNode } from "react";
import { parseEventDescription, type DescriptionNode } from "@/lib/hackathons/description";
function renderNode(node: DescriptionNode, key: number): ReactNode {
  if (typeof node === "string") return node;
  return createElement(node.tag, { key, ...(node.href ? { href: node.href, target: "_blank", rel: "noopener noreferrer" } : {}),
    ...(node.start !== undefined ? { start: node.start } : {}), ...(node.value !== undefined ? { value: node.value } : {}), ...(node.reversed ? { reversed: true } : {}) }, ...node.children.map(renderNode));
}
export default function StructuredHackathonDescription({ description, className = "", baseUrl }: { description?: string | null; className?: string; baseUrl?: string | null }) {
  const nodes = useMemo(() => parseEventDescription(description || "", baseUrl), [description, baseUrl]);
  if (!description?.trim()) return <p className="text-sm text-ink-3">No detailed description provided for this hackathon.</p>;
  return <div className={`min-w-0 max-w-[72ch] space-y-4 whitespace-pre-line break-words text-[14px] leading-7 text-ink-2 [overflow-wrap:anywhere] [&_h3]:pt-3 [&_h3]:font-semibold [&_h3]:text-ink [&_p]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_a]:text-accent-ink [&_a]:underline [&_a]:underline-offset-4 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-sunken [&_pre]:p-3 [&_table]:block [&_table]:overflow-x-auto [&_td]:border [&_td]:border-line [&_td]:p-2 [&_th]:p-2 ${className}`}>
    {nodes.map(renderNode)}
  </div>;
}
