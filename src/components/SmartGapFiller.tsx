"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, RefreshCw, UserPlus, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { loadSquadRecommendations, sendSquadInvite, squadFitLabel, squadStatusCopy } from "@/lib/squadMatching";
import type { SquadRecommendations } from "@/lib/squadMatching";
import { Avatar, Button, ButtonLink, Chip, EmptyState, ErrorNotice, Panel, SeatMeter, Skeleton, Tape } from "@/components/system";

interface SmartGapFillerProps {
  teamId: string;
  teamName: string;
  // Revision keys trigger fresh server reads when workspace context changes.
  requiredSkills?: string[] | null;
  rolesNeeded?: string[] | null;
  members: Array<{ id: string; user_id?: string; role: string; profiles?: { id: string; skills?: string[] | null } }>;
  maxMembers: number | null;
  isRecruiting?: boolean | null;
  isOwnerOrMember: boolean;
  onInviteSent?: () => void;
}

export default function SmartGapFiller({ teamId, teamName, requiredSkills, rolesNeeded, members, maxMembers, isRecruiting, isOwnerOrMember, onInviteSent }: SmartGapFillerProps) {
  const [result, setResult] = useState<SquadRecommendations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const request = useRef(0);
  const inviting = useRef(false);
  const currentTeam = useRef<string | null>(teamId);
  const revision = JSON.stringify({ requiredSkills, rolesNeeded, members, maxMembers, isRecruiting });

  const load = useCallback(async () => {
    const version = ++request.current;
    setLoading(true); setError(null); setResult(null);
    if (!isOwnerOrMember) { setLoading(false); return; }
    try {
      const next = await loadSquadRecommendations(supabase, teamId);
      if (version === request.current) setResult(next);
    } catch (cause) {
      if (version === request.current) setError(cause instanceof Error ? cause.message : "Could not load squad suggestions.");
    } finally {
      if (version === request.current) setLoading(false);
    }
  }, [teamId, isOwnerOrMember]);

  const invalidateRequests = useCallback(() => { request.current++; }, []);
  useEffect(() => {
    currentTeam.current = teamId;
    let active = true;
    // Begin the external read asynchronously; cleanup prevents updates after switching/unmounting.
    void Promise.resolve().then(() => {
      if (!active) return;
      setSentIds(new Set()); setInviteNotice(null);
      void load();
    });
    return () => { active = false; currentTeam.current = null; invalidateRequests(); };
  }, [load, revision, teamId, invalidateRequests]);

  async function invite(candidateId: string) {
    if (!result?.context.canInvite || inviting.current || sentIds.has(candidateId)) return;
    const targetTeam = teamId;
    inviting.current = true; setInvitingId(candidateId); setError(null); setInviteNotice(null);
    try {
      await sendSquadInvite(supabase, targetTeam, candidateId);
      if (currentTeam.current !== targetTeam) return;
      setSentIds(ids => new Set([...ids, candidateId]));
      setInviteNotice("Invite sent. The builder can respond from their invitations.");
      onInviteSent?.();
    } catch (cause) {
      if (currentTeam.current === targetTeam) {
        // Remove stale actionable cards after a rejected invitation.
        setResult(null);
        setError(cause instanceof Error ? cause.message : "Could not send the invite. Refresh suggestions.");
      }
    } finally {
      inviting.current = false; setInvitingId(null);
    }
  }

  if (!isOwnerOrMember) return <EmptyState icon={<Users />} title="Squad suggestions are for team members" body="Join the team to view its open roles and teammate suggestions." />;
  const context = result?.context;
  const status = context && context.status !== "ready" ? squadStatusCopy[context.status] : null;
  const candidates = result?.candidates || [];
  return (
    <div className="space-y-5 text-left">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-[13px] leading-relaxed text-ink-3">Find builders for the open roles and skill gaps in {teamName}. Suggestions use recorded profiles; confirm skills and availability together.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" icon={<RefreshCw />} onClick={() => void load()} disabled={loading || invitingId !== null} className="min-h-9">Refresh</Button>
          <ButtonLink href="/developers" variant="secondary" size="sm" iconRight={<ArrowRight />} className="min-h-9">Browse builders</ButtonLink>
        </div>
      </div>
      {error && <ErrorNotice title="Suggestions unavailable" detail={error} />}
      {inviteNotice && <p role="status" className="flex items-center gap-2 text-[13px] text-ok"><CheckCircle2 className="size-4" />{inviteNotice}</p>}
      {loading ? (
        <ul className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Loading squad suggestions">{[1, 2].map(i => <li key={i} className="rounded-lg border border-line bg-raised p-4"><Skeleton className="h-4 w-1/2" /><Skeleton className="mt-3 h-3 w-3/4" /><Skeleton className="mt-2 h-3 w-2/3" /></li>)}</ul>
      ) : context && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
          <Panel as="aside" className="h-fit min-w-0 p-4 lg:order-2" aria-label="Squad needs">
            <h3 className="text-[14px] font-semibold text-ink">Your squad needs</h3>
            <div className="mt-3 flex items-center justify-between gap-3 text-[13px] text-ink-2">
              <span>{context.capacity ? `${context.memberCount}/${context.capacity} members` : "Capacity not set"}</span>
              {context.capacity && <SeatMeter filled={context.memberCount} total={context.capacity} showLabel={false} />}
            </div>
            {context.capacity && <p className="mt-2 text-[12px] text-ink-3">{Math.max(0, context.capacity - context.memberCount)} open seats</p>}
            {context.eventCapacity && <p className="mt-2 text-[12px] text-ink-3">Recorded event maximum: {context.eventCapacity}</p>}
            <p className="mt-4 text-[12px] text-ink-3">Open roles</p>
            <div className="mt-1.5 flex flex-wrap gap-1">{context.rolesNeeded.length ? context.rolesNeeded.map(role => <Chip key={role}>{role}</Chip>) : <span className="text-[13px] text-ink-2">No roles specified</span>}</div>
            <p className="mt-4 text-[12px] text-ink-3">Requested skills missing from recorded member profiles</p>
            <div className="mt-1.5 flex flex-wrap gap-1">{context.gapSkills.length ? context.gapSkills.map(skill => <Chip key={skill} active>{skill}</Chip>) : <span className="text-[13px] text-ink-2">No recorded gap in the requested skills</span>}</div>
            <p className="mt-4 border-t border-line pt-3 text-[12px] leading-relaxed text-ink-3">Skills are self-reported. Missing information means the fit is unknown.</p>
            {context.status === "ready" && !context.canInvite && <p className="mt-2 text-[12px] text-ink-3">Only the team owner can send invitations.</p>}
          </Panel>
          <div className="min-w-0 lg:order-1">
            {status ? <EmptyState icon={<Users />} title={status.title} body={status.body} /> : candidates.length === 0 ? <EmptyState icon={<Users />} title="No eligible suggestions right now" body="Update open roles or requested skills in team settings, review pending invitations and join requests, or browse builders." /> : (
              <ul className="grid gap-3 sm:grid-cols-2">{candidates.map(candidate => {
                const sent = sentIds.has(candidate.id);
                return <li key={candidate.id} className="flex min-w-0 flex-col rounded-lg border border-line bg-raised p-4">
                  <div className="flex items-start gap-3">
                    <Avatar name={candidate.fullName || "Builder"} src={candidate.avatarUrl} size="md" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/profile/${candidate.id}`} className="block break-words text-[14px] font-semibold text-ink hover:underline focus-visible:outline-2 focus-visible:outline-accent">{candidate.fullName || "Builder"}</Link>
                      <p className="mt-0.5 text-[12px] text-ink-3">{candidate.isAvailable === true ? "Open to a team" : "Availability not specified"}</p>
                    </div>
                  </div>
                  <div className="mt-3"><Tape tone={candidate.fitKind === "explore" || candidate.limitedEvidence ? "neutral" : "accent"}>{squadFitLabel(candidate)}</Tape></div>
                  <ul className="mt-3 space-y-1.5 text-[12.5px] leading-relaxed text-ink-2">{candidate.reasons.slice(0, 4).map(reason => <li key={reason}>{reason}</li>)}</ul>
                  {candidate.limitedEvidence && <p className="mt-2 text-[12px] text-ink-3">Limited skill evidence. Ask what they want to contribute.</p>}
                  <div className="mt-3 flex flex-wrap gap-1" aria-label="Self-reported skills">{candidate.skills.slice(0, 6).map((skill, index) => <Chip key={`${skill}-${index}`}>{skill}</Chip>)}</div>
                  {context.canInvite && <div className="mt-auto pt-4"><Button variant="secondary" size="sm" icon={sent ? <CheckCircle2 /> : <UserPlus />} loading={invitingId === candidate.id} disabled={sent || invitingId !== null} onClick={() => void invite(candidate.id)} className="min-h-9 w-full" aria-label={`${sent ? "Invited" : "Invite"} ${candidate.fullName || "builder"}`}>{sent ? "Invited" : "Invite to squad"}</Button></div>}
                </li>;
              })}</ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
