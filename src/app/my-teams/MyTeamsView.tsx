"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, Clock3, Plus, RefreshCw, Target, Users } from "lucide-react";
import { Button, ButtonLink, EmptyState, ErrorNotice, Page, PageHeader, PageLoader, Section, SkeletonRows, Tape, TeamMark } from "@/components/system";
import { TeamsTabs } from "@/app/teams/TeamsTabs";
import type { Application, MyTeamsData, Team } from "./useMyTeamsData";

export type MyTeamsHandlers = { refresh: () => void; refreshMemberships: () => void; refreshApplications: () => void };

export function MyTeamsView({ data, handlers }: { data: MyTeamsData; handlers: MyTeamsHandlers }) {
  if (data.sessionError) return <Page><ErrorNotice title="Couldn't verify your account" detail={data.sessionError} onRetry={handlers.refresh} /></Page>;
  if (!data.viewerId) return <PageLoader label="Checking your teams" />;
  const teams = data.memberships.data || [];
  const lead = teams.filter(team => team.owner_id === data.viewerId);
  const joined = teams.filter(team => team.owner_id !== data.viewerId);
  const memberIds = new Set(data.memberships.status === "success" ? teams.map(team => team.id) : []);
  const requests = (data.applications.data || []).filter(request => !memberIds.has(request.teamId));
  const membershipCount = data.memberships.status === "success" ? teams.length : undefined;
  const applicationCount = data.applications.status === "success" ? requests.length : undefined;

  return (
    <Page>
      <PageHeader title="Teams"
        meta={membershipCount !== undefined ? `You're on ${membershipCount} team${membershipCount === 1 ? "" : "s"} · leading ${lead.length}`
          : data.memberships.status === "error" ? "Your membership count is unavailable" : "Updating your teams…"}
        actions={<ButtonLink href="/teams/create" variant="primary" icon={<Plus />}>New team</ButtonLink>}
        tabs={<TeamsTabs />} />
      <div className="mt-7 space-y-10">
        <Section id="your-memberships" title="Your teams" count={membershipCount}
          action={<Button size="sm" variant="ghost" icon={<RefreshCw />} className="h-11 md:h-8" aria-label="Refresh memberships"
            disabled={data.memberships.status === "loading"} onClick={handlers.refreshMemberships}>Refresh</Button>}>
          {data.memberships.error && <ErrorNotice className="mb-4" title="Couldn't load your teams" detail={data.memberships.error} onRetry={handlers.refreshMemberships} />}
          {data.memberships.status !== "success" && teams.length > 0 && <p role="status" className="mb-3 text-[13px] text-ink-3">Showing previously loaded memberships while we check for updates.</p>}
          {data.memberships.status === "loading" && teams.length === 0 ? <SkeletonRows rows={2} avatar="square" />
            : membershipCount === 0 ? (
              <EmptyState icon={<Users />} title="No teams yet" body="Pending applications are listed below. You're a member only after joining a team."
                action={<><ButtonLink href="/teams" size="sm" variant="secondary">Find a team</ButtonLink>
                  <ButtonLink href="/teams/create" size="sm" variant="ghost" icon={<Plus />}>New team</ButtonLink></>} />
            ) : teams.length > 0 ? (
              <div className="space-y-6">
                {lead.length > 0 && <TeamList title="You lead" teams={lead} leader />}
                {joined.length > 0 && <TeamList title="You're a member" teams={joined} />}
              </div>
            ) : null}
        </Section>

        <Section id="pending-applications" title="Pending applications" count={applicationCount}
          description="Requests awaiting a team owner's response. These aren't team memberships."
          action={<Button size="sm" variant="ghost" icon={<RefreshCw />} className="h-11 md:h-8" aria-label="Refresh applications"
            disabled={data.applications.status === "loading"} onClick={handlers.refreshApplications}>Refresh</Button>}>
          {data.applications.error && <ErrorNotice className="mb-4" title="Couldn't load applications" detail={data.applications.error} onRetry={handlers.refreshApplications} />}
          {data.applications.status !== "success" && requests.length > 0 && <p role="status" className="mb-3 text-[13px] text-ink-3">Showing last loaded applications. Refresh to check their current status.</p>}
          {data.applications.status === "loading" && requests.length === 0 ? (
            <div role="status" aria-label="Loading applications"><SkeletonRows rows={2} avatar="square" /></div>
          ) : applicationCount === 0 ? (
            <EmptyState icon={<Clock3 />} title="No pending applications"
              body="When you request to join a team, you can track it here. This list shows current pending requests only." />
          ) : requests.length > 0 ? <ApplicationList applications={requests} /> : null}
        </Section>
      </div>
    </Page>
  );
}

function ApplicationList({ applications }: { applications: Application[] }) {
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-raised">
      {applications.map(application => {
        const date = new Date(application.createdAt);
        const validDate = Number.isFinite(date.getTime());
        const name = application.teamName || "Team details unavailable";
        return (
          <li key={application.teamId} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-5">
            <div className="flex min-w-0 flex-1 items-start gap-3.5">
              <TeamMark name={application.teamName || "Team"} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/teams/${application.teamId}`} className="break-words text-[15px] font-semibold text-ink underline-offset-4 hover:underline">{name}</Link>
                  <Tape tone="warn" dot>Pending</Tape>
                </div>
                <p className="mt-1 text-[13px] text-ink-3">
                  {validDate ? <>Requested <time dateTime={application.createdAt}>{date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</time></> : "Request date unavailable"}
                </p>
              </div>
            </div>
            <ButtonLink href={`/teams/${application.teamId}`} size="sm" variant="secondary" className="ml-[62px] h-11 self-start sm:ml-0 sm:shrink-0 md:h-8"
              aria-label={`View team: ${name}`} iconRight={<ArrowRight />}>View team</ButtonLink>
          </li>
        );
      })}
    </ul>
  );
}

function TeamList({ title, teams, leader = false }: { title: string; teams: Team[]; leader?: boolean }) {
  return (
    <Section title={title} count={teams.length}>
      <ul className="divide-y divide-line rounded-lg border border-line bg-raised" data-stagger>
        {teams.map((t) => {
          const ev = t.ppt_evaluations.find((e) => e.status === "completed") || t.ppt_evaluations[0];
          const done = ev && ev.status === "completed";
          return (
            <li key={t.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3.5">
                <TeamMark name={t.name} size="lg" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/teams/${t.id}`} className="truncate text-[15px] font-semibold text-ink hover:underline decoration-line-strong underline-offset-4">
                      {t.name}
                    </Link>
                    <Tape tone={leader ? "solid" : "neutral"}>{leader ? "Owner" : "Member"}</Tape>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[13px] text-ink-3">{t.description || "No description yet."}</p>
                  <Link href={`/teams/${t.id}/workspace?tab=ppt`} className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-ink-3 hover:text-ink">
                    <Target className="size-3.5 text-proj" aria-hidden />
                    {done ? (
                      <>
                        Pitch deck <span className="font-mono text-ink-2">{ev.total_score}/100</span> <Tape tone="proj">{ev.grade}</Tape>
                      </>
                    ) : (
                      "Evaluate your pitch deck"
                    )}
                  </Link>
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5 pl-[62px] sm:pl-0">
                <ButtonLink href={`/teams/${t.id}`} size="sm" variant="ghost">
                  Overview
                </ButtonLink>
                <ButtonLink href={`/teams/${t.id}/workspace`} size="sm" variant="secondary" iconRight={<ArrowUpRight />}>
                  Workspace
                </ButtonLink>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
