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

export default function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  const normalized = useMemo(() => normalizeMarkdown(content || ""), [content]);

  if (!normalized) return null;

  return (
    <div className={`markdown-content text-xs sm:text-sm leading-relaxed ${className}`}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1 className="text-xl sm:text-2xl font-extrabold text-zinc-900 dark:text-white mt-6 mb-3 pb-2 border-b border-zinc-200 dark:border-zinc-800">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white mt-5 mb-2.5 flex items-center gap-2">
              <span className="w-1.5 h-4 rounded-full bg-lime-500 inline-block shrink-0" />
              <span>{children}</span>
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm sm:text-[15px] font-bold text-zinc-900 dark:text-zinc-100 mt-5 mb-2 pt-1">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-xs sm:text-sm font-semibold text-zinc-800 dark:text-zinc-200 mt-3 mb-1.5">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="text-zinc-700 dark:text-zinc-300 mb-3.5 leading-relaxed font-normal">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-outside ml-5 space-y-1.5 mb-4 text-zinc-700 dark:text-zinc-300">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-outside ml-5 space-y-1.5 mb-4 text-zinc-700 dark:text-zinc-300">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed pl-1 marker:text-lime-500 marker:font-bold">
              {children}
            </li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-zinc-800 dark:text-zinc-200">
              {children}
            </em>
          ),
          code: ({ children, className }) => {
            const isBlock = className?.includes("language-");
            if (isBlock) {
              return (
                <code className="block bg-zinc-900 text-zinc-100 p-3 rounded-lg text-xs font-mono overflow-x-auto my-3 border border-zinc-800">
                  {children}
                </code>
              );
            }
            return (
              <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-lime-700 dark:text-lime-400 font-mono text-[11px] border border-zinc-200 dark:border-zinc-700/60">
                {children}
              </code>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-lime-500 pl-3.5 py-1 italic my-3 text-zinc-600 dark:text-zinc-400 bg-lime-500/5 rounded-r">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-lime-600 dark:text-lime-400 underline underline-offset-2 hover:text-lime-500 font-medium transition"
            >
              {children}
            </a>
          ),
          hr: () => (
            <hr className="my-6 border-zinc-200 dark:border-zinc-800" />
          ),
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
