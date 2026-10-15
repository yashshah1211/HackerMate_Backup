import Link from "next/link";
import { eventDiscoveryHref } from "@/lib/hackathons/discoveryNavigation";
import type { EventSeries, Qualifier, QualifierEvent } from "@/lib/partners/eventSeries";
import styles from "./EventSeriesPage.module.css";

function Branding({ series }: { series: EventSeries }) {
  // Text co-branding until the organizer's verified logo asset is available.
  return <header className={styles.branding}>
    <Link href="/" className={styles.wordmark}>HackerMate<span>Team up. Build together.</span></Link>
    <span className={styles.brandDivider} aria-hidden="true">×</span>
    <div className={styles.festival}>{series.festival}<span>{series.institution}</span></div>
  </header>;
}

function Eligibility({ series }: { series: EventSeries }) {
  return <section className={styles.rules} aria-labelledby="eligibility-title">
    <div><p className={styles.eyebrow}>Before you team up</p><h2 id="eligibility-title">Build within your qualifier state.</h2></div>
    <div><p className={styles.ruleLead}>{series.teamSize}</p><p>{series.collegeRule}</p>
      <p className={styles.note}>Organizer-confirmed rules. HackerMate does not verify college locations or certify eligibility. Confirm your team with the organizer before registering.</p></div>
  </section>;
}

function OfficialHub({ series }: { series: EventSeries }) {
  return <a className={styles.textLink} href={series.officialHub} target="_blank" rel="noopener noreferrer">D³ TechFest 2026 on Unstop <span aria-hidden="true">↗</span><span className={styles.srOnly}> (opens in a new tab)</span></a>;
}

export function EventSeriesHub({ series, events }: { series: EventSeries; events: QualifierEvent[] }) {
  return <main className={styles.page}><div className={styles.container}>
    <Branding series={series} />
    <section className={styles.hero}>
      <div><p className={styles.eyebrow}>National qualifier hub / 2026</p><h1>{series.name}<span>Find your starting point.</span></h1>
        <p className={styles.intro}>Choose your state qualifier. Meet builders for that event, form your team, and register on Unstop.</p></div>
      <aside className={styles.heroAside}><p>Explore the festival<br />on its official hub.</p><OfficialHub series={series} /></aside>
    </section>
    <section className={styles.directory} aria-labelledby="qualifiers-title">
      <div className={styles.sectionHeading}><h2 id="qualifiers-title">Currently listed qualifiers</h2><p>More states may be added as listings are confirmed.</p></div>
      {events.length === 0 ? <p role="status" className={styles.empty}>No qualifier details are available right now. Check the official festival hub for updates.</p> : null}
      <ul className={styles.qualifiers}>{series.qualifiers.map(qualifier => {
        const event = events.find(item => item.id === qualifier.eventId);
        return <li key={qualifier.slug}>{event ? <Link className={styles.qualifierLink} href={`/partners/${series.slug}/${qualifier.slug}`}>
          <span>{qualifier.state}</span><span className={styles.rowAction}>View qualifier <span aria-hidden="true">→</span></span>
        </Link> : <div className={styles.unavailableRow}><span>{qualifier.state}</span><span className={styles.rowAction}>Details unavailable</span></div>}</li>;
      })}</ul>
    </section>
    <Eligibility series={series} />
    <footer className={styles.footer}><p>HackerMate helps you find teammates. Official registration happens separately on Unstop.</p><OfficialHub series={series} /></footer>
  </div></main>;
}

export function EventSeriesQualifier({ series, qualifier, event }: { series: EventSeries; qualifier: Qualifier; event: QualifierEvent }) {
  const discoveryHref = eventDiscoveryHref(event.id);
  return <main className={styles.page}><div className={styles.container}>
    <Branding series={series} />
    <nav aria-label="Qualifier navigation"><Link className={styles.back} href={`/partners/${series.slug}`}>← All listed qualifiers</Link></nav>
    <section className={styles.stateHero}>
      <p className={styles.eyebrow}>{series.name} / State qualifier</p><h1>{qualifier.state}<span>Your qualifier. Your team.</span></h1>
      <p className={styles.eventName}>{event.name}</p>
      <div className={styles.actions}>
        {event.registrationUrl ? <a className={styles.primary} href={event.registrationUrl} target="_blank" rel="noopener noreferrer">Register on Unstop <span aria-hidden="true">↗</span><span className={styles.srOnly}> (opens in a new tab)</span></a> : null}
        {discoveryHref ? <Link className={styles.secondary} href={discoveryHref}>Find teammates in {qualifier.state} →</Link> : null}
      </div>
      {!event.registrationUrl ? <p className={styles.note}>A verified qualifier registration link is currently unavailable. Check the official festival hub.</p> : null}
      <p className={styles.note}>Discovery is scoped to this qualifier. Sign in and complete onboarding when prompted for protected actions. Browsing or joining the HackerMate community does not register your team on Unstop.</p>
    </section>
    <section className={styles.details} aria-label="Qualifier information">
      <div><h2>Schedule & rounds</h2><p>Confirm dates, deadlines and round details on this qualifier’s Unstop listing. No schedule is confirmed on this page.</p></div>
      <dl><div><dt>Listed qualifier format</dt><dd>{event.format || "Not available"}</dd></div><div><dt>Listed location</dt><dd>{event.listedLocation || "Not confirmed — check Unstop"}</dd></div></dl>
    </section>
    <Eligibility series={series} />
    <footer className={styles.footer}><Link className={styles.textLink} href={`/partners/${series.slug}`}>Explore the listed qualifiers →</Link><OfficialHub series={series} /></footer>
  </div></main>;
}

export function EventSeriesState({ series, kind, retryPath }: { series: EventSeries; kind: "loading" | "unavailable" | "missing"; retryPath?: string }) {
  return <main className={styles.page}><div className={styles.container}><Branding series={series} />
    <section className={styles.stateHero} aria-live="polite" aria-busy={kind === "loading"}>
      <p className={styles.eyebrow}>{series.name}</p><h1 className={styles.stateTitle}>{kind === "loading" ? "Loading qualifier details…" : kind === "missing" ? "Qualifier not found" : "Qualifier details temporarily unavailable"}</h1>
      <p className={styles.intro}>{kind === "loading" ? "Getting public event information." : kind === "missing" ? "This qualifier may not be publicly listed. Explore the available qualifiers." : "We couldn’t load public event information. Please try again."}</p>
      <div className={styles.actions}>{kind === "unavailable" && retryPath ? <a className={styles.primary} href={retryPath}>Retry</a> : null}
        {kind !== "loading" ? <Link className={styles.secondary} href={`/partners/${series.slug}`}>All listed qualifiers</Link> : null}</div>
      <OfficialHub series={series} />
    </section>
  </div></main>;
}
