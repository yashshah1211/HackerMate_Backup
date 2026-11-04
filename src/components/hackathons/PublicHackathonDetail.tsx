"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { browsingActionHref, loadPublicEvent, type PublicEvent } from "@/lib/hackathons/publicBrowsing";
import { listedTags, prizeLabel } from "@/lib/hackathons/discovery";
import EventOverview from "./EventOverview";
import { registrationDestination } from "@/lib/hackathons/source";
import { dateLabel } from "@/lib/hackathons/lifecycle";
import StructuredHackathonDescription from "@/components/StructuredHackathonDescription";
import { ButtonLink, Chip, EmptyState, ErrorNotice, Page, PageLoader, Section } from "@/components/system";
import { isRackItUpEvent } from "@/lib/partners/rackItUp2026";
import { eventDiscoveryTab } from "@/lib/hackathons/discoveryNavigation";
import RackPublicDiscovery from "@/components/partners/RackPublicDiscovery";

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
  const website = publicWebsite(registrationDestination(event));
  const rounds = Array.isArray(event.rounds_info) ? event.rounds_info.filter(round => round && typeof round.name === "string") : [];
  const rack = isRackItUpEvent({ isExternal: event.type === "external", registrationUrl: event.website_url });
  const discoveryTab = eventDiscoveryTab(search.getAll("tab"));
  const rackDiscovery = rack && (discoveryTab === "looking_for_teams" || discoveryTab === "builders");
  const actionLabel = rackDiscovery
    ? onboard ? "Complete profile for teammate matching" : "Sign in for teammate matching"
    : onboard ? "Complete onboarding" : "Sign in to participate";
  const teamSize = event.min_team_size === 1 && event.max_team_size === 1
    ? "Solo"
    : event.min_team_size && event.max_team_size
      ? `${event.min_team_size}–${event.max_team_size} members`
      : event.max_team_size
        ? `Up to ${event.max_team_size} members`
        : "Not listed";

  return <Page className="pb-28 md:pb-16">
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 pt-5 text-[12.5px] text-ink-3 md:pt-6">
      <Link href="/hackathons" className="inline-flex items-center gap-1.5 hover:text-ink">
        <ArrowLeft className="size-3.5" aria-hidden /> Hackathons
      </Link>
      <span aria-hidden className="text-ink-4">/</span>
      <span className="min-w-0 truncate text-ink-2">{event.name}</span>
    </nav>

    <EventOverview
      event={event}
      now={now}
      organizer={event.college}
      teamSize={teamSize}
      prize={Number(event.prize_pool) > 0 ? prizeLabel(event) : null}
      showLocation={event.mode?.toLowerCase() !== "online" || Boolean(event.location && !event.location.toLowerCase().includes("online"))}
      actions={<>
        {website && (
          <ButtonLink href={website} target="_blank" rel="noopener noreferrer" variant="primary" icon={<ExternalLink />}>
            View official event site
          </ButtonLink>
        )}
        <ButtonLink href={href} variant={website ? "secondary" : "primary"}>
          {actionLabel}
        </ButtonLink>
      </>}
    />

    <div className="mt-8 grid min-w-0 items-start gap-7 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-7">
        {rackDiscovery && <RackPublicDiscovery key={event.id} eventId={event.id} signInHref={href} onboard={onboard} />}

        <section aria-labelledby="public-event-about" className="min-w-0 rounded-2xl border border-line bg-raised p-5 sm:p-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-accent-ink">The event</p>
          <h2 id="public-event-about" className="mt-1.5 font-display text-[22px] font-semibold tracking-tight text-ink">
            About this hackathon
          </h2>
          <div className="mt-5 min-w-0 text-ink-2">
            <StructuredHackathonDescription description={event.description} />
          </div>
          {listedTags(event.tags).length > 0 && (
            <div className="mt-6 border-t border-line pt-4">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-ink-3">Topics & tags</p>
              <div className="flex flex-wrap gap-1.5">
                {listedTags(event.tags).map(tag => <Chip key={tag}>{tag}</Chip>)}
              </div>
            </div>
          )}
        </section>

        {!!rounds.length && <Section title="Event rounds" className="rounded-2xl border border-line bg-raised p-5 sm:p-7">
          <ol className="divide-y divide-line">
            {rounds.map((round, index) => (
              <li key={index} className="py-4 first:pt-2 last:pb-0">
                <div className="flex items-start gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-selected font-mono text-xs text-ink-2">{index + 1}</span>
                  <div className="min-w-0">
                    <h3 className="break-words text-[14px] font-semibold text-ink">{round.name}</h3>
                    {(round.start_date || round.end_date) && (
                      <p className="mt-1 text-[12px] text-ink-3">{dateLabel(round.start_date)} – {dateLabel(round.end_date)}</p>
                    )}
                    {typeof round.description === "string" && (
                      <div className="mt-2 text-[13.5px] text-ink-2"><StructuredHackathonDescription description={round.description} /></div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Section>}
      </div>

      <aside className="min-w-0 space-y-5">
        <section aria-labelledby="guest-community" className="rounded-2xl border border-line-strong bg-raised p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-accent-ink">Your next step</p>
          <h2 id="guest-community" className="mt-2 font-display text-[20px] font-semibold text-ink">
            Find your team on HackerMate
          </h2>
          <p className="mt-2.5 text-[13px] leading-6 text-ink-2">
            {rack
              ? "Sign in to discover teammates, share your builder profile, or create a team. Official registration stays on Unstop."
              : "Sign in to save the event, discover builders, and link your team. Official event registration is a separate step."}
          </p>
          <ButtonLink href={href} className="mt-5 w-full">{actionLabel}</ButtonLink>
          <p className="mt-3 text-[12px] leading-5 text-ink-3">
            Signing in or joining the community does not register you for the event.
          </p>
        </section>
        <section aria-labelledby="guest-before-joining" className="rounded-2xl border border-line bg-canvas p-5">
          <h2 id="guest-before-joining" className="text-[13.5px] font-semibold text-ink">Before you register</h2>
          <p className="mt-2 text-[12.5px] leading-6 text-ink-2">
            Confirm eligibility, deadlines, and final availability on the organizer&apos;s official page.
            Source information and dates may change after the latest check.
          </p>
          {website && <a href={website} target="_blank" rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-ink hover:underline">
            Open official event page <ExternalLink className="size-3.5" aria-hidden />
          </a>}
        </section>
      </aside>
    </div>
  </Page>;
}
