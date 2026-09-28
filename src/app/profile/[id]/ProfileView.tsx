"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Award,
  Ban,
  Check,
  Ellipsis,
  Flag,
  Flame,
  Link2,
  Lock,
  Mail,
  MessageSquare,
  PenLine,
  RefreshCw,
  Trophy,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import {
  Avatar,
  AvatarStack,
  Button,
  ButtonLink,
  Chip,
  EmptyState,
  GithubIcon,
  LinkedinIcon,
  Menu,
  Page,
  Section,
  Segmented,
  Skeleton,
  Tape,
  TeamMark,
  type MenuItem,
} from "@/components/system";
import type { UserBadge } from "@/components/CertificateModal";
import type { TrackRecordData } from "@/components/BuilderTrackRecord";
import { calculateProfileCompleteness } from "@/lib/profileCompleteness";
import { isOnline, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { BuilderProfile, ConnectionState, GithubStats } from "./useProfileData";

export type ProfileActions = {
  onConnect: () => void;
  onAccept: () => void;
  onRemove: (message?: string) => void;
  onToggleBlock: () => void;
  onReport: () => void;
  onInvite: () => void;
  onSyncGithub: () => void;
  onDelete: () => void;
  onViewCertificate: (b: UserBadge) => void;
  onShareBadge: (b: UserBadge) => void;
  onCopyLink: () => void;
};

type Props = {
  profile: BuilderProfile;
  viewerId: string | null;
  isOwnProfile: boolean;
  connectionState: ConnectionState;
  isBlockedByMe: boolean;
  badges: UserBadge[];
  trackRecord: TrackRecordData | null;
  trackRecordLoading: boolean;
  stats: { connections: number; teams: number; practice: number; registrations: number };
  canInvite: boolean;
  alreadyInvited: boolean;
  busy: string | null;
  actions: ProfileActions;
};

function formatUrl(url: string) {
  return url.startsWith("http://") || url.startsWith("https://") ? url : `https://${url}`;
}

function streakValue(p: BuilderProfile) {
  if (!p.current_streak) return 0;
  const today = new Date().toISOString().split("T")[0];
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yesterday = y.toISOString().split("T")[0];
  return p.last_active_date === today || p.last_active_date === yesterday ? p.current_streak : 0;
}

/**
 * Builder profile. Reads like a dossier: who they are and whether they're
 * free, what they've actually done (track record, GitHub, badges), and one
 * clear next action for the viewer's relationship with them.
 */
export function ProfileView(props: Props) {
  const { profile, isOwnProfile, isBlockedByMe, badges, trackRecord, stats } = props;
  const complete = calculateProfileCompleteness(profile).score === 100;
  const streak = streakValue(profile);
  const wins = profile.hackathon_wins ?? 0;
  const hackathons = trackRecord?.registrations?.length ?? (stats.registrations || profile.hackathon_participations || 0);
  const isPrivate = profile.show_track_record === false;
  const hideRecord = isPrivate && !isOwnProfile;
  const online = isOnline(profile.last_seen_at);

  const facts = [
    { label: "Hackathons", value: hackathons },
    { label: "Wins", value: wins, tone: wins > 0 ? "text-warn" : undefined },
    { label: "Teams", value: stats.teams },
    { label: "Connections", value: stats.connections },
    { label: "Practice", value: stats.practice },
    {
      label: "Member since",
      value: profile.created_at ? new Date(profile.created_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "—",
    },
  ];

  return (
    <Page className="pb-32 md:pb-16">
      <nav aria-label="Breadcrumb" className="hidden pt-6 text-[12.5px] text-ink-3 md:block">
        <Link href="/developers" className="hover:text-ink">
          Builders
        </Link>
        <span className="mx-1.5 text-ink-4">/</span>
        <span className="text-ink-2">{profile.full_name}</span>
      </nav>

      {/* ── Identity ─────────────────────────────────────────── */}
      <header className="pt-5 md:pt-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="flex items-start gap-4 md:items-end md:gap-6">
            <Avatar name={profile.full_name} src={profile.avatar_url} size="2xl" presence={online ? "online" : null} className="max-md:size-20" />
            <div className="min-w-0 pb-0.5">
              <h1
                data-v2-heading
                className="font-display text-[30px] font-semibold leading-[1.02] tracking-[-0.03em] text-ink [font-variation-settings:'wdth'_88] md:text-[44px]"
              >
                {profile.full_name}
              </h1>
              <p className="mt-2 text-[13.5px] text-ink-3">
                {[
                  profile.username ? `@${profile.username}` : null,
                  profile.college || "Independent builder",
                  profile.year_of_study,
                  online ? "Online now" : profile.last_seen_at ? `Active ${relativeTime(profile.last_seen_at, { suffix: true })}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {complete && (
                  <Tape tone="ok" icon={<Check />}>
                    Verified
                  </Tape>
                )}
                {profile.is_available !== false ? <Tape tone="accent" dot>Open to teams</Tape> : <Tape>Not looking</Tape>}
                {wins > 0 && (
                  <Tape tone="warn" icon={<Trophy />}>
                    {wins} win{wins === 1 ? "" : "s"}
                  </Tape>
                )}
                {streak > 0 && (
                  <Tape tone="warn" icon={<Flame />}>
                    {streak}-day streak
                  </Tape>
                )}
              </div>
            </div>
          </div>
          <div className="hidden shrink-0 md:block">
            <PrimaryActions {...props} />
          </div>
        </div>

        {/* Credibility strip: real counts only */}
        <dl className="mt-7 grid grid-cols-3 border-y border-line md:grid-cols-6">
          {facts.map((f, i) => (
            <div
              key={f.label}
              className={cn(
                "px-3 py-3.5 md:px-4",
                i % 3 !== 0 && "border-l border-line",
                i >= 3 && "border-t border-line md:border-t-0",
                i === 3 && "md:border-l",
              )}
            >
              <dt className="caps-label truncate text-ink-4">{f.label}</dt>
              <dd className={cn("mt-1 font-display text-[21px] font-semibold leading-none tabular", f.tone || "text-ink")}>{f.value}</dd>
            </div>
          ))}
        </dl>
      </header>

      {isBlockedByMe ? (
        <div className="mt-10">
          <EmptyState
            icon={<Ban />}
            title="You've blocked this builder"
            body="Their profile details stay hidden while they're blocked."
            action={
              <Button size="sm" variant="secondary" loading={props.busy === "block"} onClick={props.actions.onToggleBlock}>
                Unblock
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-9 grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-12">
          <div className="min-w-0 space-y-10">
            <Section title="About">
              {profile.bio ? (
                <p className="max-w-[68ch] whitespace-pre-line text-[15px] leading-[1.65] text-ink-2">{profile.bio}</p>
              ) : isOwnProfile ? (
                <EmptyState compact title="Say what you build" body="One or two lines on your stack and the role you want on a team." action={<ButtonLink href="/profile/edit" size="sm" variant="secondary">Add a bio</ButtonLink>} />
              ) : (
                <p className="text-[13.5px] text-ink-3">No bio yet.</p>
              )}
            </Section>

            {isPrivate && isOwnProfile && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-warn-soft px-4 py-3 ring-1 ring-inset ring-warn/25">
                <p className="flex items-center gap-2 text-[13px] text-ink-2">
                  <Lock className="size-4 text-warn" aria-hidden />
                  Your track record and badges are hidden from visitors.
                </p>
                <Link href="/settings?tab=privacy" className="text-[12.5px] font-medium text-ink underline decoration-line-strong underline-offset-4">
                  Change in settings
                </Link>
              </div>
            )}

            {hideRecord ? (
              <Section title="Track record">
                <EmptyState icon={<Lock />} title="Track record is private" body="This builder keeps their hackathon history and badges to themselves." />
              </Section>
            ) : (
              <>
                <TrackRecord data={trackRecord} loading={props.trackRecordLoading} isOwner={isOwnProfile} />
                <Badges badges={badges} onView={props.actions.onViewCertificate} onShare={props.actions.onShareBadge} isOwner={isOwnProfile} />
              </>
            )}

            {profile.github_url && (
              <GithubSection
                stats={profile.github_stats ?? null}
                syncedAt={profile.github_stats_updated_at ?? null}
                isOwner={isOwnProfile}
                syncing={props.busy === "sync"}
                onSync={props.actions.onSyncGithub}
              />
            )}
          </div>

          <aside className="space-y-9">
            <Section title="Skills" count={profile.skills?.length || 0}>
              {profile.skills?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.skills.map((s) => (
                    <Chip key={s}>{s}</Chip>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-ink-3">{isOwnProfile ? "Add skills so matching can find you." : "No skills listed."}</p>
              )}
            </Section>

            <Section title="Links">
              <ul className="divide-y divide-line rounded-lg border border-line">
                {profile.github_url && <LinkRow href={formatUrl(profile.github_url)} icon={<GithubIcon className="size-4" />} label="GitHub" value={profile.github_url.replace(/^https?:\/\/(www\.)?/, "")} />}
                {profile.linkedin_url && (
                  <LinkRow href={formatUrl(profile.linkedin_url)} icon={<LinkedinIcon className="size-4" />} label="LinkedIn" value={profile.linkedin_url.replace(/^https?:\/\/(www\.)?/, "")} />
                )}
                {profile.email && <LinkRow href={`mailto:${profile.email}`} icon={<Mail className="size-4" />} label="Email" value={profile.email} external={false} />}
                {!profile.github_url && !profile.linkedin_url && !profile.email && <li className="px-3.5 py-3 text-[12.5px] text-ink-3">No links added.</li>}
              </ul>
            </Section>

            {isOwnProfile ? (
              <Section title="Your profile">
                <div className="space-y-2">
                  <ButtonLink href="/profile/edit" variant="secondary" className="w-full" icon={<PenLine />}>
                    Edit profile
                  </ButtonLink>
                  <Link href="/settings?tab=privacy" className="flex items-center justify-between rounded-md px-1 py-1.5 text-[12.5px] text-ink-3 hover:text-ink">
                    Track record: {isPrivate ? "hidden" : "public"}
                    <ArrowUpRight className="size-3.5" aria-hidden />
                  </Link>
                </div>
                <div className="mt-6 rounded-lg border border-bad/25 p-3.5">
                  <p className="caps-label text-bad">Danger zone</p>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">Deletes your profile, DMs and files, and disbands teams where you&apos;re the only member.</p>
                  <Button size="sm" variant="danger" className="mt-3" onClick={props.actions.onDelete}>
                    Delete account
                  </Button>
                </div>
              </Section>
            ) : (
              props.viewerId && (
                <Section title="Safety">
                  <div className="flex flex-col items-start gap-1">
                    <button type="button" onClick={props.actions.onToggleBlock} className="inline-flex items-center gap-2 py-1 text-[12.5px] text-ink-3 hover:text-ink">
                      <Ban className="size-3.5" aria-hidden /> Block
                    </button>
                    <button type="button" onClick={props.actions.onReport} className="inline-flex items-center gap-2 py-1 text-[12.5px] text-ink-3 hover:text-ink">
                      <Flag className="size-3.5" aria-hidden /> Report profile
                    </button>
                  </div>
                </Section>
              )
            )}
          </aside>
        </div>
      )}

      {/* Mobile: sticky action bar above the tab bar */}
      {!isBlockedByMe && (
        <div className="fixed inset-x-0 bottom-[calc(var(--hm-tabbar-h)+env(safe-area-inset-bottom))] z-30 border-t border-line bg-canvas/95 px-4 py-2.5 backdrop-blur md:hidden">
          <PrimaryActions {...props} compact />
        </div>
      )}
    </Page>
  );
}

/* ── Actions ───────────────────────────────────────────────────────── */

function PrimaryActions(props: Props & { compact?: boolean }) {
  const { profile, isOwnProfile, connectionState, viewerId, actions, busy, canInvite, alreadyInvited, compact } = props;
  const loading = busy === "connect";
  const full = compact ? "flex-1" : undefined;

  const overflow: MenuItem[] = [{ label: "Copy profile link", icon: <Link2 />, onSelect: actions.onCopyLink }];
  if (!isOwnProfile && viewerId) {
    if (connectionState === "connected") overflow.push({ label: "Remove connection", icon: <UserMinus />, onSelect: () => actions.onRemove("Connection removed") });
    overflow.push({ type: "separator" }, { label: "Block", icon: <Ban />, onSelect: actions.onToggleBlock }, { label: "Report", icon: <Flag />, onSelect: actions.onReport, tone: "danger" });
  }

  let main: ReactNode;
  if (isOwnProfile) {
    main = (
      <ButtonLink href="/profile/edit" variant="secondary" icon={<PenLine />} className={full}>
        Edit profile
      </ButtonLink>
    );
  } else if (!viewerId) {
    main = (
      <ButtonLink href={`/login?next=${encodeURIComponent(`/profile/${profile.id}`)}`} variant="primary" icon={<UserPlus />} className={full}>
        Sign in to connect
      </ButtonLink>
    );
  } else if (connectionState === "connected") {
    main = (
      <ButtonLink href={`/messages?user=${profile.id}`} variant="inverse" icon={<MessageSquare />} className={full}>
        Message
      </ButtonLink>
    );
  } else if (connectionState === "request_received") {
    main = (
      <>
        <Button variant="primary" loading={loading} onClick={actions.onAccept} className={full} icon={<Check />}>
          Accept request
        </Button>
        <Button variant="ghost" disabled={loading} onClick={() => actions.onRemove("Request declined")}>
          Decline
        </Button>
      </>
    );
  } else if (connectionState === "request_sent") {
    main = (
      <Button variant="secondary" loading={loading} onClick={() => actions.onRemove("Request withdrawn")} className={full} title="Withdraw request">
        Request sent · Withdraw
      </Button>
    );
  } else {
    main = (
      <Button variant="primary" loading={loading} onClick={actions.onConnect} icon={<UserPlus />} className={full}>
        Connect
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {main}
      {!isOwnProfile && viewerId && canInvite && (
        <Button variant="secondary" onClick={actions.onInvite} disabled={alreadyInvited} icon={alreadyInvited ? <Check /> : <Users />} className={compact ? "px-3" : undefined}>
          {alreadyInvited ? "Invited" : compact ? "Invite" : "Invite to team"}
        </Button>
      )}
      <Menu
        align="end"
        side={compact ? "top" : "bottom"}
        items={overflow}
        trigger={({ open, toggle, ref }) => (
          <button
            ref={ref}
            type="button"
            onClick={toggle}
            aria-label="More actions"
            aria-expanded={open}
            className={cn(
              "inline-flex size-[34px] items-center justify-center rounded-md text-ink-2 ring-1 ring-inset ring-line-strong transition-colors hover:bg-hover hover:text-ink",
              open && "bg-hover text-ink",
            )}
          >
            <Ellipsis className="size-4" />
          </button>
        )}
      />
    </div>
  );
}

function LinkRow({ href, icon, label, value, external = true }: { href: string; icon: ReactNode; label: string; value: string; external?: boolean }) {
  return (
    <li>
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className="group flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-hover"
      >
        <span className="text-ink-3 group-hover:text-ink">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-medium text-ink">{label}</span>
          <span className="block truncate font-mono text-[11px] text-ink-4">{value}</span>
        </span>
        <ArrowUpRight className="size-3.5 text-ink-4 group-hover:text-ink" aria-hidden />
      </a>
    </li>
  );
}

/* ── Track record ──────────────────────────────────────────────────── */

type TRView = "all" | "delivered" | "teams";

function TrackRecord({ data, loading, isOwner }: { data: TrackRecordData | null; loading: boolean; isOwner: boolean }) {
  const [view, setView] = useState<TRView>("all");
  const registrations = useMemo(() => data?.registrations ?? [], [data]);
  const teams = useMemo(() => data?.teams ?? [], [data]);
  const submissions = useMemo(() => data?.submissions ?? [], [data]);

  const rows = useMemo(() => {
    const byKey = new Map<string, (typeof submissions)[number]>();
    submissions.forEach((s) => {
      byKey.set(`${s.team_id}_${s.hackathon_id}`, s);
      byKey.set(s.team_id, s);
    });
    return registrations.map((reg) => {
      const team = teams.find((t) => t.team_hackathons.includes(reg.hackathon_id) || t.team_hackathons.length === 0);
      const submission = team ? byKey.get(`${team.team_id}_${reg.hackathon_id}`) || byKey.get(team.team_id) : undefined;
      return { reg, team, submission };
    });
  }, [registrations, teams, submissions]);

  const delivered = rows.filter((r) => r.submission).length;
  const shown = view === "delivered" ? rows.filter((r) => r.submission) : rows;

  return (
    <Section
      title="Track record"
      count={loading ? undefined : `${registrations.length} events · ${delivered} delivered`}
      action={
        registrations.length > 0 || teams.length > 0 ? (
          <Segmented<TRView>
            label="Track record view"
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: "all", label: "Events" },
              { value: "delivered", label: "Delivered" },
              { value: "teams", label: "Teams", count: teams.length },
            ]}
          />
        ) : undefined
      }
    >
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      ) : !data ? (
        <p className="text-[13px] text-ink-3">Track record isn&apos;t available right now.</p>
      ) : view === "teams" ? (
        teams.length === 0 ? (
          <p className="text-[13px] text-ink-3">No teams on record.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {teams.map((t) => (
              <li key={t.team_id}>
                <Link href={`/teams/${t.team_id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-hover">
                  <TeamMark name={t.team_name} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-ink">{t.team_name}</p>
                    <p className="truncate text-[12px] text-ink-3">
                      {t.user_role ? `${t.user_role} · ` : ""}joined {new Date(t.joined_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                    </p>
                  </div>
                  {t.teammates?.length > 0 && (
                    <AvatarStack people={t.teammates.map((m) => ({ id: m.user_id, name: m.full_name, src: m.avatar_url }))} max={4} size="xs" />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : shown.length === 0 ? (
        <EmptyState
          compact
          icon={<Trophy />}
          title={view === "delivered" ? "No delivered projects yet" : "No hackathons on record"}
          body={isOwner ? "Register for a hackathon on HackerMate and it shows up here." : "Nothing to show yet."}
          action={isOwner ? <ButtonLink href="/hackathons" size="sm" variant="secondary">Browse hackathons</ButtonLink> : undefined}
        />
      ) : (
        <ol className="divide-y divide-line rounded-lg border border-line">
          {shown.map(({ reg, team, submission }) => {
            const when = reg.start_date || reg.registered_at;
            return (
              <li key={reg.registration_id} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 px-4 py-3.5 md:grid-cols-[84px_minmax(0,1fr)]">
                <div className="pt-0.5 font-mono text-[11px] uppercase leading-tight text-ink-3 tabular">
                  {when ? new Date(when).toLocaleDateString("en-IN", { month: "short" }) : "—"}
                  <br />
                  <span className="text-ink-4">{when ? new Date(when).getFullYear() : ""}</span>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link href={`/hackathons/${reg.hackathon_id}`} className="truncate text-[14px] font-semibold text-ink hover:underline decoration-line-strong underline-offset-4">
                      {reg.hackathon_name}
                    </Link>
                    {reg.mode && <Tape>{reg.mode}</Tape>}
                    {submission ? <Tape tone="ok" dot>Delivered</Tape> : <Tape>Participated</Tape>}
                  </div>
                  {team && (
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-3">
                      <span>
                        with{" "}
                        <Link href={`/teams/${team.team_id}`} className="font-medium text-ink-2 hover:text-ink">
                          {team.team_name}
                        </Link>
                        {team.user_role ? ` · ${team.user_role}` : ""}
                      </span>
                      {team.teammates?.length > 0 && (
                        <AvatarStack people={team.teammates.map((m) => ({ id: m.user_id, name: m.full_name, src: m.avatar_url }))} max={5} size="xs" />
                      )}
                    </p>
                  )}
                  {submission && (
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
                      <span className="text-ink-2">
                        <span className="text-ink-4">Project</span> {submission.project_title}
                      </span>
                      {submission.demo_url && <ExtLink href={submission.demo_url}>Demo</ExtLink>}
                      {submission.github_url && <ExtLink href={submission.github_url}>Code</ExtLink>}
                      {submission.slides_url && <ExtLink href={submission.slides_url}>Slides</ExtLink>}
                      {submission.pitch_video_url && <ExtLink href={submission.pitch_video_url}>Pitch</ExtLink>}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink">
      {children}
      <ArrowUpRight className="size-3" aria-hidden />
    </a>
  );
}

/* ── Badges ────────────────────────────────────────────────────────── */

function Badges({ badges, onView, onShare, isOwner }: { badges: UserBadge[]; onView: (b: UserBadge) => void; onShare: (b: UserBadge) => void; isOwner: boolean }) {
  return (
    <Section title="Badges & certificates" count={badges.length}>
      {badges.length === 0 ? (
        <p className="text-[13px] text-ink-3">
          {isOwner ? "Partner hackathons award verified badges and certificates. None yet." : "No verified badges yet."}
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {badges.map((b) => (
            <li key={b.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-warn-soft text-warn">
                  <Award className="size-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-semibold text-ink">{b.badge_name}</span>
                    <Tape tone="warn">{b.rank_title || "Verified winner"}</Tape>
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink-3">
                    {b.issuer_name || "HackerMate Partner Network"} · {new Date(b.issued_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5 pl-12 sm:pl-0">
                <Button size="sm" variant="secondary" onClick={() => onView(b)}>
                  Certificate
                </Button>
                {isOwner && (
                  <Button size="sm" variant="ghost" onClick={() => onShare(b)}>
                    Share
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ── GitHub ────────────────────────────────────────────────────────── */

const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#e8d44d",
  Python: "#3572A5",
  HTML: "#e34c26",
  CSS: "#663399",
  Rust: "#dea584",
  Go: "#00ADD8",
  C: "#6e6e6e",
  "C++": "#f34b7d",
  "C#": "#178600",
  Ruby: "#b3312a",
  Java: "#b07219",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  PHP: "#6f7dbd",
  Shell: "#89e051",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  Dart: "#00B4AB",
};

function GithubSection({ stats, syncedAt, isOwner, syncing, onSync }: { stats: GithubStats | null; syncedAt: string | null; isOwner: boolean; syncing: boolean; onSync: () => void }) {
  const langs = Object.entries(stats?.top_languages || {});
  const total = langs.reduce((a, [, n]) => a + n, 0);
  return (
    <Section
      title="GitHub"
      count={syncedAt ? `synced ${relativeTime(syncedAt, { suffix: true })}` : undefined}
      action={
        isOwner ? (
          <Button size="sm" variant="ghost" loading={syncing} icon={<RefreshCw />} onClick={onSync}>
            Sync
          </Button>
        ) : undefined
      }
    >
      {!stats ? (
        <p className="text-[13px] text-ink-3">{isOwner ? "Sync your GitHub to show repos and languages here." : "No GitHub data synced yet."}</p>
      ) : (
        <div className="space-y-5">
          <div className="flex gap-8">
            <div>
              <div className="caps-label text-ink-4">Public repos</div>
              <div className="mt-1 font-display text-[21px] font-semibold leading-none tabular">{stats.public_repos}</div>
            </div>
            <div>
              <div className="caps-label text-ink-4">Followers</div>
              <div className="mt-1 font-display text-[21px] font-semibold leading-none tabular">{stats.followers}</div>
            </div>
          </div>
          {total > 0 && (
            <div>
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-selected" aria-hidden>
                {langs.map(([lang, n]) => (
                  <span key={lang} style={{ width: `${(n / total) * 100}%`, backgroundColor: LANG_COLORS[lang] || "#8b8880" }} />
                ))}
              </div>
              <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
                {langs.map(([lang, n]) => (
                  <li key={lang} className="flex items-center gap-1.5 text-[12px] text-ink-2">
                    <span className="size-2 rounded-full" style={{ backgroundColor: LANG_COLORS[lang] || "#8b8880" }} aria-hidden />
                    {lang}
                    <span className="font-mono text-[11px] text-ink-4">{Math.round((n / total) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {stats.repos?.length > 0 && (
            <ul className="grid gap-2 sm:grid-cols-2">
              {stats.repos.map((r) => (
                <li key={r.name}>
                  <a href={r.url} target="_blank" rel="noreferrer" className="group flex h-full flex-col rounded-lg border border-line p-3.5 transition-colors hover:border-line-strong hover:bg-hover">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-[12.5px] font-medium text-ink">{r.name}</span>
                      <ArrowUpRight className="size-3.5 shrink-0 text-ink-4 group-hover:text-ink" aria-hidden />
                    </span>
                    {r.description && <span className="mt-1 line-clamp-2 text-[12px] text-ink-3">{r.description}</span>}
                    <span className="mt-auto flex items-center gap-3 pt-2.5 text-[11.5px] text-ink-3">
                      {r.language && (
                        <span className="flex items-center gap-1.5">
                          <span className="size-2 rounded-full" style={{ backgroundColor: LANG_COLORS[r.language] || "#8b8880" }} aria-hidden />
                          {r.language}
                        </span>
                      )}
                      <span className="font-mono">{r.stars} stars</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Section>
  );
}
