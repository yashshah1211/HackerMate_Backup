"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, Lightbulb, SlidersHorizontal, Trophy, UserPlus, UsersRound, X } from "lucide-react";
import {
  Avatar,
  Button,
  ButtonLink,
  Chip,
  Dialog,
  EmptyState,
  ErrorNotice,
  FieldLabel,
  FilterChip,
  Page,
  PageHeader,
  RouteTabs,
  SearchField,
  Segmented,
  Select,
  Sheet,
  SkeletonRows,
  Switch,
  Tape,
  TeamMark,
} from "@/components/system";
import { isOnline, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { fitBand, matchReason } from "@/lib/matchPresentation";
import { type Builder, type OwnedTeam, type Recommendation, type Relationship } from "./useDevelopersData";

type Sort = "fit" | "active" | "new";
type Experience = "any" | "competed" | "won";

type Filters = {
  college: string;
  year: string;
  availableOnly: boolean;
  experience: Experience;
  skills: string[];
};

const EMPTY_FILTERS: Filters = { college: "", year: "", availableOnly: false, experience: "any", skills: [] };
const YEARS = ["1st Year", "2nd Year", "3rd Year", "4th Year", "Postgrad / Alumni"];
const PAGE = 40;

export function DevelopersView({
  builders,
  viewer,
  recs,
  relationships,
  ownedTeams,
  loading,
  error,
  onRetry,
  search,
  onSearch,
  sort,
  onSort,
  onSendInvite,
  inviteBusy,
}: {
  builders: Builder[];
  viewer: Builder | null;
  recs: Record<string, Recommendation>;
  relationships: Record<string, Relationship>;
  ownedTeams: OwnedTeam[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  search: string;
  onSearch: (v: string) => void;
  sort: Sort;
  onSort: (v: Sort) => void;
  onSendInvite: (teamId: string, builderId: string) => Promise<boolean>;
  inviteBusy: boolean;
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [limit, setLimit] = useState(PAGE);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [inviteFor, setInviteFor] = useState<Builder | null>(null);

  const colleges = useMemo(() => {
    const m = new Map<string, { name: string; count: number }>();
    builders.forEach((b) => {
      const t = b.college?.trim();
      if (!t) return;
      const k = t.toLowerCase();
      const e = m.get(k);
      if (e) e.count += 1;
      else m.set(k, { name: t, count: 1 });
    });
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [builders]);

  const topSkills = useMemo(() => {
    const m = new Map<string, { name: string; count: number }>();
    builders.forEach((b) =>
      (b.skills || []).forEach((s) => {
        const k = s.trim().toLowerCase();
        if (!k) return;
        const e = m.get(k);
        if (e) e.count += 1;
        else m.set(k, { name: s.trim(), count: 1 });
      }),
    );
    return Array.from(m.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 14);
  }, [builders]);

  const scored = useMemo(
    () => builders.map((b) => ({ b, match: recs[b.id] || null })),
    [builders, recs],
  );

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    const skillSet = new Set(filters.skills.map((s) => s.toLowerCase()));
    const list = scored.filter(({ b }) => {
      if (filters.college && (b.college || "").toLowerCase().trim() !== filters.college.toLowerCase().trim()) return false;
      if (filters.year && (b.year_of_study || "").toLowerCase().trim() !== filters.year.toLowerCase()) return false;
      if (filters.availableOnly && b.is_available === false) return false;
      if (filters.experience === "won" && !((b.hackathon_wins ?? 0) > 0 || b.has_won_hackathon)) return false;
      if (filters.experience === "competed" && !(b.has_participated_hackathon || (b.hackathon_participations ?? 0) > 0 || (b.hackathon_wins ?? 0) > 0))
        return false;
      if (skillSet.size && !(b.skills || []).some((s) => skillSet.has(s.trim().toLowerCase()))) return false;
      if (!q) return true;
      return (
        b.full_name?.toLowerCase().includes(q) ||
        b.college?.toLowerCase().includes(q) ||
        b.year_of_study?.toLowerCase().includes(q) ||
        b.skills?.some((s) => s.toLowerCase().includes(q))
      );
    });
    const time = (s?: string | null) => (s ? new Date(s).getTime() : 0);
    list.sort((x, y) => {
      // For "active" and "new", the server already sorted the core dataset, but we may have filtered client-side.
      // Stable sort (by preserving original order if 0) is ideal, but JS sort is stable in modern browsers.
      // However, we just return 0 to keep the exact server order for active/new, preserving the limit selection.
      if (sort === "active" || sort === "new") return 0;
      
      const matchX = x.match;
      const matchY = y.match;
      
      if (matchX && matchY) {
         if (matchX.compatibility !== matchY.compatibility) {
             return matchY.compatibility - matchX.compatibility;
         }
      } else if (matchX && !matchY) {
         return -1;
      } else if (!matchX && matchY) {
         return 1;
      }
      
      // Fallback for ties or unscored builders
      const actX = time(x.b.last_seen_at);
      const actY = time(y.b.last_seen_at);
      if (actX !== actY) return actY - actX;

      const createX = time(x.b.created_at);
      const createY = time(y.b.created_at);
      return createY - createX;
    });
    return list;
  }, [scored, filters, sort, search]);

  const activeFilterCount =
    (filters.college ? 1 : 0) + (filters.year ? 1 : 0) + (filters.availableOnly ? 1 : 0) + (filters.experience !== "any" ? 1 : 0) + filters.skills.length;
  const availableCount = builders.filter((b) => b.is_available !== false).length;

  const update = (p: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...p }));
    setLimit(PAGE);
  };
  const toggleSkill = (s: string) =>
    update({ skills: filters.skills.includes(s) ? filters.skills.filter((x) => x !== s) : [...filters.skills, s] });

  const filterPanel = (
    <div className="space-y-6">
      <div className="flex gap-4 border-b border-line pb-px" role="tablist" aria-label="Sort builders">
        {(
          [
            ["fit", "Best fit"],
            ["active", "Active"],
            ["new", "New"],
          ] as [Sort, string][]
        ).map(([v, label]) => (
          <button
            key={v}
            role="tab"
            aria-selected={sort === v}
            onClick={() => onSort(v)}
            className={`pb-2.5 text-[13px] font-medium transition-colors border-b-2 -mb-[1.5px] ${
              sort === v ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink-2"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-ink-2">Available for a team</span>
        <Switch checked={filters.availableOnly} onChange={(v) => update({ availableOnly: v })} label="Only builders available for a team" />
      </label>
      <div>
        <FieldLabel htmlFor="f-college">College</FieldLabel>
        <Select id="f-college" value={filters.college} onChange={(e) => update({ college: e.target.value })}>
          <option value="">All colleges</option>
          {colleges.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name.length > 34 ? `${c.name.slice(0, 32)}…` : c.name} ({c.count})
            </option>
          ))}
        </Select>
      </div>
      <div>
        <FieldLabel htmlFor="f-year">Year</FieldLabel>
        <Select id="f-year" value={filters.year} onChange={(e) => update({ year: e.target.value })}>
          <option value="">Any year</option>
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <FieldLabel>Hackathon record</FieldLabel>
        <div className="mt-1 flex flex-col">
          {(
            [
              ["any", "Any"],
              ["competed", "Has competed"],
              ["won", "Has won"],
            ] as [Experience, string][]
          ).map(([v, label]) => {
            const active = filters.experience === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => update({ experience: v })}
                className="group flex w-full items-center justify-between rounded-lg py-1.5 px-2.5 -mx-2.5 hover:bg-hover transition-colors text-left"
              >
                <span className={`text-[13px] truncate pr-3 transition-colors ${active ? "font-medium text-ink-2" : "text-ink-3 group-hover:text-ink-2"}`}>
                  {label}
                </span>
                {active && <Check className="size-3.5 text-accent" aria-hidden />}
              </button>
            );
          })}
        </div>
      </div>
      {topSkills.length > 0 && (
        <div>
          <FieldLabel hint={filters.skills.length ? "any of" : undefined}>Skills</FieldLabel>
          <ul className="mt-1 flex flex-col">
            {topSkills.map((s) => {
              const active = filters.skills.includes(s.name);
              return (
                <li key={s.name}>
                  <button
                    type="button"
                    onClick={() => toggleSkill(s.name)}
                    className="group flex w-full items-center justify-between rounded-lg py-1.5 px-2.5 -mx-2.5 hover:bg-hover transition-colors text-left"
                  >
                    <span className={`text-[13px] truncate pr-3 transition-colors ${active ? "font-medium text-ink-2" : "text-ink-3 group-hover:text-ink-2"}`}>
                      {s.name}
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      {active && <Check className="size-3.5 text-accent" aria-hidden />}
                      <span className={`text-[12.5px] tabular-nums transition-colors ${active ? "text-ink-3" : "text-ink-4 group-hover:text-ink-3"}`}>{s.count}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {activeFilterCount > 0 && (
        <button type="button" onClick={() => update(EMPTY_FILTERS)} className="text-[12.5px] font-medium text-ink-3 underline decoration-line-strong underline-offset-4 hover:text-ink">
          Clear {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}
        </button>
      )}
    </div>
  );

  const shown = results.slice(0, limit);

  return (
    <Page width="wide">
      <PageHeader
        title="Builders"
        meta={
          loading
            ? "Loading the network…"
            : `${builders.length.toLocaleString("en-IN")} builders · ${availableCount.toLocaleString("en-IN")} available for a team`
        }
        tabs={
          <RouteTabs
            tabs={[
              { href: "/developers", label: "Discover", active: true },
              { href: "/connections", label: "Your network", active: false },
            ]}
          />
        }
      />

      <div className="mt-6 grid gap-8 lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-10">
        <aside className="hidden lg:block">
          <div className="sticky top-6 max-h-[calc(100dvh-3rem)] overflow-y-auto overflow-x-hidden overscroll-contain pb-6 space-y-6 -mx-3 px-3">
            <SearchField value={search} onChange={onSearch} placeholder="Name, skill or college" label="Search builders" />
            {filterPanel}
          </div>
        </aside>

        <div className="min-w-0">
          {/* Mobile search + filters */}
          <div className="mb-4 flex gap-2 lg:hidden">
            <SearchField className="flex-1" value={search} onChange={onSearch} placeholder="Name, skill or college" label="Search builders" />
            <Button variant="secondary" icon={<SlidersHorizontal />} onClick={() => setFiltersOpen(true)} aria-label="Filters">
              {activeFilterCount > 0 ? activeFilterCount : null}
            </Button>
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12.5px] text-ink-3">
              <span className="font-mono text-ink-2 tabular">{results.length.toLocaleString("en-IN")}</span> {results.length === 1 ? "builder" : "builders"}
              {sort === "fit" && viewer && " · sorted by fit with you"}
            </p>
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {filters.availableOnly && <ActiveChip label="Available" onRemove={() => update({ availableOnly: false })} />}
                {filters.college && <ActiveChip label={filters.college} onRemove={() => update({ college: "" })} />}
                {filters.year && <ActiveChip label={filters.year} onRemove={() => update({ year: "" })} />}
                {filters.experience !== "any" && (
                  <ActiveChip label={filters.experience === "won" ? "Has won" : "Has competed"} onRemove={() => update({ experience: "any" })} />
                )}
                {filters.skills.map((s) => (
                  <ActiveChip key={s} label={s} onRemove={() => toggleSkill(s)} />
                ))}
              </div>
            )}
          </div>

          {error && <ErrorNotice className="mb-4" title="Couldn't load builders" detail={error} onRetry={onRetry} />}

          {loading ? (
            <SkeletonRows rows={8} />
          ) : results.length === 0 ? (
            <EmptyState
              icon={<UsersRound />}
              title={builders.length === 0 ? "No builders yet" : "No builders match"}
              body={builders.length === 0 ? "Share HackerMate with people you'd build with." : "Loosen a filter or try a different skill."}
              action={
                activeFilterCount > 0 || search ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      update(EMPTY_FILTERS);
                      onSearch("");
                    }}
                  >
                    Reset search
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <ul className="divide-y divide-line border-y border-line" data-stagger>
                {shown.map(({ b, match }) => (
                  <BuilderRow
                    key={b.id}
                    b={b}
                    fit={viewer && match ? match.compatibility : null}
                    rec={match || undefined}
                    viewerSkills={viewer?.skills || []}
                    highlight={filters.skills}
                    relationship={relationships[b.id]}
                    canInvite={ownedTeams.length > 0}
                    onInvite={() => setInviteFor(b)}
                  />
                ))}
              </ul>
              {results.length > shown.length && (
                <div className="mt-5 flex justify-center">
                  <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>
                    Show {Math.min(PAGE, results.length - shown.length)} more
                    <span className="font-mono text-[12px] text-ink-4">
                      {shown.length}/{results.length}
                    </span>
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filter builders"
        label="Filter builders"
        footer={
          <Button variant="inverse" className="w-full" onClick={() => setFiltersOpen(false)}>
            Show {results.length} builders
          </Button>
        }
      >
        <div className="px-4 py-4">{filterPanel}</div>
      </Sheet>

      <InviteDialog
        builder={inviteFor}
        teams={ownedTeams}
        busy={inviteBusy}
        onClose={() => setInviteFor(null)}
        onSend={async (teamId) => {
          if (!inviteFor) return;
          const ok = await onSendInvite(teamId, inviteFor.id);
          if (ok) setInviteFor(null);
        }}
      />
    </Page>
  );
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-[4px] bg-selected pl-2 pr-1 text-[12px] text-ink-2">
      <span className="max-w-40 truncate">{label}</span>
      <button type="button" onClick={onRemove} aria-label={`Remove filter ${label}`} className="inline-flex size-4 items-center justify-center rounded text-ink-4 hover:text-ink">
        <X className="size-3" />
      </button>
    </span>
  );
}

function BuilderRow({
  b,
  fit,
  rec,
  viewerSkills,
  highlight,
  relationship,
  canInvite,
  onInvite,
}: {
  b: Builder;
  fit: number | null;
  rec?: Recommendation;
  viewerSkills: string[];
  highlight: string[];
  relationship?: Relationship;
  canInvite: boolean;
  onInvite: () => void;
}) {
  const mine = new Set([...viewerSkills, ...highlight].map((s) => s.toLowerCase().trim()));
  const skills = [...(b.skills || [])].sort((x, y) => Number(mine.has(y.toLowerCase().trim())) - Number(mine.has(x.toLowerCase().trim())));
  const visible = skills.slice(0, 5);
  const wins = b.hackathon_wins ?? 0;
  const competed = b.has_participated_hackathon || (b.hackathon_participations ?? 0) > 0;
  const online = isOnline(b.last_seen_at);
  const why = matchReason({ reasons: rec?.reasons, builderSkills: b.skills, viewerSkills });
  const reason = why?.text;
  const discovery = Boolean(why?.discovery);

  return (
    <li className="group relative flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Avatar name={b.full_name} src={b.avatar_url} size="lg" presence={online ? "online" : null} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link
              href={`/profile/${b.id}`}
              className="truncate text-[15.5px] font-semibold text-ink decoration-line-strong underline-offset-4 after:absolute after:inset-0 after:content-[''] group-hover:underline"
            >
              {b.full_name || "Builder"}
            </Link>
            {b.is_available !== false && (
              <span className="flex items-center gap-1.5 text-[13px] text-ink-2">
                <span className="size-1.5 rounded-full bg-ok" aria-hidden />
                Available
              </span>
            )}
            {wins > 0 ? (
              <span className="flex items-center gap-1.5 text-[13px] text-ink-2">
                <Trophy className="size-3.5 text-warn" />
                {wins} win{wins === 1 ? "" : "s"}
              </span>
            ) : competed ? (
              <span className="text-[13px] text-ink-2">Competed</span>
            ) : null}
          </div>
          <p className="mt-1 truncate text-[13px] text-ink-3">
            {[b.college || "Independent builder", b.year_of_study, online ? "Online now" : b.last_seen_at ? `Active ${relativeTime(b.last_seen_at, { suffix: true })}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {b.bio && <p className="mt-1.5 line-clamp-1 text-[13.5px] text-ink-2">{b.bio}</p>}
          {reason && (
            <p className={cn("mt-2 flex items-center gap-1.5 text-[13px]", discovery ? "text-ink-3" : "text-ink-2")}>
              {discovery ? <Lightbulb className="size-3.5 shrink-0 text-warn" aria-hidden /> : <Check className="size-3.5 shrink-0 text-accent" aria-hidden />}
              <span className="truncate">{reason}</span>
            </p>
          )}
          {visible.length > 0 && (
            <p className="mt-1.5 truncate text-[13px] text-ink-3">
              {visible.map((s, i) => {
                const isMatch = mine.has(s.toLowerCase().trim());
                return (
                  <span key={s}>
                    <span className={isMatch ? "font-medium text-ink-1" : ""}>{s}</span>
                    {i < visible.length - 1 ? " · " : ""}
                  </span>
                );
              })}
              {skills.length > visible.length && <span className="ml-1 text-ink-4">+{skills.length - visible.length}</span>}
            </p>
          )}
        </div>
      </div>

      <div className="relative z-10 flex shrink-0 items-center justify-between gap-3 pl-[60px] sm:w-[190px] sm:flex-col sm:items-end sm:justify-start sm:pl-0">
        {rec && typeof fit === "number" && (
          <span
            className={cn(
              "text-[12.5px] font-medium tracking-tight",
              rec.matchEngine === "v3" ? "text-accent-ink" : "text-ink-3"
            )}
          >
            {rec.matchEngine === "v3" ? `${fit}% match` : (fitBand(fit)?.label || "Recommended")}
          </span>
        )}
        <div className="flex items-center gap-1.5">
          {relationship === "connected" ? (
            <Tape tone="ok">Connected</Tape>
          ) : relationship === "request_sent" ? (
            <Tape>Request sent</Tape>
          ) : relationship === "request_received" ? (
            <ButtonLink href="/connections" size="sm" variant="primary">
              Respond
            </ButtonLink>
          ) : (
            <ButtonLink href={`/profile/${b.id}?connect=1`} size="sm" variant="secondary" icon={<UserPlus />}>
              Connect
            </ButtonLink>
          )}
          {canInvite && (
            <Button size="sm" variant="ghost" onClick={onInvite}>
              Invite
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function InviteDialog({
  builder,
  teams,
  busy,
  onClose,
  onSend,
}: {
  builder: Builder | null;
  teams: OwnedTeam[];
  busy: boolean;
  onClose: () => void;
  onSend: (teamId: string) => void;
}) {
  const [picked, setPicked] = useState<string>("");
  const selected = picked || (teams.length === 1 ? teams[0].id : "");
  return (
    <Dialog
      open={Boolean(builder)}
      onClose={() => {
        setPicked("");
        onClose();
      }}
      size="sm"
      title={builder ? `Invite ${builder.full_name?.split(" ")[0] || "builder"} to a team` : "Invite to a team"}
      description="They'll get a notification and can accept from their home screen."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={!selected} onClick={() => onSend(selected)}>
            Send invite
          </Button>
        </>
      }
    >
      <div role="radiogroup" aria-label="Your teams" className="space-y-1.5">
        {teams.map((t) => {
          const active = selected === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setPicked(t.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left ring-1 ring-inset transition-colors",
                active ? "bg-selected ring-ink-4" : "ring-line hover:bg-hover",
              )}
            >
              <TeamMark name={t.name} size="sm" />
              <span className="flex-1 truncate text-[13.5px] font-medium text-ink">{t.name}</span>
              {active && <Check className="size-4 text-ink" aria-hidden />}
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}

