"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Plus, Target, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";
import { ButtonLink, EmptyState, ErrorNotice, Page, PageHeader, Section, SkeletonRows, Tape, TeamMark } from "@/components/system";
import { TeamsTabs } from "@/app/teams/TeamsTabs";

type Team = {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  ppt_evaluations: { id: string; total_score: number; grade: string; status: string; version: number }[];
};

/** Same read as V1: the viewer's team_members rows with team + PPT evaluations. */
function MyTeamsContent() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadMyTeams() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setViewerId(user.id);
    const { data, error: qErr } = await supabase
      .from("team_members")
      .select(`teams ( id, name, description, owner_id, team_ppt_evaluations ( id, total_score, grade, status, version ) )`)
      .eq("user_id", user.id);
    if (qErr) {
      console.error("[my-teams] load failed:", qErr);
      setError(qErr.message);
      setLoading(false);
      return;
    }
    type Row = { teams: (Omit<Team, "ppt_evaluations"> & { team_ppt_evaluations?: Team["ppt_evaluations"] }) | null };
    setTeams(
      ((data as unknown as Row[]) || [])
        .map((r) => r.teams)
        .filter(Boolean)
        .map((t) => ({ ...(t as NonNullable<Row["teams"]>), ppt_evaluations: t?.team_ppt_evaluations || [] })),
    );
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    Promise.resolve().then(loadMyTeams);
  }, []);

  const lead = teams.filter((t) => t.owner_id === viewerId);
  const joined = teams.filter((t) => t.owner_id !== viewerId);

  return (
    <Page>
      <PageHeader
        title="Teams"
        meta={loading ? "Loading your teams…" : `You're on ${teams.length} team${teams.length === 1 ? "" : "s"} · leading ${lead.length}`}
        actions={
          <ButtonLink href="/teams/create" variant="primary" icon={<Plus />}>
            New team
          </ButtonLink>
        }
        tabs={<TeamsTabs />}
      />

      <div className="mt-7 space-y-10">
        {error && <ErrorNotice title="Couldn't load your teams" detail={error} onRetry={loadMyTeams} />}
        {loading ? (
          <SkeletonRows rows={3} avatar="square" />
        ) : teams.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title="No teams yet"
            body="Join a team that's recruiting, or start your own and invite builders."
            action={
              <>
                <ButtonLink href="/teams" size="sm" variant="secondary">
                  Find a team
                </ButtonLink>
                <ButtonLink href="/teams/create" size="sm" variant="ghost" icon={<Plus />}>
                  New team
                </ButtonLink>
              </>
            }
          />
        ) : (
          <>
            {lead.length > 0 && <TeamList title="You lead" teams={lead} leader />}
            {joined.length > 0 && <TeamList title="You're a member" teams={joined} />}
          </>
        )}
      </div>
    </Page>
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

export default function MyTeamsPage() {
  return (
    <AuthGuard>
      <MyTeamsContent />
    </AuthGuard>
  );
}
