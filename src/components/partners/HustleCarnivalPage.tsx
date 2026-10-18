import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUpRight, Globe2, MapPin, Monitor, Users, Zap } from "lucide-react";
import Logo from "@/components/Logo";
import { eventDiscoveryHref } from "@/lib/hackathons/discoveryNavigation";
import { HUSTLE_CARNIVAL as event, hustlePublicParticipationEnabled, type HustleCommunityState } from "@/lib/partners/hustleCarnival";
import PartnerImage from "./PartnerImage";
import styles from "./HustleCarnivalPage.module.css";

function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
    {children}<ArrowUpRight size={17} aria-hidden="true" /><span className={styles.srOnly}> (opens in a new tab)</span>
  </a>;
}

export default function HustleCarnivalPage({ community }: { community: HustleCommunityState }) {
  // Metadata correctness alone must never enable event participation in this information-only release.
  const discovery = hustlePublicParticipationEnabled() && community === "ready" ? eventDiscoveryHref(event.eventId) : null;
  return <main className={styles.page}>
    <a href="#hustle-content" className={styles.skip}>Skip to event details</a>
    <div className={styles.container}>
      <div className={styles.brandBar}>
        <div className={styles.coBrand}>
          <Link href="/" aria-label="HackerMate home" className={styles.home}><Logo decorative className={styles.logo} /></Link>
          <span className={styles.cross} aria-hidden="true">×</span>
          <span className={styles.ellusion}>ELLUSION<span>CLUB · GL BAJAJ MATHURA</span></span>
        </div>
        <nav className={styles.eventNav} aria-label="Carnival navigation">
          <a href="#schedule" className={styles.navLink}>The journey <ArrowDown size={15} aria-hidden="true" /></a>
          <Link href="/partners/hustle-carnival/workshops" prefetch={false} className={styles.navLink}>Public workshops <ArrowUpRight size={15} aria-hidden="true" /></Link>
        </nav>
      </div>

      <section id="hustle-content" className={styles.hero} aria-labelledby="hustle-title" tabIndex={-1}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span aria-hidden="true" /> OPEN INNOVATION BUILDATHON · 2026</p>
          <h1 id="hustle-title">Hustle<br /><span>Carnival.</span><span className={styles.srOnly}> 2026</span></h1>
          <p className={styles.tagline}>Hustle Beyond <ArrowUpRight size={24} aria-hidden="true" /></p>
          <p className={styles.intro}>Your idea. Your domain. Your next big build.<br />Take it from an online pitch to a live prototype in Mathura.</p>
          <p className={styles.organizer}>Organized by <strong>Club Ellusion</strong><br />G.L. Bajaj Group of Institutions, Mathura</p>
          <div className={styles.actions}>
            <ExternalLink href={event.registrationUrl} className={styles.primary}>Register on Unstop</ExternalLink>
            <a href="#community" className={styles.secondary}>Team matching status <Users size={17} aria-hidden="true" /></a>
          </div>
          <p className={styles.note}>Both rounds are free. Registration closes <time dateTime="2026-10-20">20 October 2026</time>.<br />Official registration is separate from HackerMate community participation.</p>
        </div>
        <figure className={styles.heroArtwork}>
          <div className={styles.artworkLabel}><span>THE NEXT BUILD STARTS HERE</span><span aria-hidden="true">✳</span></div>
          <PartnerImage src={`${event.assetRoot}/hustle-carnival-gold-brand-poster.jpeg`} alt="Ellusion’s gold Hustle Carnival buildathon artwork with the motto Hustle Beyond" className={styles.goldPoster} />
          <figcaption><span>ON-CAMPUS FINALE</span><strong>24 OCT <span>2026</span></strong><span>GL BAJAJ · MATHURA</span></figcaption>
        </figure>
      </section>

      <section className={styles.factStrip} aria-label="Event at a glance">
        <div><Globe2 aria-hidden="true" size={20} /><p><span>THE FORMAT</span><strong>Hybrid buildathon</strong></p></div>
        <div><Users aria-hidden="true" size={20} /><p><span>YOUR TEAM</span><strong>1–2 members</strong></p></div>
        <div><Zap aria-hidden="true" size={20} /><p><span>THE CHALLENGE</span><strong>Open innovation</strong></p></div>
        <div><MapPin aria-hidden="true" size={20} /><p><span>THE FINALE</span><strong>Mathura, India</strong></p></div>
      </section>

      <section id="schedule" className={styles.schedule} aria-labelledby="schedule-title">
        <div className={styles.sectionHeading}><p className={styles.eyebrow}>01 / THE JOURNEY</p><h2 id="schedule-title">Two phases.<br /><span>One idea worth building.</span></h2><p>Start online. Earn your place at the finale.<br />All times below are India Standard Time (IST, UTC+05:30).</p></div>
        <div className={styles.deadline}><span>FIRST, MAKE IT OFFICIAL</span><p><strong>Register by <time dateTime="2026-10-20">20 October 2026</time></strong><span>Check the exact cutoff on Unstop before registering.</span></p><ExternalLink href={event.registrationUrl} className={styles.textLink}>Official listing</ExternalLink></div>
        <div className={styles.phases}>
          <article className={styles.phase}>
            <div className={styles.phaseTop}><span>PHASE 01</span><span><Monitor size={15} aria-hidden="true" /> ONLINE</span></div>
            <h3>Pitch your possibility.</h3><p>Choose a real-world problem. Present your solution, approach and impact in a PPT and project video.</p>
            <dl><div><dt>PPT + video submission</dt><dd><time dateTime="2026-10-22T14:00:00+05:30">22 Oct · 2:00 PM IST</time></dd></div><div><dt>Results announced</dt><dd><time dateTime="2026-10-23T10:00:00+05:30">23 Oct · 10:00 AM IST</time></dd></div></dl>
            <p className={styles.phaseNote}>Follow the organizer’s official channels for submission instructions and shortlisting results.</p>
          </article>
          <article className={`${styles.phase} ${styles.finale}`}>
            <div className={styles.phaseTop}><span>PHASE 02</span><span><MapPin size={15} aria-hidden="true" /> ON CAMPUS</span></div>
            <h3>Build beyond the pitch.</h3><p>Shortlisted teams head to Mathura for a six-hour buildathon, prototype development and live project demonstrations.</p>
            <dl><div><dt>On-campus finale</dt><dd><time dateTime="2026-10-24T09:20:00+05:30">24 Oct · 9:20 AM</time>–<time dateTime="2026-10-24T16:30:00+05:30">4:30 PM IST</time></dd></div><div><dt>Venue</dt><dd>Block A &amp; B, G.L. Bajaj Group of Institutions, Mathura</dd></div></dl>
            <p className={styles.phaseNote}>Free and invitation-only for shortlisted teams. Private invitations follow verification of the official shortlist. Confirm attendance by <time dateTime="2026-10-23T23:00:00+05:30">23 Oct, 11:00 PM IST</time>, following the organizer’s instructions.</p>
          </article>
        </div>
      </section>

      <section id="community" className={styles.community} aria-labelledby="community-title">
        <div><p className={styles.eyebrow}>02 / BUILD TOGETHER</p><h2 id="community-title">Big ideas.<br /><span>The right teammate.</span></h2><p>HackerMate team matching for this event is not yet enabled. Official registration is open separately on Unstop, and the event allows solo participants or teams of two.</p></div>
        <div className={styles.communityAction}>
          <span className={styles.communityLabel}><Users size={20} aria-hidden="true" /> HACKERMATE COMMUNITY</span>
          {discovery ? <><Link href={discovery} prefetch={false} className={styles.primary}>Find Hustle Carnival teammates <ArrowUpRight size={17} aria-hidden="true" /></Link><p>Browse the event’s community. Sign in through HackerMate when prompted to connect or participate.</p></>
            : <><p className={styles.communityStatus}>{community === "ready" ? "HackerMate team matching is not enabled for this event yet." : community === "metadata-pending" ? "Teammate discovery is awaiting an event details update." : "Teammate discovery is temporarily unavailable."}</p><p>Official registration on Unstop is available separately. Please return here for community access.</p></>}
          <p className={styles.note}>HackerMate community participation does not register you for the event or secure a finale place.</p>
        </div>
      </section>

      <section className={styles.practical} aria-labelledby="practical-title">
        <div className={styles.faq}>
          <p className={styles.eyebrow}>03 / BEFORE YOU BUILD</p><h2 id="practical-title">Know before you go.</h2>
          <details><summary>Who can take part?</summary><p>The official listing’s summary says “All”, while its detailed rules include B.Tech undergraduates (CSE, IT, ECE and AI/ML) as well as MBA students. Eligibility beyond these courses and across colleges needs organizer confirmation. Confirm your eligibility with Club Ellusion before registering.</p></details>
          <details><summary>Is there a fixed problem statement?</summary><p>No. Hustle Carnival is an open-innovation buildathon. Bring your own problem and solution, and follow the organizer’s originality and submission rules.</p></details>
          <details><summary>How do I submit or confirm my finale place?</summary><p>Both rounds are free. Register for Round 1 through Unstop. Follow the official listing and organizer channels for PPT/video uploads and results. Round 2 attendance confirmation is invitation-only after the official shortlist is verified.</p></details>
          <details><summary>Do I need to attend both phases?</summary><p>Phase 1 is online. Only teams shortlisted from Phase 1 can attend the on-campus finale on 24 October in Mathura.</p></details>
          <div className={styles.resources}><ExternalLink href={event.whatsappUrl} className={styles.textLink}>Organizer WhatsApp group</ExternalLink><a className={styles.textLink} href={`mailto:${event.contactEmail}`}>Contact Club Ellusion <ArrowUpRight size={17} aria-hidden="true" /></a></div>
          <p className={styles.note}>The organizer uses its official WhatsApp group for updates and submission instructions. Check Unstop for the latest rules.</p>
        </div>
        <figure className={styles.officialPoster}><PartnerImage src={`${event.assetRoot}/hustle-carnival-official-event-poster.jpeg`} alt="Club Ellusion’s Hustle Carnival poster announcing the 24 October 2026 finale at G.L. Bajaj Group of Institutions, Mathura" className={styles.poster} /><figcaption>CLUB ELLUSION · EVENT POSTER</figcaption></figure>
      </section>

      <div className={styles.closing}><p>Bring an idea.<br /><span>Leave with a build.</span></p><ExternalLink href={event.registrationUrl} className={styles.primary}>Register on Unstop</ExternalLink></div>
      <footer className={styles.footer}><span>Hustle Carnival 2026 × HackerMate</span><p>Event organized by Club Ellusion. Registration, selection and event operations are managed by the organizer.</p><ExternalLink href={event.registrationUrl} className={styles.textLink}>Official event source</ExternalLink></footer>
    </div>
  </main>;
}
