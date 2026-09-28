"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Plus, SlidersHorizontal, Target, Users } from "lucide-react";
import {
  Button,
  ButtonLink,
  Chip,
  EmptyState,
  ErrorNotice,
  FieldLabel,
  FilterChip,
  Page,
  PageHeader,
  SearchField,
  SeatMeter,
  Segmented,
  Select,
  Sheet,
  SkeletonRows,
  Tape,
  TeamMark,
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
          <div className="flex flex-wrap gap-1.5">
            {facets.skills.map((s) => (
              <FilterChip
                key={s.name}
                active={skills.includes(s.name)}
                count={s.n}
                onClick={() => setSkills((p) => (p.includes(s.name) ? p.filter((x) => x !== s.name) : [...p, s.name]))}
              >
                {s.name}
              </FilterChip>
            ))}
          </div>
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

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <Segmented<Scope>
              label="Which teams"
              size="sm"
              value={scope}
              onChange={(v) => {
                setScope(v);
                setLimit(PAGE);
              }}
              options={[
                { value: "open", label: "Open to join", count: loading ? undefined : openCount },
                { value: "all", label: "All teams", count: loading ? undefined : teams.length },
              ]}
            />
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
                    <li key={t.id} className="group relative flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-5">
                      <div className="flex min-w-0 flex-1 items-start gap-3.5">
                        <TeamMark name={t.name} tone={tone} size="lg" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Link
                              href={`/teams/${t.id}`}
                              className="truncate text-[15px] font-semibold text-ink decoration-line-strong underline-offset-4 after:absolute after:inset-0 after:content-[''] group-hover:underline"
                            >
                              {t.name}
                            </Link>
                            {status.full ? <Tape tone="bad">Full</Tape> : status.closed ? <Tape>Closed</Tape> : <Tape tone="accent" dot>Recruiting</Tape>}
                            <Tape tone={tone}>{info.tag}</Tape>
                            {coverage && (
                              <span className="inline-flex items-center gap-1 text-[12px] text-info">
                                <CheckCircle2 className="size-3.5" aria-hidden />
                                {coverage}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 line-clamp-1 text-[13px] text-ink-2">{t.description || "No description yet."}</p>
                          <p className="mt-1 truncate text-[12.5px] text-ink-3">
                            {[events.join(", ") || "Independent project", t.college || "Multi-college"].join(" · ")}
                          </p>
                          {(t.skills?.length ?? 0) > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {(t.skills || []).slice(0, 5).map((s) => (
                                <Chip key={s} active={viewerSkills.includes(s)}>
                                  {s}
                                </Chip>
                              ))}
                              {(t.skills?.length || 0) > 5 && <Chip className="text-ink-4">+{(t.skills?.length || 0) - 5}</Chip>}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center justify-between gap-4 pl-[62px] sm:w-[220px] sm:flex-col sm:items-end sm:pl-0">
                        <SeatMeter filled={status.members} total={status.max} />
                        {ppt && (
                          <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-3" title="Latest pitch-deck evaluation">
                            <Target className="size-3.5 text-proj" aria-hidden />
                            Pitch <span className="font-mono text-ink-2">{ppt.total_score}/100</span>
                            <Tape tone="proj">{ppt.grade}</Tape>
                          </span>
                        )}
                        <span className="hidden items-center gap-1 text-[12.5px] font-medium text-ink-3 group-hover:text-ink sm:inline-flex">
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
                    <span className="font-mono text-[11px] text-ink-4">
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
