"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { WorkspaceIdentity } from "@/lib/partners/workspace";
import { clearFilterChanges, fetchParticipantExport, fetchWorkspaceSection, participantFiltersActive, sectionQuery,
  workspaceHref, workspaceParams, workspaceTab, WorkspaceReadError, type WorkspaceData, type WorkspacePagination } from "@/lib/partners/workspaceClient";
import OrganizerAccessState from "./OrganizerAccessState";
import OrganizerFilters from "./OrganizerFilters";
import { ParticipantTable, TeamTable, WorkspaceTime } from "./OrganizerTables";
import styles from "./OrganizerDashboard.module.css";

type ReadState = { status: "loading" | "idle" } | { status: "error"; message: string } | { status: "ready"; data: WorkspaceData };

function useWorkspaceRead(identity: WorkspaceIdentity, query: string | null, refresh: number, accessIssue: (status: number) => void): ReadState {
  const key = `${identity.slug}:${identity.eventId}:${query}:${refresh}`;
  const [result, setResult] = useState<{ key: string; state: ReadState } | null>(null);
  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    let active = true;
    fetchWorkspaceSection(identity.slug, identity.eventId, new URLSearchParams(query), controller.signal)
      .then(data => { if (active) setResult({ key, state: { status: "ready", data } }); })
      .catch(error => {
        if (!active) return;
        console.error("[partner workspace] Section read failed:", error);
        if (error instanceof WorkspaceReadError && (error.status === 401 || error.status === 403)) accessIssue(error.status);
        setResult({ key, state: { status: "error", message: error instanceof WorkspaceReadError ? error.message : "This section is temporarily unavailable." } });
      });
    return () => { active = false; controller.abort(); };
  }, [identity.slug, identity.eventId, query, key, accessIssue]);
  if (!query) return { status: "idle" };
  return result?.key === key ? result.state : { status: "loading" };
}

function ReadNotice({ state, retry, label }: { state: ReadState; retry: () => void; label: string }) {
  return state.status === "error" ? <div className={styles.notice} role="alert"><p>{label}: {state.message}</p>
    <button type="button" className={styles.secondary} onClick={retry}>Retry {label.toLowerCase()}</button></div>
    : <p className={styles.muted} role="status">Loading {label.toLowerCase()}…</p>;
}
function Pagination({ value, tab, identity, params }: {
  value: WorkspacePagination; tab: "participants" | "teams"; identity: WorkspaceIdentity; params: URLSearchParams;
}) {
  const key = tab === "participants" ? "pPage" : "tPage";
  return <nav className={styles.pagination} aria-label={`${tab} pagination`}>
    <span>{value.total} matching {tab}; {value.totalPages ? `page ${value.page} of ${value.totalPages}` : "no pages"}</span>
    <div>{value.page > 1 && <Link href={workspaceHref(identity.slug, params, { [key]: String(value.page - 1) })} className={styles.secondary}>Previous</Link>}
      {value.hasNext && value.page < 40_001 && <Link href={workspaceHref(identity.slug, params, { [key]: String(value.page + 1) })} className={styles.secondary}>Next</Link>}</div>
    {value.hasNext && value.page >= 40_001 && <span>Narrow the filters to view further results.</span>}
  </nav>;
}

export default function OrganizerDashboard({ identity }: { identity: WorkspaceIdentity }) {
  const router = useRouter();
  const search = useSearchParams();
  const confirmedLimits = identity.minTeamSize !== null && identity.maxTeamSize !== null;
  const params = workspaceParams(new URLSearchParams(search.toString()), confirmedLimits);
  const tab = workspaceTab(params);
  const [refresh, setRefresh] = useState(0);
  const [accessStatus, setAccessStatus] = useState<number | null>(null);
  const accessRef = useRef<number | null>(null);
  const onAccessIssue = useCallback((status: number) => { accessRef.current = status; setAccessStatus(status); }, []);
  const summary = useWorkspaceRead(identity, "section=overview", refresh, onAccessIssue);
  const section = useWorkspaceRead(identity, tab === "overview" ? null : sectionQuery(tab, params).toString(), refresh, onAccessIssue);
  const recent = useWorkspaceRead(identity, tab === "overview" ? "section=participants&page=1&pageSize=5&sort=newest" : null, refresh, onAccessIssue);
  const below = useWorkspaceRead(identity, tab === "overview" && confirmedLimits ? "section=teams&page=1&pageSize=1&sizeState=below_min" : null, refresh, onAccessIssue);
  const above = useWorkspaceRead(identity, tab === "overview" && confirmedLimits ? "section=teams&page=1&pageSize=1&sizeState=above_max" : null, refresh, onAccessIssue);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const publicPath = `/partners/${encodeURIComponent(identity.slug)}`;
  const filteredParticipants = participantFiltersActive(params);
  const retry = () => { setRefresh(value => value + 1); router.refresh(); };
  const updated = [summary, section, recent, below, above].flatMap(value => value.status === "ready" ? [value.data.retrievedAt] : [])
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];

  async function exportParticipants() {
    if (exporting || accessRef.current) return;
    setExporting(true); setExportError(null);
    try {
      const blob = await fetchParticipantExport(identity.slug, params);
      if (accessRef.current) return;
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement("a"); link.href = url; link.download = "partner-participants.csv";
        document.body.append(link); link.click(); link.remove();
      } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch (error) {
      console.error("[partner workspace] Export failed:", error);
      if (error instanceof WorkspaceReadError && (error.status === 401 || error.status === 403)) onAccessIssue(error.status);
      setExportError(error instanceof WorkspaceReadError ? error.message : "Participant export is unavailable. Please retry.");
    } finally { setExporting(false); }
  }
  async function copyPublicLink() {
    try { await navigator.clipboard.writeText(new URL(publicPath, window.location.origin).href); setCopyMessage("Public event link copied."); }
    catch (error) { console.error("[partner workspace] Copy failed:", error); setCopyMessage("Could not copy the link. Use Open public page instead."); }
  }
  function apply(changes: Record<string, string>) {
    router.push(workspaceHref(identity.slug, params, { ...changes, [tab === "participants" ? "pPage" : "tPage"]: null }));
  }
  if (accessStatus) return <OrganizerAccessState kind={accessStatus === 401 ? "unauthenticated" : "denied"}
    loginHref={`/login?next=${encodeURIComponent(workspaceHref(identity.slug, params, {}))}`} />;

  const metrics = summary.status === "ready" && summary.data.section === "overview" ? summary.data.metrics : null;
  return <main className={styles.page}><div className={styles.container}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>{identity.partnerName} / Organizer workspace</p>
        <h1 className={styles.title}>{identity.eventName}</h1>
        <p className={styles.eventFacts}>{identity.archived ? "Archived event" : identity.approvalStatus ? `Event approval: ${identity.approvalStatus}` : null}
          {identity.startDate && <span><time dateTime={identity.startDate}>{identity.startDate}</time>{identity.endDate && identity.endDate !== identity.startDate ? ` – ${identity.endDate}` : ""}</span>}
          {identity.mode && <span>{identity.mode}</span>}{identity.location && <span>{identity.location}</span>}</p>
        <p className={styles.muted}>HackerMate event-community registrations.{identity.externalRegistration ? " Official organizer registration is separate." : ""}</p>
      </div>
      <div className={styles.headerActions}><button type="button" className={styles.secondary} onClick={retry}>Refresh</button>
        <Link href={publicPath} className={styles.secondary}>Open public page</Link>
        <button type="button" className={styles.primary} disabled={exporting} onClick={exportParticipants}>{exporting ? "Preparing export…" : "Export participants"}</button>
      </div>
    </header>
    <div className={styles.retrieval}><p>{updated ? <>Updated <WorkspaceTime value={updated} /></> : "Retrieving current event data…"}</p>
      <p>{filteredParticipants ? "Export matches the saved participant filters across all pages." : "Export includes all HackerMate participants across all pages."}
        {filteredParticipants && <> <Link href={workspaceHref(identity.slug, params, { tab: "participants" })}>Review participant filters</Link></>}</p>
    </div>
    {exporting && <p role="status" className={styles.muted}>The download uses the participant filters active when you clicked Export participants.</p>}
    {exportError && <p role="alert" className={styles.notice}>{exportError}</p>}
    <section aria-label="HackerMate event summary" className={styles.summarySection}>
      {metrics ? <dl className={styles.summary}>{[
        ["HackerMate registrations", metrics.registration_count], ["Event-linked teams", metrics.team_count],
        ["Registered in teams", metrics.participants_in_team], ["Registered without a team", metrics.participants_without_team],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        : <ReadNotice state={summary} retry={retry} label="Summary" />}
    </section>
    <nav className={styles.tabs} aria-label="Organizer views">{(["overview", "participants", "teams"] as const).map(value =>
      <Link key={value} href={workspaceHref(identity.slug, params, { tab: value })} aria-current={tab === value ? "page" : undefined}>{value === "overview" ? "Overview" : value === "participants" ? "Participants" : "Teams"}</Link>)}</nav>
    {tab === "overview" ? <div className={styles.overview}>
      <section aria-labelledby="attention-heading"><h2 id="attention-heading">Needs attention</h2>
        {metrics ? metrics.registration_count === 0 ? <div className={styles.empty}>
          <h3>No one has joined {identity.eventName} on HackerMate yet.</h3>
          <p>Share the public event page to help builders find teammates. This says nothing about registrations on the organizer’s site.</p>
          <div className={styles.emptyActions}><Link href={publicPath} className={styles.secondary}>Open public page</Link>
            <button type="button" className={styles.secondary} onClick={copyPublicLink}>Copy public event link</button></div>
          {copyMessage && <p role="status">{copyMessage}</p>}
        </div> : <ul className={styles.attentionList}>{[
          { label: "Registered without an event-linked team", value: metrics.participants_without_team, changes: { pTeamState: "without_team", pLooking: null } },
          { label: "Explicitly looking for teammates", value: metrics.looking_for_team_count, changes: { pLooking: "true", pTeamState: null } },
          { label: "Looking for teammates and without a team", value: metrics.looking_without_team_count, changes: { pLooking: "true", pTeamState: "without_team" } },
        ].map(item => <li key={item.label}><Link href={workspaceHref(identity.slug, params, { ...clearFilterChanges("participants"), ...item.changes, tab: "participants" })}>{item.label}</Link><strong>{item.value}</strong></li>)}</ul>
          : <ReadNotice state={summary} retry={retry} label="Attention metrics" />}
        {confirmedLimits ? <div className={styles.sizeChecks}>{[{ label: "Teams below the event minimum", state: below, filter: "below_min" },
          { label: "Teams above the event maximum", state: above, filter: "above_max" }].map(item => <div key={item.label}>
            {item.state.status === "ready" && item.state.data.section === "teams" ? <p><Link href={workspaceHref(identity.slug, params, { ...clearFilterChanges("teams"), tab: "teams", tSizeState: item.filter })}>{item.label}</Link> <strong>{item.state.data.pagination.total}</strong></p>
              : <ReadNotice state={item.state} retry={retry} label={item.label} />}
          </div>)}</div> : <p className={styles.muted}>Team-size checks unavailable until event limits are confirmed.</p>}
      </section>
      <section aria-labelledby="recent-heading"><h2 id="recent-heading">Recent HackerMate registrations</h2>
        {recent.status === "ready" && recent.data.section === "participants" ? recent.data.rows.length ? <ul className={styles.recentList}>{recent.data.rows.map(row => <li key={row.user_id}>
          <div><Link href={`/profile/${row.user_id}`}>{row.full_name || "Builder"}</Link><span>{row.college || "College not recorded"}</span></div><WorkspaceTime value={row.created_at} />
        </li>)}</ul> : <p className={styles.muted}>This list will populate when builders join the HackerMate event community.</p>
          : <ReadNotice state={recent} retry={retry} label="Recent registrations" />}
      </section>
    </div> : <section className={styles.listSection} aria-labelledby="list-heading">
      <h2 id="list-heading">{tab === "participants" ? "HackerMate participants" : "Event-linked teams"}</h2>
      <OrganizerFilters tab={tab} params={params} confirmedLimits={confirmedLimits} apply={apply}
        clear={() => router.push(workspaceHref(identity.slug, params, clearFilterChanges(tab)))} />
      {tab === "teams" && !confirmedLimits && <p className={styles.muted}>Team-size checks unavailable until event limits are confirmed.</p>}
      {section.status === "ready" && section.data.section !== "overview" ? <>
        {section.data.rows.length ? section.data.section === "participants" ? <ParticipantTable rows={section.data.rows} />
          : <TeamTable rows={section.data.rows} confirmedLimits={confirmedLimits} />
          : <div className={styles.empty}><h3>{section.data.pagination.total > 0 ? `No ${tab} on this page` : tab === "participants" ? filteredParticipants ? "No participants match these filters" : "No HackerMate participants yet"
            : params.has("tSearch") || params.has("tRecruiting") || params.has("tSizeState") ? "No teams match these filters" : "No event-linked teams yet"}</h3>
            <p>{section.data.pagination.total > 0 ? "The results changed or this page is beyond the matching results. Return to the first page."
              : tab === "participants" ? "The table will populate when builders join the HackerMate event community. Official event registration is separate."
              : "No matching HackerMate teams are currently linked to this event. Teams on the organizer’s site may be different."}</p>
            {section.data.pagination.page > 1 && <Link className={styles.textLink} href={workspaceHref(identity.slug, params, { [tab === "participants" ? "pPage" : "tPage"]: "1" })}>Return to first page</Link>}
          </div>}
        <Pagination value={section.data.pagination} tab={tab} identity={identity} params={params} />
      </> : <ReadNotice state={section} retry={retry} label={tab === "participants" ? "Participants" : "Teams"} />}
    </section>}
  </div></main>;
}
