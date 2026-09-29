"use client";

import type { ReactNode } from "react";
import { Container, Eyebrow } from "@/components/landing/primitives";

type LegalSection = { id: string; title: string; body: ReactNode };

const linkClass = "font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink";
const listClass = "list-disc space-y-2 pl-5 marker:text-ink-4";

/* Legal copy below is unchanged from V1; only layout and typography differ. */
const SECTIONS: LegalSection[] = [
  {
    id: "acceptance",
    title: "1. Acceptance of Terms",
    body: (
      <p>
        Welcome to HackerMate. By accessing or using our platform, services, or website, you agree to comply with and be bound by these Terms of Service. If you do not agree to these terms, please do not use our services.
      </p>
    ),
  },
  {
    id: "accounts",
    title: "2. User Accounts & Verification",
    body: (
      <p>
        To use certain features of the platform, you must register for an account using verified credentials. You are responsible for maintaining the confidentiality of your credentials and are fully responsible for all activities that occur under your account.
      </p>
    ),
  },
  {
    id: "conduct",
    title: "3. Platform Rules & Code of Conduct",
    body: (
      <>
        <p>
          HackerMate is designed to foster positive collaboration and builder matching. You agree not to:
        </p>
        <ul className={listClass}>
          <li>Harass, threaten, or abuse other users of the platform.</li>
          <li>Provide false, inaccurate, or misleading profile information.</li>
          <li>Attempt to scrape, brute force, or breach security measures.</li>
          <li>Post content that violates standard copyright or intellectual property guidelines.</li>
        </ul>
      </>
    ),
  },
  {
    id: "ip",
    title: "4. Intellectual Property",
    body: (
      <p>
        All code, designs, illustrations, brand names, and platform contents are the property of HackerMate. You retain full ownership of the project ideas, materials, and code you publish or upload inside teams, subject only to a non-exclusive license for platform display.
      </p>
    ),
  },
  {
    id: "liability",
    title: "5. Limitation of Liability",
    body: (
      <p>
        HackerMate is provided &quot;as is&quot; without warranty of any kind. Under no circumstances shall HackerMate be liable for direct, indirect, incidental, special, or consequential damages resulting from the use or inability to use the platform.
      </p>
    ),
  },
  {
    id: "changes",
    title: "6. Changes to Terms",
    body: (
      <p>
        We reserves the right to modify or replace these Terms of Service at any time. We will notify users of major updates by posting notices inside the dashboard platform.
      </p>
    ),
  },
  {
    id: "contact",
    title: "7. Contact Information",
    body: (
      <p>
        If you have any questions or concerns regarding our terms, feel free to email our builder support team at{" "}
        <a href="mailto:contacthackermate@gmail.com" className={linkClass}>
          contacthackermate@gmail.com
        </a>
        .
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <main data-v2 className="border-b border-line">
      <Container className="py-14 md:py-20">
        <header className="border-b border-line pb-8">
          <Eyebrow>Legal</Eyebrow>
          <h1
            data-v2-heading
            className="mt-4 font-display text-[34px] font-semibold leading-[1.02] tracking-[-0.03em] text-ink text-balance [font-variation-settings:'wdth'_88] md:text-[46px]"
          >
            Terms of Service
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
