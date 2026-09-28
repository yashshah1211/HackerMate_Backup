"use client";

import { Skeleton } from "@/components/system";

/** Loading placeholder for the Tasks board: team pulse strip + three columns. */
export function KanbanTasksSkeleton() {
  const columns = ["To do", "In progress", "Done"];
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading tasks">
      <div className="grid gap-4 rounded-lg border border-line bg-raised p-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-2 w-2/3" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {columns.map((name) => (
          <div key={name} className="min-w-0">
            <div className="mb-2 flex items-center gap-2 px-0.5">
              <span className="size-2 rounded-full bg-line-strong" aria-hidden />
              <span className="text-[13px] font-semibold text-ink-3">{name}</span>
            </div>
            <div className="space-y-2 rounded-lg bg-sunken p-2 ring-1 ring-inset ring-line md:min-h-[320px]">
              {[0, 1].map((c) => (
                <div key={c} className="space-y-2.5 rounded-md border border-line bg-raised p-3">
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-2.5 w-2/3" />
                  <div className="flex items-center justify-between border-t border-line pt-2.5">
                    <Skeleton className="h-6 w-24 rounded-[5px]" />
                    <Skeleton className="size-5 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Loading placeholder for the GitHub commit list. */
export function CommitsTimelineSkeleton() {
  return (
    <div className="divide-y divide-line" aria-busy="true" aria-label="Loading commits">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-start gap-3 py-3">
          <Skeleton className="size-7 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
          <Skeleton className="h-6 w-16 rounded" />
        </div>
      ))}
    </div>
  );
}

/** Loading placeholder for the brainstorm ideas grid. */
export function IdeationBoardSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Loading ideas">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="space-y-3 rounded-lg border border-line bg-raised p-4">
          <Skeleton className="h-[18px] w-20 rounded-[3px]" />
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-5/6" />
            <Skeleton className="h-2.5 w-full" />
            <Skeleton className="h-2.5 w-2/3" />
          </div>
          <div className="flex items-center justify-between pt-1">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-8 w-14 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Loading placeholder for the activity log. */
export function ActivityFeedSkeleton() {
  return (
    <div className="divide-y divide-line rounded-lg border border-line bg-raised" aria-busy="true" aria-label="Loading activity">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3">
          <Skeleton className="size-7 shrink-0 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-2.5 w-2/3" />
          </div>
          <Skeleton className="h-2.5 w-10" />
        </div>
      ))}
    </div>
  );
}
