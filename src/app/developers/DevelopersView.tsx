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
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { compatibilityFor, type Builder, type OwnedTeam, type Recommendation, type Relationship } from "./useDevelopersData";

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

function isOnline(lastSeen?: string | null) {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;
}

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
  onSendInvite: (teamId: string, builderId: string) => Promise<boolean>;
  inviteBusy: boolean;
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<Sort>("fit");
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
    () => builders.map((b) => ({ b, fit: compatibilityFor(b, viewer, recs) })),
    [builders, viewer, recs],
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
      if (sort === "active") return time(y.b.last_seen_at) - time(x.b.last_seen_at);
      if (sort === "new") return time(y.b.created_at) - time(x.b.created_at);
      return y.fit - x.fit;
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
      <div>
        <FieldLabel>Sort</FieldLabel>
        <Segmented<Sort>
          label="Sort builders"
          size="sm"
          value={sort}
          onChange={setSort}
          options={[
            { value: "fit", label: "Best fit" },
            { value: "active", label: "Active" },
            { value: "new", label: "New" },
          ]}
        />
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
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["any", "Any"],
              ["competed", "Has competed"],
              ["won", "Has won"],
            ] as [Experience, string][]
          ).map(([v, label]) => (
            <FilterChip key={v} active={filters.experience === v} onClick={() => update({ experience: v })}>
              {label}
            </FilterChip>
          ))}
        </div>
      </div>
      {topSkills.length > 0 && (
        <div>
          <FieldLabel hint={filters.skills.length ? "any of" : undefined}>Skills</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {topSkills.map((s) => (
              <FilterChip key={s.name} active={filters.skills.includes(s.name)} onClick={() => toggleSkill(s.name)} count={s.count}>
                {s.name}
              </FilterChip>
            ))}
          </div>
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
          <div className="sticky top-6 space-y-6">
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
                {shown.map(({ b, fit }) => (
                  <BuilderRow
                    key={b.id}
                    b={b}
                    fit={viewer ? fit : null}
                    rec={recs[b.id]}
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
                    <span className="font-mono text-[11px] text-ink-4">
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
  const reason = rec?.reasons?.[0];
  const discovery = Boolean(reason && /discovery suggestion/i.test(reason));

  return (
    <li className="group relative flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Avatar name={b.full_name} src={b.avatar_url} size="lg" presence={online ? "online" : null} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={`/profile/${b.id}`}
              className="truncate text-[15px] font-semibold text-ink decoration-line-strong underline-offset-4 after:absolute after:inset-0 after:content-[''] group-hover:underline"
            >
              {b.full_name || "Builder"}
            </Link>
            {wins > 0 ? (
              <Tape tone="warn" icon={<Trophy />}>
                {wins} win{wins === 1 ? "" : "s"}
              </Tape>
            ) : competed ? (
              <Tape>Competed</Tape>
            ) : null}
            {b.is_available !== false && <Tape tone="ok">Available</Tape>}
          </div>
          <p className="mt-0.5 truncate text-[12.5px] text-ink-3">
            {[b.college || "Independent builder", b.year_of_study, online ? "Online now" : b.last_seen_at ? `Active ${relativeTime(b.last_seen_at, { suffix: true })}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {b.bio && <p className="mt-1.5 line-clamp-1 text-[13px] text-ink-2">{b.bio}</p>}
          {reason && (
            <p className={cn("mt-1.5 flex items-center gap-1.5 text-[12.5px]", discovery ? "text-ink-3" : "text-ink-2")}>
              {discovery ? <Lightbulb className="size-3.5 shrink-0 text-warn" aria-hidden /> : <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />}
              <span className="truncate">{reason}</span>
            </p>
          )}
          {visible.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {visible.map((s) => (
                <Chip key={s} active={mine.has(s.toLowerCase().trim())}>
                  {s}
                </Chip>
              ))}
              {skills.length > visible.length && <Chip className="text-ink-4">+{skills.length - visible.length}</Chip>}
            </div>
          )}
        </div>
      </div>

      <div className="relative z-10 flex shrink-0 items-center justify-between gap-3 pl-[60px] sm:w-[190px] sm:flex-col sm:items-end sm:justify-start sm:pl-0">
        {fit !== null && (
          <span className="flex items-baseline gap-1" title="Compatibility with you">
            <span className="font-display text-[22px] font-semibold leading-none text-ink tabular">{fit}</span>
            <span className="caps-label text-ink-4">fit</span>
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
