"use client";

import React, { useState } from "react";

interface StructuredHackathonDescriptionProps {
  description: string | null | undefined;
  className?: string;
}

interface SubItem {
  title: string;
  text: string;
}

interface DescriptionSection {
  id: string;
  title: string;
  icon: string;
  accentColor: "blue" | "emerald" | "amber" | "violet" | "rose" | "teal" | "indigo" | "zinc";
  contentParagraphs: string[];
  bulletPoints: string[];
  subItems: SubItem[];
}

/**
 * Decodes HTML entities and strips invisible zero-width characters
 */
function cleanHtmlEntities(raw: string): string {
  if (!raw) return "";
  return raw
    // Strip zero-width joiners and spaces (e.g. &zwj;, &#8205;, \u200B)
    .replace(/&zwj;/gi, "")
    .replace(/&zwnj;/gi, "")
    .replace(/&#8205;/g, "")
    .replace(/&#8204;/g, "")
    .replace(/&#8203;/g, "")
    .replace(/&#x200B;/gi, "")
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    // Formatting line breaks
    .replace(/<hr\s*\/?>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|h[1-6])>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]*>/g, "")
    // Entity decoding
    .replace(/&nbsp;/gi, " ")
    .replace(/&AElig;/gi, "Æ")
    .replace(/&aelig;/gi, "æ")
    .replace(/&Oslash;/gi, "Ø")
    .replace(/&oslash;/gi, "ø")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&bull;/gi, "•")
    .replace(/&middot;/gi, "·")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&rdquo;/gi, '"')
    .replace(/&ldquo;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&cent;/gi, "¢")
    .replace(/&pound;/gi, "£")
    .replace(/&yen;/gi, "¥")
    .replace(/&euro;/gi, "€")
    .replace(/^[\-=_*]{3,}$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Trims leading/trailing whitespace and cleans trailing bullet artifacts (e.g. "Rules •")
 */
function cleanLineNoise(str: string): string {
  if (!str) return "";
  return str
    .replace(/[\s•\-*✦●▪◦▸·]+$/, "") // remove trailing bullets/symbols
    .replace(/^[\s\u200B\u200C\u200D\uFEFF]+/, "")
    .trim();
}

const SECTION_CONFIGS: Array<{
  keywords: string[];
  title: string;
  icon: string;
  accentColor: DescriptionSection["accentColor"];
}> = [
  {
    keywords: ["about the event", "about the opportunity", "about the hackathon", "overview", "event overview", "about us", "description"],
    title: "About the Event",
    icon: "🚀",
    accentColor: "blue",
  },
  {
    keywords: ["eligibility & team guidelines", "eligibility & team rules", "eligibility criteria", "eligibility", "who can participate", "prerequisites", "allowed participants"],
    title: "Eligibility & Team Rules",
    icon: "🎓",
    accentColor: "emerald",
  },
  {
    keywords: ["selection criteria", "shortlisting criteria", "evaluation criteria", "judging criteria", "scoring criteria", "scoring"],
    title: "Selection & Evaluation Criteria",
    icon: "⚖️",
    accentColor: "amber",
  },
  {
    keywords: ["competition format", "process & rounds", "event format", "rounds & stages", "rounds", "stages", "duration"],
    title: "Competition Format & Rounds",
    icon: "⚔️",
    accentColor: "violet",
  },
  {
    keywords: ["why participate?", "why participate", "prizes & perks", "prizes and perks", "prizes & rewards", "prizes and rewards", "prizes", "rewards", "prize pool", "certificates & swags", "swags & certificates", "swag & perks", "perks & benefits", "incubation support", "perks"],
    title: "Prizes & Rewards",
    icon: "🏆",
    accentColor: "rose",
  },
  {
    keywords: ["team formation rules", "rules of the hackathon", "rules & guidelines", "rules and guidelines", "general rules", "important rules", "code of conduct", "rules", "guidelines", "terms & conditions"],
    title: "Rules & Guidelines",
    icon: "📋",
    accentColor: "teal",
  },
  {
    keywords: ["tracks & problem statements", "tracks and problem statements", "problem statements", "hackathon format & themes", "tracks & themes", "themes & tracks", "themes", "tracks", "challenges"],
    title: "Tracks & Problem Statements",
    icon: "💡",
    accentColor: "indigo",
  },
  {
    keywords: ["contact & support", "contact us", "contact info", "contact information", "organizer contact", "helpdesk & support", "helpdesk", "queries & support", "queries"],
    title: "Contact & Support",
    icon: "📞",
    accentColor: "zinc",
  },
];

/**
 * Parses a raw string into structured sections with headings, sub-events, and bullet lists
 */
function parseDescription(raw: string): DescriptionSection[] {
  const text = cleanHtmlEntities(raw);
  if (!text) return [];

  // Split into raw non-empty lines
  const rawLines = text
    .split(/\n+/)
    .map((l) => cleanLineNoise(l))
    .filter(Boolean);

  if (rawLines.length === 0) return [];

  // Line-by-line section matching
  type RawSection = {
    title: string;
    icon: string;
    accentColor: DescriptionSection["accentColor"];
    lines: string[];
  };

  const rawSections: RawSection[] = [];
  let currentSec: RawSection = {
    title: "About the Event",
    icon: "🚀",
    accentColor: "blue",
    lines: [],
  };

  for (const line of rawLines) {
    const cleanL = cleanLineNoise(line);
    const lowerLine = cleanL.toLowerCase().replace(/[:\s•\-*]+$/, "");

    // Do NOT treat bullet lines or long body lines (> 60 chars) as Section Headers
    const isBulletLine = /^[•\-*✦●▪◦▸\d+\.]\s*/.test(cleanL);
    const isHeaderCandidate = !isBulletLine && cleanL.length <= 60;

    let matchedConfig: typeof SECTION_CONFIGS[0] | undefined = undefined;

    if (isHeaderCandidate) {
      matchedConfig = SECTION_CONFIGS.find((cfg) =>
        cfg.keywords.some((kw) => {
          if (lowerLine === kw) return true;
          if (lowerLine.startsWith(kw + ":") || lowerLine.startsWith(kw + " ")) return true;
          if (kw.length >= 6 && lowerLine.startsWith(kw)) return true;
          return false;
        })
      );
    }

    if (matchedConfig) {
      if (currentSec.lines.length > 0) {
        rawSections.push(currentSec);
      }
      currentSec = {
        title: matchedConfig.title,
        icon: matchedConfig.icon,
        accentColor: matchedConfig.accentColor,
        lines: [],
      };

      // If the line had text beyond the matched keyword, check if there's trailing body content
      const inlineBody = cleanL.replace(/^(About the Event|About the Opportunity|About the Hackathon|Overview|Eligibility Criteria|Eligibility & Team Guidelines|Eligibility & Team Rules|Eligibility|Selection Criteria|Evaluation Criteria|Competition Format|Process & Rounds|Event Format|Prizes & Perks|Prizes & Rewards|Why Participate\??|Prizes|Rewards|Rules of the Hackathon|Rules & Guidelines|Team Formation Rules|Rules|Code of Conduct|Tracks|Themes|Problem Statements|Contact Us|Contact Info|Organizers|Important Notes|General Guidelines)[\s:]*/gi, "").trim();
      const cleanedInline = cleanLineNoise(inlineBody);
      if (cleanedInline && cleanedInline.length > 5) {
        currentSec.lines.push(cleanedInline);
      }
      continue;
    }

    currentSec.lines.push(line);
  }

  if (currentSec.lines.length > 0) {
    rawSections.push(currentSec);
  }

  // If no sections were identified, wrap all lines in overview
  if (rawSections.length === 0) {
    rawSections.push({
      title: "Event Details & Overview",
      icon: "📌",
      accentColor: "blue",
      lines: rawLines,
    });
  }

  const sections: DescriptionSection[] = [];

  for (let i = 0; i < rawSections.length; i++) {
    const rawSec = rawSections[i];
    const parsed = parseSectionLines(rawSec.lines);

    // Skip section if it contains no actual content after cleaning
    if (parsed.contentParagraphs.length === 0 && parsed.bulletPoints.length === 0 && parsed.subItems.length === 0) {
      continue;
    }

    const existing = sections.find((s) => s.title === rawSec.title);
    if (existing) {
      existing.contentParagraphs.push(...parsed.contentParagraphs);
      existing.bulletPoints.push(...parsed.bulletPoints);
      existing.subItems.push(...parsed.subItems);
    } else {
      sections.push({
        id: `section-${i}`,
        title: rawSec.title,
        icon: rawSec.icon,
        accentColor: rawSec.accentColor,
        ...parsed,
      });
    }
  }

  return sections;
}

/**
 * Splits section lines into paragraphs, bullet items, and key-value sub-items
 */
function parseSectionLines(lines: string[]): {
  contentParagraphs: string[];
  bulletPoints: string[];
  subItems: SubItem[];
} {
  const contentParagraphs: string[] = [];
  const bulletPoints: string[] = [];
  const subItems: SubItem[] = [];

  let currentPara = "";

  for (const rawLine of lines) {
    const cleanLine = cleanLineNoise(rawLine);
    if (!cleanLine) continue;

    // Check if line is a bullet point (starts with •, -, *, ✦, ●, ▪, ◦, ▸, 1., 2., etc.)
    if (/^[•\-*✦●▪◦▸\d+\.]\s*/.test(cleanLine)) {
      const bpText = cleanLineNoise(cleanLine.replace(/^[•\-*✦●▪◦▸\d+\.]+\s*/, ""));
      // Crucial: ONLY push if bullet point text is non-empty after stripping bullet symbols!
      if (bpText.length > 0) {
        if (currentPara) {
          contentParagraphs.push(cleanLineNoise(currentPara));
          currentPara = "";
        }
        bulletPoints.push(bpText);
      }
      continue;
    }

    // Check if line contains a sub-item like "Relay Sprint: Team-based sequential..."
    const subItemMatch = cleanLine.match(/^([A-Z0-9\s\-_]{3,35}):\s*(.+)/i);
    if (subItemMatch && !subItemMatch[1].toLowerCase().includes("http")) {
      if (currentPara) {
        contentParagraphs.push(cleanLineNoise(currentPara));
        currentPara = "";
      }
      subItems.push({
        title: cleanLineNoise(subItemMatch[1]),
        text: cleanLineNoise(subItemMatch[2]),
      });
      continue;
    }

    // Check for inline bullet separators or long sentence blocks
    if (cleanLine.includes(". ") && cleanLine.length > 120) {
      const sentences = cleanLine.split(/(?<=\.)\s+/).filter(Boolean);
      for (const sent of sentences) {
        const cleanedSent = cleanLineNoise(sent);
        if (!cleanedSent) continue;
        if (currentPara) {
          contentParagraphs.push(cleanLineNoise(currentPara));
          currentPara = "";
        }
        contentParagraphs.push(cleanedSent);
      }
    } else {
      if (currentPara) {
        currentPara += " " + cleanLine;
      } else {
        currentPara = cleanLine;
      }
    }
  }

  if (currentPara) {
    const finalPara = cleanLineNoise(currentPara);
    if (finalPara) {
      contentParagraphs.push(finalPara);
    }
  }

  return { contentParagraphs, bulletPoints, subItems };
}

function getBadgeStyles(color: DescriptionSection["accentColor"]) {
  switch (color) {
    case "blue":
      return "border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-950/20 text-blue-800 dark:text-blue-400";
    case "emerald":
      return "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-400";
    case "amber":
      return "border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-400";
    case "violet":
      return "border-violet-200 dark:border-violet-500/30 bg-violet-50 dark:bg-violet-950/20 text-violet-800 dark:text-violet-400";
    case "rose":
      return "border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-400";
    case "teal":
      return "border-teal-200 dark:border-teal-500/30 bg-teal-50 dark:bg-teal-950/20 text-teal-800 dark:text-teal-400";
    case "indigo":
      return "border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-800 dark:text-indigo-400";
    default:
      return "border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300";
  }
}

export default function StructuredHackathonDescription({
  description,
  className = "",
}: StructuredHackathonDescriptionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!description) {
    return (
      <div className="p-6 rounded-xl bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-800 text-center text-zinc-500 text-xs font-mono">
        No detailed description provided for this hackathon.
      </div>
    );
  }

  const sections = parseDescription(description);

  if (sections.length === 0) {
    return (
      <div className="p-6 rounded-xl bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-800 text-center text-zinc-500 text-xs font-mono">
        No detailed description available.
      </div>
    );
  }

  const totalTextLength = cleanHtmlEntities(description).length;
  const isLong = totalTextLength > 500 && sections.length > 1;

  const visibleSections = isLong && !isExpanded ? sections.slice(0, 2) : sections;

  return (
    <div className={`space-y-5 max-w-full overflow-hidden ${className}`}>
      {visibleSections.map((sec) => (
        <div
          key={sec.id}
          className="p-5 rounded-2xl bg-zinc-50/80 dark:bg-zinc-950/50 border border-zinc-200/90 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700/80 transition-all shadow-sm space-y-3.5 overflow-hidden max-w-full break-words"
        >
          {/* Section Header */}
          <div className="flex items-center gap-2.5 max-w-full overflow-hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-base shrink-0 shadow-sm">
              {sec.icon}
            </span>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white tracking-tight truncate">
              {sec.title}
            </h3>
            <span
              className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border uppercase ml-auto shrink-0 ${getBadgeStyles(
                sec.accentColor
              )}`}
            >
              {sec.title}
            </span>
          </div>

          {/* Section Body - Paragraphs */}
          {sec.contentParagraphs.length > 0 && (
            <div className="space-y-2 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed font-sans break-words overflow-hidden">
              {sec.contentParagraphs.map((para, idx) => (
                <p key={idx} className="break-words">{para}</p>
              ))}
            </div>
          )}

          {/* Section Body - Sub Items (e.g., Rounds like Relay Sprint, Battle Royale) */}
          {sec.subItems.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {sec.subItems.map((sub, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/90 text-xs space-y-1 hover:border-zinc-300 dark:hover:border-zinc-700 transition shadow-sm overflow-hidden break-words"
                >
                  <div className="font-mono font-bold text-zinc-900 dark:text-white flex items-center gap-1.5 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 shrink-0" />
                    <span className="truncate">{sub.title}</span>
                  </div>
                  <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed text-[11px] break-words">
                    {sub.text}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Section Body - Bullet Points */}
          {sec.bulletPoints.length > 0 && (
            <ul className="space-y-2 pt-1">
              {sec.bulletPoints
                .filter((bp) => bp.trim().length > 0)
                .map((bp, idx) => (
                  <li
                    key={idx}
                    className="text-xs text-zinc-700 dark:text-zinc-300 flex items-start gap-2 leading-relaxed break-words overflow-hidden"
                  >
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold shrink-0 mt-0.5">✦</span>
                    <span className="break-words">{bp}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      ))}

      {/* Expansion Toggle */}
      {isLong && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-4 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700 text-xs font-mono font-bold text-zinc-800 dark:text-white transition-all shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <span>{isExpanded ? "Show Less Sections" : `Read Full Description (${sections.length} Sections)`}</span>
            <svg
              className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

