'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Logo from '@/components/Logo';

export default function FlyerPage() {
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
    <div className="min-h-screen bg-neutral-600 print:bg-transparent overflow-x-auto flex flex-col items-center py-8 print:py-0">

      {/* SCREEN-ONLY CONTROLS */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-50 print:hidden bg-black/90 p-2 rounded-full shadow-2xl backdrop-blur-md">
        <button
          onClick={() => {
            const el = document.getElementById('front-page');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          className="px-4 py-2 text-xs font-mono text-white hover:bg-white/10 rounded-full transition-colors"
        >
          FRONT
        </button>
        <button
          onClick={() => {
            const el = document.getElementById('back-page');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          className="px-4 py-2 text-xs font-mono text-white hover:bg-white/10 rounded-full transition-colors"
        >
          BACK
        </button>
        <div className="w-px h-4 bg-white/20 mx-1" />
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
            size: 148mm 210mm portrait;
            margin: 0;
          }
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
            background: #F2F0EA !important;
          }
        }
      `}} />

      <div className="flex flex-col gap-12 print:gap-0 print:block">

        {/* FRONT PAGE */}
        <div
          id="front-page"
          className="relative bg-[#F2F0EA] shadow-2xl print:shadow-none print:break-after-page overflow-hidden"
          style={{ width: '148mm', height: '210mm' }}
        >
          {/* SAFE AREA GUIDE */}
          {showGuides && (
            <div
              className="absolute pointer-events-none border border-red-500/30 print:hidden z-50"
              style={{
                top: '12mm',
                left: '12mm',
                right: '12mm',
                bottom: '12mm',
              }}
            />
          )}

          {/* FRONT BACKGROUND SYSTEM */}
          <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
            <svg viewBox="0 0 148 210" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="front-grid" width="10" height="10" patternUnits="userSpaceOnUse">
                  <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#0F0F0E" strokeWidth="0.15" opacity="0.05" />
                </pattern>
                <pattern id="front-dots" width="3" height="3" patternUnits="userSpaceOnUse">
                  <circle cx="1.5" cy="1.5" r="0.3" fill="#0F0F0E" opacity="0.08" />
                </pattern>
              </defs>

              {/* Base grid selectively used to frame the content without interfering */}
              <rect x="98" y="0" width="50" height="210" fill="url(#front-grid)" />
              <rect x="0" y="130" width="148" height="80" fill="url(#front-grid)" />

              {/* Dot grid region in lower left empty space */}
              <rect x="15" y="160" width="24" height="24" fill="url(#front-dots)" />

              {/* Ghosted brand geometry (Abstract cursor fragment from logo) */}
              <g transform="translate(95, -25) scale(5.5)" opacity="0.04" fill="none" stroke="#0F0F0E" strokeWidth="0.1">
                <path d="M12.98 25.04l8.36-16.74a1.5 1.5 0 00-1.84-1.95L2.34 11.23a1.5 1.5 0 00-.08 2.82l6.24 2.12 2.12 6.24a1.5 1.5 0 002.36.63z" />
              </g>

              {/* Corner registration marks */}
              <g stroke="#0F0F0E" strokeWidth="0.3" opacity="0.3">
                <polyline points="10,5 5,5 5,10" fill="none" />
                <polyline points="138,5 143,5 143,10" fill="none" />
                <polyline points="10,205 5,205 5,200" fill="none" />
                <polyline points="138,205 143,205 143,200" fill="none" />
                <circle cx="5" cy="5" r="0.5" fill="#0F0F0E" />
                <circle cx="143" cy="5" r="0.5" fill="#0F0F0E" />
                <circle cx="5" cy="205" r="0.5" fill="#0F0F0E" />
                <circle cx="143" cy="205" r="0.5" fill="#0F0F0E" />
              </g>

              {/* Accent marks (Lime and Cyan) */}
              <line x1="148" y1="40" x2="142" y2="40" stroke="#B4F461" strokeWidth="0.6" />
              <line x1="148" y1="42" x2="145" y2="42" stroke="#22d3ee" strokeWidth="0.3" />
              <line x1="0" y1="185" x2="8" y2="185" stroke="#B4F461" strokeWidth="0.6" />
              <line x1="0" y1="183" x2="4" y2="183" stroke="#22d3ee" strokeWidth="0.3" />

            </svg>
          </div>

          {/* FRONT CONTENT */}
          <div className="absolute inset-0 p-[12mm] flex flex-col justify-between z-10">
            {/* Header section */}
            <div className="flex flex-col">
              <div className="mb-6">
                <Logo />
              </div>

              <h1
                style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.02em', lineHeight: '1.05' }}
                className="text-3xl text-[#0F0F0E] font-bold mb-4 uppercase"
              >
                Your hackathon team<br/>
                shouldn't start<br/>
                in a WhatsApp group.
              </h1>

              <div
                style={{ fontFamily: 'var(--font-ui)', fontSize: '11pt' }}
                className="text-[#161615] flex flex-col gap-1.5 font-medium"
              >
                <p>Find builders by skill.</p>
                <p>Review who actually builds.</p>
                <p>Form the right team.</p>
                <p>Ship together.</p>
              </div>
            </div>

            {/* Product Screenshot Panel */}
            <div className="flex-1 my-4 flex flex-col items-center justify-center">
              <div className="flex flex-col w-[115mm]">
                <p
                  style={{ fontFamily: 'var(--font-mono)' }}
                  className="text-[8pt] text-[#737069] tracking-wider uppercase mb-1"
                >
                  DISCOVER BUILDERS
                </p>
                <div
                  className="relative w-full overflow-hidden bg-white"
                  style={{
                    height: '41mm',
                    borderRadius: '2.5mm',
                    border: '0.5pt solid rgba(15, 15, 14, 0.15)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                  }}
                >
                  <Image
                    src="/expo/builders-discover-flyer.png"
                    alt="HackerMate Builders Discover UI"
                    fill
                    className="object-cover object-left-top"
                  />
                </div>
                <p
                  style={{ fontFamily: 'var(--font-ui)' }}
                  className="text-[9pt] text-[#737069] mt-2 font-medium"
                >
                  Find people who complement what your team is missing.
                </p>
              </div>
            </div>

            {/* Footer section */}
            <div className="flex items-end justify-between pt-2">
              <div className="flex flex-col">
                <p
                  style={{ fontFamily: 'var(--font-display)', fontSize: '14pt', letterSpacing: '-0.02em' }}
                  className="text-[#0F0F0E] font-bold mb-1"
                >
                  Find your next<br/>hackathon team.
                </p>
                <p
                  style={{ fontFamily: 'var(--font-mono)' }}
                  className="text-[9pt] text-[#737069]"
                >
                  hackermate.in
                </p>
              </div>

              <div className="bg-white p-1.5 rounded-md shadow-sm shrink-0 relative z-20" style={{ width: '32mm', height: '32mm' }}>
                <Image
                  src="/expo/hackermate-qr.svg"
                  alt="QR Code to hackermate.in"
                  width={150}
                  height={150}
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

          </div>
        </div>


        {/* BACK PAGE */}
        <div
          id="back-page"
          className="relative bg-[#F2F0EA] shadow-2xl print:shadow-none overflow-hidden"
          style={{ width: '148mm', height: '210mm' }}
        >
          {/* SAFE AREA GUIDE */}
          {showGuides && (
            <div
              className="absolute pointer-events-none border border-red-500/30 print:hidden z-50"
              style={{
                top: '12mm',
                left: '12mm',
                right: '12mm',
                bottom: '12mm',
              }}
            />
          )}

          {/* BACK BACKGROUND SYSTEM */}
          <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
            <svg viewBox="0 0 148 210" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="back-grid" width="10" height="10" patternUnits="userSpaceOnUse">
                  <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#0F0F0E" strokeWidth="0.15" opacity="0.05" />
                </pattern>
                <pattern id="back-dots" width="3" height="3" patternUnits="userSpaceOnUse">
                  <circle cx="1.5" cy="1.5" r="0.3" fill="#0F0F0E" opacity="0.06" />
                </pattern>
              </defs>

              {/* Vertical flow lines behind timeline */}
              <rect x="0" y="0" width="45" height="210" fill="url(#back-grid)" />
              <rect x="120" y="0" width="28" height="210" fill="url(#back-grid)" />

              {/* Dot blocks for editorial feel */}
              <rect x="125" y="20" width="15" height="60" fill="url(#back-dots)" />
              <rect x="125" y="140" width="15" height="45" fill="url(#back-dots)" />

              {/* Corner registration marks */}
              <g stroke="#0F0F0E" strokeWidth="0.3" opacity="0.3">
                <polyline points="10,5 5,5 5,10" fill="none" />
                <polyline points="138,5 143,5 143,10" fill="none" />
                <polyline points="10,205 5,205 5,200" fill="none" />
                <polyline points="138,205 143,205 143,200" fill="none" />
                <circle cx="5" cy="5" r="0.5" fill="#0F0F0E" />
                <circle cx="143" cy="5" r="0.5" fill="#0F0F0E" />
                <circle cx="5" cy="205" r="0.5" fill="#0F0F0E" />
                <circle cx="143" cy="205" r="0.5" fill="#0F0F0E" />
              </g>

              {/* Accent ticks */}
              <line x1="0" y1="50" x2="6" y2="50" stroke="#22d3ee" strokeWidth="0.3" />
              <line x1="0" y1="90" x2="10" y2="90" stroke="#B4F461" strokeWidth="0.6" />
              <line x1="148" y1="160" x2="142" y2="160" stroke="#B4F461" strokeWidth="0.6" />
              <line x1="148" y1="162" x2="144" y2="162" stroke="#22d3ee" strokeWidth="0.3" />
            </svg>
          </div>

          {/* BACK CONTENT */}
          <div className="absolute inset-0 p-[12mm] flex flex-col z-10">

            {/* Back Header */}
            <h2
              style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.03em', lineHeight: '1.05' }}
              className="text-4xl text-[#0F0F0E] font-bold uppercase mb-10 pt-4"
            >
              From &ldquo;I need<br/>a team&rdquo; to<br/>&ldquo;We shipped.&rdquo;
            </h2>

            {/* Workflow List */}
            <div className="flex flex-col flex-1 gap-5">

              <WorkflowStep
                num="01"
                title="FIND"
                desc="Discover builders by skills, role, and fit."
              />
              <WorkflowStep
                num="02"
                title="REVIEW"
                desc="See who they are, what they build, and what they bring."
              />
              <WorkflowStep
                num="03"
                title="MERGE"
                desc="Form a complementary team instead of guessing."
              />
              <WorkflowStep
                num="04"
                title="BUILD"
                desc="Coordinate and work together in one place."
                accent
              />
              <WorkflowStep
                num="05"
                title="SHIP"
                desc="Turn the team into something real."
                last
              />

            </div>

            {/* Back Footer */}
            <div className="mt-8 border-t border-[#0F0F0E]/10 pt-4 flex justify-between items-end">
              <p
                style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}
                className="text-[#161615] font-bold uppercase text-lg"
              >
                Built for builders.
              </p>
              <p
                style={{ fontFamily: 'var(--font-mono)' }}
                className="text-[9pt] text-[#737069]"
              >
                hackermate.in
              </p>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}

function WorkflowStep({ num, title, desc, accent, last }: { num: string, title: string, desc: string, accent?: boolean, last?: boolean }) {
  return (
    <div className="relative pl-[24px]">
      {/* Timeline line */}
      {!last && (
        <div className="absolute left-[3px] top-[18px] bottom-[-28px] w-px bg-[#0F0F0E]/15" />
      )}

      {/* Timeline dot */}
      <div className={`absolute left-0 top-[6px] w-[7px] h-[7px] rounded-full border border-[#0F0F0E] ${accent ? 'bg-[#B4F461]' : 'bg-[#F2F0EA]'}`} />

      {/* Content */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-3">
          <span style={{ fontFamily: 'var(--font-mono)' }} className="text-[9pt] text-[#737069]">
            {num}
          </span>
          <h3 style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }} className="text-[#0F0F0E] font-bold text-lg uppercase tracking-tight">
            {title}
          </h3>
        </div>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: '11pt' }} className="text-[#161615] font-medium leading-snug pr-4">
          {desc}
        </p>
      </div>
    </div>
  );
}
