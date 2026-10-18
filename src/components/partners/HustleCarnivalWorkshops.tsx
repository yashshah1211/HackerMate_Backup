import Link from 'next/link';
import { ArrowDown, ArrowLeft, ArrowUpRight, CalendarDays, Clock3, FileCheck2, GitBranch, Globe2, Play, Sparkles } from 'lucide-react';
import Logo from '@/components/Logo';
import { approvedWorkshopUrl, HUSTLE_WORKSHOPS, WORKSHOP_SCHEDULE, type HustleWorkshop } from '@/lib/partners/hustleCarnivalWorkshops';
import styles from './HustleCarnivalWorkshops.module.css';

function WorkshopAction({ workshop, kind }: { workshop: HustleWorkshop; kind: 'livestream' | 'certificate' }) {
  const stream = kind === 'livestream';
  const href = approvedWorkshopUrl(stream ? workshop.livestream : workshop.certificateForm, kind);
  const Icon = stream ? Play : FileCheck2;
  const label = stream ? 'Watch on YouTube' : 'Official certificate form';
  const pending = stream ? 'Livestream link coming soon' : 'Certificate form coming soon';
  const descriptionId = `${workshop.id}-${kind}-status`;
  return <div className={styles.actionGroup}>
    {href ? <a className={stream ? styles.primary : styles.secondary} href={href} target="_blank" rel="noopener noreferrer" aria-describedby={descriptionId}>
      <Icon size={17} aria-hidden="true" />{label}<ArrowUpRight size={17} aria-hidden="true" /><span className={styles.srOnly}> for {workshop.title} (opens in a new tab)</span>
    </a> : <button className={stream ? styles.primary : styles.secondary} type="button" disabled aria-describedby={descriptionId}>
      <Icon size={17} aria-hidden="true" />{pending}<span className={styles.srOnly}> for {workshop.title}</span>
    </button>}
    <p id={descriptionId}>{stream
      ? href ? 'Livestream hosted on an official Club Ellusion YouTube channel.' : 'Club Ellusion will share the official YouTube link here.'
      : href ? 'Provided and managed by Club Ellusion through Google Forms.' : 'The organizer will share its official Google Form here.'}</p>
  </div>;
}

export default function HustleCarnivalWorkshops({ workshops = HUSTLE_WORKSHOPS }: { workshops?: readonly HustleWorkshop[] }) {
  return <main className={styles.page}>
    <a href="#workshop-content" className={styles.skip}>Skip to workshop details</a>
    <div className={styles.container}>
      <header className={styles.brandBar}>
        <div className={styles.coBrand}>
          <Link href="/" aria-label="HackerMate home" className={styles.home}><Logo decorative className={styles.logo} /></Link>
          <span className={styles.cross} aria-hidden="true">×</span>
          <span className={styles.ellusion}>ELLUSION<span>CLUB · GL BAJAJ MATHURA</span></span>
        </div>
        <Link href="/partners/hustle-carnival" className={styles.back}><ArrowLeft size={16} aria-hidden="true" /> Carnival portal</Link>
      </header>

      <section id="workshop-content" className={styles.hero} aria-labelledby="workshop-title" tabIndex={-1}>
        <div>
          <p className={styles.eyebrow}><span aria-hidden="true" /> HUSTLE CARNIVAL 2026 / PUBLIC WORKSHOPS</p>
          <h1 id="workshop-title">Curiosity in.<br /><span>Possibilities out.</span></h1>
          <p className={styles.intro}>Two workshops. One afternoon to explore.<br />Join Club Ellusion live on YouTube, wherever you are.</p>
          <div className={styles.heroActions}><a href="#workshops" className={styles.explore}>Explore the workshops <ArrowDown size={17} aria-hidden="true" /></a><span className={styles.publicBadge}><Globe2 size={15} aria-hidden="true" /> Open to everyone</span></div>
          <p className={styles.organizer}>Organized by <strong>Club Ellusion</strong><br />G.L. Bajaj Group of Institutions, Mathura<br />In partnership with <strong>HackerMate</strong></p>
        </div>
        <aside className={styles.schedule} aria-label="Workshop schedule">
          <div className={styles.scheduleTop}><span>YOUR AFTERNOON, SORTED</span><Sparkles size={20} aria-hidden="true" /></div>
          <p className={styles.date}><time dateTime="2026-10-24">24 OCT<span>2026 · SATURDAY</span></time></p>
          <div className={styles.time}><Clock3 size={20} aria-hidden="true" /><p><time dateTime={WORKSHOP_SCHEDULE.start}>2:20 PM</time>–<time dateTime={WORKSHOP_SCHEDULE.end}>4:00 PM</time><span>India Standard Time · IST (UTC+05:30)</span></p></div>
          <p className={styles.simultaneous}>Both workshops run simultaneously.<br />Choose the session you want to explore.</p>
          <div className={styles.scheduleBottom}><Play size={14} aria-hidden="true" /> LIVE ON YOUTUBE<span aria-hidden="true">↗</span></div>
        </aside>
      </section>

      <section id="workshops" className={styles.workshops} aria-labelledby="sessions-title">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>01 / PICK YOUR POSSIBILITY</p><h2 id="sessions-title">What will you explore?</h2></div><p>Anyone can attend.<br />No sign-in or registration required.</p></div>
        <div className={styles.cards}>
          {workshops.map((workshop, index) => {
            const Icon = workshop.id === 'git-github' ? GitBranch : Sparkles;
            return <article key={workshop.id} className={styles.card} aria-labelledby={`${workshop.id}-title`}>
              <div className={styles.cardTop}><span>WORKSHOP 0{index + 1}</span><span>PUBLIC · ONLINE</span></div>
              <div className={styles.cardIcon}><Icon size={36} strokeWidth={1.4} aria-hidden="true" /></div>
              <h3 id={`${workshop.id}-title`}>{workshop.title}</h3>
              <p className={styles.description}>{workshop.description}</p>
              <p className={styles.cardSchedule}><CalendarDays size={16} aria-hidden="true" />{WORKSHOP_SCHEDULE.date}<span>2:20 PM–4:00 PM IST</span></p>
              <div className={styles.actions}><WorkshopAction workshop={workshop} kind="livestream" /><WorkshopAction workshop={workshop} kind="certificate" /></div>
            </article>;
          })}
        </div>
      </section>

      <section className={styles.practical} aria-labelledby="attending-title">
        <div><p className={styles.eyebrow}>02 / GOOD TO KNOW</p><h2 id="attending-title">Just bring your curiosity.</h2><p>Watch your chosen session on an official Club Ellusion YouTube channel. Livestream links will appear above once the organizer shares them.</p></div>
        <div className={styles.faq}>
          <details><summary>Who can attend the workshops?</summary><p>Everyone. These public workshops are open to anyone, independently of buildathon participation. You do not need to sign in to HackerMate or register for a workshop.</p></details>
          <details><summary>Can I watch both workshops live?</summary><p>Both run on 24 October 2026 from 2:20 PM to 4:00 PM IST (UTC+05:30). They take place simultaneously, so choose the session you want to join.</p></details>
          <details><summary>How will certificates be handled?</summary><p>Club Ellusion manages certificates through organizer-provided Google Forms. Official forms and any instructions will be shared later. HackerMate does not generate certificates or collect certificate responses.</p></details>
        </div>
      </section>
      <footer className={styles.footer}><span>Hustle Carnival 2026 × HackerMate</span><p>Workshops, livestreams and certificates are managed by Club Ellusion.</p><Link href="/partners/hustle-carnival">Back to the carnival <ArrowUpRight size={15} aria-hidden="true" /></Link></footer>
    </div>
  </main>;
}
