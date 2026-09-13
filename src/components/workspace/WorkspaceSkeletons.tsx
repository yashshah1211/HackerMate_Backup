"use client";

import React from "react";

/**
 * Low-contrast shimmer skeleton for the 3-column Collaborative Kanban board.
 */
export function KanbanTasksSkeleton() {
  const columns = ["To Do", "In Progress", "Completed"];

  return (
    <div className="space-y-4 animate-pulse">
      {/* Top workload balance placeholder */}
      <div className="p-4 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-950/40 space-y-2">
        <div className="h-3 w-40 bg-zinc-200 dark:bg-zinc-800 rounded" />
        <div className="flex gap-4">
          <div className="h-2 w-28 bg-zinc-200 dark:bg-zinc-800 rounded" />
          <div className="h-2 w-28 bg-zinc-200 dark:bg-zinc-800 rounded" />
        </div>
      </div>

      {/* 3 Kanban Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
        {columns.map((colName, colIdx) => (
          <div
            key={colIdx}
            className="flex flex-col rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-zinc-950/40 p-4 space-y-3 min-h-[380px]"
          >
            {/* Column Header */}
            <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800/80">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                <span className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">{colName}</span>
              </div>
              <div className="h-4 w-6 rounded-full bg-zinc-200 dark:bg-zinc-800" />
            </div>

            {/* Task Cards Skeletons */}
            {[1, 2].map((cardIdx) => (
              <div
                key={cardIdx}
                className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 space-y-2.5 shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="h-3 w-16 bg-zinc-200 dark:bg-zinc-800 rounded" />
                  <div className="h-4 w-12 rounded bg-zinc-100 dark:bg-zinc-800" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-3.5 w-4/5 bg-zinc-200 dark:bg-zinc-800 rounded" />
                  <div className="h-3 w-2/3 bg-zinc-100 dark:bg-zinc-800/60 rounded" />
                </div>
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between">
                  <div className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-3 w-14 bg-zinc-100 dark:bg-zinc-800 rounded" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Low-contrast shimmer skeleton for the GitHub commit timeline.
 */
export function CommitsTimelineSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3, 4].map((idx) => (
        <div key={idx} className="flex gap-4 items-start">
          <div className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-800 shrink-0 mt-0.5" />
          <div className="flex-1 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 space-y-2">
            <div className="h-3.5 w-3/4 bg-zinc-200 dark:bg-zinc-800 rounded" />
            <div className="flex items-center gap-3">
              <div className="h-3 w-24 bg-zinc-100 dark:bg-zinc-800 rounded" />
              <div className="h-3 w-16 bg-zinc-100 dark:bg-zinc-800/60 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Low-contrast shimmer skeleton for the brainstorm / ideation tag board.
 */
export function IdeationBoardSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-pulse">
      {[1, 2, 3, 4].map((idx) => (
        <div
          key={idx}
          className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 space-y-3 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <div className="h-4 w-20 rounded-full bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-4 w-12 rounded bg-zinc-100 dark:bg-zinc-800" />
          </div>
          <div className="space-y-1.5">
            <div className="h-4 w-5/6 bg-zinc-200 dark:bg-zinc-800 rounded" />
            <div className="h-3 w-full bg-zinc-100 dark:bg-zinc-800/60 rounded" />
            <div className="h-3 w-2/3 bg-zinc-100 dark:bg-zinc-800/60 rounded" />
          </div>
          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between">
            <div className="h-3 w-24 bg-zinc-100 dark:bg-zinc-800 rounded" />
            <div className="h-6 w-14 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Low-contrast shimmer skeleton for the workspace activity feed.
 */
export function ActivityFeedSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3, 4, 5].map((idx) => (
        <div
          key={idx}
          className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 shrink-0" />
            <div className="space-y-1">
              <div className="h-3.5 w-48 bg-zinc-200 dark:bg-zinc-800 rounded" />
              <div className="h-2.5 w-28 bg-zinc-100 dark:bg-zinc-800/60 rounded" />
            </div>
          </div>
          <div className="h-3 w-16 bg-zinc-100 dark:bg-zinc-800 rounded font-mono" />
        </div>
      ))}
    </div>
  );
}
