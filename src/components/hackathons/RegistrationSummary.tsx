import { eventState, dateLabel, registrationLabel, registrationState, type RegistrationDates } from "@/lib/hackathons/lifecycle";

export default function RegistrationSummary({ event, now }: { event: RegistrationDates; now: number }) {
  const state = registrationState(event, now);
  return <div className="rounded-lg border border-line bg-raised p-4" data-registration-state={state}>
    <p className={`text-sm font-semibold ${state === "open" ? "text-ok" : state === "closed" ? "text-warn" : "text-ink"}`}>{eventState(event, now) === "ended" ? "Event ended · new registration unavailable" : registrationLabel(event, now)}</p>
    {event.registration_start && <p className="mt-2 text-sm text-ink-2">Opens: {dateLabel(event.registration_start)}</p>}
    <p className="mt-1 text-sm text-ink-2">Registration deadline: {dateLabel(event.registration_end)}</p>
    {state === "unknown" && <p className="mt-2 text-sm leading-relaxed text-ink-3">Availability could not be verified. Review the organizer’s requirements before submitting; registration is not guaranteed.</p>}
    <p className="mt-2 text-xs text-ink-3">Event dates: {dateLabel(event.start_date)} – {dateLabel(event.end_date)}</p>
  </div>;
}
