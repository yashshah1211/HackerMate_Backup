"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, EmptyState, ErrorNotice, Panel, Progress, Section, SkeletonRows } from "@/components/system";
import { supabase } from "@/lib/supabase";
import {
  assigneeLabel, dateValue, deadlineState, loadRunMode, openResponsibilities, recordedUrl, roundDates, taskProgress,
  type RunResult, type RunSnapshot, type RunSubmission,
} from "@/lib/hackathonRunMode";
import type { WorkspaceTab } from "./WorkspaceFrame";

type Props = { teamId: string; canAccess: boolean; onTabChange: (tab: WorkspaceTab) => void };
const TOOLS: { tab: WorkspaceTab; label: string }[] = [
  { tab: "tasks", label: "Tasks" }, { tab: "github", label: "GitHub" }, { tab: "deployments", label: "Deployments" },
  { tab: "resources", label: "Resources" }, { tab: "ppt", label: "Pitch review" }, { tab: "chat", label: "Team chat" },
];
const ARTIFACTS: { key: keyof Pick<RunSubmission, "demo_url" | "github_url" | "pitch_video_url" | "slides_url">; label: string }[] = [
  { key: "demo_url", label: "Demo" }, { key: "github_url", label: "Repository" },
  { key: "pitch_video_url", label: "Pitch video" }, { key: "slides_url", label: "Slides" },
];

function formatDate(value: string | null): string {
  const time = dateValue(value);
  if (time === null) return value ? "Invalid date recorded" : "Not recorded";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value!)) {
    return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
  return new Date(time).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
}

/** A read-only snapshot, refreshed on entry or explicitly. Existing editors and their subscriptions stay separate. */
export default function HackathonRunMode({ teamId, canAccess, onTabChange }: Props) {
  const [state, setState] = useState<{ teamId: string; loading: boolean; result: RunResult | null }>({ teamId, loading: true, result: null });
  const alive = useRef(false);
  const generation = useRef(0);
  const invalidate = useCallback(() => { ++generation.current; }, []);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    if (!alive.current || !canAccess) return;
    setState({ teamId, loading: true, result: null });
    const result = await loadRunMode(supabase, teamId);
    if (alive.current && request === generation.current) setState({ teamId, loading: false, result });
  }, [teamId, canAccess]);
  useEffect(() => {
    alive.current = true;
    void Promise.resolve().then(refresh);
    return () => { alive.current = false; invalidate(); };
  }, [refresh, invalidate]);

  if (!canAccess) return <EmptyState title="Team members only" body="Run mode is available to this team's owner and members." />;
  if (state.teamId !== teamId || state.loading) return <div role="status"><p className="mb-3 text-[13px] text-ink-3">Loading run mode…</p><SkeletonRows rows={4} /></div>;
  if (!state.result || state.result.kind === "error") return <ErrorNotice title="Couldn't load run mode" detail={state.result?.kind === "error" ? state.result.message : null} onRetry={refresh} />;
  if (state.result.kind === "denied") return <EmptyState title="Team members only" body="Your current sign-in could not access this team's run mode." action={<Button variant="secondary" size="sm" onClick={refresh}>Check access again</Button>} />;
  const data = state.result;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-3">Team execution snapshot · refreshed {formatDate(data.loadedAt)}</p>
        <Button variant="secondary" size="sm" onClick={refresh}>Refresh overview</Button>
      </div>
      <nav aria-label="Run mode tools" className="flex flex-wrap gap-2">
        {TOOLS.map(tool => <Button key={tool.tab} variant="secondary" size="sm" onClick={() => onTabChange(tool.tab)}>{tool.label}</Button>)}
      </nav>
      <Execution data={data} onTasks={() => onTabChange("tasks")} />
      <Section title="Hackathon dates and deadlines" id="run-dates">
        {data.events.error ? <ErrorNotice title="Couldn't load linked hackathons" detail={data.events.error} onRetry={refresh} /> : !data.events.data?.length ? (
          <EmptyState title="No linked hackathon" body="Task progress is available above. Link an event from the team page to see its recorded dates and submission information."
            action={<Link href={`/teams/${teamId}`} className="text-[13px] font-medium text-accent-ink hover:underline">Open team page</Link>} />
        ) : <div className="space-y-3">{data.events.data.map(event => (
          <Panel key={event.id} className="space-y-3 p-4">
            <Link href={`/hackathons/${event.id}`} className="text-[15px] font-semibold text-ink hover:underline">{event.name}</Link>
            <p className="text-[13px] text-ink-2">Starts: {formatDate(event.start_date)} · Ends: {formatDate(event.end_date)}</p>
            <p className="text-[12.5px] text-ink-3">Event end dates are not proof of a submission deadline.</p>
            {roundDates(event.rounds_info).map((round, index) => <p key={index} className="text-[13px] text-ink-2">{round.name} · Starts: {formatDate(round.start)} · Ends: {formatDate(round.end)}</p>)}
            {data.stages.error ? <ErrorNotice title="Scheduled deadlines unavailable" detail={data.stages.error} onRetry={refresh} /> : (
              data.stages.data?.filter(stage => stage.hackathon_id === event.id).length ? (
                <ul className="space-y-1 text-[13px] text-ink-2">{data.stages.data.filter(stage => stage.hackathon_id === event.id).map(stage => (
                  <li key={stage.id}>{stage.title} · Scheduled: {formatDate(stage.start_time)}{stage.end_time ? ` · Ends: ${formatDate(stage.end_time)}` : ""}</li>
                ))}</ul>
              ) : <p className="text-[13px] text-ink-3">No scheduled submission deadline recorded. Check the event requirements.</p>
            )}
            {recordedUrl(event.website_url) && <a href={recordedUrl(event.website_url)!} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium text-accent-ink hover:underline">Open event website</a>}
          </Panel>
        ))}</div>}
      </Section>
      <Section title="Submission readiness evidence" id="run-submissions">
        <p className="mb-3 text-[13px] text-ink-3">Saved links show preparation only. Their availability, event requirements and organizer receipt are not verified here. Confirm delivery on the event&apos;s submission portal.</p>
        {data.submissions.error ? <ErrorNotice title="Couldn't load submission records" detail={data.submissions.error} onRetry={refresh} /> : data.events.error ? (
          <p className="text-[13px] text-ink-3">Verify the linked hackathon before reviewing its submission record.</p>
        ) : !data.events.data?.length ? <p className="text-[13px] text-ink-3">Link a hackathon to review event-specific submission evidence.</p> : (
          <div className="space-y-3">{data.events.data.map(event => {
            const submission = data.submissions.data?.find(s => s.hackathon_id === event.id && s.team_id === teamId);
            return <Panel key={event.id} className="p-4">
              <h3 className="text-[14px] font-semibold text-ink">{event.name}</h3>
              {!submission ? <p className="mt-2 text-[13px] text-ink-3">No saved submission record available for this event. External submission status is unknown.</p> : <>
                <p className="mt-2 text-[13px] text-ink-2">Project title: {submission.project_title?.trim() || "Not recorded"}</p>
                <p className="mt-1 text-[13px] text-ink-3">Stored status: {submission.completion_status || "Unknown"} · Record updated: {formatDate(submission.updated_at)}</p>
                <ul className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">{ARTIFACTS.map(artifact => {
                  const value = submission[artifact.key], url = recordedUrl(value);
                  return <li key={artifact.key}>{artifact.label}: {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-accent-ink hover:underline">Saved link</a> : value?.trim() ? "Invalid link recorded" : "Not recorded"}</li>;
                })}</ul>
              </>}
            </Panel>;
          })}</div>
        )}
      </Section>
    </div>
  );
}

function Execution({ data, onTasks }: { data: RunSnapshot; onTasks: () => void }) {
  if (data.tasks.error || !data.tasks.data) return <ErrorNotice title="Task progress unavailable" detail={data.tasks.error} />;
  const tasks = data.tasks.data, progress = taskProgress(tasks), open = openResponsibilities(tasks);
  const now = new Date(data.loadedAt).getTime();
  const unassigned = open.filter(task => !task.assignee_id).length;
  const overdue = open.filter(task => deadlineState(task.due_date, now) === "overdue").length;
  const undated = open.filter(task => dateValue(task.due_date) === null).length;
  return (
    <Section title="Execution and responsibilities" id="run-execution" action={<Button size="sm" variant="secondary" onClick={onTasks}>Open tasks</Button>}>
      {!progress.total ? <EmptyState title="No tasks yet" body="Progress is unknown until the team records tasks. Assign responsibilities and dates in Tasks." /> : <Panel className="p-4">
        <p className="text-[15px] font-semibold text-ink">{progress.completed} of {progress.total} tasks completed · {progress.percent}%</p>
        <Progress value={progress.percent ?? 0} className="mt-3" aria-label="Recorded task completion" />
        <p className="mt-2 text-[13px] text-ink-3">{progress.todo} to do · {progress.inProgress} in progress{progress.unknown ? ` · ${progress.unknown} with unknown status` : ""}</p>
        <p className="mt-2 text-[13px] text-ink-2">{unassigned} open tasks unassigned · {overdue} overdue · {undated} without a valid due date</p>
        {data.members.error && <ErrorNotice title="Assignments unavailable" detail={data.members.error} className="mt-3" />}
        {!open.length ? <p className="mt-3 text-[13px] text-ink-3">All recorded tasks are complete. This does not confirm a submission.</p> : <>
          <p className="mt-4 caps-label text-ink-3">Next responsibilities · earliest deadlines first</p>
          <ul className="mt-2 divide-y divide-line">{open.slice(0, 8).map(task => (
            <li key={task.id} className="flex flex-col gap-1 py-2.5 text-[13px] sm:flex-row sm:justify-between">
              <span className="min-w-0"><span className="block break-words font-medium text-ink">{task.title}</span><span className="text-ink-3">{assigneeLabel(task, data.members.data)}</span></span>
              <span className="shrink-0 text-ink-3">Due: {formatDate(task.due_date)}{deadlineState(task.due_date, now) === "overdue" ? " · Overdue" : deadlineState(task.due_date, now) === "today" ? " · Due today" : ""}</span>
            </li>
          ))}</ul>
          {open.length > 8 && <p className="mt-2 text-[12.5px] text-ink-3">Showing 8 of {open.length} open tasks. Open Tasks for the full board.</p>}
        </>}
      </Panel>}
    </Section>
  );
}
