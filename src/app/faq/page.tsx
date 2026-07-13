"use client";

import Link from "next/link";
import Logo from "@/components/Logo";

export default function FAQPage() {
  const faqItems = [
    {
      q: "What is HackerMate?",
      a: "HackerMate is the ultimate Team Operating System designed specifically for hackathon builders. It helps developers, designers, and product managers find compatible teammates, form structured teams, and collaborate seamlessly to ship their projects on time."
    },
    {
      q: "How does the builder matching & compatibility score work?",
      a: "HackerMate calculates builder compatibility using a customized algorithm based on overlapping skills, matching goals, and hackathon schedules. When browsing builders, you will see a percentage score indicating how well your profiles align."
    },
    {
      q: "Is HackerMate free to use?",
      a: "Yes! HackerMate is 100% free for individual hackathon builders looking for teams and developers seeking to collaborate on projects."
    },
    {
      q: "How do I create or join a team?",
      a: "Once onboarding is complete, you can browse available teams in the 'Browse Teams' panel and send join requests. Alternatively, you can create a team profile, list the skills you are looking for, and invite compatible builders directly from the 'Find Builders' screen."
    },
    {
      q: "Can I manage multiple hackathons simultaneously?",
      a: "Absolutely. You can save multiple hackathons to your dashboard, track their specific schedules, and create separate team profiles for different events."
    },
    {
      q: "How do I report spam or platform abuse?",
      a: "We maintain a strict code of conduct. If you encounter harassment, spam, or fake builder profiles, please use the 'Contact Us' page or email our safety desk at contacthackermate@gmail.com immediately."
    }
  ];

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
            Frequently Asked Questions
          </h1>
          <p className="text-zinc-500">
            Everything you need to know about building teams and shipping projects with HackerMate.
          </p>
        </header>

        {/* FAQ Accordions using native semantic details & summary */}
        <div className="space-y-4">
          {faqItems.map((item, idx) => (
            <details 
              key={idx} 
              className="group border border-zinc-800/80 bg-zinc-950/20 rounded-lg p-5 transition-all duration-300 open:bg-zinc-950/60 open:border-zinc-700/80 cursor-pointer"
            >
              <summary className="list-none flex items-center justify-between font-bold text-white text-base md:text-lg select-none outline-none">
                <span>{item.q}</span>
                <span className="ml-4 transition-transform duration-300 group-open:rotate-180 flex items-center justify-center w-6 h-6 text-zinc-500 group-hover:text-white">
                  <svg className="w-4 h-4 stroke-current" fill="none" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </summary>
              <div className="mt-4 text-sm md:text-base text-zinc-400 leading-relaxed pt-2 border-t border-zinc-800/60 transition-all duration-300">
                <p>{item.a}</p>
              </div>
            </details>
          ))}
        </div>

        {/* Footer Info Box */}
        <div className="mt-16 bg-zinc-950/40 border border-zinc-850 rounded-xl p-8 text-center space-y-4">
          <h3 className="text-lg font-bold text-white">Still have questions?</h3>
          <p className="text-sm text-zinc-500 max-w-md mx-auto">
            Our support desk is always online. Contact us via our official channel or reach out to our team directly.
          </p>
          <div className="flex justify-center gap-4 pt-2">
            <a 
              href="mailto:contacthackermate@gmail.com" 
              className="btn btn-primary inline-flex items-center gap-2 px-6 py-3 font-bold text-sm shadow-lg cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span>Email contacthackermate@gmail.com</span>
            </a>
          </div>
        </div>

      </div>
    </main>
  );
}
