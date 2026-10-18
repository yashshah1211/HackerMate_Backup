"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ArrowRight, ArrowUpRight, CalendarDays } from "lucide-react";
import styles from "./HustlePartnershipBanner.module.css";

const EXPIRES_AT = Date.parse("2026-10-25T00:00:00+05:30");
const isBeforeExpiry = () => Date.now() < EXPIRES_AT;
// SSR and the first hydration render agree; cached HTML never contains an expired banner.
const serverSnapshot = () => false;

function subscribeToExpiry(onChange: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = () => {
    clearTimeout(timer);
    onChange();
    const remaining = EXPIRES_AT - Date.now();
    if (remaining > 0) timer = setTimeout(refresh, Math.min(remaining, 2_147_483_647));
  };
  refresh();
  document.addEventListener("visibilitychange", refresh);
  window.addEventListener("focus", refresh);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", refresh);
    window.removeEventListener("focus", refresh);
  };
}

/** Public event discovery only. Private Round 2 access stays behind its existing gates. */
export default function HustlePartnershipBanner() {
  const visible = useSyncExternalStore(subscribeToExpiry, isBeforeExpiry, serverSnapshot);
  if (!visible) return null;

  return (
    <section className={styles.banner} aria-labelledby="hustle-partnership-title">
      <div className={styles.event}>
        <p className={styles.brand}>HackerMate <span aria-hidden="true">×</span> Club Ellusion</p>
        <h2 id="hustle-partnership-title">Hustle Carnival <span>2026</span></h2>
        <p className={styles.description}>An open-innovation buildathon by Club Ellusion, G.L. Bajaj Group of Institutions, Mathura.</p>
        <div className={styles.facts}><span>Both rounds free</span><span>Finale · 24 October</span></div>
        <Link href="/partners/hustle-carnival" prefetch={false} className={styles.primary}>Explore the carnival <ArrowUpRight size={17} aria-hidden="true" /></Link>
        <p className={styles.note}>Round 2 is invitation-only. Private invitations follow verification of the official shortlist.</p>
      </div>
      <div className={styles.workshops}>
        <p className={styles.eyebrow}>FREE PUBLIC WORKSHOPS</p>
        <h3>One afternoon.<br /> Two possibilities.</h3>
        <p className={styles.sessions}>Git &amp; GitHub<br />Introduction to AI Tools</p>
        <p className={styles.schedule}><CalendarDays size={17} aria-hidden="true" /><span><time dateTime="2026-10-24">24 October 2026</time><br />2:00–4:00 PM IST · simultaneous</span></p>
        <Link href="/partners/hustle-carnival/workshops" prefetch={false} className={styles.secondary}>Explore public workshops <ArrowRight size={17} aria-hidden="true" /></Link>
        <p className={styles.note}>Open to everyone on YouTube. No sign-in or registration required.</p>
      </div>
    </section>
  );
}
