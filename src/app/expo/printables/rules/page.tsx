"use client";

import React, { useState } from "react";
import Logo from "@/components/Logo";

const Guides = () => (
  <>
    {/* Page Safe Area (15mm) */}
    <div className="guide-line absolute border-[0.5pt] border-dotted border-blue-500 z-50 pointer-events-none"
         style={{ top: '15mm', left: '15mm', right: '15mm', bottom: '15mm' }} />
  </>
);

export default function RulesBoardPrintPage() {
  const [showGuides, setShowGuides] = useState(true);

  return (
    <div className="min-h-screen bg-neutral-200 py-8 flex flex-col items-center print:py-0 print:bg-transparent screen-only-container">
      <style dangerouslySetInnerHTML={{__html: `
        @page {
          size: A3 portrait;
          margin: 0;
        }
        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          .screen-only-container {
            padding: 0 !important;
            background: white !important;
          }
          .no-print {
            display: none !important;
          }
          .print-sheet {
            width: 297mm !important;
            height: 420mm !important;
            margin: 0 !important;
            padding: 0 !important;
            box-sizing: border-box !important;
            page-break-after: always !important;
            break-after: page !important;
            box-shadow: none !important;
            justify-content: center !important;
            align-items: center !important;
          }
          .guide-line {
            display: none !important;
          }
        }
      `}} />

      <div className="no-print flex flex-col items-center gap-4 mb-8">
        <h1 className="text-xl font-bold tracking-widest uppercase text-gray-800">RULES BOARD</h1>
        <div className="flex gap-4">
          <button
            onClick={() => setShowGuides(!showGuides)}
            className="bg-white border border-gray-300 text-black px-4 py-2 rounded text-sm hover:bg-gray-50 transition-colors"
          >
            {showGuides ? "Hide Guides" : "Show Guides"}
          </button>
          <button
            onClick={() => window.print()}
            className="bg-black text-white px-4 py-2 rounded text-sm hover:bg-neutral-800 transition-colors"
          >
            Print / Save PDF
          </button>
        </div>
      </div>

      <div className="print-sheet bg-[#F2F0EA] text-[#0F0F0E] shadow-xl box-border relative flex flex-col"
           style={{ width: '297mm', height: '420mm', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>

        {showGuides && <Guides />}

        {/* Content Container with 15mm padding */}
        <div className="flex-1 flex flex-col" style={{ padding: '15mm' }}>

          {/* HEADER */}
          <div className="flex flex-col items-center text-center mb-12">
            <div className="uppercase tracking-widest text-[#737069] mb-8 font-semibold" style={{ fontFamily: 'var(--font-code)', fontSize: '11pt' }}>
              30 SECOND TEAM CHALLENGE
            </div>
            <Logo className="w-[50mm] h-auto text-[#0F0F0E] mb-6" />
            <h1 style={{ fontFamily: 'var(--font-display-face)', fontSize: '42pt', lineHeight: '1' }} className="font-bold tracking-tight mb-4 uppercase">
              Build the Perfect Team
            </h1>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: '20pt' }} className="text-[#161615] font-medium">
              Can you do it in 30 seconds?
            </p>
          </div>

          {/* RULES SECTION */}
          <div className="flex-1 flex flex-col justify-center gap-8 mb-12 max-w-[200mm] mx-auto w-full">

            {/* Rule 01 */}
            <div className="flex items-start gap-6 border-t-[0.5pt] border-gray-300 pt-8">
              <div style={{ fontFamily: 'var(--font-code)', fontSize: '32pt', lineHeight: '0.9' }} className="text-[#737069] font-medium w-16">
                01
              </div>
              <div className="flex-1">
                <h2 style={{ fontFamily: 'var(--font-display-face)', fontSize: '24pt', lineHeight: '1' }} className="font-semibold text-[#0F0F0E] mb-2 uppercase">
                  Draw
                </h2>
                <p style={{ fontFamily: 'var(--font-ui)', fontSize: '15pt' }} className="text-[#161615]">
                  Pick one Challenge Card.
                </p>
              </div>
            </div>

            {/* Rule 02 */}
            <div className="flex items-start gap-6 border-t-[0.5pt] border-gray-300 pt-8">
              <div style={{ fontFamily: 'var(--font-code)', fontSize: '32pt', lineHeight: '0.9' }} className="text-[#737069] font-medium w-16">
                02
              </div>
              <div className="flex-1">
                <h2 style={{ fontFamily: 'var(--font-display-face)', fontSize: '24pt', lineHeight: '1' }} className="font-semibold text-[#0F0F0E] mb-2 uppercase">
                  Think Fast
                </h2>
                <p style={{ fontFamily: 'var(--font-ui)', fontSize: '15pt' }} className="text-[#161615]">
                  You have 30 seconds.
                </p>
              </div>
            </div>

            {/* Rule 03 */}
            <div className="flex items-start gap-6 border-t-[0.5pt] border-gray-300 pt-8">
              <div style={{ fontFamily: 'var(--font-code)', fontSize: '32pt', lineHeight: '0.9' }} className="text-[#737069] font-medium w-16">
                03
              </div>
              <div className="flex-1">
                <h2 style={{ fontFamily: 'var(--font-display-face)', fontSize: '24pt', lineHeight: '1' }} className="font-semibold text-[#0F0F0E] mb-2 uppercase">
                  Build
                </h2>
                <p style={{ fontFamily: 'var(--font-ui)', fontSize: '15pt' }} className="text-[#161615]">
                  Choose exactly 4 Builders who cover the challenge and complement each other.
                </p>
              </div>
            </div>

            {/* Rule 04 */}
            <div className="flex items-start gap-6 border-t-[0.5pt] border-gray-300 pt-8">
              <div style={{ fontFamily: 'var(--font-code)', fontSize: '32pt', lineHeight: '0.9' }} className="text-[#737069] font-medium w-16">
                04
              </div>
              <div className="flex-1">
                <h2 style={{ fontFamily: 'var(--font-display-face)', fontSize: '24pt', lineHeight: '1' }} className="font-semibold text-[#0F0F0E] mb-2 uppercase">
                  Lock It In
                </h2>
                <p style={{ fontFamily: 'var(--font-ui)', fontSize: '15pt' }} className="text-[#161615]">
                  Take your team to the HackerMate judge.
                </p>
              </div>
            </div>

          </div>

          {/* SCORING & WIN CONDITION */}
          <div className="flex gap-12 border-t-[0.5pt] border-gray-300 pt-10">
            {/* Scoring Box */}
            <div className="flex-1 border border-gray-300 p-8 rounded-sm bg-white/40">
              <div className="uppercase tracking-widest text-[#737069] font-semibold mb-6" style={{ fontFamily: 'var(--font-code)', fontSize: '11pt' }}>
                HOW YOU&apos;RE SCORED
              </div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: '14pt' }} className="text-[#161615] flex flex-col gap-3 font-medium">
                <div className="flex justify-between items-center">
                  <span>Challenge Coverage</span>
                  <span style={{ fontFamily: 'var(--font-code)', fontSize: '14pt' }} className="font-semibold">60</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Team Complementarity</span>
                  <span style={{ fontFamily: 'var(--font-code)', fontSize: '14pt' }} className="font-semibold">20</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Bonus Fit</span>
                  <span style={{ fontFamily: 'var(--font-code)', fontSize: '14pt' }} className="font-semibold">20</span>
                </div>

                <div className="border-t-[0.5pt] border-gray-300 my-2"></div>

                <div className="flex justify-between items-center font-bold">
                  <span>TOTAL</span>
                  <span style={{ fontFamily: 'var(--font-code)', fontSize: '15pt' }}>100</span>
                </div>
              </div>
            </div>

            {/* Win Condition Box */}
            <div className="flex-1 flex flex-col justify-center border border-gray-300 p-8 rounded-sm relative overflow-hidden bg-white/40">
              {/* Subtle Cyan/Lime accent tabs */}
              <div className="absolute top-0 right-0 w-full h-[3mm] flex">
                <div className="flex-1 h-full bg-[#42f5dd]" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} />
                <div className="flex-1 h-full bg-[#B4F461]" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} />
              </div>

              <div style={{ fontFamily: 'var(--font-display-face)', fontSize: '38pt', lineHeight: '1' }} className="font-bold text-[#0F0F0E] mb-3">
                90+ = WIN
              </div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: '13pt' }} className="text-[#161615] leading-snug font-medium mb-1">
                Highest score leads the leaderboard.
              </div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: '13pt' }} className="text-[#737069] leading-snug font-medium">
                Ties are broken by fastest time.
              </div>
            </div>
          </div>

          {/* FOOTER */}
          <div className="flex justify-center items-center mt-auto pt-10">
            <div className="uppercase tracking-widest text-[#737069] font-medium flex gap-4 items-center" style={{ fontFamily: 'var(--font-code)', fontSize: '12pt' }}>
              <span>DRAW</span>
              <span>→</span>
              <span>BUILD</span>
              <span>→</span>
              <span>LOCK IN</span>
              <span>→</span>
              <span>SCORE</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
