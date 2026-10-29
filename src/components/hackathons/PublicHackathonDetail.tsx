"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { browsingActionHref, loadPublicEvent, type PublicEvent } from "@/lib/hackathons/publicBrowsing";
import { eventDate, eventState, listedTags, prizeLabel } from "@/lib/hackathons/discovery";
import StructuredHackathonDescription from "@/components/StructuredHackathonDescription";
import { ButtonLink, EmptyState, ErrorNotice, Page, PageHeader, PageLoader, Section } from "@/components/system";
import { isRackItUpEvent } from "@/lib/partners/rackItUp2026";
import { eventDiscoveryTab } from "@/lib/hackathons/discoveryNavigation";
import RackPublicDiscovery from "@/components/partners/RackPublicDiscovery";

function dateLabel(value: string | null | undefined) {
  const time = eventDate(value);
  return time === null ? "Not listed" : new Date(time).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });
}
function publicWebsite(value: string | null): string | null {
  try { const url = new URL(value || ""); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}

/** Guests/incomplete accounts never mount the participant component or its private data effects. */
export default function PublicHackathonDetail({ onboard = false }: { onboard?: boolean }) {
  const params = useParams();
  const search = useSearchParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [result, setResult] = useState<{ id: string; event: PublicEvent | null; failed: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(clock);
  }, []);
  useEffect(() => {
    let alive = true;
    void loadPublicEvent(supabase, id).then(event => {
      if (alive) setResult({ id, event, failed: false });
    }).catch(error => {
      console.error("Public event could not be loaded:", error);
      if (alive) setResult({ id, event: null, failed: true });
    });
    return () => { alive = false; };
  }, [id, attempt]);

  if (!result || result.id !== id) return <PageLoader label="Loading event" />;
  if (result.failed) return <Page><ErrorNotice title="Couldn't load event" detail="Event details are unavailable. Please retry." onRetry={() => { setResult(null); setAttempt(value => value + 1); }} /></Page>;
  const event = result.event;
  if (!event) return <Page><EmptyState title="Event unavailable" body="This event is not publicly listed." action={<ButtonLink href="/hackathons">Browse hackathons</ButtonLink>} /></Page>;
  const destination = `/hackathons/${encodeURIComponent(id)}${search.toString() ? `?${search}` : ""}`;
  const href = browsingActionHref(destination, onboard);
  const website = publicWebsite(event.website_url);
  const status = eventState(event, now);
  const rounds = Array.isArray(event.rounds_info) ? event.rounds_info.filter(round => round && typeof round.name === "string") : [];
  const actionLabel = onboard ? "Complete onboarding" : "Sign in to participate";
  const rack = isRackItUpEvent({ isExternal: event.type === "external", registrationUrl: event.website_url });
  const discoveryTab = eventDiscoveryTab(search.getAll("tab"));
  return <Page>
    <Link href="/hackathons" className="text-sm text-ink-3 hover:text-ink">← Hackathons</Link>
    <PageHeader title={event.name} meta={`${event.mode || "Format not listed"} · ${event.location || "Location not listed"}`} actions={<ButtonLink href={href}>{actionLabel}</ButtonLink>} />
    <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-6">
        <Section title="About this hackathon"><StructuredHackathonDescription description={event.description} />
          <div className="mt-3 flex flex-wrap gap-2">{listedTags(event.tags).map(tag => <span key={tag} className="rounded-md bg-sunken px-2 py-1 text-xs text-ink-2">{tag}</span>)}</div>
        </Section>
        {!!rounds.length && <Section title="Rounds">{rounds.map((round, index) => <div key={index} className="border-b border-line py-3">
          <h3 className="font-medium">{round.name}</h3><p className="text-sm text-ink-3">{dateLabel(round.start_date)} – {dateLabel(round.end_date)}</p>
          {typeof round.description === "string" && <StructuredHackathonDescription description={round.description} />}
        </div>)}</Section>}
        {rack && (discoveryTab === "looking_for_teams" || discoveryTab === "builders") && <RackPublicDiscovery key={event.id} eventId={event.id} signInHref={href} onboard={onboard} />}
        <Section title="Participate on HackerMate">
          <p className="mb-3 text-sm text-ink-2">{rack ? <>{onboard ? "Complete your profile" : "Sign in free"} to list your profile, save this event or build a team. Official event registration stays on Unstop. Returning here will not perform an action automatically.</> : <>{onboard ? "Complete your profile" : "Sign in"} to register, save this event, discover builders or link your team. Returning here will not register or save anything automatically.</>}</p>
          <div className="flex flex-wrap gap-2"><ButtonLink href={href}>{actionLabel}</ButtonLink><ButtonLink href={href} variant="secondary">{onboard ? "Complete profile to save" : "Sign in to save"}</ButtonLink></div>
        </Section>
      </div>
      <aside className="min-w-0 space-y-4">
        <Section title="Event details"><dl className="space-y-3 text-sm">
          <div><dt className="text-ink-3">Dates</dt><dd>{dateLabel(event.start_date)} – {dateLabel(event.end_date)}</dd></div>
          <div><dt className="text-ink-3">Status</dt><dd>{status === "unknown" ? "Dates unclear" : status === "ended" ? "Ended" : status === "ongoing" ? "Ongoing" : "Upcoming"}</dd></div>
          <div><dt className="text-ink-3">Registration deadline</dt><dd>{dateLabel(event.registration_end)}</dd></div>
          <div><dt className="text-ink-3">Prizes</dt><dd>{prizeLabel(event)}</dd></div>
          <div><dt className="text-ink-3">Team size</dt><dd>{event.min_team_size != null && event.max_team_size != null ? `${event.min_team_size}–${event.max_team_size}` : "Not listed"}</dd></div>
          {event.college && <div><dt className="text-ink-3">College</dt><dd>{event.college}</dd></div>}
        </dl></Section>
        {website && <a href={website} target="_blank" rel="noopener noreferrer" className="inline-flex text-sm font-medium text-ink underline">View event website ↗</a>}
      </aside>
    </div>
  </Page>;
}
