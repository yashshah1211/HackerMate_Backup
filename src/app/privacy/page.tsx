"use client";

import Link from "next/link";
import Logo from "@/components/Logo";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-300 font-sans selection:bg-[#B4F461]/20 selection:text-[#B4F461] py-16 md:py-24 relative overflow-hidden">
      {/* Decorative Glows */}
      <div className="absolute top-0 right-1/4 w-[400px] h-[400px] bg-[#B4F461]/2 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-[450px] h-[450px] bg-emerald-500/2 rounded-full blur-[160px] pointer-events-none" />

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
            Privacy Policy
          </h1>
          <p className="text-sm text-zinc-500 font-mono">
            Last updated: July 13, 2026
          </p>
        </header>

        {/* Content Sections */}
        <article className="space-y-8 text-sm md:text-base text-zinc-400 leading-relaxed">
          
          <section className="space-y-3">
            <h2 className="text-lg md:text-xl font-bold text-white tracking-tight">1. Information We Collect</h2>
            <p>
              We collect user details to provide matching and verification services. This includes:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-zinc-500">
              <li>Authentication detail: Email, full name, profile avatar, and verified provider ID.</li>
              <li>Builder profile data: Bio, skills, college details, GitHub URL, and LinkedIn URL.</li>
              <li>Interactions: Messaging logs, connection request status, and team collaboration records.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg md:text-xl font-bold text-white tracking-tight">2. How We Use Information</h2>
            <p>
              Your data is solely used to facilitate team discovery and collaboration. Specifically:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-zinc-500">
              <li>To calculate and present builder compatibility metrics.</li>
              <li>To dispatch email notifications for invitations, reminders, and connection requests.</li>
              <li>To monitor and maintain system security and prevent automated bots/spam.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg md:text-xl font-bold text-white tracking-tight">3. Data Sharing & Security</h2>
            <p>
              We do not sell, trade, or share your personal database records with third-party advertising companies. Contact information shared with third-party service providers (like Supabase for databases and Resend for transactional email dispatch) is securely processed under strict API guidelines.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg md:text-xl font-bold text-white tracking-tight">4. Cookies & Local Storage</h2>
            <p>
              We utilize browser cookies and HTML5 Local Storage to securely verify user login sessions and persist custom visual preferences (like dark and light modes).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg md:text-xl font-bold text-white tracking-tight">5. Your Choices & Data Rights</h2>
            <p>
              You maintain complete control over your builder profile. You can modify your details, update your skills, or delete your account records directly via the Profile Settings dashboard.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg md:text-xl font-bold text-white tracking-tight">6. Contact Us</h2>
            <p>
              For privacy requests, data export, or account deletion support, reach out directly to us at{" "}
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
