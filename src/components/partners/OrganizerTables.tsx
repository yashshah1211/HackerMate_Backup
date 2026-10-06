import Link from "next/link";
import type { OrganizerParticipant } from "@/lib/partners/organizer";
import { teamAttention, type WorkspaceTeam } from "@/lib/partners/workspaceClient";
import styles from "./OrganizerDashboard.module.css";

export function WorkspaceTime({ value }: { value: string }) {
  return <time dateTime={value} className={styles.timestamp}>{new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  }).format(new Date(value))} UTC</time>;
}
function Skills({ skills }: { skills: string[] }) {
  if (skills.length === 0) return <span className={styles.muted}>Not declared</span>;
  const list = (items: string[]) => <ul className={styles.skillList}>{items.map((skill, i) => <li key={`${skill}-${i}`}>{skill}</li>)}</ul>;
  return skills.length <= 3 ? list(skills) : <>{list(skills.slice(0, 3))}
    <details className={styles.rowDetails}><summary>{skills.length - 3} more skills</summary>{list(skills.slice(3))}</details></>;
}
function EventTeams({ row }: { row: OrganizerParticipant }) {
  return row.event_teams.length ? <ul className={styles.plainList}>{row.event_teams.map(team =>
    <li key={team.team_id}><Link href={`/teams/${team.team_id}`}>{team.team_name}</Link></li>)}</ul>
    : <span>Without an event-linked team</span>;
}

export function ParticipantTable({ rows }: { rows: OrganizerParticipant[] }) {
  return <>
    <table className={styles.desktopTable}>
      <caption className={styles.srOnly}>HackerMate event-community participants</caption>
      <thead><tr>{["Name", "College", "Declared skills", "HackerMate status", "Event-linked teams", "Looking for teammates", "Joined HackerMate"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.user_id}>
        <th scope="row"><Link href={`/profile/${row.user_id}`}>{row.full_name || "Builder"}</Link></th>
        <td>{row.college || "Not recorded"}</td><td><Skills skills={row.skills} /></td>
        <td>{row.status === "confirmed" ? "Confirmed" : "Waitlisted"}</td><td><EventTeams row={row} /></td>
        <td>{row.looking_for_team ? "Yes" : "No"}</td><td><WorkspaceTime value={row.created_at} /></td>
      </tr>)}</tbody>
    </table>
    <ul className={styles.mobileRows}>{rows.map(row => <li key={row.user_id}>
      <details className={styles.mobileRow}><summary>
        <strong>{row.full_name || "Builder"}</strong><span>{row.college || "College not recorded"}</span>
        <span className={styles.rowContext}>{row.event_teams.length ? "In an event-linked team" : "Without an event-linked team"}{row.looking_for_team ? "; looking for teammates" : ""}</span>
      </summary><dl>
        <div><dt>Declared skills</dt><dd><Skills skills={row.skills} /></dd></div>
        <div><dt>HackerMate status</dt><dd>{row.status === "confirmed" ? "Confirmed" : "Waitlisted"}</dd></div>
        <div><dt>Event-linked teams</dt><dd><EventTeams row={row} /></dd></div>
        <div><dt>Looking for teammates</dt><dd>{row.looking_for_team ? "Yes" : "No"}</dd></div>
        <div><dt>Joined HackerMate</dt><dd><WorkspaceTime value={row.created_at} /></dd></div>
      </dl><Link href={`/profile/${row.user_id}`} className={styles.textLink}>Open public profile</Link></details>
    </li>)}</ul>
  </>;
}

function Roster({ team }: { team: WorkspaceTeam }) {
  return <details className={styles.rowDetails}><summary>View roster</summary>
    {team.roster.length ? <ul className={styles.roster}>{team.roster.map(member => <li key={member.user_id}>
      <Link href={`/profile/${member.user_id}`}>{member.full_name || "Builder"}</Link>
      <span>{member.registered_for_event ? "Joined this event on HackerMate" : "Has not joined this event on HackerMate"}</span>
    </li>)}</ul> : <p className={styles.muted}>No visible roster entries.</p>}
  </details>;
}
function Attention({ team, confirmedLimits }: { team: WorkspaceTeam; confirmedLimits: boolean }) {
  const reasons = teamAttention(team, confirmedLimits);
  return reasons.length ? <ul className={styles.plainList}>{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
    : <span className={styles.muted}>{teamHasLimits(team, confirmedLimits) ? "No attention items" : "Team-size checks unavailable"}</span>;
}
const teamHasLimits = (team: WorkspaceTeam, confirmed: boolean) => confirmed && team.event_min_team_size !== null
  && team.event_min_team_size > 0 && team.event_max_team_size !== null && team.event_max_team_size >= team.event_min_team_size;
const recruiting = (value: boolean | null) => value === null ? "Not recorded" : value ? "Recruiting" : "Not recruiting";
export function TeamTable({ rows, confirmedLimits }: { rows: WorkspaceTeam[]; confirmedLimits: boolean }) {
  return <>
    <table className={styles.desktopTable}>
      <caption className={styles.srOnly}>Teams linked to this HackerMate event</caption>
      <thead><tr>{["Team", "Current members", "Joined this event", "Recruiting", "Declared needs", "Attention", "Roster"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{rows.map(team => <tr key={team.team_id}>
        <th scope="row"><Link href={`/teams/${team.team_id}`}>{team.team_name}</Link></th>
        <td>{team.member_count}</td><td>{team.registered_member_count}</td><td>{recruiting(team.is_recruiting)}</td>
        <td>{team.roles_needed.length ? <ul className={styles.plainList}>{team.roles_needed.map((role, i) => <li key={`${role}-${i}`}>{role}</li>)}</ul> : "Not declared"}</td>
        <td><Attention team={team} confirmedLimits={confirmedLimits} /></td><td><Roster team={team} /></td>
      </tr>)}</tbody>
    </table>
    <ul className={styles.mobileRows}>{rows.map(team => <li key={team.team_id}>
      <details className={styles.mobileRow}><summary><strong>{team.team_name}</strong>
        <span>{team.member_count} current members; {team.registered_member_count} joined this event</span>
        <span className={styles.rowContext}>{teamAttention(team, confirmedLimits).join("; ") || (teamHasLimits(team, confirmedLimits) ? "No attention items" : "Team-size checks unavailable")}</span>
      </summary><dl><div><dt>Recruiting</dt><dd>{recruiting(team.is_recruiting)}</dd></div>
        <div><dt>Declared needs</dt><dd>{team.roles_needed.join(", ") || "Not declared"}</dd></div></dl>
        <Roster team={team} /><Link href={`/teams/${team.team_id}`} className={styles.textLink}>Open team page</Link>
      </details>
    </li>)}</ul>
  </>;
}
