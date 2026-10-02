"use client";

import React, { useState } from "react";
import Logo from "@/components/Logo";

const BUILDERS = [
  {
    id: '01',
    name: 'AARAV',
    role: 'Frontend Developer',
    skills: 'React · TypeScript · Next.js',
    covers: ['Frontend', 'UI/UX'],
    needs: ['Backend'],
    footer: 'Builds polished interfaces fast when the clock matters.'
  },
  {
    id: '02',
    name: 'PRIYA',
    role: 'Backend Developer',
    skills: 'Node.js · PostgreSQL · REST APIs',
    covers: ['Backend'],
    needs: ['UI/UX'],
    footer: 'Builds reliable systems that survive the demo.'
  },
  {
    id: '03',
    name: 'KARAN',
    role: 'AI/ML Engineer',
    skills: 'Python · PyTorch · LLMs',
    covers: ['AI/ML', 'Data'],
    needs: ['Cloud/DevOps'],
    footer: 'Turns complex problems into working AI prototypes.'
  },
  {
    id: '04',
    name: 'MEERA',
    role: 'UI/UX Designer',
    skills: 'Figma · User Research · Prototyping',
    covers: ['UI/UX', 'Product'],
    needs: ['Backend'],
    footer: 'Makes products intuitive before anyone writes code.'
  },
  {
    id: '05',
    name: 'ROHAN',
    role: 'Product Strategist',
    skills: 'Research · Roadmapping · Pitching',
    covers: ['Product', 'Growth'],
    needs: ['Frontend'],
    footer: 'Keeps the team focused on the problem that matters.'
  },
  {
    id: '06',
    name: 'ANANYA',
    role: 'DevOps Engineer',
    skills: 'Docker · AWS · CI/CD',
    covers: ['Cloud/DevOps', 'Backend'],
    needs: ['Product'],
    footer: 'Gets the project deployed when everyone else says “works locally.”'
  },
  {
    id: '07',
    name: 'VIKRAM',
    role: 'Mobile Developer',
    skills: 'Flutter · Firebase · REST',
    covers: ['Mobile', 'Frontend'],
    needs: ['UI/UX'],
    footer: 'Turns ideas into a usable mobile MVP quickly.'
  },
  {
    id: '08',
    name: 'ISHA',
    role: 'Full-Stack Developer',
    skills: 'Next.js · Node.js · PostgreSQL',
    covers: ['Frontend', 'Backend'],
    needs: ['Product'],
    footer: 'Bridges the gap between interface and infrastructure.'
  },
  {
    id: '09',
    name: 'NEEL',
    role: 'Data Engineer',
    skills: 'Python · SQL · Pandas',
    covers: ['Data'],
    needs: ['Frontend'],
    footer: 'Turns raw data into something the team can actually use.'
  },
  {
    id: '10',
    name: 'SANA',
    role: 'Security Engineer',
    skills: 'Auth · OWASP · Privacy',
    covers: ['Security', 'Backend'],
    needs: ['Product'],
    footer: 'Spots the problem everyone else notices after launch.'
  },
  {
    id: '11',
    name: 'KABIR',
    role: 'IoT Engineer',
    skills: 'ESP32 · Sensors · MQTT',
    covers: ['IoT', 'Data'],
    needs: ['Backend'],
    footer: 'Makes software interact with the physical world.'
  },
  {
    id: '12',
    name: 'ZOYA',
    role: 'Growth & Community',
    skills: 'Storytelling · Community · Partnerships',
    covers: ['Growth', 'Product'],
    needs: ['Frontend'],
    footer: 'Turns a working project into something people want to use.'
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

export default function BuilderDeckPrintPage() {
  const [showGuides, setShowGuides] = useState(true);
  const [mode, setMode] = useState<'FRONTS' | 'BACKS'>('FRONTS');

  // Chunk builders into pages of 4
  const pages = [];
  for (let i = 0; i < BUILDERS.length; i += 4) {
    pages.push(BUILDERS.slice(i, i + 4));
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
        <h1 className="text-xl font-bold tracking-widest uppercase text-gray-800">BUILDER DECK — {mode}</h1>
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
        {pages.map((pageBuilders, pageIndex) => (
          <div key={pageIndex} className="print-sheet bg-white text-black shadow-xl box-border relative flex flex-col items-center justify-center"
               style={{ width: '210mm', height: '297mm' }}>

            <div className="grid grid-cols-2 gap-[10mm]">
              {pageBuilders.map((builder, i) => (
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
                            <div className="font-bold text-gray-900">BUILDER</div>
                            <div className="text-gray-500">{builder.id} / 12</div>
                          </div>
                        </div>

                        {/* MIDDLE CONTENT */}
                        <div className="flex-1 flex flex-col justify-center -mt-4">
                          <h3 style={{ fontFamily: 'var(--font-display-face)', fontSize: '24pt', lineHeight: '1' }} className="font-semibold text-[#0F0F0E] tracking-tight mb-2">
                            {builder.name}
                          </h3>

                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="w-1 h-[11pt] bg-[#B4F461]" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} />
                            <div style={{ fontSize: '11pt', fontFamily: 'var(--font-ui)' }} className="font-semibold text-[#161615] leading-none">
                              {builder.role}
                            </div>
                          </div>

                          <div style={{ fontSize: '9pt', fontFamily: 'var(--font-ui)' }} className="text-gray-700 font-medium leading-tight">
                            {builder.skills}
                          </div>

                          <div className="w-full border-t-[0.5pt] border-gray-300 mt-6 mb-5" />

                          {/* TWO COLUMNS */}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="uppercase text-gray-600 font-medium mb-1.5" style={{ fontFamily: 'var(--font-code)', fontSize: '8.5pt' }}>COVERS</div>
                              <div className="font-semibold text-[#161615] leading-snug" style={{ fontFamily: 'var(--font-ui)', fontSize: '12pt' }}>
                                {builder.covers.map((c, idx) => (
                                  <React.Fragment key={idx}>
                                    {c}
                                    {idx < builder.covers.length - 1 && <br/>}
                                  </React.Fragment>
                                ))}
                              </div>
                            </div>
                            <div>
                              <div className="uppercase text-gray-600 font-medium mb-1.5" style={{ fontFamily: 'var(--font-code)', fontSize: '8.5pt' }}>NEEDS</div>
                              <div className="font-semibold text-[#161615] leading-snug" style={{ fontFamily: 'var(--font-ui)', fontSize: '12pt' }}>
                                {builder.needs.map((c, idx) => (
                                  <React.Fragment key={idx}>
                                    {c}
                                    {idx < builder.needs.length - 1 && <br/>}
                                  </React.Fragment>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* FOOTER */}
                        <div style={{ fontSize: '8.5pt', fontFamily: 'var(--font-ui)' }} className="text-[#737069] leading-tight">
                          {builder.footer}
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
                          BUILDER
                        </div>

                        <div className="text-[#F2F0EA] font-semibold tracking-wide text-center" style={{ fontFamily: 'var(--font-ui)', fontSize: '9pt' }}>
                          FIND THE TEAMMATE YOU<span className="text-[#B4F461]">&apos;</span>RE MISSING.
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
