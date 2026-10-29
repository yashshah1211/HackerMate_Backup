"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { loadEventDiscovery, type DiscoveryPage } from "@/lib/hackathons/eventParticipation";
import { Button, ButtonLink, EmptyState, ErrorNotice, PageLoader, Section } from "@/components/system";

/** Read-only opt-in projection; never mounts participant controls or raw profile queries. */
export default function RackPublicDiscovery({ eventId, signInHref, onboard }: {
  eventId: string; signInHref: string; onboard: boolean;
}) {
  const [offset, setOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ eventId: string; offset: number; attempt: number; page: DiscoveryPage | null } | null>(null);
  useEffect(() => {
    let alive = true;
    void loadEventDiscovery(supabase, eventId, offset).then(page => {
      if (alive) setResult({ eventId, offset, attempt, page });
    }).catch(error => {
      console.error("Rack public discovery failed:", error);
      if (alive) setResult({ eventId, offset, attempt, page: null });
    });
    return () => { alive = false; };
  }, [eventId, offset, attempt]);
  const current = result?.eventId === eventId && result.offset === offset && result.attempt === attempt ? result : null;
  return <Section id="rack-teammates" title="Find teammates for Rack It Up">
    <p className="mb-4 text-sm text-ink-2">Browse builders who chose to make their profiles visible for this event. {onboard ? "Complete your profile" : "Sign up free"} to list your profile or build a team. Unstop registration is separate.</p>
    {!current ? <PageLoader label="Loading public builder listings" /> : !current.page
      ? <ErrorNotice title="Couldn't load public builder listings" detail="Please retry. Listing availability could not be verified." onRetry={() => setAttempt(value => value + 1)} />
      : current.page.items.length === 0
        ? <EmptyState title="No public builder listings yet" body="Only opted-in, publicly visible profiles appear here. You can sign in and choose to list yours." />
        : <ul className="mb-4 divide-y divide-line rounded-lg border border-line bg-raised">
          {current.page.items.map(builder => <li key={builder.id} className="min-w-0 p-4">
            <p className="break-words text-sm font-semibold text-ink">{builder.full_name}</p>
            {builder.college && <p className="mt-1 break-words text-xs text-ink-3">{builder.college}</p>}
            <ul aria-label={`${builder.full_name}'s skills`} className="mt-2 flex flex-wrap gap-2">
              {builder.skills.slice(0, 5).map(skill => <li key={skill} className="break-all rounded-md bg-sunken px-2 py-1 text-xs text-ink-2">{skill}</li>)}
            </ul>
          </li>)}
        </ul>}
    {current?.page && (offset > 0 || current.page.total > offset + current.page.limit) && <div className="mb-4 flex flex-wrap gap-2" aria-label="Public builder pages">
      <Button variant="secondary" size="sm" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 50))}>Previous builders</Button>
      <Button variant="secondary" size="sm" disabled={current.page.total <= offset + current.page.limit || offset >= 1_000_000} onClick={() => setOffset(value => value + 50)}>More builders</Button>
    </div>}
    <ButtonLink href={signInHref}>{onboard ? "Complete onboarding to list your profile" : "Sign in to list your profile"}</ButtonLink>
    <p className="mt-2 text-xs text-ink-3">Returning here won’t list your profile or create a team automatically.</p>
  </Section>;
}
