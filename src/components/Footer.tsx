"use client";

import Link from "next/link";
import Logo from "@/components/Logo";

export default function Footer() {
  return (
    <footer className="w-full border-t border-zinc-200/10 dark:border-zinc-800/40 mt-12 md:mt-20 py-12 md:py-16 bg-transparent text-zinc-400">
      <div className="max-w-6xl mx-auto px-6">
        {/* 2-Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 pb-12">
          
          {/* Column 1: Brand (spans 2 columns on desktop for balance) */}
          <div className="md:col-span-2 space-y-4">
            <Link href="/" className="inline-block cursor-pointer">
              <Logo className="h-8" />
            </Link>
            <p className="text-sm text-zinc-550 dark:text-zinc-400 leading-relaxed max-w-md">
              The ultimate operating system for hackathon builders. Discover compatible teammates, coordinate your projects, track upcoming hackathons, and ship your next idea with confidence.
            </p>
            {/* Social Icons Row */}
            <div className="flex items-center gap-4">
              <a
                href="mailto:contacthackermate@gmail.com"
                aria-label="Email Support"
                className="text-zinc-500 hover:text-zinc-900 dark:hover:text-[#B4F461] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </a>
              <a
                href="https://www.instagram.com/hackermate.in?igsh=dnRndWdtcmNrdXBw&utm_source=ig_contact_invite"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram Profile"
                className="text-zinc-500 hover:text-zinc-900 dark:hover:text-[#B4F461] transition-colors"
              >
                <svg className="w-5 h-5 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
              </a>
            </div>
          </div>

          {/* Column 2: Company */}
          <nav aria-label="Company Links" className="space-y-4">
            <h4 className="text-xs uppercase tracking-wide text-zinc-500 font-semibold font-mono">Company</h4>
            <ul className="space-y-2 text-sm">

              <li>
                <Link href="/contact" className="text-zinc-400 hover:text-white dark:hover:text-[#B4F461] transition-colors">
                  Contact Us
                </Link>
              </li>
              <li>
                <Link href="/faq" className="text-zinc-400 hover:text-white dark:hover:text-[#B4F461] transition-colors">
                  FAQ
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-zinc-400 hover:text-white dark:hover:text-[#B4F461] transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-zinc-400 hover:text-white dark:hover:text-[#B4F461] transition-colors">
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </nav>

        </div>

        {/* Divider Line & Bottom Bar */}
        <div className="border-t border-zinc-200/10 dark:border-zinc-800/40 pt-8 mt-4 flex items-center justify-between text-xs">
          <p className="font-mono text-zinc-500">
            © {new Date().getFullYear()} HackerMate. Built for hackathon builders.
          </p>
        </div>

      </div>
    </footer>
  );
}
