import type { SupabaseClient } from "@supabase/supabase-js";

export type RunTask = { id: string; team_id: string; title: string; status: string; assignee_id: string | null; due_date: string | null };
export type RunMember = { user_id: string; project_role: string | null; profiles: { full_name: string | null } | null };
export type RunEvent = { id: string; name: string; start_date: string | null; end_date: string | null; website_url: string | null; rounds_info: unknown };
export type RunStage = { id: string; hackathon_id: string; title: string; stage_type: string; start_time: string; end_time: string | null };
export type RunSubmission = { team_id: string; hackathon_id: string; project_title: string | null; demo_url: string | null; github_url: string | null; pitch_video_url: string | null; slides_url: string | null; completion_status: string | null; updated_at: string | null };
export type RunRead<T> = { data: T | null; error: string | null };
export type RunSnapshot = {
  kind: "ready"; teamId: string; loadedAt: string;
  tasks: RunRead<RunTask[]>; members: RunRead<RunMember[]>; events: RunRead<RunEvent[]>;
  stages: RunRead<RunStage[]>; submissions: RunRead<RunSubmission[]>;
};
export type RunResult = RunSnapshot | { kind: "denied" } | { kind: "error"; message: string };

function failed<T>(error: string): RunRead<T> { return { data: null, error }; }
function available<T>(data: T): RunRead<T> { return { data, error: null }; }

/** Explicit projections and exact counts avoid treating a truncated response as the whole team's progress. */
async function readRows<T>(label: string, query: PromiseLike<{ data: unknown; error: unknown; count: number | null }>): Promise<RunRead<T[]>> {
  try {
    const result = await query;
    if (result.error) throw result.error;
    if (!Array.isArray(result.data) || result.count !== result.data.length) throw new Error("Incomplete list response");
    return available(result.data as T[]);
  } catch (error) {
    console.error(`[run mode] ${label} read failed:`, error);
    return failed(`Couldn't verify ${label}. Refresh to try again.`);
  }
}

/** Read-only member/owner overview. No RPCs, remote URL probes, writes, or subscription side effects. */
export async function loadRunMode(client: Pick<SupabaseClient, "auth" | "from">, teamId: string): Promise<RunResult> {
  try {
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError) throw authError;
    if (!user) return { kind: "denied" };
    const { data: team, error: teamError } = await client.from("teams")
      .select("id, owner_id, hackathon_id").eq("id", teamId).maybeSingle();
    if (teamError) throw teamError;
    if (!team || team.id !== teamId) return { kind: "denied" };
    const members = await readRows<RunMember>("team responsibilities", client.from("team_members")
      .select("user_id, project_role, profiles(full_name)", { count: "exact" }).eq("team_id", teamId));
    if (team.owner_id !== user.id) {
      if (members.error) return { kind: "error", message: "Team membership could not be verified. Refresh to try again." };
      if (!members.data?.some(m => m.user_id === user.id)) return { kind: "denied" };
    }
    const [tasks, links] = await Promise.all([
      readRows<RunTask>("task progress", client.from("team_tasks")
        .select("id, team_id, title, status, assignee_id, due_date", { count: "exact" }).eq("team_id", teamId).order("created_at", { ascending: true })),
      readRows<{ hackathon_id: string }>("linked hackathons", client.from("team_hackathons")
        .select("hackathon_id", { count: "exact" }).eq("team_id", teamId)),
    ]);
    const ids = [...new Set([...(links.data || []).map(l => l.hackathon_id), team.hackathon_id].filter((id): id is string => typeof id === "string" && !!id))];
    let events: RunRead<RunEvent[]> = available([]), stages: RunRead<RunStage[]> = available([]), submissions: RunRead<RunSubmission[]> = available([]);
    if (links.error) {
      events = failed(links.error); stages = failed(links.error); submissions = failed(links.error);
    } else if (ids.length) {
      [events, stages, submissions] = await Promise.all([
        readRows<RunEvent>("hackathon dates", client.from("hackathons")
          .select("id, name, start_date, end_date, website_url, rounds_info", { count: "exact" }).in("id", ids)),
        readRows<RunStage>("scheduled deadlines", client.from("hackathon_stages")
          .select("id, hackathon_id, title, stage_type, start_time, end_time", { count: "exact" }).in("hackathon_id", ids).eq("stage_type", "deadline").order("start_time", { ascending: true })),
        readRows<RunSubmission>("submission records", client.from("team_submissions")
          .select("team_id, hackathon_id, project_title, demo_url, github_url, pitch_video_url, slides_url, completion_status, updated_at", { count: "exact" })
          .eq("team_id", teamId).in("hackathon_id", ids)),
      ]);
      if (events.data && (events.data.length !== ids.length || events.data.some(e => !ids.includes(e.id)))) {
        console.error("[run mode] Linked event details were incomplete");
        events = failed("Some linked hackathon details are unavailable. Refresh to try again.");
      }
    }
    // Ignore out-of-scope records defensively even though the server filters and RLS remain authoritative.
    if (tasks.data) tasks.data = tasks.data.filter(t => t.team_id === teamId);
    if (submissions.data) submissions.data = submissions.data.filter(s => s.team_id === teamId && ids.includes(s.hackathon_id));
    if (stages.data) stages.data = stages.data.filter(s => ids.includes(s.hackathon_id) && s.stage_type === "deadline");
    return { kind: "ready", teamId, loadedAt: new Date().toISOString(), tasks, members, events, stages, submissions };
  } catch (error) {
    console.error("[run mode] Access/read failed:", error);
    return { kind: "error", message: "Couldn't verify workspace access. Refresh to try again." };
  }
}

export function taskProgress(tasks: RunTask[]) {
  const completed = tasks.filter(t => t.status === "completed").length;
  return {
    total: tasks.length, completed,
    todo: tasks.filter(t => t.status === "todo").length,
    inProgress: tasks.filter(t => t.status === "in_progress").length,
    unknown: tasks.filter(t => !["todo", "in_progress", "completed"].includes(t.status)).length,
    percent: tasks.length ? (completed === tasks.length ? 100 : Math.min(99, Math.round(completed / tasks.length * 100))) : null,
  };
}

/** A saved URL proves only that an HTTP(S) address was recorded, never availability or organizer delivery. */
export function recordedUrl(value: string | null): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function dateValue(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:$|[T ])/.test(value)) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  // Reject calendar rollover instead of turning a malformed deadline into a real date.
  const calendarDay = value.slice(0, 10);
  if (new Date(calendarDay).toISOString().slice(0, 10) !== calendarDay) return null;
  return timestamp;
}

export function deadlineState(value: string | null, now: number): "overdue" | "today" | "upcoming" | "unknown" {
  const time = dateValue(value);
  if (time === null) return "unknown";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value!)) {
    const today = new Date(now);
    const localDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    return value === localDay ? "today" : value! < localDay ? "overdue" : "upcoming";
  }
  return time < now ? "overdue" : "upcoming";
}

export function openResponsibilities(tasks: RunTask[]) {
  return tasks.filter(t => t.status !== "completed").sort((a, b) => (dateValue(a.due_date) ?? Infinity) - (dateValue(b.due_date) ?? Infinity));
}

export function assigneeLabel(task: RunTask, members: RunMember[] | null): string {
  if (!task.assignee_id) return "Unassigned";
  if (!members) return "Assignment unavailable";
  const member = members.find(m => m.user_id === task.assignee_id);
  if (!member) return "Assignee no longer in team";
  return [member.profiles?.full_name || "Unnamed teammate", member.project_role].filter(Boolean).join(" · ");
}

export function roundDates(value: unknown): { name: string; start: string | null; end: string | null }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((round, index) => {
    if (!round || typeof round !== "object") return [];
    return [{ name: typeof round.name === "string" ? round.name : `Round ${index + 1}`,
      start: typeof round.start_date === "string" ? round.start_date : null,
      end: typeof round.end_date === "string" ? round.end_date : null }];
  });
}
