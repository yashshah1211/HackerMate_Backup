"use client";

import Link from "next/link";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import PartnerImage from "@/components/partners/PartnerImage";
import { partnerSpotlightContent, type PartnerEvent } from "./partnerSpotlight";
import styles from "./FeaturedPartnerEvents.module.css";

export default function FeaturedPartnerEvents({ events, loading }: { events: readonly PartnerEvent[]; loading: boolean }) {
  if (!loading && events.length === 0) return null;
  return (
    <section className={styles.section} aria-labelledby="featured-partner-title" aria-busy={loading}>
      <div className={styles.heading}>
        <h2 id="featured-partner-title">Partner events</h2>
        <span>Official collaborations</span>
      </div>
      {loading ? <div className={styles.loading} role="status">Loading partner events…</div> : (
        <ul className={styles.grid} data-count={events.length}>
          {events.map(event => {
            const content = partnerSpotlightContent(event);
            return <li key={event.slug} className={styles.card}>
              <div className={styles.identity}>
                <div className={styles.logo}>
                  {content.logo ? <PartnerImage key={content.logo} src={content.logo} alt="" className={styles.image} fallback={content.title.slice(0, 1)} /> : <span aria-hidden="true">{content.title.slice(0, 1)}</span>}
                </div>
                <div className={styles.details}>
                  {content.credit !== content.title && <p className={styles.credit}>{content.credit}</p>}
                  <h3>{content.title}</h3>
                  <p className={styles.date}><CalendarDays size={14} aria-hidden="true" />{content.dates}</p>
                </div>
              </div>
              {content.description && <p className={styles.description}>{content.description}</p>}
              <div className={styles.actions}>
                {content.rack && <p>Teammates on HackerMate. Official registration on Unstop.</p>}
                <Link href={`/partners/${event.slug}`} prefetch={false} className={styles.cta} aria-label={`Explore event: ${content.title}`}>
                  Explore event <ArrowUpRight size={17} aria-hidden="true" />
                </Link>
              </div>
            </li>;
          })}
        </ul>
      )}
    </section>
  );
}
