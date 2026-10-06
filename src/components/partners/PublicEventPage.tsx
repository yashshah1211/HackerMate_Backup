import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { PublicEvent, PublicPartnerConfig } from "@/lib/partners/config";
import Logo from "@/components/Logo";
import PartnerImage from "./PartnerImage";
import styles from "./PublicEventPage.module.css";

function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
    {children}<span aria-hidden="true"> ↗</span><span className={styles.srOnly}> (opens in a new tab)</span>
  </a>;
}

function dateLabel(day: string, format: "full" | "month" | "day" = "full") {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: format === "day" ? undefined : "short",
    year: format === "full" ? "numeric" : undefined, timeZone: "UTC" })
    .format(new Date(`${day}T00:00:00Z`));
}

export function PartnerPageState({ unavailable = false }: { unavailable?: boolean }) {
  return <main className={styles.page}><div className={styles.container}>
    <h1 className={styles.stateTitle}>{unavailable ? "Event information is temporarily unavailable" : "Partner event not found"}</h1>
    <p className={styles.intro}>{unavailable ? "Please try again in a moment." : "Explore the events and communities on HackerMate."}</p>
    <Link href="/partners" className={styles.secondary}>Explore partners</Link>
  </div></main>;
}

export default function PublicEventPage({ config, event }: { config: PublicPartnerConfig; event: PublicEvent | null }) {
  const title = event?.name || config.name;
  const introduction = config.tagline || event?.description;
  const communityUrl = event ? `/hackathons/${event.id}` : null;
  const facts: { label: string; value: ReactNode; mono?: boolean }[] = [];
  const startFormat = event?.startDate && event.endDate && event.startDate !== event.endDate
    ? event.startDate.slice(0, 7) === event.endDate.slice(0, 7) ? "day"
      : event.startDate.slice(0, 4) === event.endDate.slice(0, 4) ? "month" : "full" : "full";
  if (event?.startDate) facts.push({ label: "Dates", mono: true, value: <>
    <time dateTime={event.startDate} aria-label={dateLabel(event.startDate)}>{dateLabel(event.startDate, startFormat)}</time>
    {event.endDate && event.endDate !== event.startDate && <> – <time dateTime={event.endDate}>{dateLabel(event.endDate)}</time></>}
  </> });
  else if (event?.endDate) facts.push({ label: "Ends", mono: true, value: <time dateTime={event.endDate}>{dateLabel(event.endDate)}</time> });
  if (event?.mode) facts.push({ label: "Format", value: event.mode });
  if (event?.location) facts.push({ label: "Venue", value: event.location });
  if (event && (event.minTeamSize !== null || event.maxTeamSize !== null)) {
    const min = event.minTeamSize;
    const max = event.maxTeamSize;
    facts.push({ label: "Team size", value: min && max ? min === max ? `${min} ${min === 1 ? "person" : "people"}` : `${min}–${max} people`
      : min ? `At least ${min} ${min === 1 ? "person" : "people"}` : `Up to ${max} ${max === 1 ? "person" : "people"}` });
  }
  const officialRegistration = event?.isExternal && event.registrationUrl;
  const links = [
    ...(config.officialWebsite ? [{ label: "Organizer website", url: config.officialWebsite }] : []),
    ...config.approvedLinks,
    ...(config.publicContact ? [config.publicContact] : []),
  ];
  return <main className={styles.page} style={config.identityColor ? { "--partner-identity": config.identityColor } as CSSProperties : undefined}>
    <div className={styles.container}>
      <div className={styles.coBrand}>
        <Link href="/" className={styles.wordmark} aria-label="HackerMate home"><Logo className={styles.brandLogo} decorative /></Link><span aria-hidden="true">×</span>
        <span className={styles.partnerName}>{config.name}</span>
      </div>
      <section className={styles.hero} aria-labelledby="event-title">
        <div className={styles.identity}>
          {config.logoUrl ? <PartnerImage key={config.logoUrl} src={config.logoUrl} alt={`${config.name} logo`} className={styles.logo} fallback={config.name.slice(0, 1)} />
            : <span className={styles.logo} aria-hidden="true">{config.name.slice(0, 1)}</span>}
          <p className={styles.identityLabel}>An event with {config.name}</p>
        </div>
        <h1 id="event-title" className={styles.title}>{title}</h1>
        {introduction && <p className={styles.intro}>{introduction}</p>}
        {(!event || facts.length === 0) && <p className={styles.pending}>Event information is being finalized.</p>}
        {(officialRegistration || communityUrl) && <div className={styles.actions}>
          {officialRegistration && <ExternalLink href={officialRegistration} className={styles.primary}>Official registration</ExternalLink>}
          {communityUrl && <Link href={communityUrl} className={officialRegistration ? styles.secondary : styles.primary}>Find teammates</Link>}
        </div>}
        {event?.isExternal && <p className={styles.actionNote}>{officialRegistration
          ? "Official registration opens the organizer’s site. Joining the HackerMate community is a separate step."
          : "The official registration link will be shared when available. HackerMate community participation is separate."}</p>}
      </section>
      {facts.length > 0 && <section className={styles.details} aria-labelledby="details-title">
        <h2 id="details-title" className={styles.sectionLabel}>Event details</h2>
        <dl className={styles.facts}>{facts.map(fact => <div key={fact.label} className={styles.fact}>
          <dt>{fact.label}</dt><dd className={fact.mono ? styles.date : undefined}>{fact.value}</dd>
        </div>)}</dl>
      </section>}
      {config.bannerUrl && <PartnerImage key={config.bannerUrl} src={config.bannerUrl} alt="" className={styles.banner} />}
      <section className={styles.community} aria-labelledby="community-title">
        <h2 id="community-title">Build with the<br className={styles.desktopBreak} /> right people.</h2>
        <div>
          <p>HackerMate helps you find teammates and form a team for this event.</p>
          <p>{event?.isExternal ? "The organizer handles official event registration separately." : event
            ? "Explore the event community for participation details and teammate discovery."
            : "Community access and further event details will be shared when available."}</p>
          {communityUrl && <Link href={communityUrl} className={styles.textLink}>Explore the event community <span aria-hidden="true">→</span></Link>}
        </div>
      </section>
      {links.length > 0 && <section className={styles.links} aria-labelledby="links-title">
        <h2 id="links-title" className={styles.sectionLabel}>From the organizer</h2>
        <ul>{links.map((link, index) => <li key={`${link.url}-${index}`}>
          <ExternalLink href={link.url} className={styles.resourceLink}>{link.label}</ExternalLink>
        </li>)}</ul>
      </section>}
    </div>
  </main>;
}
