"use client";

import React, { useState } from "react";
import Logo from "@/components/Logo";

const Guides = () => (
  <>
    {/* Page Safe Area (10mm) */}
    <div className="guide-line absolute border-[0.5pt] border-dotted border-blue-500 z-50 pointer-events-none"
         style={{ top: '10mm', left: '10mm', right: '10mm', bottom: '10mm' }} />
  </>
);

const ChallengeSlot = ({ showGuides }: { showGuides: boolean }) => (
  <div className="relative flex flex-col items-center justify-center border border-dashed border-gray-400 bg-white/40"
       style={{ width: '74mm', height: '104mm' }}>

    {/* Cyan accent */}
    <div className="absolute top-0 left-0 right-0 h-[2mm] bg-[#42f5dd]" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} />

    {/* Center label */}
    <div className="text-center">
      <div className="uppercase tracking-widest text-[#737069] font-medium" style={{ fontFamily: 'var(--font-code)', fontSize: '9pt' }}>
        PLACE
      </div>
      <div className="uppercase tracking-widest text-[#737069] font-medium mt-1" style={{ fontFamily: 'var(--font-code)', fontSize: '9pt' }}>
        CHALLENGE
      </div>
      <div className="uppercase tracking-widest text-[#737069] font-medium mt-1" style={{ fontFamily: 'var(--font-code)', fontSize: '9pt' }}>
        HERE
      </div>
    </div>

    {/* Actual card footprint guide (70x100mm) centered inside */}
    {showGuides && (
      <div className="guide-line absolute border-[0.5pt] border-solid border-red-400 pointer-events-none"
           style={{ width: '70mm', height: '100mm' }} />
    )}
  </div>
);

const BuilderSlot = ({ num, showGuides }: { num: string, showGuides: boolean }) => (
  <div className="relative flex flex-col items-center justify-center border border-dashed border-gray-400 bg-white/40"
       style={{ width: '74mm', height: '104mm' }}>

    {/* Lime accent */}
    <div className="absolute top-0 left-0 right-0 h-[2mm] bg-[#B4F461]" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} />

    {/* Center label */}
    <div className="text-center">
      <div className="uppercase tracking-widest text-[#737069] font-medium" style={{ fontFamily: 'var(--font-code)', fontSize: '9pt' }}>
        BUILDER
      </div>
      <div className="mt-2 text-gray-300 font-medium" style={{ fontFamily: 'var(--font-code)', fontSize: '24pt' }}>
        {num}
      </div>
    </div>

    {/* Actual card footprint guide (70x100mm) centered inside */}
    {showGuides && (
      <div className="guide-line absolute border-[0.5pt] border-solid border-red-400 pointer-events-none"
           style={{ width: '70mm', height: '100mm' }} />
    )}
  </div>
);

export default function TeamMatPrintPage() {
  const [showGuides, setShowGuides] = useState(true);

  return (
    <div className="min-h-screen bg-neutral-200 py-8 flex flex-col items-center print:py-0 print:bg-transparent screen-only-container">
      <style dangerouslySetInnerHTML={{__html: `
        @page {
          size: A3 landscape;
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
            width: 420mm !important;
            height: 297mm !important;
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
        <h1 className="text-xl font-bold tracking-widest uppercase text-gray-800">TEAM MAT</h1>
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
           style={{ width: '420mm', height: '297mm', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>

        {showGuides && <Guides />}

        {/* Content Container with 10mm padding */}
        <div className="flex-1 flex flex-col" style={{ padding: '12mm' }}>

          {/* HEADER */}
          <div className="flex justify-between items-start">
            <div className="flex gap-6 items-start">
              <Logo className="w-[45mm] h-auto text-[#0F0F0E]" />
              <div className="mt-1">
                <h1 style={{ fontFamily: 'var(--font-display-face)', fontSize: '26pt', lineHeight: '1' }} className="font-bold tracking-tight mb-2">
                  30 SECOND TEAM CHALLENGE
                </h1>
                <p style={{ fontFamily: 'var(--font-ui)', fontSize: '13pt' }} className="text-[#737069] font-medium">
                  Draw one challenge. Pick exactly four builders.
                </p>
              </div>
            </div>
            <div className="bg-[#161615] text-[#F2F0EA] px-3 py-1.5 rounded-sm font-semibold tracking-widest uppercase" style={{ fontFamily: 'var(--font-code)', fontSize: '11pt', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
              30 SEC
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center -mt-4">
            {/* CHALLENGE AREA */}
            <div className="flex flex-col items-center mb-10">
              <div className="uppercase tracking-widest text-[#737069] font-semibold mb-3" style={{ fontFamily: 'var(--font-code)', fontSize: '10pt' }}>
                YOUR CHALLENGE
              </div>
              <ChallengeSlot showGuides={showGuides} />
            </div>

            {/* BUILDER AREA */}
            <div className="flex flex-col items-center w-full">
              <div className="flex flex-col items-center mb-3">
                <div className="uppercase tracking-widest text-[#737069] font-semibold mb-1" style={{ fontFamily: 'var(--font-code)', fontSize: '10pt' }}>
                  BUILD YOUR TEAM
                </div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '10pt' }} className="text-[#737069]">
                  Pick exactly 4 builders.
                </div>
              </div>

              <div className="flex justify-center" style={{ gap: '10mm' }}>
                <BuilderSlot num="01" showGuides={showGuides} />
                <BuilderSlot num="02" showGuides={showGuides} />
                <BuilderSlot num="03" showGuides={showGuides} />
                <BuilderSlot num="04" showGuides={showGuides} />
              </div>
            </div>
          </div>

          {/* FOOTER */}
          <div className="flex flex-col items-center text-center mt-auto pt-6 border-t-[0.5pt] border-gray-300">
            <div style={{ fontFamily: 'var(--font-display-face)', fontSize: '16pt' }} className="font-semibold text-[#0F0F0E] tracking-tight mb-1">
              LOCKED IN? <span className="text-[#737069]">→</span> TAKE YOUR TEAM TO THE JUDGE
            </div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '11pt' }} className="text-[#737069]">
              Your team will be scored out of 100.
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
