import { useEffect, useRef, type FormEvent } from "react";
import styles from "./OrganizerDashboard.module.css";

function SelectFilter({ label, name, params, options }: {
  label: string; name: string; params: URLSearchParams; options: [string, string][];
}) {
  const value = params.get(name);
  const defaultSort = name === "pSort" ? "newest" : name === "tSort" ? "name_asc" : null;
  return <label>{label}<select name={name} defaultValue={value === defaultSort ? "" : value || ""}>
    {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
  </select></label>;
}
function TextFilter({ label, name, params, maxLength = 200 }: { label: string; name: string; params: URLSearchParams; maxLength?: number }) {
  return <label>{label}<input type={name.endsWith("Search") ? "search" : "text"} name={name} defaultValue={params.get(name) || ""} maxLength={maxLength} /></label>;
}
export default function OrganizerFilters({ tab, params, confirmedLimits, apply, clear }: {
  tab: "participants" | "teams"; params: URLSearchParams; confirmedLimits: boolean;
  apply: (changes: Record<string, string>) => void; clear: () => void;
}) {
  const panel = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!panel.current) return;
    // Native details retain keyboard behavior and work without JavaScript.
    // Start compact on mobile after hydration; desktop keeps inline filters.
    panel.current.open = window.matchMedia("(min-width: 601px)").matches;
  }, []);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    apply(Object.fromEntries([...new FormData(event.currentTarget)].map(([key, value]) => [key, String(value).trim()])));
  }
  return <details ref={panel} className={styles.filterPanel} open><summary>Filters and sort</summary>
    <form onSubmit={submit} key={params.toString()} className={styles.filters}>
      {tab === "participants" ? <>
        <TextFilter label="Search name or college" name="pSearch" params={params} />
        <TextFilter label="College (exact name)" name="pCollege" params={params} />
        <TextFilter label="Declared skill" name="pSkill" params={params} maxLength={100} />
        <SelectFilter label="HackerMate status" name="pStatus" params={params} options={[["", "Any status"], ["confirmed", "Confirmed"], ["waitlisted", "Waitlisted"]]} />
        <SelectFilter label="Event-linked team" name="pTeamState" params={params} options={[["", "Any team state"], ["in_team", "In a team"], ["without_team", "Without a team"]]} />
        <SelectFilter label="Looking for teammates" name="pLooking" params={params} options={[["", "Any preference"], ["true", "Yes"], ["false", "No"]]} />
        <SelectFilter label="Sort" name="pSort" params={params} options={[["", "Newest first"], ["oldest", "Oldest first"], ["name_asc", "Name A–Z"], ["name_desc", "Name Z–A"]]} />
      </> : <>
        <TextFilter label="Search team name" name="tSearch" params={params} />
        <SelectFilter label="Recruiting" name="tRecruiting" params={params} options={[["", "Any recruiting state"], ["true", "Recruiting"], ["false", "Not recruiting"]]} />
        {confirmedLimits && <SelectFilter label="Event team-size check" name="tSizeState" params={params} options={[["", "Any size"], ["below_min", "Below minimum"], ["above_max", "Above maximum"], ["within_limits", "Within limits"]]} />}
        <SelectFilter label="Sort" name="tSort" params={params} options={[["", "Name A–Z"], ["name_desc", "Name Z–A"], ["newest", "Newest first"], ["oldest", "Oldest first"], ["size_asc", "Smallest first"], ["size_desc", "Largest first"]]} />
      </>}
      <div className={styles.filterActions}><button type="submit" className={styles.primary}>Apply filters</button>
        <button type="button" className={styles.secondary} onClick={clear}>Clear filters</button></div>
    </form>
  </details>;
}
