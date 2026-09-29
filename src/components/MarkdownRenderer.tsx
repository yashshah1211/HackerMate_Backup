"use client";

import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";

interface MarkdownRendererProps {
  content?: string | null;
  className?: string;
}

/**
 * Preprocesses markdown text to fix common issues such as spaced hashes (# # #),
 * missing space after headers (###Header), or Windows line endings.
 */
function normalizeMarkdown(raw: string): string {
  if (!raw) return "";

  return raw
    .replace(/\r\n/g, "\n")
    // Fix broken header syntax like "# # # Title" into "### Title"
    .replace(/^(#\s+){1,5}#/gm, (match) => {
      const hashes = match.replace(/\s+/g, "");
      return hashes + " ";
    })
    // Fix missing space after hashes like "###Title" into "### Title"
    .replace(/^(#{1,6})([^\s#])/gm, "$1 $2")
    .trim();
}

/** V2 prose: ink headings, ink-2 body, mono code wells, underlined links. */
export default function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  const normalized = useMemo(() => normalizeMarkdown(content || ""), [content]);

  if (!normalized) return null;

  return (
    <div className={`markdown-content min-w-0 break-words text-[14px] leading-relaxed text-ink-2 ${className}`}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1 className="mb-3 mt-6 border-b border-line pb-2 font-display text-[20px] font-semibold tracking-[-0.02em] text-ink first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2.5 mt-6 text-[16px] font-semibold tracking-[-0.01em] text-ink first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-5 text-[14.5px] font-semibold text-ink first:mt-0">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="mb-1.5 mt-4 text-[13.5px] font-semibold text-ink first:mt-0">
              {children}
            </h4>
          ),
          p: ({ children }) => <p className="mb-3.5 text-ink-2">{children}</p>,
          ul: ({ children }) => (
            <ul className="mb-4 ml-5 list-outside list-disc space-y-1.5 text-ink-2 marker:text-ink-4">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-4 ml-5 list-outside list-decimal space-y-1.5 text-ink-2 marker:font-mono marker:text-[12px] marker:text-ink-3">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="pl-1">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
          em: ({ children }) => <em className="italic text-ink-2">{children}</em>,
          code: ({ children, className }) => {
            const isBlock = className?.includes("language-");
            if (isBlock) {
              return (
                <code className="my-3 block overflow-x-auto rounded-md bg-sunken p-3 font-mono text-[12.5px] text-ink ring-1 ring-inset ring-line">
                  {children}
                </code>
              );
            }
            return (
              <code className="rounded-[4px] bg-sunken px-1.5 py-0.5 font-mono text-[12px] text-ink ring-1 ring-inset ring-line">
                {children}
              </code>
            );
          },
          pre: ({ children }) => <pre className="max-w-full overflow-x-auto">{children}</pre>,
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-2 border-line-strong py-0.5 pl-3.5 text-ink-3">{children}</blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink"
            >
              {children}
            </a>
          ),
          hr: () => <hr className="my-6 border-line" />,
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
