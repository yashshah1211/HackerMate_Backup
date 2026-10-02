'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Logo from '@/components/Logo';

export default function PosterPage() {
  const [showGuides, setShowGuides] = useState(true);

  // Auto-hide guides before printing, restore after
  useEffect(() => {
    const handleBeforePrint = () => setShowGuides(false);
    const handleAfterPrint = () => setShowGuides(true);

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  return (
    <div className="min-h-screen bg-neutral-800 print:bg-transparent overflow-x-auto flex flex-col items-center py-8 print:py-0">

      {/* SCREEN-ONLY CONTROLS */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-50 print:hidden bg-black/90 p-2 rounded-full shadow-2xl backdrop-blur-md">
        <button
          onClick={() => setShowGuides(!showGuides)}
          className={`px-4 py-2 text-xs font-mono rounded-full transition-colors ${showGuides ? 'bg-[#B4F461] text-black' : 'text-white hover:bg-white/10'}`}
        >
          {showGuides ? 'HIDE GUIDES' : 'SHOW GUIDES'}
        </button>
        <div className="w-px h-4 bg-white/20 mx-1" />
        <button
          onClick={() => {
            setShowGuides(false);
            setTimeout(() => window.print(), 100);
          }}
          className="px-4 py-2 text-xs font-mono text-white hover:bg-white/10 rounded-full transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          PRINT / SAVE PDF
        </button>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: 420mm 594mm portrait;
            margin: 0;
          }
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
            background: #F2F0EA !important;
          }
        }
      `}} />

      <div
        className="relative bg-[#F2F0EA] shadow-2xl print:shadow-none overflow-hidden shrink-0"
        style={{ width: '420mm', height: '594mm' }}
      >
        {/* SAFE AREA GUIDE */}
        {showGuides && (
          <div
            className="absolute pointer-events-none border border-red-500/30 print:hidden z-50"
            style={{
              top: '25mm',
              left: '25mm',
              right: '25mm',
              bottom: '25mm',
            }}
          />
        )}

        {/* BACKGROUND SYSTEM */}
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
          <svg viewBox="0 0 420 594" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="poster-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#0F0F0E" strokeWidth="0.2" opacity="0.05" />
              </pattern>
              <pattern id="poster-dots" width="6" height="6" patternUnits="userSpaceOnUse">
                <circle cx="3" cy="3" r="0.6" fill="#0F0F0E" opacity="0.08" />
              </pattern>
            </defs>

            {/* Grid bands */}
            <rect x="0" y="80" width="420" height="180" fill="url(#poster-grid)" />
            <rect x="360" y="0" width="60" height="594" fill="url(#poster-grid)" />

            {/* Dotted areas */}
            <rect x="30" y="320" width="80" height="120" fill="url(#poster-dots)" />

            {/* Subtle card geometry backing the game flow */}
            <g transform="translate(40, 275)" fill="none" stroke="#0F0F0E" strokeWidth="1" opacity="0.06">
              <rect x="0" y="0" width="50" height="75" rx="3" />
              <rect x="110" y="10" width="35" height="55" rx="2" />
              <rect x="150" y="10" width="35" height="55" rx="2" />
              <rect x="190" y="10" width="35" height="55" rx="2" />
              <rect x="230" y="10" width="35" height="55" rx="2" />
            </g>

            {/* Oversized ghosted fragment */}
            <g transform="translate(180, 200) scale(15)" opacity="0.02" fill="none" stroke="#0F0F0E" strokeWidth="0.05">
              <path d="M12.98 25.04l8.36-16.74a1.5 1.5 0 00-1.84-1.95L2.34 11.23a1.5 1.5 0 00-.08 2.82l6.24 2.12 2.12 6.24a1.5 1.5 0 002.36.63z" />
            </g>

            {/* Registration marks */}
            <g stroke="#0F0F0E" strokeWidth="0.5" opacity="0.3">
              <polyline points="20,10 10,10 10,20" fill="none" />
              <polyline points="400,10 410,10 410,20" fill="none" />
              <polyline points="20,584 10,584 10,574" fill="none" />
              <polyline points="400,584 410,584 410,574" fill="none" />
              <circle cx="10" cy="10" r="1.5" fill="#0F0F0E" />
              <circle cx="410" cy="10" r="1.5" fill="#0F0F0E" />
              <circle cx="10" cy="584" r="1.5" fill="#0F0F0E" />
              <circle cx="410" cy="584" r="1.5" fill="#0F0F0E" />
            </g>

            {/* Edge ticks */}
            <line x1="0" y1="180" x2="15" y2="180" stroke="#B4F461" strokeWidth="1.5" />
            <line x1="0" y1="185" x2="8" y2="185" stroke="#22d3ee" strokeWidth="0.8" />
            <line x1="420" y1="420" x2="405" y2="420" stroke="#B4F461" strokeWidth="1.5" />
            <line x1="420" y1="415" x2="412" y2="415" stroke="#22d3ee" strokeWidth="0.8" />
          </svg>
        </div>

        {/* POSTER CONTENT */}
        <div className="absolute inset-0 p-[25mm] flex flex-col justify-between z-10">

          {/* 1. TOP SECTION */}
          <div className="flex justify-between items-start">
            <div className="w-[32mm] [&_svg]:w-full [&_svg]:h-auto [&_img]:w-full [&_img]:h-auto">
              <Logo />
            </div>
            <div className="flex flex-col items-end">
              <p style={{ fontFamily: 'var(--font-mono)' }} className="text-[#0F0F0E] font-bold text-[18pt] tracking-widest uppercase">
                30 Second Team Challenge
              </p>
              <p style={{ fontFamily: 'var(--font-mono)' }} className="text-[#737069] text-[12pt] tracking-widest uppercase mt-2">
                DJSCE Startup Expo
              </p>
            </div>
          </div>

          {/* 2. HEADLINE & SUBHEAD */}
          <div className="mt-[20mm]">
            <h1
              style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.02em', lineHeight: '0.95' }}
              className="text-[#0F0F0E] font-bold uppercase w-[95%] mb-[10mm]"
            >
              <span style={{ fontSize: '75pt' }}>Can you build</span><br/>
              <span style={{ fontSize: '75pt' }}>the perfect</span><br/>
              <span style={{ fontSize: '75pt' }}>hackathon team</span><br/>
              <span style={{ fontSize: '75pt' }}>in </span>
              <span style={{ fontSize: '75pt', color: '#B4F461', WebkitTextStroke: '3px #0F0F0E' }}>30 seconds?</span>
            </h1>
            <p
              style={{ fontFamily: 'var(--font-ui)', letterSpacing: '-0.01em' }}
              className="text-[28pt] font-medium text-[#161615]"
            >
              Draw a challenge. Pick 4 builders. Beat the judge.
            </p>
          </div>

          {/* 3. GAME FLOW & 90+ WIN */}
          <div className="mt-[25mm] flex gap-[15mm]">
            {/* Flow */}
            <div className="flex-1 flex gap-[10mm] relative">
              {/* Optional structural line */}
              <div className="absolute top-[8mm] left-0 right-0 h-[2px] bg-[#0F0F0E]/10 -z-10" />

              <div className="flex-1 flex flex-col gap-4">
                <div className="bg-[#B4F461] border-2 border-[#0F0F0E] w-[18mm] h-[18mm] flex items-center justify-center rounded-full text-[16pt] font-bold" style={{ fontFamily: 'var(--font-mono)' }}>01</div>
                <h2 className="text-[28pt] font-bold text-[#0F0F0E] uppercase" style={{ fontFamily: 'var(--font-display)' }}>Draw</h2>
                <p className="text-[18pt] text-[#161615] font-medium leading-tight pr-4" style={{ fontFamily: 'var(--font-ui)' }}>
                  Pick one Challenge Card.
                </p>
              </div>
              <div className="flex-1 flex flex-col gap-4">
                <div className="bg-[#F2F0EA] border-2 border-[#0F0F0E] text-[#0F0F0E] w-[18mm] h-[18mm] flex items-center justify-center rounded-full text-[16pt] font-bold" style={{ fontFamily: 'var(--font-mono)' }}>02</div>
                <h2 className="text-[28pt] font-bold text-[#0F0F0E] uppercase" style={{ fontFamily: 'var(--font-display)' }}>Build</h2>
                <p className="text-[18pt] text-[#161615] font-medium leading-tight pr-4" style={{ fontFamily: 'var(--font-ui)' }}>
                  Choose exactly 4 Builders.
                </p>
              </div>
              <div className="flex-1 flex flex-col gap-4">
                <div className="bg-[#22d3ee] border-2 border-[#0F0F0E] w-[18mm] h-[18mm] flex items-center justify-center rounded-full text-[16pt] font-bold" style={{ fontFamily: 'var(--font-mono)' }}>03</div>
                <h2 className="text-[28pt] font-bold text-[#0F0F0E] uppercase" style={{ fontFamily: 'var(--font-display)' }}>Score</h2>
                <p className="text-[18pt] text-[#161615] font-medium leading-tight pr-4" style={{ fontFamily: 'var(--font-ui)' }}>
                  Take your team to the HackerMate judge.
                </p>
              </div>
            </div>

            {/* Emphases (30 SEC / WIN) */}
            <div className="w-[100mm] border-l-[3px] border-[#0F0F0E]/10 pl-[10mm] flex flex-col justify-between shrink-0">
              <div>
                <div className="text-[48pt] font-bold leading-none text-[#0F0F0E]" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '-0.05em' }}>
                  30 SEC
                </div>
                <div className="text-[14pt] text-[#737069] uppercase font-bold tracking-widest mt-2" style={{ fontFamily: 'var(--font-ui)' }}>
                  Time Limit
                </div>
              </div>

              <div className="mt-8">
                <div className="text-[48pt] font-bold leading-none text-[#B4F461]" style={{ fontFamily: 'var(--font-display)', WebkitTextStroke: '2px #0F0F0E' }}>
                  90+ = WIN
                </div>
                <div className="text-[16pt] text-[#161615] font-medium leading-snug mt-3" style={{ fontFamily: 'var(--font-ui)' }}>
                  Score out of 100.<br/>
                  <span className="text-[#737069]">Highest scores lead the leaderboard.</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1" />

          {/* 4. PRODUCT BRIDGE & QR */}
          <div className="border-t-[4px] border-[#0F0F0E] pt-[15mm] flex gap-[20mm] items-end">
            <div className="flex-1 pb-[5mm]">
              <h3
                className="text-[42pt] font-bold uppercase leading-[1.05] text-[#0F0F0E] mb-6"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                <span className="text-[#32312D]">Real hackathons don't give you a perfect team.</span><br/>
                HackerMate helps you find one.
              </h3>
              <p className="text-[24pt] text-[#161615] font-medium max-w-[85%] mb-12" style={{ fontFamily: 'var(--font-ui)' }}>
                Find builders by skill, review who they are, form the right team, and ship together.
              </p>

              <div className="text-[16pt] font-bold text-[#0F0F0E] uppercase tracking-[0.2em]" style={{ fontFamily: 'var(--font-mono)' }}>
                FIND <span className="text-[#B4F461] px-2">→</span>
                REVIEW <span className="text-[#B4F461] px-2">→</span>
                MERGE <span className="text-[#B4F461] px-2">→</span>
                BUILD <span className="text-[#B4F461] px-2">→</span>
                SHIP
              </div>
            </div>

            <div className="shrink-0 flex flex-col items-center border-[1px] border-[#0F0F0E]/15 bg-white p-[10mm] shadow-none rounded-xl">
              <div className="w-[50mm] h-[50mm] relative">
                <Image
                  src="/expo/hackermate-qr.svg"
                  alt="QR Code"
                  fill
                  className="object-contain"
                />
              </div>
              <div className="text-center mt-[8mm]">
                <div className="text-[18pt] font-bold uppercase text-[#0F0F0E]" style={{ fontFamily: 'var(--font-display)' }}>
                  Find your next<br/>hackathon team.
                </div>
                <div className="text-[14pt] text-[#737069] mt-3 font-bold uppercase tracking-widest" style={{ fontFamily: 'var(--font-mono)' }}>
                  hackermate.in
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
