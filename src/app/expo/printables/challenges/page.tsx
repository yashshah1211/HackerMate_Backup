"use client";

import React, { useState } from "react";
import Logo from "@/components/Logo";

const CHALLENGES = [
  {
    id: '01',
    title: 'AI STUDY\nBUDDY',
    prompt: 'Build a study companion that helps college students understand difficult material and stay on track.',
    mustCover: ['AI/ML', 'Backend', 'UI/UX', 'Product'],
    bonus: ['Frontend', 'Data']
  },
  {
    id: '02',
    title: 'ZERO-WASTE\nCAMPUS',
    prompt: 'Reduce food waste across college canteens using technology.',
    mustCover: ['Mobile', 'Backend', 'Data', 'Product'],
    bonus: ['UI/UX', 'Growth']
  },
  {
    id: '03',
    title: 'EMERGENCY\nRESPONSE\nNETWORK',
    prompt: 'Help students and campus staff coordinate quickly during emergencies.',
    mustCover: ['Mobile', 'Backend', 'Cloud/DevOps', 'Product'],
    bonus: ['Security', 'Data']
  },
  {
    id: '04',
    title: 'MENTAL\nWELLNESS\nCOMPANION',
    prompt: 'Create a private, approachable digital companion for student wellbeing.',
    mustCover: ['UI/UX', 'Product', 'Backend', 'Security'],
    bonus: ['AI/ML', 'Mobile']
  },
  {
    id: '05',
    title: 'SMART ENERGY\nCAMPUS',
    prompt: 'Use sensors and software to reduce unnecessary energy consumption on campus.',
    mustCover: ['IoT', 'Backend', 'Data', 'Cloud/DevOps'],
    bonus: ['Frontend', 'Product']
  },
  {
    id: '06',
    title: 'CYBER SAFETY\nCOACH',
    prompt: 'Help non-technical users recognize scams, unsafe links and risky online behaviour.',
    mustCover: ['Security', 'Backend', 'Frontend', 'Product'],
    bonus: ['AI/ML', 'UI/UX']
  },
  {
    id: '07',
    title: 'LOCAL BUSINESS\nGROWTH OS',
    prompt: 'Help small local businesses manage customers and grow digitally.',
    mustCover: ['Frontend', 'Backend', 'Product', 'Growth'],
    bonus: ['Data', 'UI/UX']
  },
  {
    id: '08',
    title: 'ACCESSIBLE\nCAMPUS\nNAVIGATOR',
    prompt: 'Help students navigate campus more easily, including accessibility-aware routes.',
    mustCover: ['Mobile', 'UI/UX', 'Backend', 'Data'],
    bonus: ['Product', 'Security']
  }
];

const CropMarks = () => (
  <>
    {/* Top-Left */}
    <div className="absolute bg-black pointer-events-none" style={{ width: '5mm', height: '0.5pt', top: '3mm', right: '100%', marginRight: '2mm', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} />
    <div className="absolute bg-black pointer-events-none" style={{ width: '0.5pt', height: '5mm', left: '3mm', bottom: '100%', marginBottom: '2mm', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} />

    {/* Top-Right */}
    <div className="absolute bg-black pointer-events-none" style={{ width: '5mm', height: '0.5pt', top: '3mm', left: '100%', marginLeft: '2mm', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} />
    <div className="absolute bg-black pointer-events-none" style={{ width: '0.5pt', height: '5mm', right: '3mm', bottom: '100%', marginBottom: '2mm', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} />

    {/* Bottom-Left */}
    <div className="absolute bg-black pointer-events-none" style={{ width: '5mm', height: '0.5pt', bottom: '3mm', right: '100%', marginRight: '2mm', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} />
    <div className="absolute bg-black pointer-events-none" style={{ width: '0.5pt', height: '5mm', left: '3mm', top: '100%', marginTop: '2mm', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} />

    {/* Bottom-Right */}
    <div className="absolute bg-black pointer-events-none" style={{ width: '5mm', height: '0.5pt', bottom: '3mm', left: '100%', marginLeft: '2mm', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} />
    <div className="absolute bg-black pointer-events-none" style={{ width: '0.5pt', height: '5mm', right: '3mm', top: '100%', marginTop: '2mm', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} />
  </>
);

const Guides = () => (
  <>
    {/* Trim Line */}
    <div className="guide-line absolute border-[0.5pt] border-dashed border-red-500 z-50 pointer-events-none"
         style={{ top: '3mm', left: '3mm', right: '3mm', bottom: '3mm' }} />
    {/* Safe Area Line */}
    <div className="guide-line absolute border-[0.5pt] border-dotted border-blue-500 z-50 pointer-events-none"
         style={{ top: '8mm', left: '8mm', right: '8mm', bottom: '8mm' }} />
  </>
);

export default function ChallengeDeckPrintPage() {
  const [showGuides, setShowGuides] = useState(true);
  const [mode, setMode] = useState<'FRONTS' | 'BACKS'>('FRONTS');

  // Chunk challenges into pages of 4
  const pages = [];
  for (let i = 0; i < CHALLENGES.length; i += 4) {
    pages.push(CHALLENGES.slice(i, i + 4));
  }

  return (
    <div className="min-h-screen bg-neutral-200 py-8 flex flex-col items-center print:py-0 print:bg-transparent screen-only-container">
      <style dangerouslySetInnerHTML={{__html: `
        @page {
          size: A4 portrait;
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
            width: 210mm !important;
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
        <h1 className="text-xl font-bold tracking-widest uppercase text-gray-800">CHALLENGE DECK — {mode}</h1>
        <div className="flex gap-4">
          <button
            onClick={() => setMode('FRONTS')}
            className={"px-4 py-2 rounded text-sm font-semibold transition-colors " + (mode === 'FRONTS' ? 'bg-black text-white' : 'bg-white border border-gray-300 text-black hover:bg-gray-50')}
          >
            FRONTS
          </button>
          <button
            onClick={() => setMode('BACKS')}
            className={"px-4 py-2 rounded text-sm font-semibold transition-colors " + (mode === 'BACKS' ? 'bg-black text-white' : 'bg-white border border-gray-300 text-black hover:bg-gray-50')}
          >
            BACKS
          </button>
        </div>
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

      <div className="flex flex-col gap-8 print:gap-0">
        {pages.map((pageChallenges, pageIndex) => (
          <div key={pageIndex} className="print-sheet bg-white text-black shadow-xl box-border relative flex flex-col items-center justify-center"
               style={{ width: '210mm', height: '297mm' }}>

            <div className="grid grid-cols-2 gap-[10mm]">
              {pageChallenges.map((challenge, i) => (
                <div key={i} className="flex flex-col items-center">
                  {mode === 'FRONTS' ? (
                    <div
                      className="relative bg-[#F2F0EA]"
                      style={{ width: '76mm', height: '106mm', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
                    >
                      <CropMarks />
                      {showGuides && <Guides />}

                      <div className="absolute inset-0 flex flex-col justify-between" style={{ padding: '8mm' }}>

                        {/* HEADER */}
                        <div className="flex justify-between items-start">
                          <Logo className="w-[20mm] h-auto" />
                          <div className="text-right uppercase leading-tight" style={{ fontFamily: 'var(--font-code)', fontSize: '8pt' }}>
                            <div className="font-bold text-gray-900">CHALLENGE</div>
                            <div className="text-gray-500">{challenge.id} / 08</div>
                          </div>
                        </div>

                        {/* MIDDLE CONTENT */}
                        <div className="flex-1 flex flex-col justify-center -mt-2">
                          <div className="flex items-start gap-2 mb-2">
                            <div className="w-1.5 h-[18pt] bg-[#42f5dd] mt-1 shrink-0" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} />
                            <h3 style={{ fontFamily: 'var(--font-display-face)', fontSize: '19pt', lineHeight: '1' }} className="font-semibold text-[#0F0F0E] tracking-tight">
                              {challenge.title.split('\\n').map((line, idx) => (
                                <React.Fragment key={idx}>
                                  {line}
                                  {idx < challenge.title.split('\\n').length - 1 && <br/>}
                                </React.Fragment>
                              ))}
                            </h3>
                          </div>

                          <div style={{ fontSize: '9pt', fontFamily: 'var(--font-ui)' }} className="text-gray-800 leading-snug pr-2">
                            {challenge.prompt}
                          </div>

                          <div className="w-full border-t-[0.5pt] border-gray-300 mt-5 mb-4" />

                          {/* CAPABILITIES */}
                          <div className="flex flex-col gap-3">
                            <div>
                              <div className="uppercase text-gray-600 font-medium mb-1" style={{ fontFamily: 'var(--font-code)', fontSize: '8pt' }}>MUST COVER</div>
                              <div className="font-semibold text-[#161615] leading-snug" style={{ fontFamily: 'var(--font-ui)', fontSize: '11.5pt' }}>
                                {challenge.mustCover.slice(0, 2).join(' · ')}<br/>
                                {challenge.mustCover.slice(2, 4).join(' · ')}
                              </div>
                            </div>
                            <div>
                              <div className="uppercase text-gray-600 font-medium mb-1" style={{ fontFamily: 'var(--font-code)', fontSize: '8pt' }}>BONUS</div>
                              <div className="font-semibold text-[#161615] leading-snug" style={{ fontFamily: 'var(--font-ui)', fontSize: '10.5pt' }}>
                                {challenge.bonus.join(' · ')}
                              </div>
                            </div>
                          </div>
                        </div>

                      </div>
                    </div>
                  ) : (
                    <div
                      className="relative bg-[#0F0F0E] flex flex-col items-center justify-center"
                      style={{ width: '76mm', height: '106mm', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
                    >
                      <CropMarks />
                      {showGuides && <Guides />}

                      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ padding: '8mm' }}>
                        <Logo className="w-[30mm] h-auto mb-6" />

                        <div className="uppercase tracking-widest text-[#F2F0EA] opacity-60 mb-2" style={{ fontFamily: 'var(--font-code)', fontSize: '8pt' }}>
                          CHALLENGE
                        </div>

                        <div className="text-[#F2F0EA] font-semibold tracking-wide text-center" style={{ fontFamily: 'var(--font-ui)', fontSize: '9pt' }}>
                          BUILD FOR THE PROBLEM<span className="text-[#42f5dd]">.</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

          </div>
        ))}
      </div>
    </div>
  );
}
