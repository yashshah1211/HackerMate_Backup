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
 * Decodes HTML entities commonly found in web-scraped descriptions
 */
function cleanHtmlEntities(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/<hr\s*\/?>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|h[1-6])>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&bull;/gi, "•")
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

const SECTION_CONFIGS: Array<{
  keywords: string[];
  title: string;
  icon: string;
  accentColor: DescriptionSection["accentColor"];
}> = [
  {
    keywords: ["about the event", "about the opportunity", "about the hackathon", "overview", "about code rush", "event overview", "about us", "description"],
    title: "About the Event",
    icon: "🚀",
    accentColor: "blue",
  },
  {
    keywords: ["eligibility", "who can participate", "eligibility criteria", "prerequisites", "allowed participants"],
    title: "Eligibility & Team Rules",
    icon: "🎓",
    accentColor: "emerald",
  },
  {
    keywords: ["selection criteria", "shortlisting criteria", "evaluation criteria", "judging criteria", "scoring"],
    title: "Selection & Evaluation Criteria",
    icon: "⚖️",
    accentColor: "amber",
  },
  {
    keywords: ["competition format", "process & rounds", "event format", "rounds", "event structure", "hackathon format", "stages", "competition structure"],
    title: "Competition Format & Rounds",
    icon: "⚔️",
    accentColor: "violet",
  },
  {
    keywords: ["prizes", "rewards", "prize pool", "perks", "swag", "benefits", "certificates"],
    title: "Prizes & Rewards",
    icon: "🏆",
    accentColor: "rose",
  },
  {
    keywords: ["rules", "guidelines", "code of conduct", "general rules", "important rules", "terms", "accommodation"],
    title: "Rules & Guidelines",
    icon: "📋",
    accentColor: "teal",
  },
  {
    keywords: ["tracks", "themes", "problem statements", "domain", "challenges", "categories"],
    title: "Tracks & Problem Statements",
    icon: "💡",
    accentColor: "indigo",
  },
  {
    keywords: ["contact", "queries", "organizer contact", "helpdesk", "support", "coordinators"],
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

  // Match headers like "About the Event:", "About the Opportunity:", "Eligibility:", "Process & Rounds:"
  const headerRegex = /(?:^|\n+)(About the Event|About the Opportunity|About the Hackathon|Overview|Eligibility Criteria|Eligibility|Selection Criteria|Evaluation Criteria|Competition Format|Process & Rounds|Event Format|Prizes & Perks|Prizes|Rewards|Rules & Guidelines|Rules|Code of Conduct|Tracks|Themes|Problem Statements|Contact Us|Contact Info|Organizers|Important Notes|General Guidelines)[\s:]*/gi;

  const matches: { index: number; text: string; headerName: string }[] = [];
  let match: RegExpExecArray | null;

  while ((match = headerRegex.exec(text)) !== null) {
    matches.push({
      index: match.index,
      text: match[0],
      headerName: match[1].trim(),
    });
  }

  // If no explicit section headers found, check if text has sentence sentences or bullet points
  if (matches.length === 0) {
    return [
      {
        id: "general-overview",
        title: "Event Details & Overview",
        icon: "📌",
        accentColor: "blue",
        ...parseSectionContent(text),
      },
    ];
  }

  const sections: DescriptionSection[] = [];

  // Pre-header text if any
  if (matches[0].index > 0) {
    const leadText = text.slice(0, matches[0].index).trim();
    if (leadText.length > 20) {
      sections.push({
        id: "lead-overview",
        title: "About the Event",
        icon: "🚀",
        accentColor: "blue",
        ...parseSectionContent(leadText),
      });
    }
  }

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const startIndex = current.index + current.text.length;
    const endIndex = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const sectionBody = text.slice(startIndex, endIndex).trim();

    if (!sectionBody) continue;

    const lowerHeader = current.headerName.toLowerCase();
    const config = SECTION_CONFIGS.find((c) =>
      c.keywords.some((kw) => lowerHeader.includes(kw))
    ) || {
      title: current.headerName,
      icon: "📌",
      accentColor: "zinc" as const,
    };

    const parsedContent = parseSectionContent(sectionBody);

    // Prevent duplicate section titles by appending index if needed
    const existing = sections.find((s) => s.title === config.title);
    if (existing) {
      existing.contentParagraphs.push(...parsedContent.contentParagraphs);
      existing.bulletPoints.push(...parsedContent.bulletPoints);
      existing.subItems.push(...parsedContent.subItems);
    } else {
      sections.push({
        id: `section-${i}`,
        title: config.title,
        icon: config.icon,
        accentColor: config.accentColor,
        ...parsedContent,
      });
    }
  }

  return sections;
}

/**
 * Splits section body text into paragraphs, bullet items, and key-value sub-items (e.g. Relay Sprint: ...)
 */
function parseSectionContent(bodyText: string): {
  contentParagraphs: string[];
  bulletPoints: string[];
  subItems: SubItem[];
} {
  const contentParagraphs: string[] = [];
  const bulletPoints: string[] = [];
  const subItems: SubItem[] = [];

  // Split into sentences / lines
  const lines = bodyText
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  let currentPara = "";

  for (const line of lines) {
    const cleanLine = line.replace(/^(About the (Event|Opportunity|Hackathon)|Process & Rounds|Overview|Eligibility Criteria|Eligibility|Selection Criteria|Competition Format)[\s:]*/gi, "").trim();
    if (!cleanLine) continue;

    // Check if line is a bullet point (starts with •, -, *, 1., 2., etc.)
    if (/^[•\-*\d+\.]\s+/.test(cleanLine)) {
      if (currentPara) {
        contentParagraphs.push(currentPara);
        currentPara = "";
      }
      bulletPoints.push(cleanLine.replace(/^[•\-*\d+\.]\s+/, "").trim());
      continue;
    }

    // Check if line contains a sub-item like "Relay Sprint: Team-based sequential..."
    const subItemMatch = cleanLine.match(/^([A-Z0-9\s\-_]{3,35}):\s*(.+)/i);
    if (subItemMatch && !subItemMatch[1].toLowerCase().includes("http")) {
      if (currentPara) {
        contentParagraphs.push(currentPara);
        currentPara = "";
      }
      subItems.push({
        title: subItemMatch[1].trim(),
        text: subItemMatch[2].trim(),
      });
      continue;
    }

    // Check for inline bullet separators like "Each participant... . Selection Criteria: ..."
    if (line.includes(". ") && line.length > 120) {
      // If line is very long, break it into readable sentences
      const sentences = line.split(/(?<=\.)\s+/).filter(Boolean);
      for (const sent of sentences) {
        if (currentPara) {
          contentParagraphs.push(currentPara);
          currentPara = "";
        }
        contentParagraphs.push(sent.trim());
      }
    } else {
      if (currentPara) {
        currentPara += " " + line;
      } else {
        currentPara = line;
      }
    }
  }

  if (currentPara) {
    contentParagraphs.push(currentPara);
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
              {sec.bulletPoints.map((bp, idx) => (
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
