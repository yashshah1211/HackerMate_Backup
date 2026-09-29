"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/system";
import { cn } from "@/lib/utils";

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
}> = [
  {
    keywords: ["about the event", "about the opportunity", "about the hackathon", "overview", "event overview", "about us", "description"],
    title: "About the Event",
  },
  {
    keywords: ["eligibility & team guidelines", "eligibility & team rules", "eligibility criteria", "eligibility", "who can participate", "prerequisites", "allowed participants", "how to enter", "how to apply"],
    title: "Eligibility & Team Rules",
  },
  {
    keywords: ["selection criteria", "shortlisting criteria", "evaluation criteria", "judging criteria", "scoring criteria", "scoring", "how we test and score", "how we test", "evaluation", "judging"],
    title: "Selection & Evaluation Criteria",
  },
  {
    keywords: ["competition format", "process & rounds", "event format", "rounds & stages", "rounds", "stages", "duration", "timeline", "important dates", "important deadlines", "deadlines"],
    title: "Competition Format & Rounds",
  },
  {
    keywords: ["why participate?", "why participate", "prizes & perks", "prizes and perks", "prizes & rewards", "prizes and rewards", "prizes", "rewards", "prize pool", "certificates & swags", "swags & certificates", "swag & perks", "perks & benefits", "incubation support", "perks"],
    title: "Prizes & Rewards",
  },
  {
    keywords: ["team formation rules", "rules of the hackathon", "rules & guidelines", "rules and guidelines", "general rules", "important rules", "code of conduct", "rules", "guidelines", "terms & conditions", "what to submit", "submission requirements", "submission guidelines"],
    title: "Rules & Guidelines",
  },
  {
    keywords: ["tracks & problem statements", "tracks and problem statements", "problem statements", "hackathon format & themes", "tracks & themes", "themes & tracks", "themes", "tracks", "challenges", "what to build", "challenge details"],
    title: "Tracks & Problem Statements",
  },
  {
    keywords: ["contact & support", "contact us", "contact info", "contact information", "organizer contact", "helpdesk & support", "helpdesk", "queries & support", "queries"],
    title: "Contact & Support",
  },
];

/**
 * Pre-processes and normalizes unformatted/single-line descriptions into structured multi-line text
 */
function normalizeRawDescription(raw: string): string {
  let text = cleanHtmlEntities(raw);
  if (!text) return "";

  // 1. Top-Level Main Section Headers
  const allKeywords: string[] = [];
  for (const cfg of SECTION_CONFIGS) {
    allKeywords.push(...cfg.keywords);
  }
  allKeywords.push(
    "prize pool", "additional perks", "submission criteria", "submission details",
    "submission policy", "allowed resources", "resources", "intellectual property",
    "originality requirement", "important notes", "terms & conditions", "terms and conditions",
    "code of conduct", "team participation"
  );
  const uniqueKws = Array.from(new Set(allKeywords)).sort((a, b) => b.length - a.length);

  // Standalone section phrases without colons before uppercase text (common on Unstop / Devfolio)
  const standalonePhrases = [
    "Overview", "What to Build", "What to Submit", "How We Test and Score", "How to Enter",
    "Eligibility Criteria", "Who Can Participate", "Rules and Guidelines", "General Rules",
    "Judging Criteria", "Evaluation Criteria", "Important Notes", "Contact Us", "Why Participate",
    "Important Deadlines", "Important Dates"
  ];
  for (const phrase of standalonePhrases) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`([.!?\\s]|^)(${escaped})(?=\\s+[A-Z0-9])`, "g");
    text = text.replace(regex, "\n\n$2:\n");
  }

  // Match "About [Event Name]:" or "Why [Event Name]:"
  text = text.replace(/([.!?\s]|^)(About\s+[A-Z0-9][A-Za-z0-9\s&—–'-]{2,35}):\s*/gi, "\n\n$2:\n");
  text = text.replace(/([.!?\s]|^)(Why\s+[A-Z0-9][A-Za-z0-9\s&—–'-]{2,35}):\s*/gi, "\n\n$2:\n");

  for (const kw of uniqueKws) {
    const escapedKw = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`([.!?\\s]|^)(${escapedKw}):\\s*`, "gi");
    text = text.replace(regex, "\n\n$2:\n");
  }

  // 2. Metadata markers (e.g. Date:, No. of Days:, Members Count:, Registration Fees:, Mode:)
  const metaLabels = ["Date", "Dates", "No\\. of Days", "Members Count", "Team Size", "Registration Fees?", "Registration Fee", "Mode", "Venue"];
  for (const kw of metaLabels) {
    const regex = new RegExp(`([.!?\\s]|^)(${kw}:)\\s*`, "gi");
    text = text.replace(regex, "\n• $2 ");
  }

  // 3. Sub-headings like "Smart Travel & Personalization: Reimagine..."
  text = text.replace(/([.!?]\s+)([A-Z][A-Za-z0-9\s&/'–-]{2,45}):\s+(?=[A-Z])/g, "\n\n• $2: ");

  // 4. Bullet lists after colons (e.g., "stand a chance to: Win from...", "benefits include: ...")
  text = text.replace(/(stand a chance to:|benefits include:|perks include:|problem statements:)\s*([A-Z])/gi, "$1\n• $2");

  // 5. Break bullet lists formatted with semicolons
  text = text.replace(/;\s+([A-Z])/g, ";\n• $1");

  // 6. Break huge unbroken paragraphs (> 220 chars) into individual readable sentences
  const lines = text.split("\n");
  const processedLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 220 && !trimmed.startsWith("•") && !trimmed.startsWith("http")) {
      const sents = trimmed.split(/(?<=[.!?])\s+(?=[A-Z])/);
      if (sents.length > 1) {
        processedLines.push(sents.join("\n\n"));
        continue;
      }
    }
    processedLines.push(line);
  }

  return processedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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

    // Bullet point
    if (/^[•\-*✦●▪◦▸\d+\.]\s*/.test(cleanLine)) {
      const bpText = cleanLineNoise(cleanLine.replace(/^[•\-*✦●▪◦▸\d+\.]+\s*/, ""));
      if (bpText.length > 0) {
        // Check if bullet point is a sub-item e.g. "Smart Travel & Personalization: Reimagine..."
        const subItemMatch = bpText.match(/^([A-Z0-9\s\-_&]{3,45}):\s*(.+)/i);
        if (subItemMatch && !subItemMatch[1].toLowerCase().includes("http") && subItemMatch[2].length > 5) {
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

        if (currentPara) {
          contentParagraphs.push(cleanLineNoise(currentPara));
          currentPara = "";
        }
        bulletPoints.push(bpText);
      }
      continue;
    }

    // Sub item without leading bullet e.g. "Relay Sprint: 3 hours of speed coding..."
    const subItemMatch = cleanLine.match(/^([A-Z0-9\s\-_&]{3,45}):\s*(.+)/i);
    if (subItemMatch && !subItemMatch[1].toLowerCase().includes("http") && subItemMatch[2].length > 5) {
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

    if (currentPara) {
      currentPara += " " + cleanLine;
    } else {
      currentPara = cleanLine;
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

/**
 * Parses a raw string into structured sections with headings, sub-events, and bullet lists
 */
function parseDescription(raw: string): DescriptionSection[] {
  const text = normalizeRawDescription(raw);
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
    lines: string[];
  };

  const rawSections: RawSection[] = [];
  let currentSec: RawSection = {
    title: "About the Event",
    lines: [],
  };

  for (const line of rawLines) {
    const cleanL = cleanLineNoise(line);
    // Strip leading bullet symbol to check if this is a section header (e.g. "• Problem Statements:")
    const strippedHeaderCheck = cleanL.replace(/^[•\-*✦●▪◦▸\d+\.]+\s*/, "").toLowerCase().replace(/[:\s•\-*]+$/, "");

    let matchedConfig: typeof SECTION_CONFIGS[0] | undefined = undefined;

    if (strippedHeaderCheck.length <= 50) {
      matchedConfig = SECTION_CONFIGS.find((cfg) =>
        cfg.keywords.some((kw) => {
          if (strippedHeaderCheck === kw) return true;
          if (strippedHeaderCheck.startsWith(kw + ":") || strippedHeaderCheck.startsWith(kw + " ")) return true;
          if (kw.length >= 4 && strippedHeaderCheck.startsWith(kw)) return true;
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
        lines: [],
      };
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
        ...parsed,
      });
    }
  }

  return sections;
}

export default function StructuredHackathonDescription({
  description,
  className = "",
}: StructuredHackathonDescriptionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!description) {
    return <p className={cn("text-[13.5px] text-ink-3", className)}>No detailed description provided for this hackathon.</p>;
  }

  const sections = parseDescription(description);

  if (sections.length === 0) {
    return <p className={cn("text-[13.5px] text-ink-3", className)}>No detailed description available.</p>;
  }

  const INITIAL_VISIBLE_COUNT = 2;
  const totalTextLength = cleanHtmlEntities(description).length;
  const canExpand = sections.length > INITIAL_VISIBLE_COUNT && totalTextLength > 500;

  const visibleSections = canExpand && !isExpanded ? sections.slice(0, INITIAL_VISIBLE_COUNT) : sections;

  return (
    <div className={cn("min-w-0 max-w-[72ch] space-y-7 break-words [overflow-wrap:anywhere]", className)}>
      {visibleSections.map((sec) => (
        <section key={sec.id} className="min-w-0">
          <h3 className="text-[14.5px] font-semibold text-ink">{sec.title}</h3>

          {/* Paragraphs */}
          {sec.contentParagraphs.length > 0 && (
            <div className="mt-2 space-y-2.5 text-[14.5px] leading-[1.65] text-ink-2">
              {sec.contentParagraphs.map((para, idx) => (
                <p key={idx}>{para}</p>
              ))}
            </div>
          )}

          {/* Key/value sub-items (e.g. rounds like Relay Sprint, Battle Royale) */}
          {sec.subItems.length > 0 && (
            <dl className="mt-3 divide-y divide-line border-y border-line">
              {sec.subItems.map((sub, idx) => (
                <div key={idx} className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)] sm:gap-4">
                  <dt className="text-[13.5px] font-medium text-ink">{sub.title}</dt>
                  <dd className="text-[13.5px] leading-relaxed text-ink-2">{sub.text}</dd>
                </div>
              ))}
            </dl>
          )}

          {/* Bullet points */}
          {sec.bulletPoints.length > 0 && (
            <ul className="mt-2.5 list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-ink-2 marker:text-ink-4">
              {sec.bulletPoints
                .filter((bp) => bp.trim().length > 0)
                .map((bp, idx) => (
                  <li key={idx} className="pl-0.5">
                    {bp}
                  </li>
                ))}
            </ul>
          )}
        </section>
      ))}

      {/* Expansion toggle */}
      {canExpand && (
        <Button
          variant="secondary"
          size="sm"
          aria-expanded={isExpanded}
          iconRight={<ChevronDown className={cn("transition-transform", isExpanded && "rotate-180")} aria-hidden />}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? "Show less" : `Read full description · ${sections.length} sections`}
        </Button>
      )}
    </div>
  );
}
