"use client";

import type { ReactNode } from "react";
import { Container, Eyebrow } from "@/components/landing/primitives";

type LegalSection = { id: string; title: string; body: ReactNode };

const linkClass = "font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink";
const listClass = "list-disc space-y-2 pl-5 marker:text-ink-4";

/* Legal copy below is unchanged from V1; only layout and typography differ. */
const SECTIONS: LegalSection[] = [
  {
    id: "collect",
    title: "1. Information We Collect",
    body: (
      <>
        <p>
          We collect user details to provide matching and verification services. This includes:
        </p>
        <ul className={listClass}>
          <li>Authentication detail: Email, full name, profile avatar, and verified provider ID.</li>
          <li>Builder profile data: Bio, skills, college details, GitHub URL, and LinkedIn URL.</li>
          <li>Interactions: Messaging logs, connection request status, and team collaboration records.</li>
        </ul>
      </>
    ),
  },
  {
    id: "use",
    title: "2. How We Use Information",
    body: (
      <>
        <p>
          Your data is solely used to facilitate team discovery and collaboration. Specifically:
        </p>
        <ul className={listClass}>
          <li>To calculate and present builder compatibility metrics.</li>
          <li>To dispatch email notifications for invitations, reminders, and connection requests.</li>
          <li>To monitor and maintain system security and prevent automated bots/spam.</li>
        </ul>
      </>
    ),
  },
  {
    id: "sharing",
    title: "3. Data Sharing & Analytics",
    body: (
      <>
        <p>
          We do not sell, trade, or share your personal database records with third-party advertising companies. Contact information shared with essential infrastructure providers (like Supabase for database hosting and Resend for transactional email dispatch) is securely processed under strict API guidelines.
        </p>
        <p>
          <strong className="font-semibold text-ink">Product Analytics & Telemetry:</strong> We utilize Google Analytics 4 (GA4) to analyze traffic patterns, page views, and feature interactions. Google Analytics captures pseudonymous usage metrics mapped strictly to anonymous identifiers. We do <strong className="font-semibold text-ink">not</strong> share your full name, email address, or personal identifying information (PII) with analytics providers.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "4. Cookies & Local Storage",
    body: (
      <p>
        We utilize browser cookies and HTML5 Local Storage to securely verify user login sessions and persist custom visual preferences (like dark and light modes).
      </p>
    ),
  },
  {
    id: "rights",
    title: "5. Your Choices & Data Rights",
    body: (
      <p>
        You maintain complete control over your builder profile. You can modify your details, update your skills, or delete your account records directly via the Profile Settings dashboard.
      </p>
    ),
  },
  {
    id: "contact",
    title: "6. Contact Us",
    body: (
      <p>
        For privacy requests, data export, or account deletion support, reach out directly to us at{" "}
        <a href="mailto:contacthackermate@gmail.com" className={linkClass}>
          contacthackermate@gmail.com
        </a>
        .
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <main data-v2 className="border-b border-line">
      <Container className="py-14 md:py-20">
        <header className="border-b border-line pb-8">
          <Eyebrow>Legal</Eyebrow>
          <h1
            data-v2-heading
            className="mt-4 font-display text-[34px] font-semibold leading-[1.02] tracking-[-0.03em] text-ink text-balance [font-variation-settings:'wdth'_88] md:text-[46px]"
          >
            Privacy Policy
          </h1>
          <p className="mt-3 font-mono text-[12.5px] text-ink-3">
            Last updated: July 13, 2026
          </p>
        </header>

        <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
          {/* Table of contents (desktop) */}
          <nav aria-label="On this page" className="hidden lg:block">
            <div className="sticky top-20">
              <p className="caps-label text-ink-3">On this page</p>
              <ol className="mt-3 space-y-1 border-l border-line">
                {SECTIONS.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="-ml-px block border-l border-transparent py-1.5 pl-3 text-[13px] text-ink-3 transition-colors hover:border-ink-3 hover:text-ink"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>

          <article className="min-w-0 max-w-[68ch] space-y-10 text-[15px] leading-[1.7] text-ink-2">
            {SECTIONS.map((s) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-20 space-y-3">
                <h2 id={`${s.id}-title`} className="text-[18px] font-semibold tracking-[-0.01em] text-ink md:text-[19px]">
                  {s.title}
                </h2>
                {s.body}
              </section>
            ))}
          </article>
        </div>
      </Container>
    </main>
  );
}
