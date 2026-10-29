"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BadgeCheck, Fingerprint, ShieldQuestion } from "lucide-react";
import { lookupCertificate, type VerificationResult } from "@/lib/certificateVerification";
import styles from "./Verification.module.css";

const messages = {
  loading: ["Checking certificate", "Looking up the issuer’s certificate record. This may take a moment."],
  invalid: ["Invalid certificate link", "This link does not contain a valid certificate ID. Ask the issuer for the original verification link."],
  missing: ["Certificate not found", "No certificate was found for this ID. Check the original link or contact the issuer."],
  ambiguous: ["Certificate ID is not unique", "This ID matches more than one record. We cannot verify a specific certificate. Contact the issuer for an individual verification link."],
  unavailable: ["Verification unavailable", "We could not confirm this certificate. Please try again later or contact the issuer. This is not a verification result."],
} as const;

export default function CertificateVerification({ id }: { id: string }) {
  const [result, setResult] = useState<{ id: string; value: VerificationResult }>({ id, value: { kind: "loading" } });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    void lookupCertificate(id, controller.signal).then(value => {
      if (active) setResult({ id, value });
    });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [id, attempt]);
  // Never show a previous ID's verified result while a new request starts.
  const state = result.id === id ? result.value : { kind: "loading" as const };
  return <main className={styles.page}>
    <div className={styles.intro}>
      <p className={styles.eyebrow}>HackerMate credentials</p>
      <h1>Certificate verification</h1>
      <p>Recognition worth checking. Verify a certificate against its issuer’s record.</p>
    </div>
    <p className={styles.status} role="status" aria-live="polite" aria-atomic="true">
      {state.kind === "verified" ? "Certificate verified" : messages[state.kind][0]}
    </p>
    <section className={styles.card} aria-label="Certificate verification result" aria-busy={state.kind === "loading"}>
      <div>
        {state.kind === "verified" ? <>
          <div className={styles.banner}><BadgeCheck aria-hidden="true" size={26} /><span>Certificate verified</span></div>
          <div className={styles.identity}><p className={styles.eyebrow}>Awarded to</p><h2>{state.certificate.recipient}</h2>
            <p className={styles.achievement}>{state.certificate.achievement}</p></div>
          <dl className={styles.details}>
            <div><dt>Event</dt><dd>{state.certificate.event}</dd></div>
            <div><dt>Issued by</dt><dd>{state.certificate.issuer}</dd></div>
            <div><dt>Issue date</dt><dd><time dateTime={state.certificate.issued}>{new Date(`${state.certificate.issued}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</time></dd></div>
            <div className={styles.identifier}><dt><Fingerprint aria-hidden="true" size={15} /> Certificate ID</dt><dd>{state.certificate.id}</dd></div>
          </dl>
        </> : <div className={styles.notice}>
          {state.kind === "loading" ? <span className={styles.loader} aria-hidden="true" /> : <ShieldQuestion size={36} aria-hidden="true" />}
          <h2>{messages[state.kind][0]}</h2><p>{messages[state.kind][1]}</p>
        </div>}
      </div>
      {state.kind === "unavailable" && <button className={styles.retry} type="button" onClick={() => {
        setResult({ id, value: { kind: "loading" } }); setAttempt(value => value + 1);
      }}>Try again</button>}
      <div className={styles.note}>This page checks a certificate record. It does not issue a new certificate.</div>
    </section>
    <nav className={styles.links} aria-label="Verification help"><Link href="/contact">Contact HackerMate</Link><Link href="/">About HackerMate <span aria-hidden="true">↗</span></Link></nav>
  </main>;
}
