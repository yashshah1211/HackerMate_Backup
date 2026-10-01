"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Check, Plus, SlidersHorizontal, Target, Users } from "lucide-react";
import {
  Button,
  ButtonLink,
  EmptyState,
  ErrorNotice,
  FieldLabel,
  Page,
  PageHeader,
  SearchField,
  Select,
  Sheet,
  SkeletonRows,
  Tape,
} from "@/components/system";
import { CATEGORY_TONE, getTeamCategoryInfo } from "@/lib/teamCategory";
import { coverageLabel, teamSkillCoverage } from "@/lib/matchPresentation";
import { TeamsTabs } from "./TeamsTabs";
import { teamMatchScore, teamStatus, type ListTeam } from "./useTeamsData";

type Scope = "open" | "all";
const PAGE = 30;

function hackathonNames(t: ListTeam): string[] {
  const linked = (t.team_hackathons || []).map((th) => th.hackathons?.name).filter(Boolean) as string[];
  return linked.length ? linked : t.hackathon_name ? [t.hackathon_name] : [];
}

/**
 * Team discovery. Default view is teams you can actually join (recruiting,
 * seats left, event not over); "All teams" restores the full V1 list.
 */
export function TeamsView({
  teams,
  viewerSkills,
  loading,
  error,
  onRetry,
  today,
}: {
  teams: ListTeam[];
  viewerSkills: string[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  today: string;
}) {
  const [scope, setScope] = useState<Scope>("open");
  const [search, setSearch] = useState("");
  const [hackathon, setHackathon] = useState("");
  const [college, setCollege] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [limit, setLimit] = useState(PAGE);
  const [sheet, setSheet] = useState(false);

  const enriched = useMemo(
    () =>
      teams.map((t) => ({
        t,
        status: teamStatus(t, today),
        match: teamMatchScore(t.skills, viewerSkills),
        coverage: coverageLabel(teamSkillCoverage(t.skills, viewerSkills)),
        info: getTeamCategoryInfo(t),
        events: hackathonNames(t),
      })),
    [teams, viewerSkills, today],
  );

  const facets = useMemo(() => {
    const ev = new Map<string, number>();
    const col = new Map<string, number>();
    const sk = new Map<string, { name: string; n: number }>();
    enriched.forEach(({ t, events }) => {
      events.forEach((e) => ev.set(e, (ev.get(e) || 0) + 1));
      if (t.college?.trim()) col.set(t.college.trim(), (col.get(t.college.trim()) || 0) + 1);
      (t.skills || []).forEach((s) => {
        const k = s.trim().toLowerCase();
        if (!k) return;
        const e = sk.get(k);
        if (e) e.n += 1;
        else sk.set(k, { name: s.trim(), n: 1 });
      });
    });
    return {
      events: Array.from(ev.entries()).sort((a, b) => b[1] - a[1]),
      colleges: Array.from(col.entries()).sort((a, b) => a[0].localeCompare(b[0])),
      skills: Array.from(sk.values()).sort((a, b) => b.n - a.n).slice(0, 12),
    };
  }, [enriched]);

  const openCount = enriched.filter((e) => e.status.open).length;

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    const want = new Set(skills.map((s) => s.toLowerCase()));
    return enriched
      .filter(({ t, status, events }) => {
        if (scope === "open" && !status.open) return false;
        if (q && !t.name.toLowerCase().includes(q) && !(t.description || "").toLowerCase().includes(q)) return false;
        if (hackathon && !events.includes(hackathon)) return false;
        if (college && (t.college || "").trim() !== college) return false;
        if (want.size && !(t.skills || []).some((s) => want.has(s.trim().toLowerCase()))) return false;
        return true;
      })
      .sort((a, b) => b.match - a.match);
  }, [enriched, scope, search, hackathon, college, skills]);

  const active = (hackathon ? 1 : 0) + (college ? 1 : 0) + skills.length;
  const reset = () => {
    setHackathon("");
    setCollege("");
    setSkills([]);
    setLimit(PAGE);
  };

  const filterPanel = (
    <div className="space-y-6">
      <div>
        <FieldLabel htmlFor="t-event">Hackathon</FieldLabel>
        <Select id="t-event" value={hackathon} onChange={(e) => setHackathon(e.target.value)}>
          <option value="">Any event</option>
          {facets.events.map(([name, n]) => (
            <option key={name} value={name}>
              {name.length > 36 ? `${name.slice(0, 34)}…` : name} ({n})
            </option>
          ))}
        </Select>
      </div>
      <div>
        <FieldLabel htmlFor="t-college">College</FieldLabel>
        <Select id="t-college" value={college} onChange={(e) => setCollege(e.target.value)}>
          <option value="">Any college</option>
          {facets.colleges.map(([name, n]) => (
            <option key={name} value={name}>
              {name.length > 36 ? `${name.slice(0, 34)}…` : name} ({n})
            </option>
          ))}
        </Select>
      </div>
      {facets.skills.length > 0 && (
        <div>
          <FieldLabel hint={skills.length ? "any of" : undefined}>Looking for</FieldLabel>
          <ul className="mt-2 flex flex-col">
            {facets.skills.map((s) => {
              const active = skills.includes(s.name);
              return (
                <li key={s.name}>
                  <button
                    type="button"
                    onClick={() => setSkills((p) => (active ? p.filter((x) => x !== s.name) : [...p, s.name]))}
                    className="group flex w-full items-center justify-between rounded-lg py-1.5 px-2.5 -mx-2.5 hover:bg-hover transition-colors text-left"
                  >
                    <span className={`text-[13px] truncate pr-3 transition-colors ${active ? "font-medium text-ink-2" : "text-ink-3 group-hover:text-ink-2"}`}>
                      {s.name}
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      {active && <Check className="size-3.5 text-accent" aria-hidden />}
                      <span className={`text-[12.5px] tabular-nums transition-colors ${active ? "text-ink-3" : "text-ink-4 group-hover:text-ink-3"}`}>{s.n}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {active > 0 && (
        <button type="button" onClick={reset} className="text-[12.5px] font-medium text-ink-3 underline decoration-line-strong underline-offset-4 hover:text-ink">
          Clear {active} filter{active === 1 ? "" : "s"}
        </button>
      )}
    </div>
  );

  return (
    <Page width="wide">
      <PageHeader
        title="Teams"
        meta={loading ? "Loading teams…" : `${teams.length} teams · ${openCount} open to join`}
        actions={
          <ButtonLink href="/teams/create" variant="primary" icon={<Plus />}>
            New team
          </ButtonLink>
        }
        tabs={<TeamsTabs />}
      />

      <div className="mt-6 grid gap-8 lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-10">
        <aside className="hidden lg:block">
          <div className="sticky top-6 space-y-6">
            <SearchField value={search} onChange={setSearch} placeholder="Team name or idea" label="Search teams" />
            {filterPanel}
          </div>
        </aside>

        <div className="min-w-0">
          <div className="mb-4 flex gap-2 lg:hidden">
            <SearchField className="flex-1" value={search} onChange={setSearch} placeholder="Team name or idea" label="Search teams" />
            <Button variant="secondary" icon={<SlidersHorizontal />} onClick={() => setSheet(true)} aria-label="Filters">
              {active > 0 ? active : null}
            </Button>
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex gap-6" role="tablist" aria-label="Which teams">
              <button
                role="tab"
                aria-selected={scope === "open"}
                onClick={() => { setScope("open"); setLimit(PAGE); }}
                className={`flex items-center gap-1.5 pb-2.5 text-[14px] font-medium transition-colors border-b-2 ${
                  scope === "open" ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink-2"
                }`}
              >
                Open to join
                {!loading && openCount !== undefined && <span className="text-[12.5px] text-ink-4 tabular-nums">{openCount}</span>}
              </button>
              <button
                role="tab"
                aria-selected={scope === "all"}
                onClick={() => { setScope("all"); setLimit(PAGE); }}
                className={`flex items-center gap-1.5 pb-2.5 text-[14px] font-medium transition-colors border-b-2 ${
                  scope === "all" ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink-2"
                }`}
              >
                All teams
                {!loading && <span className="text-[12.5px] text-ink-4 tabular-nums">{teams.length}</span>}
              </button>
            </div>
            <p className="text-[12.5px] text-ink-3">
              <span className="font-mono text-ink-2 tabular">{results.length}</span> shown{viewerSkills.length ? " · best skill match first" : ""}
            </p>
          </div>

          {error && <ErrorNotice className="mb-4" title="Couldn't load teams" detail={error} onRetry={onRetry} />}

          {loading ? (
            <SkeletonRows rows={7} avatar="square" />
          ) : results.length === 0 ? (
            <EmptyState
              icon={<Users />}
              title={scope === "open" ? "No open teams match" : "No teams match"}
              body={scope === "open" ? "Try all teams, or start one and invite builders yourself." : "Loosen a filter or start your own team."}
              action={
                <>
                  {scope === "open" && (
                    <Button size="sm" variant="secondary" onClick={() => setScope("all")}>
                      Show all teams
                    </Button>
                  )}
                  <ButtonLink href="/teams/create" size="sm" variant="ghost" icon={<Plus />}>
                    New team
                  </ButtonLink>
                </>
              }
            />
          ) : (
            <>
              <ul className="divide-y divide-line border-y border-line" data-stagger>
                {results.slice(0, limit).map(({ t, status, coverage, info, events }) => {
                  const ppt = t.team_ppt_evaluations?.find((e) => e.status === "completed");
                  const tone = CATEGORY_TONE[info.category];
                  return (
                    <li key={t.id} className="group relative flex flex-col gap-4 py-5 px-3 sm:px-4 sm:-mx-4 rounded-xl hover:bg-hover transition-colors sm:flex-row sm:items-start sm:gap-5">
                      <div className="flex shrink-0 sm:pt-0.5">
                        <div className="flex size-10 items-center justify-center rounded-[40%] bg-raised border border-line text-[14px] font-semibold text-ink-2 group-hover:bg-overlay group-hover:text-ink transition-colors" aria-hidden>
                          {(t.name.trim().split(/\s+/).length > 1 ? t.name.trim().split(/\s+/)[0][0] + t.name.trim().split(/\s+/)[1][0] : t.name.slice(0, 2)).toUpperCase()}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <Link
                            href={`/teams/${t.id}`}
                            className="truncate text-[15.5px] font-semibold text-ink decoration-line-strong underline-offset-4 after:absolute after:inset-0 after:content-[''] group-hover:underline"
                          >
                            {t.name}
                          </Link>
                          {status.full ? (
                            <span className="text-[12.5px] font-medium text-ink-2"><span className="text-bad">●</span> Full</span>
                          ) : status.closed ? (
                            <span className="text-[12.5px] font-medium text-ink-3"><span className="text-ink-4">●</span> Closed</span>
                          ) : (
                            <span className="text-[12.5px] font-medium text-ink-2"><span className="text-accent">●</span> Recruiting</span>
                          )}
                        </div>
                        <p className="mt-1 line-clamp-1 text-[13.5px] text-ink-2">{t.description || "No description yet."}</p>
                        <p className="mt-1.5 truncate text-[13px] text-ink-3">
                          {[events.join(", ") || "Independent project", t.college || "Multi-college"].join(" · ")}
                        </p>
                        {(t.skills?.length ?? 0) > 0 && (
                          <p className="mt-1 truncate text-[13px] text-ink-3">
                            {(t.skills || []).slice(0, 5).map((s, i) => (
                              <span key={s}>
                                <span className={viewerSkills.includes(s) ? "text-ink-2 font-medium" : ""}>{s}</span>
                                {i < Math.min((t.skills || []).length, 5) - 1 ? " · " : ""}
                              </span>
                            ))}
                            {(t.skills?.length || 0) > 5 && ` · +${(t.skills?.length || 0) - 5}`}
                          </p>
                        )}
                        {coverage && (
                          <div className="mt-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-ink-3">
                            <Check className="size-3.5 text-accent" aria-hidden />
                            {coverage}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center justify-between gap-4 sm:w-[160px] sm:flex-col sm:items-end sm:justify-start sm:pt-0.5">
                        <div className="flex flex-col gap-1 items-start sm:items-end">
                          {status.open && (
                            <span className="text-[13.5px] font-medium text-ink-2">
                              {status.max - status.members} spot{status.max - status.members === 1 ? "" : "s"} open
                            </span>
                          )}
                          <span className="text-[12.5px] text-ink-3">
                            {status.members} of {status.max} members
                          </span>
                          {ppt && (
                            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-3 mt-1" title="Latest pitch-deck evaluation">
                              Pitch <span className="font-mono text-ink-2">{ppt.total_score}/100</span>
                              <Tape tone="proj">{ppt.grade}</Tape>
                            </span>
                          )}
                        </div>
                        <span className="hidden items-center gap-1 text-[13px] font-medium text-ink-3 group-hover:text-ink sm:inline-flex mt-2">
                          {status.open ? "View & apply" : "View team"}
                          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {results.length > limit && (
                <div className="mt-5 flex justify-center">
                  <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>
                    Show more
                    <span className="font-mono text-[12px] text-ink-4">
                      {limit}/{results.length}
                    </span>
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Filter teams"
        label="Filter teams"
        footer={
          <Button variant="inverse" className="w-full" onClick={() => setSheet(false)}>
            Show {results.length} teams
          </Button>
        }
      >
        <div className="px-4 py-4">{filterPanel}</div>
      </Sheet>
    </Page>
  );
}

