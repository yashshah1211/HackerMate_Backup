"use client";

import Link from "next/link";
import Logo from "@/components/Logo";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-300 font-sans selection:bg-[#B4F461]/20 selection:text-[#B4F461] py-16 md:py-24 relative overflow-hidden">
      {/* Decorative Glows */}
      <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-[#B4F461]/2 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[450px] h-[450px] bg-emerald-500/2 rounded-full blur-[160px] pointer-events-none" />

      <div className="max-w-3xl mx-auto px-6 relative z-10">
        
        {/* Back navigation */}
        <div className="mb-10 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-sm group">
            <svg className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to Home</span>
          </Link>
          <Logo className="h-6" />
        </div>

        {/* Header */}
        <header className="mb-12 border-b border-zinc-800 pb-8">
          <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight mb-3">
            Terms of Service
          </h1>
          <p className="text-sm text-zinc-500 font-mono">
            Last updated: July 13, 2026
          </p>
        </header>

        {/* Content Sections */}
        <article className="space-y-8 text-sm md:text-base text-zinc-400 leading-relaxed">
          
          <section className="space-y-3">
            <h2 className="text-lg md:text-xl font-bold text-white tracking-tight">1. Acceptance of Terms</h2>
            <p>
              Welcome to HackerMate. By accessing or using our platform, services, or website, you agree to comply with and be bound by these Terms of Service. If you do not agree to these terms, please do not use our services.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg md:text-xl font-bold text-white tracking-tight">2. User Accounts & Verification</h2>
            <p>
              To use certain features of the platform, you must register for an account using verified credentials. You are responsible for maintaining the confidentiality of your credentials and are fully responsible for all activities that occur under your account.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg md:text-xl font-bold text-white tracking-tight">3. Platform Rules & Code of Conduct</h2>
            <p>
              HackerMate is designed to foster positive collaboration and builder matching. You agree not to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-zinc-500">
              <li>Harass, threaten, or abuse other users of the platform.</li>
              <li>Provide false, inaccurate, or misleading profile information.</li>
              <li>Attempt to scrape, brute force, or breach security measures.</li>
              <li>Post content that violates standard copyright or intellectual property guidelines.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg md:text-xl font-bold text-white tracking-tight">4. Intellectual Property</h2>
            <p>
              All code, designs, illustrations, brand names, and platform contents are the property of HackerMate. You retain full ownership of the project ideas, materials, and code you publish or upload inside teams, subject only to a non-exclusive license for platform display.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg md:text-xl font-bold text-white tracking-tight">5. Limitation of Liability</h2>
            <p>
              HackerMate is provided "as is" without warranty of any kind. Under no circumstances shall HackerMate be liable for direct, indirect, incidental, special, or consequential damages resulting from the use or inability to use the platform.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg md:text-xl font-bold text-white tracking-tight">6. Changes to Terms</h2>
            <p>
              We reserves the right to modify or replace these Terms of Service at any time. We will notify users of major updates by posting notices inside the dashboard platform.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg md:text-xl font-bold text-white tracking-tight">7. Contact Information</h2>
            <p>
              If you have any questions or concerns regarding our terms, feel free to email our builder support team at{" "}
              <a href="mailto:contacthackermate@gmail.com" className="text-[#B4F461] hover:underline">
                contacthackermate@gmail.com
              </a>
              .
            </p>
          </section>

        </article>

        {/* Footer Accent */}
        <div className="mt-16 pt-8 border-t border-zinc-900 text-center text-xs text-zinc-500 font-mono">
          <p>© {new Date().getFullYear()} HackerMate. All rights reserved.</p>
        </div>

      </div>
    </main>
  );
}
