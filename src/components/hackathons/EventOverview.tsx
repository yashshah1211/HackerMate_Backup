import type { ReactNode } from "react";
import { CalendarDays, ChevronDown, Clock3, MapPin, ShieldCheck, UsersRound, Trophy } from "lucide-react";
import { Tape } from "@/components/system";
import { dateLabel, eventState, eventStateLabel, registrationLabel, registrationState, scheduleIsUnverified, type RegistrationDates } from "@/lib/hackathons/lifecycle";
import { sourceFresh, sourceMetadata } from "@/lib/hackathons/source";
import SourceInformation from "./SourceInformation";

type OverviewEvent = RegistrationDates & {
  name: string;
  mode?: string | null;
  location?: string | null;
  college?: string | null;
};

type Props = {
  event: OverviewEvent;
  now: number;
  actions: ReactNode;
  teamSize: string;
  organizer?: string | null;
  prize?: string | null;
  showLocation?: boolean;
  participationLabel?: string | null;
};

/** Shared participant and guest overview: decisions first, source provenance on demand. */
export default function EventOverview({
  event, now, actions, teamSize, organizer, prize, showLocation = true, participationLabel,
}: Props) {
  const phase = eventState(event, now);
  const registration = registrationState(event, now);
  const isNative = event.type === "native";
  const source = !isNative ? sourceMetadata(event.source_metadata, event.website_url) : null;
  const sourceVerified = Boolean(source && sourceFresh(source, now) && source.category === "hackathon");
  const datesUnverified = scheduleIsUnverified(event, now);
  const start = event.start_date ? dateLabel(event.start_date) : null;
  const end = event.end_date ? dateLabel(event.end_date) : null;
  const dates = start && end ? start === end ? start : `${start} – ${end}` : start || end || "Dates to be announced";
  const registrationTone = registration === "open" ? "text-ok" : registration === "closed" ? "text-ink-3" : "text-warn";

  return (
    <section aria-label="Hackathon overview" className="relative isolate mt-5 overflow-hidden rounded-2xl border border-line-strong bg-raised md:mt-6">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-40 size-[360px] rounded-full bg-accent-soft blur-[90px]" />
      <div aria-hidden className="pointer-events-none absolute right-0 top-0 h-1 w-full bg-gradient-to-r from-accent/70 via-hack/30 to-transparent" />
      <div className="relative grid min-w-0 gap-7 px-5 py-6 sm:px-7 sm:py-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-7">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Tape tone={phase === "ongoing" ? "ok" : phase === "upcoming" ? "accent" : "neutral"} dot={phase === "ongoing"}>
              {eventStateLabel(event, now)}
            </Tape>
            <Tape tone="hack">Hackathon</Tape>
            <Tape>{isNative ? "Hosted on HackerMate" : "External event"}</Tape>
            {participationLabel && <Tape tone="ok">{participationLabel}</Tape>}
          </div>

          <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-ink">Event overview</p>
          <h1 data-v2-heading className="mt-2 max-w-[21ch] break-words font-display text-[clamp(2rem,4vw,3.15rem)] font-semibold leading-[1.08] tracking-[-0.035em] text-ink [overflow-wrap:anywhere]">
            {event.name}
          </h1>
          {organizer && (
            <p className="mt-3 flex items-start gap-2 text-[13.5px] leading-6 text-ink-2">
              <span className="mt-0.5 text-ink-4">By</span><span className="min-w-0 break-words">{organizer}</span>
            </p>
          )}

          <dl className="mt-7 grid gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 items-start gap-3 rounded-xl border border-line bg-canvas/55 px-3.5 py-3.5">
              <CalendarDays className="mt-0.5 size-4 shrink-0 text-accent-ink" aria-hidden />
              <div className="min-w-0">
                <dt className="text-[11px] font-medium uppercase tracking-wider text-ink-3">{datesUnverified ? "Listed dates · unverified" : "Event dates"}</dt>
                <dd className="mt-1 break-words text-[13.5px] font-medium leading-5 text-ink">{dates}</dd>
              </div>
            </div>
            <div className="flex min-w-0 items-start gap-3 rounded-xl border border-line bg-canvas/55 px-3.5 py-3.5">
              <MapPin className="mt-0.5 size-4 shrink-0 text-hack" aria-hidden />
              <div className="min-w-0">
                <dt className="text-[11px] font-medium uppercase tracking-wider text-ink-3">Format & location</dt>
                <dd className="mt-1 break-words text-[13.5px] font-medium leading-5 text-ink">
                  <span className="capitalize">{event.mode || "Format not listed"}</span>
                  {showLocation && event.location && <span className="font-normal text-ink-2"> · {event.location}</span>}
                  {showLocation && !event.location && event.mode?.toLowerCase() !== "online" && <span className="font-normal text-ink-3"> · Location TBA</span>}
                </dd>
              </div>
            </div>
            <div className="flex min-w-0 items-start gap-3 rounded-xl border border-line bg-canvas/55 px-3.5 py-3.5">
              <UsersRound className="mt-0.5 size-4 shrink-0 text-hack" aria-hidden />
              <div className="min-w-0">
                <dt className="text-[11px] font-medium uppercase tracking-wider text-ink-3">{datesUnverified ? "Listed team size" : "Team size"}</dt>
                <dd className="mt-1 text-[13.5px] font-medium text-ink">{teamSize}</dd>
              </div>
            </div>
            <div className="flex min-w-0 items-start gap-3 rounded-xl border border-line bg-canvas/55 px-3.5 py-3.5">
              <Trophy className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
              <div className="min-w-0">
                <dt className="text-[11px] font-medium uppercase tracking-wider text-ink-3">Prize pool</dt>
                <dd className="mt-1 break-words text-[13.5px] font-medium text-ink">{prize || "Not announced"}</dd>
              </div>
            </div>
          </dl>

          <div className="mt-6 flex flex-wrap items-center gap-2.5">{actions}</div>
        </div>

        <div className="flex min-w-0 flex-col justify-start">
          <div className="rounded-xl border border-line-strong bg-canvas/85 p-5 sm:p-6">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.13em] text-ink-3">
              <span className={`size-2 rounded-full ${registration === "open" ? "bg-ok" : registration === "unknown" ? "bg-warn" : "bg-ink-4"}`} aria-hidden />
              Registration status
            </div>
            <p className={`mt-4 font-display text-[24px] font-semibold leading-[1.16] tracking-tight ${registrationTone}`}>
              {registrationLabel(event, now)}
            </p>
            <div className="mt-5 grid gap-4 border-t border-line pt-4">
              <div className="flex items-start gap-2.5">
                <Clock3 className="mt-0.5 size-4 shrink-0 text-accent-ink" aria-hidden />
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-ink-3">Registration deadline</p>
                  <p className="mt-1 text-[13.5px] font-semibold text-ink">{dateLabel(event.registration_end)}</p>
                </div>
              </div>
              {event.registration_start && (
                <div className="pl-[26px]">
                  <p className="text-[11px] uppercase tracking-wider text-ink-3">Opens</p>
                  <p className="mt-1 text-[13px] text-ink-2">{dateLabel(event.registration_start)}</p>
                </div>
              )}
            </div>
            <p className="mt-5 border-t border-line pt-4 text-[12px] leading-[1.65] text-ink-3">
              {isNative
                ? "Event registration and community participation are handled on HackerMate. Availability is subject to confirmation."
                : "Register through the official organizer site. Joining this HackerMate community does not register you for the event."}
            </p>
          </div>
        </div>
      </div>

      {!isNative && (
        <details className="group relative border-t border-line bg-canvas/45">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 text-[12.5px] text-ink-2 transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent sm:px-7 [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-2">
              <ShieldCheck className={`size-4 shrink-0 ${sourceVerified ? "text-ok" : "text-ink-3"}`} aria-hidden />
              <span className="break-words">
                {sourceVerified ? `Source checked · ${source?.provider}` : "Source verification details"}
              </span>
              {!sourceVerified && <span className="text-ink-3">— not currently verified</span>}
            </span>
            <ChevronDown className="size-4 shrink-0 text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="border-t border-line px-5 pb-5 pt-3 text-ink-3 sm:px-7">
            <SourceInformation event={event} now={now} />
          </div>
        </details>
      )}
    </section>
  );
}
