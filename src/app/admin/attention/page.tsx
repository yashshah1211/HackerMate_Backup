"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import AuthGuard from "@/components/AuthGuard";
import { StatusBadge } from "@/app/admin/_components/StatusBadge";
import type { AttentionCategory, AttentionFilter, AttentionResponse, Measurement } from "@/lib/admin/attentionQueue";
import { isFormationReport, type FormationReport } from "@/lib/admin/teamFormationReport";
import { supabase } from "@/lib/supabase";

const categories: { key: AttentionCategory; title: string; description: string }[] = [
  { key: "onboarding", title: "Incomplete onboarding", description: "Profiles explicitly marked incomplete" },
  { key: "join-requests", title: "Pending join requests", description: "Team owners are responsible for review" },
  { key: "invitations", title: "Pending invitations", description: "Intended recipients are responsible for responding" },
];
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
function measurement(value: unknown): value is Measurement {
  return record(value) && (value.status === "verified" ? Number.isSafeInteger(value.value) && (value.value as number) >= 0 :
    value.status === "unavailable" && value.value === null && typeof value.reason === "string");
}
function isResponse(value: unknown): value is AttentionResponse {
  if (!record(value) || typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt)) ||
    !["complete", "partial", "unavailable"].includes(String(value.coverage)) || !record(value.totals) || !record(value.joinRequestAges) ||
    !record(value.page) || !Array.isArray(value.warnings) || !value.warnings.every(v => typeof v === "string")) return false;
  if (!categories.every(category => measurement((value.totals as Record<string, unknown>)[category.key])) ||
    !["under1d", "oneTo7d", "over7d", "unknown"].every(key => measurement((value.joinRequestAges as Record<string, unknown>)[key])) ||
    !measurement(value.recentIncompleteRegistrations) || !measurement(value.unknownOnboardingState) || !measurement(value.oldInvitations)) return false;
  const page = value.page;
  if (page.status === "unavailable") return page.items === null && typeof page.error === "string";
  return page.status === "available" && Array.isArray(page.items) && typeof page.hasMore === "boolean" &&
    (page.nextCursor === null || typeof page.nextCursor === "string") && page.items.every(item => record(item) &&
      typeof item.id === "string" && typeof item.name === "string" && typeof item.responsible === "string" &&
      (item.team === null || typeof item.team === "string") && record(item.age) &&
      (item.age.status === "known" ? Number.isSafeInteger(item.age.days) && (item.age.days as number) >= 0 : item.age.status === "unknown" && typeof item.age.reason === "string") &&
      Array.isArray(item.links) && item.links.every(link => record(link) && typeof link.label === "string" && typeof link.href === "string" &&
        /^(?:\/profile\/[0-9a-f-]+|\/teams\/[0-9a-f-]+(?:\/requests)?|\/invites)$/.test(link.href)));
}
function Count({ metric }: { metric?: Measurement }) {
  return metric?.status === "verified" ? <>{metric.value}</> : <span title={metric?.status === "unavailable" ? metric.reason : undefined}>{metric ? "Unavailable" : "—"}</span>;
}
const time = (value: string) => new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

function FormationPanel({ refresh }: { refresh: number }) {
  const [loaded, setLoaded] = useState<{ refresh: number; report?: FormationReport; error?: string } | null>(null);
  const report = loaded?.refresh === refresh ? loaded.report : undefined;
  const error = loaded?.refresh === refresh ? loaded.error : undefined;
  useEffect(() => {
    const controller = new AbortController();
    let observedUser: string | null | undefined;
    let expectedUser: string | undefined;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      observedUser = session?.user.id ?? null;
      if (expectedUser !== undefined && observedUser !== expectedUser) {
        controller.abort();
        setLoaded({ refresh, error: "Account changed. Refresh to verify administrator access." });
      }
    });
    void (async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (controller.signal.aborted) return;
        if (authError) { console.error("[team-formation] report session check failed:", authError); throw new Error("Administrator access could not be verified."); }
        if (!user || observedUser !== undefined && observedUser !== user.id) throw new Error("Account changed. Refresh to verify administrator access.");
        expectedUser = user.id;
        const response = await fetch("/api/admin/team-formation", { cache: "no-store", credentials: "same-origin", signal: controller.signal });
        const body: unknown = await response.json();
        if (!response.ok || !isFormationReport(body)) throw new Error("Formation outcomes are unavailable. Access, retention or coverage could not be verified.");
        if (!controller.signal.aborted) setLoaded({ refresh, report: body });
      } catch (failure) {
        if (!controller.signal.aborted) setLoaded({ refresh, error: failure instanceof Error ? failure.message : "Formation data is unavailable." });
      }
    })();
    return () => { controller.abort(); subscription.unsubscribe(); };
  }, [refresh]);
  const rate = (n: number, d: number) => report?.coverage === "complete" && d > 0 ? `${n} / ${d} (${(100 * n / d).toFixed(1)}%)` : `${n} / ${d} · rate unavailable`;
  const decimal = (n: number | null, unit: string) => n === null ? "Unavailable" : `${n.toFixed(1)} ${unit}`;
  return <section aria-labelledby="formation-title" className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
    <h2 id="formation-title" className="font-semibold">Team formation outcomes</h2>
    {!report && !error && <p role="status" className="text-sm text-zinc-500">Loading formation outcomes…</p>}
    {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error} Use Refresh to retry.</p>}
    {report && <>
      <p className="text-xs text-zinc-500">UTC cohort [{report.start}, {report.end}). Generated {time(report.generatedAt)} IST. Coverage starts {time(report.coverageStart)} IST; {report.coverage}. Cleanup verified {time(report.cleanupAt)} IST.</p>
      {report.coverage !== "complete" && <p role="status" className="text-sm text-amber-700 dark:text-amber-400">Partial measurement: rates are unavailable. Missing history is not a zero outcome.</p>}
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <caption className="sr-only">Mature cohorts and confirmed durable team outcomes</caption>
        <thead><tr className="border-b border-zinc-200 dark:border-zinc-800"><th scope="col" className="py-2 pr-4">Measure</th><th scope="col" className="py-2">Verified aggregate</th></tr></thead>
        <tbody>{[
          ["Current pending backlog", `${report.backlog.pending}; over 7d ${report.backlog.over7}; over 14d ${report.backlog.over14}; unknown age ${report.backlog.unknown_age}`],
          ["Pending age P50 / P90", `${decimal(report.backlog.age_p50_days, "days")} / ${decimal(report.backlog.age_p90_days, "days")}`],
          ["Submitted requests", `${report.requests.submitted} attempts; ${report.requests.applicants} applicants; ${report.requests.mature} mature; ${report.requests.immature} immature`],
          ["Mature request outcomes", `${report.requests.accepted} accepted; ${report.requests.rejected} rejected; ${report.requests.superseded} superseded; ${report.requests.unclassified} unclassified; ${report.requests.pending} still pending`],
          ["Owner response within seven days", rate(report.requests.responded7, report.requests.mature)],
          ["Request to confirmed membership", rate(report.requests.converted, report.requests.mature)],
          ["Owner decision time P50 / P90", `${decimal(report.requests.decision_p50_hours, "hours")} / ${decimal(report.requests.decision_p90_hours, "hours")}`],
          ["Membership acquisitions", `${report.memberships.episodes} episodes / ${report.memberships.people} people; ${report.memberships.creators} creators; ${report.memberships.joiners} joiners; ${report.memberships.unattributed} unattributed; ${report.removals} removals`],
          ["New-account first-team activation within seven days", `${rate(report.activation.activated7, report.activation.mature)}; ${report.activation.creators7} creators; ${report.activation.joiners7} joiners; ${report.activation.unattributed7} unattributed; ${report.activation.immature} immature registrations`],
          ["Current collaboration", `${report.collaboratingTeams} teams with at least two members`],
          ["Measurement health", `${report.baselineFacts} baseline facts; ${report.excludedAccounts} legacy or unknown-registration accounts excluded from first activation; ${report.requests.unexplained} unexplained request gaps; ${report.qualityIssues} reassignment or timestamp issues`],
        ].map(([label, value]) => <tr key={label} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"><th scope="row" className="py-2 pr-4 font-medium">{label}</th><td className="py-2">{value}</td></tr>)}</tbody>
      </table></div>
      {report.warnings.map(warning => <p key={warning} className="text-xs text-zinc-500">{warning}</p>)}
    </>}
  </section>;
}

function AttentionContent() {
  const [category, setCategory] = useState<AttentionCategory>("onboarding");
  const [filter, setFilter] = useState<AttentionFilter>("all");
  const [cursor, setCursor] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; data: AttentionResponse } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const requestVersion = useRef(0);
  const key = JSON.stringify([category, filter, cursor, refresh]);
  const data = loaded?.key === key ? loaded.data : null;
  const loadError = error?.key === key ? error.message : null;
  const loading = !data && !loadError;

  useEffect(() => {
    const controller = new AbortController();
    const version = ++requestVersion.current;
    async function load() {
      setLoaded(null);
      setError(null);
      try {
        const params = new URLSearchParams({ category, filter });
        if (cursor) params.set("cursor", cursor);
        const response = await fetch(`/api/admin/attention?${params}`, { method: "GET", cache: "no-store", credentials: "same-origin", signal: controller.signal });
        const body: unknown = await response.json();
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Administrator access could not be verified." :
          record(body) && typeof body.error === "string" ? body.error : "Attention data is unavailable. Please retry.");
        if (!isResponse(body) || body.category !== category || body.filter !== filter) throw new Error("Attention data returned an incomplete response. Please retry.");
        if (version === requestVersion.current && !controller.signal.aborted) setLoaded({ key, data: body });
      } catch (failure) {
        if (version === requestVersion.current && !controller.signal.aborted) {
          setLoaded(null);
          setError({ key, message: failure instanceof Error ? failure.message : "Attention data is unavailable. Please retry." });
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [category, filter, cursor, key]);

  function selectCategory(next: AttentionCategory) { setCategory(next); setFilter("all"); setCursor(null); }
  function reload() { setCursor(null); setRefresh(value => value + 1); }
  const active = categories.find(item => item.key === category)!;
  const button = "rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-800 dark:hover:bg-zinc-900";

  return <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 text-zinc-900 sm:px-6 dark:text-zinc-100">
    <Link href="/admin" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"><ArrowLeft size={14} /> Back to admin</Link>
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Admin operations · Read only</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Founder Attention Queue</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-500">Outstanding work, who is responsible, and where to review it.</p>
        {data && <p className="mt-2 text-xs text-zinc-500">Generated <time dateTime={data.generatedAt}>{time(data.generatedAt)}</time> IST. Counts are independent reads, not an atomic snapshot.</p>}
      </div>
      <button type="button" onClick={reload} className={`${button} inline-flex w-fit items-center gap-2`}><RefreshCw size={14} /> Refresh</button>
    </header>

    <FormationPanel refresh={refresh} />

    {loading && <p role="status" className="text-sm text-zinc-500">Loading attention queues…</p>}
    {loadError && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm"><p>{loadError}</p><button type="button" onClick={reload} className={`${button} mt-3`}>Retry queues</button></div>}
    {data?.coverage === "partial" && <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">Some reads are unavailable. Verified counts remain visible; unavailable values are not zero.</p>}
    {data?.warnings.map(warning => <p key={warning} role="status" className="text-sm text-amber-700 dark:text-amber-400">{warning}</p>)}

    <div className="grid gap-3 md:grid-cols-3" aria-label="Queue categories">
      {categories.map(item => <button type="button" key={item.key} onClick={() => selectCategory(item.key)} aria-pressed={category === item.key}
        className={`rounded-xl border bg-white p-5 text-left dark:bg-zinc-950 ${category === item.key ? "border-lime-500 dark:border-[#B4F461]" : "border-zinc-200 dark:border-zinc-800"}`}>
        <span className="block text-sm font-semibold">{item.title}</span>
        <span className="mt-2 block text-3xl font-bold tabular-nums"><Count metric={data?.totals[item.key]} /></span>
        <span className="mt-2 block text-xs text-zinc-500">{item.description}</span>
      </button>)}
    </div>

    {data && <section aria-label="Queue context" className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950">
      {category === "onboarding" ? <>
        <p>Registered in the last 24 hours and still explicitly incomplete: <strong><Count metric={data.recentIncompleteRegistrations} /></strong></p>
        <p>Unknown onboarding state, excluded from incomplete totals and lists: <strong><Count metric={data.unknownOnboardingState} /></strong></p>
        <p className="text-xs text-zinc-500">Account age uses registration time. Time spent incomplete and newly incomplete transitions are unmeasured. Suspended accounts remain included and labelled.</p>
      </> : category === "join-requests" ? <>
        <p className="font-medium">Pending request age distribution</p>
        <dl className="flex flex-wrap gap-x-6 gap-y-2">{([
          ["Under 1 day", data.joinRequestAges.under1d], ["1–7 days", data.joinRequestAges.oneTo7d],
          ["Over 7 days", data.joinRequestAges.over7d], ["Unknown age", data.joinRequestAges.unknown],
        ] as [string, Measurement][]).map(([label, metric]) => <div key={label}><dt className="text-xs text-zinc-500">{label}</dt><dd><Count metric={metric} /></dd></div>)}</dl>
        <p className="text-xs text-zinc-500">Age is measured from request creation. Each bucket is an independent exact count.</p>
      </> : <><p>Invitations created over 7 days ago: <strong><Count metric={data.oldInvitations} /></strong></p><p className="text-xs text-zinc-500">Only the intended recipient can respond through their own Invites page.</p></>}
    </section>}

    <section aria-labelledby="queue-title" aria-busy={loading} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="queue-title" className="text-base font-semibold">{active.title} · oldest {category === "onboarding" ? "accounts" : "records"} first</h2>
        <div className="flex gap-2" aria-label="Queue filters">
          <button type="button" className={button} aria-pressed={filter === "all"} onClick={() => { setFilter("all"); setCursor(null); }}>All outstanding</button>
          <button type="button" className={button} aria-pressed={filter !== "all"} onClick={() => { setFilter(category === "onboarding" ? "recent" : "over7d"); setCursor(null); }}>{category === "onboarding" ? "Registered in last 24h" : "Over 7 days"}</button>
        </div>
      </div>
      <p className="text-xs text-zinc-500">Summary totals cover each full queue. The list shows one filtered page. Missing timestamps sort last; missing, invalid or future timestamps have unknown age.</p>
      {data?.page.status === "unavailable" && <p role="alert" className="rounded-xl border border-amber-500/30 p-4 text-sm">{data.page.error} Use Refresh to retry; list size is unavailable.</p>}
      {data?.page.status === "available" && <>
        {data.page.items?.length === 0 ? <p role="status" className="rounded-xl border border-zinc-200 p-8 text-center text-sm text-zinc-500 dark:border-zinc-800">No outstanding records match this filter.</p> :
          <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
            {data.page.items?.map(item => <li key={item.id} className="space-y-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{item.name}</h3>{item.suspended === true && <StatusBadge label="Suspended" variant="warning" />}</div>
              {item.team && <p className="text-sm">Team: {item.team}</p>}
              <p className="text-xs text-zinc-500">{category === "onboarding" ? "Account age" : "Record age"}: {item.age.status === "known" ? `${item.age.days} ${item.age.days === 1 ? "day" : "days"}` : `Unknown — ${item.age.reason}`}{item.createdAt && <> · {category === "onboarding" ? "Registered" : "Created"} <time dateTime={item.createdAt}>{time(item.createdAt)}</time> IST</>}</p>
              <p className="text-sm text-zinc-500">{item.responsible}</p>
              {item.links.length > 0 && <div className="flex flex-wrap gap-x-4 gap-y-2">{item.links.map(link => <Link key={link.href} href={link.href} className="text-xs font-medium underline decoration-zinc-300 underline-offset-4 hover:decoration-lime-500">{link.label}</Link>)}</div>}
            </li>)}
          </ul>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">{data.page.items?.length} records on this page. Aggregate counts are shown separately above.</p>
          <div className="flex gap-2">
            {cursor && <button type="button" className={button} onClick={() => setCursor(null)}>First page</button>}
            {data.page.nextCursor && <button type="button" className={button} onClick={() => setCursor(data.page.nextCursor)}>Next page</button>}
          </div>
        </div>
      </>}
    </section>
    <p className="border-t border-zinc-200 pt-4 text-xs text-zinc-500 dark:border-zinc-800">User reports are deferred: the current schema provides no reliable unresolved state. This queue performs reads only; resolution stays with the existing responsible user or team owner.</p>
  </main>;
}

export default function AttentionPage() {
  return <AuthGuard adminOnly><AttentionContent /></AuthGuard>;
}
