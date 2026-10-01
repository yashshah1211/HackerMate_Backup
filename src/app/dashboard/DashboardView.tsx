"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  ArrowUpRight,
  CircleCheck,
  GraduationCap,
  Lightbulb,
  MessageSquare,
  Plus,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react";
import {
  Avatar,
  AvatarStack,
  Button,
  ButtonLink,
  Chip,
  EmptyState,
  Page,
  PageHeader,
  Progress,
  SeatMeter,
  Section,
  SectionLink,
  Segmented,
  Select,
  Skeleton,
  SkeletonRows,
  Tape,
  TeamMark,
} from "@/components/system";
import StreakWidget from "@/components/StreakWidget";
import { CATEGORY_TONE } from "@/lib/teamCategory";
import { fitBand, matchReason } from "@/lib/matchPresentation";
import { dateStamp, eventTimeline, greeting, relativeTime } from "@/lib/time";
import { cn, getInitials } from "@/lib/utils";
import type { ConnectedUser } from "@/components/PostAcceptanceTeamPrompt";
import type { ConnState, DashBuilder, DashboardData, QueueItem } from "./useDashboardData";

export type DashboardHandlers = {
  onConfirmYear: () => void;
  onYearChange: (v: string) => void;
  onOpenProfileSetup: () => void;
  onAcceptInvite: (id: string) => void;
  onDeclineInvite: (id: string) => void;
  onAcceptConnection: (id: string, user: ConnectedUser) => void;
  onDeclineConnection: (id: string, userId: string) => void;
  onOpenInbox: () => void;
};

const YEAR_OPTIONS = [
  { value: "1st Year", label: "1st year" },
  { value: "2nd Year", label: "2nd year" },
  { value: "3rd Year", label: "3rd year" },
  { value: "4th Year", label: "4th year" },
  { value: "Postgrad / Alumni", label: "Postgrad / alumni" },
];

/**
 * Home. Answers three questions in order: what needs me, how are my teams,
 * who should I build with. Everything else is supporting context.
 */
export function DashboardView({
  data,
  unreadMessages,
  handlers,
}: {
  data: DashboardData;
  unreadMessages: number;
  handlers: DashboardHandlers;
}) {
  const first = data.profile?.full_name?.trim().split(" ")[0] || "there";
  const needsCount = data.queue.length + (unreadMessages > 0 ? 1 : 0);
  const summary: ReactNode[] = [];
  if (needsCount > 0) summary.push(`${needsCount} pending ${needsCount === 1 ? "item" : "items"}`);
  if (data.stats.closingSoon > 0) summary.push(`${data.stats.closingSoon} hackathon${data.stats.closingSoon === 1 ? "" : "s"} close this week`);

  return (
    <Page>
      <PageHeader
        eyebrow={dateStamp()}
        title={
          <>
            {greeting()}, {first}
          </>
        }
        meta={data.loading ? <Skeleton className="h-3.5 w-56" /> : summary.join(" · ")}
        actions={
          <>
            <ButtonLink href="/developers" variant="secondary" icon={<UsersRound />}>
              Find builders
            </ButtonLink>
            <ButtonLink href="/teams/create" variant="primary" icon={<Plus />}>
              New team
            </ButtonLink>
          </>
        }
      />

      {data.year.visible && (
        <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-raised px-4 py-2.5 animate-hm-enter">
          <GraduationCap className="size-4 text-ink-3" aria-hidden />
          <label htmlFor="year-confirm" className="text-[13px] text-ink-2">
            Which year are you in? It helps teams plan around exams.
          </label>
          <div className="flex items-center gap-2 sm:ml-auto">
            <Select id="year-confirm" value={data.year.value} onChange={(e) => handlers.onYearChange(e.target.value)} className="h-8 w-44">
              {YEAR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <Button size="sm" variant="inverse" loading={data.year.saving} onClick={handlers.onConfirmYear}>
              Save
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-9 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-12">
        {/* Main column: on mobile its sections interleave with the side column via `order`. */}
        <div className="contents lg:flex lg:flex-col lg:gap-10">
          <div className="order-1">
            <NeedsYou data={data} unreadMessages={unreadMessages} handlers={handlers} />
          </div>
          <div className="order-2">
            <YourTeams data={data} />
          </div>
          <div className="order-4">
            <BuildersForYou data={data} />
          </div>
        </div>

        <aside className="contents lg:flex lg:flex-col lg:gap-9">
          {data.completeness.percent < 100 && !data.loading && (
            <div className="order-3">
              <ProfileStrength data={data} onOpenProfileSetup={handlers.onOpenProfileSetup} />
            </div>
          )}
          <div className="order-5 space-y-9">
            <Section title="Streak">
              <StreakWidget initialStreak={data.profile?.current_streak ?? 0} initialLongest={data.profile?.longest_streak ?? 0} />
            </Section>
            <Pulse data={data} />
            <SihCallout />
            {data.partners.length > 0 && <PartnerEvents data={data} />}
            <RecentActivity data={data} onOpenInbox={handlers.onOpenInbox} />
          </div>
        </aside>
      </div>
    </Page>
  );
}

/* ── Needs you ─────────────────────────────────────────────────────── */

function NeedsYou({ data, unreadMessages, handlers }: { data: DashboardData; unreadMessages: number; handlers: DashboardHandlers }) {
  const count = data.queue.length + (unreadMessages > 0 ? 1 : 0);
  return (
    <Section id="needs-you" title="Pending" count={data.loading ? undefined : count}>
      {data.loading ? (
        <SkeletonRows rows={2} />
      ) : count === 0 ? (
        <div className="flex items-center gap-2.5 rounded-lg border border-dashed border-line-strong px-4 py-3.5 text-[13px] text-ink-3">
          <CircleCheck className="size-4 shrink-0 text-ok" aria-hidden />
          <span>
            <span className="font-medium text-ink-2">You&apos;re all caught up.</span> Team invites, join requests, and connection requests will appear here.
          </span>
        </div>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-raised">
          <AnimatePresence initial={false}>
            {data.queue.map((item) => (
              <motion.li
                key={queueKey(item)}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
                transition={{ type: "spring", stiffness: 480, damping: 40 }}
              >
                <QueueRow item={item} busy={data.busyId} handlers={handlers} />
              </motion.li>
            ))}
            {unreadMessages > 0 && (
              <motion.li key="unread-dms" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Row
                  lead={
                    <span className="inline-flex size-9 items-center justify-center rounded-full bg-info-soft text-info">
                      <MessageSquare className="size-4" />
                    </span>
                  }
                  title={
                    <>
                      <b className="font-semibold text-ink">
                        {unreadMessages} {unreadMessages === 1 ? "person" : "people"}
                      </b>{" "}
                      sent you messages
                    </>
                  }
                  actions={
                    <ButtonLink href="/messages" size="sm" variant="secondary">
                      Open messages
                    </ButtonLink>
                  }
                />
              </motion.li>
            )}
          </AnimatePresence>
        </ul>
      )}
    </Section>
  );
}

function queueKey(item: QueueItem) {
  return item.kind === "join" ? `join-${item.teamId}` : `${item.kind}-${item.id}`;
}

function Row({ lead, title, meta, body, actions }: { lead: ReactNode; title: ReactNode; meta?: ReactNode; body?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="shrink-0">{lead}</span>
        <div className="min-w-0">
          <p className="text-[13.5px] leading-snug text-ink-2">{title}</p>
          {meta && <p className="mt-0.5 text-[12px] text-ink-3">{meta}</p>}
          {body && <p className="mt-1.5 line-clamp-2 border-l-2 border-line-strong pl-2.5 text-[12.5px] text-ink-2">{body}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5 pl-12 sm:pl-0">{actions}</div>}
    </div>
  );
}

function QueueRow({ item, busy, handlers }: { item: QueueItem; busy: string | null; handlers: DashboardHandlers }) {
  if (item.kind === "invite") {
    const isBusy = busy === item.id;
    return (
      <Row
        lead={<TeamMark name={item.teamName} size="md" />}
        title={
          <>
            <Link href={`/teams/${item.teamId}`} className="font-semibold text-ink hover:underline">
              {item.teamName}
            </Link>{" "}
            invited you to join
          </>
        }
        meta={
          <>
            <Tape tone="accent" className="mr-1.5 align-[1px]">
              Team invite
            </Tape>
            {item.inviterName ? `from ${item.inviterName}` : null}
          </>
        }
        body={item.teamDescription || undefined}
        actions={
          <>
            <Button size="sm" variant="primary" loading={isBusy} onClick={() => handlers.onAcceptInvite(item.id)}>
              Accept
            </Button>
            <Button size="sm" variant="ghost" disabled={isBusy} onClick={() => handlers.onDeclineInvite(item.id)}>
              Decline
            </Button>
          </>
        }
      />
    );
  }
  if (item.kind === "join") {
    return (
      <Row
        lead={<TeamMark name={item.teamName} tone={CATEGORY_TONE[item.category]} size="md" />}
        title={
          <>
            <b className="font-semibold text-ink">
              {item.count} {item.count === 1 ? "builder" : "builders"}
            </b>{" "}
            asked to join <b className="font-semibold text-ink">{item.teamName}</b>
          </>
        }
        meta={<Tape className="align-[1px]">Join request</Tape>}
        actions={
          <ButtonLink href={`/teams/${item.teamId}/requests`} size="sm" variant="secondary">
            Review
          </ButtonLink>
        }
      />
    );
  }
  const isBusy = busy === item.id;
  return (
    <Row
      lead={<Avatar name={item.user.full_name} src={item.user.avatar_url} size="md" />}
      title={
        <>
          <Link href={`/profile/${item.user.id}`} className="font-semibold text-ink hover:underline">
            {item.user.full_name}
          </Link>{" "}
          wants to connect
        </>
      }
      meta={[item.user.college, relativeTime(item.createdAt, { suffix: true })].filter(Boolean).join(" · ")}
      body={item.message || undefined}
      actions={
        <>
          <Button size="sm" variant="primary" loading={isBusy} onClick={() => handlers.onAcceptConnection(item.id, item.user)}>
            Accept
          </Button>
          <Button size="sm" variant="ghost" disabled={isBusy} onClick={() => handlers.onDeclineConnection(item.id, item.user.id)}>
            Decline
          </Button>
        </>
      }
    />
  );
}

/* ── Your teams ────────────────────────────────────────────────────── */

function YourTeams({ data }: { data: DashboardData }) {
  return (
    <Section id="your-teams" title="Your teams" count={data.loading ? undefined : data.teams.length} action={data.teams.length > 0 ? <SectionLink href="/my-teams">Manage</SectionLink> : undefined}>
      {data.loading ? (
        <SkeletonRows rows={2} avatar="square" />
      ) : data.teams.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="You're not on a team yet"
          body="Start one for your next hackathon, or join a team that's recruiting."
          action={
            <>
              <ButtonLink href="/teams/create" size="sm" variant="primary" icon={<Plus />}>
                Create a team
              </ButtonLink>
              <ButtonLink href="/teams" size="sm" variant="ghost">
                Browse teams
              </ButtonLink>
            </>
          }
        />
      ) : (
        <ul className="divide-y divide-line/50 rounded-lg border border-line/50" data-stagger>
          {data.teams.map((t) => {
            const href = `/teams/${t.id}/workspace${t.firstHackathonId ? `?hackathon_id=${t.firstHackathonId}` : ""}`;
            return (
              <li key={t.id}>
                <Link href={href} className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-hover/50">
                  <span className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-raised border border-line/50 text-[13px] font-semibold tracking-tight text-ink-2">
                    {getInitials(t.name, 2)}
                  </span>
                  
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-semibold text-ink group-hover:underline decoration-line-strong underline-offset-4">{t.name}</span>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-3">
                      <span className="truncate">
                        {[t.eventName || (t.tag === "PROJECT" ? null : t.tag), t.isOwner ? "Owner" : "Member"].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                  </div>
                  
                  <div className="hidden shrink-0 items-center gap-1.5 text-[12.5px] font-medium text-ink-3 md:flex w-16 justify-end">
                    <Users className="size-3.5 opacity-70" />
                    <span>{t.memberCount} / {t.maxMembers}</span>
                  </div>
                  
                  <AvatarStack className="hidden shrink-0 lg:inline-flex ml-2" people={t.members} max={3} size="xs" />
                  
                  <span className="ml-4 inline-flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-ink-3 transition-colors group-hover:text-ink">
                    <span className="hidden sm:inline">Workspace</span>
                    <ArrowRight className="size-3.5" aria-hidden />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

/* ── Builders for you ──────────────────────────────────────────────── */

function BuildersForYou({ data }: { data: DashboardData }) {
  const [view, setView] = useState<"fit" | "campus">("fit");
  const list = view === "fit" ? data.bestFit : data.campus;
  const college = data.profile?.college?.replace(/\s*\(.*?\)\s*/g, "").trim();

  return (
    <Section
      id="builders-for-you"
      title="Builders for you"
      action={
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4 text-[13.5px] font-medium">
            <button
              type="button"
              onClick={() => setView("fit")}
              className={cn(
                "inline-flex items-center pb-1 border-b-2 transition-colors",
                view === "fit" ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink-2"
              )}
            >
              Best fit
            </button>
            <button
              type="button"
              onClick={() => setView("campus")}
              className={cn(
                "inline-flex items-center gap-1.5 pb-1 border-b-2 transition-colors",
                view === "campus" ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink-2"
              )}
            >
              Your campus
              {!data.loading && typeof data.stats.campusCount === "number" && (
                <span className={cn("text-[12px] font-medium leading-none", view === "campus" ? "text-accent" : "text-ink-4")}>
                  {data.stats.campusCount}
                </span>
              )}
            </button>
          </div>
          <div className="hidden sm:inline-flex items-center pb-1 border-b-2 border-transparent">
            <SectionLink href="/developers">Discover</SectionLink>
          </div>
        </div>
      }
    >
      {data.loading ? (
        <SkeletonRows rows={4} />
      ) : list.length === 0 ? (
        view === "fit" ? (
          <EmptyState
            icon={<UsersRound />}
            title="No matches yet"
            body="Matching runs on skills. Add yours and we'll line up builders who complement them."
            action={
              <>
                <ButtonLink href="/profile/edit" size="sm" variant="secondary">
                  Add skills
                </ButtonLink>
                <ButtonLink href="/developers" size="sm" variant="ghost">
                  Browse all builders
                </ButtonLink>
              </>
            }
          />
        ) : (
          <EmptyState
            icon={<GraduationCap />}
            title={college ? `No one from ${college} in your matches yet` : "Set your college to see campus matches"}
            body={college ? "Browse everyone, or share HackerMate with classmates." : "Campus matching uses your college on your profile."}
            action={
              <ButtonLink href={college ? "/developers" : "/profile/edit"} size="sm" variant="secondary">
                {college ? "Browse builders" : "Set college"}
              </ButtonLink>
            }
          />
        )
      ) : (
        <ul className="divide-y divide-line/40" data-stagger key={view}>
          {list.map((b) => (
            <BuilderRow key={b.id} b={b} viewerSkills={data.profile?.skills || []} state={data.connectionStates[b.id] || "not_connected"} />
          ))}
        </ul>
      )}
    </Section>
  );
}

function BuilderRow({ b, state, viewerSkills }: { b: DashBuilder; state: ConnState; viewerSkills: string[] }) {
  const shared = new Set(b.shared_skills || []);
  const skills = [...(b.skills || [])].sort((x, y) => Number(shared.has(y)) - Number(shared.has(x))).slice(0, 4);
  const why = matchReason({ reasons: b.reasons, builderSkills: b.skills, viewerSkills });
  const reason = why?.text;
  const isDiscovery = Boolean(why?.discovery);

  return (
    <li className="group relative flex items-start gap-4 px-2 py-4 sm:px-4 sm:-mx-2 transition-colors hover:bg-hover/40 rounded-xl">
      <Avatar name={b.full_name} src={b.avatar_url} size="md" presence={b.is_available ? "online" : null} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            href={`/profile/${b.id}`}
            className="truncate text-[14.5px] font-semibold text-ink after:absolute after:inset-0 after:content-[''] group-hover:underline decoration-line-strong underline-offset-4"
          >
            {b.full_name || "Builder"}
          </Link>
          {b.is_available && (
            <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-ok">
              <span className="size-1.5 rounded-full bg-ok" aria-hidden />
              Available
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[12.5px] text-ink-3">{[b.college, b.year_of_study].filter(Boolean).join(" · ") || "Independent builder"}</p>
        {reason && (
          <p className={cn("mt-1.5 flex items-center gap-1.5 text-[12.5px]", isDiscovery ? "text-ink-3" : "text-ink-2")}>
            {isDiscovery ? <Lightbulb className="size-3.5 shrink-0 text-warn" aria-hidden /> : <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />}
            <span className="truncate">{reason}</span>
          </p>
        )}
        {skills.length > 0 && (
          <div className="mt-2 text-[12px] text-ink-3 leading-relaxed">
            {skills.map((s, i) => (
              <span key={s}>
                <span className={shared.has(s) ? "font-medium text-ink-2" : ""}>{s}</span>
                {i < skills.length - 1 && <span className="mx-1.5 text-line-strong">·</span>}
              </span>
            ))}
            {b.skills && b.skills.length > skills.length && (
              <span className="ml-1.5 text-ink-4">+{b.skills.length - skills.length}</span>
            )}
          </div>
        )}
      </div>
      <div className="relative z-10 flex shrink-0 flex-col items-end gap-2 pl-2">
        {typeof b.compatibility === "number" && (
          <span 
            className={cn(
              "text-[12.5px] font-medium tracking-tight",
              b.matchEngine === "v3" ? "text-accent-ink" : "text-ink-3"
            )}
          >
            {b.matchEngine === "v3" ? `${b.compatibility}% match` : (fitBand(b.compatibility)?.label || "Recommended")}
          </span>
        )}
        <RelationshipCta id={b.id} state={state} />
      </div>
    </li>
  );
}

function RelationshipCta({ id, state }: { id: string; state: ConnState }) {
  if (state === "connected") return (
    <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-ok">
      <span className="size-1.5 rounded-full bg-ok" aria-hidden />
      Connected
    </span>
  );
  if (state === "request_sent") return <span className="text-[12.5px] text-ink-3">Request sent</span>;
  if (state === "request_received")
    return (
      <Link href="#needs-you" className="flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">
        Respond <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    );
  return (
    <Link href={`/profile/${id}?connect=1`} className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink">
      <UserPlus className="size-4" />
      Connect
    </Link>
  );
}

/* ── Side column ───────────────────────────────────────────────────── */

function ProfileStrength({ data, onOpenProfileSetup }: { data: DashboardData; onOpenProfileSetup: () => void }) {
  const pct = data.completeness.percent;
  return (
    <Section title="Profile strength" count={`${pct}%`}>
      <div className="rounded-lg border border-line bg-raised p-4">
        <Progress value={pct} tone={pct >= 80 ? "accent" : "warn"} />
        <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{data.nextStep}</p>
        {data.completeness.missing.length > 0 && (
          <ul className="mt-3 space-y-1">
            {data.completeness.missing.map((m) => (
              <li key={m.key}>
                <Link href="/profile/edit" className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-ink-3 hover:bg-hover hover:text-ink">
                  <span className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-ink-4" aria-hidden />
                    {m.label}
                  </span>
                  <span className="font-mono text-[12px] text-ink-4">+20%</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="primary" onClick={onOpenProfileSetup}>
            Complete profile
          </Button>
          <ButtonLink href="/profile/edit" size="sm" variant="ghost">
            Edit all
          </ButtonLink>
        </div>
      </div>
    </Section>
  );
}

function Pulse({ data }: { data: DashboardData }) {
  const items = [
    { label: "Hackathons live", value: data.stats.hackathons, href: "/hackathons" },
    { label: "Closing ≤ 7 days", value: data.stats.closingSoon, href: "/hackathons", urgent: data.stats.closingSoon > 0 },
    { label: "Builders", value: data.stats.builders, href: "/developers" },
    { label: "Teams", value: data.stats.teams, href: "/teams" },
  ];
  return (
    <Section title="On HackerMate">
      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-line">
        {items.map((it, i) => (
          <Link
            key={it.label}
            href={it.href}
            className={cn(
              "group px-3.5 py-3 transition-colors hover:bg-hover",
              i % 2 === 0 && "border-r border-line",
              i < 2 && "border-b border-line",
            )}
          >
            <div className="caps-label text-ink-3">{it.label}</div>
            <div className={cn("mt-1 font-display text-[22px] font-semibold leading-none tabular", it.urgent ? "text-warn" : "text-ink")}>
              {data.loading ? <Skeleton className="mt-1 h-5 w-10" /> : it.value.toLocaleString("en-IN")}
            </div>
          </Link>
        ))}
      </div>
    </Section>
  );
}

function SihCallout() {
  return (
    <Link href="/hackathons/sih" className="group block rounded-lg border border-line p-4 transition-colors hover:border-line-strong hover:bg-hover">
      <div className="flex items-center gap-2">
        <Tape tone="sih">SIH 2026</Tape>
        <span className="caps-label text-ink-3">Team builder</span>
      </div>
      <p className="mt-2 text-[14px] font-semibold text-ink">Smart India Hackathon internal round</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">Six members from your college, at least one woman on the team. Find the gaps in yours.</p>
      <span className="mt-2.5 inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-2 group-hover:text-ink">
        Open SIH builder <ArrowUpRight className="size-3.5" aria-hidden />
      </span>
    </Link>
  );
}

function PartnerEvents({ data }: { data: DashboardData }) {
  return (
    <Section title="Partner events">
      <ul className="divide-y divide-line">
        {data.partners.map((p) => {
          const tl = eventTimeline(null, p.endDate);
          return (
            <li key={p.slug}>
              <Link href={`/partners/${p.slug}`} className="flex items-center gap-3 py-2.5 hover:text-ink">
                {p.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.logoUrl} alt="" className="size-8 rounded-[6px] bg-white object-contain p-0.5" />
                ) : (
                  <TeamMark name={p.name} size="sm" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink">{p.eventName || p.name}</p>
                  <p className="truncate text-[12px] text-ink-3">{p.name}</p>
                </div>
                {p.endDate && <Tape tone={tl.urgent ? "warn" : "neutral"}>{tl.label}</Tape>}
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function RecentActivity({ data, onOpenInbox }: { data: DashboardData; onOpenInbox: () => void }) {
  return (
    <Section
      title="Activity"
      action={
        <button type="button" onClick={onOpenInbox} className="text-[12.5px] font-medium text-ink-3 hover:text-ink">
          Open inbox
        </button>
      }
    >
      {data.loading ? (
        <SkeletonRows rows={3} avatar="none" />
      ) : data.activity.length === 0 ? (
        <p className="text-[12.5px] text-ink-3">Nothing yet. Team and network activity will land here.</p>
      ) : (
        <ol className="relative space-y-3 border-l border-line pl-4">
          {data.activity.map((a) => {
            const inner = (
              <>
                <span className="absolute -left-[20.5px] top-1.5 size-2 rounded-full bg-line-strong ring-2 ring-canvas" aria-hidden />
                <p className="text-[12.5px] leading-snug text-ink-2">{a.message}</p>
                <p className="mt-0.5 font-mono text-[12.5px] text-ink-4">{relativeTime(a.createdAt, { suffix: true })}</p>
              </>
            );
            return (
              <li key={a.id} className="relative">
                {a.link ? (
                  <Link href={a.link} className="block hover:[&_p:first-child]:text-ink">
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}

