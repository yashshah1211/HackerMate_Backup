import { decodeHTMLStrict } from "entities";

/** Presentation only. Never used to reconcile provider facts or registration state. */
export type DescriptionBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: { text: string; value?: number }[] }
  | { kind: "facts"; items: { label: string; text: string }[] };

export interface DescriptionSection {
  title: string | null;
  blocks: DescriptionBlock[];
  important: boolean;
  collapsible: boolean;
}

export type DescriptionInline = { text: string; href?: string };

export function safeDescriptionUrl(value: string): string | null {
  if (!/^https?:\/\//i.test(value) || /[\s\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && url.hostname && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

/** Decode to text, never to DOM. A second pass handles common double encoding. */
export function decodeDescriptionEntities(value: string): string {
  let text = value;
  for (let pass = 0; pass < 2; pass++) {
    const next = decodeHTMLStrict(text);
    if (next === text) break;
    text = next;
  }
  return text.replace(/\u00a0/g, " ");
}

/**
 * Recognize transport markup only, keeping text and anchor destinations. Encoded
 * markup is decoded AFTER this step and consequently remains literal text.
 * Unrecognized/malformed markup stays readable; no HTML is ever mounted.
 */
export function descriptionText(raw: string): string {
  const lists: { ordered: boolean; next: number }[] = [];
  const text = raw
    .replace(/<a\b((?:[^<>"']|"[^"]*"|'[^']*')*)>((?:[^<]|<(?!\/?a\b)[^<>]*>){0,10000})<\/a\s*>/gi,
      (_match, attributes: string, label: string) => {
        const attribute = attributes.match(/(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i);
        if (!attribute) return label;
        const href = decodeDescriptionEntities(attribute[1] ?? attribute[2] ?? attribute[3] ?? "");
        const visible = label.replace(/<\/?(?:strong|b|em|i|span)\b(?:[^<>"']|"[^"]*"|'[^']*')*>/gi, "");
        return decodeDescriptionEntities(visible).trim() === href ? visible : `${visible} (${href})`;
      })
    .replace(/<\/?(?:p|div|section|article|br|hr|ul|ol|li|h[1-6]|strong|b|em|i|u|span)\b(?:[^<>"']|"[^"]*"|'[^']*')*>/gi, tag => {
      if (/^<(?:ol|ul)\b/i.test(tag)) {
        const start = tag.match(/\bstart\s*=\s*["']?(\d+)/i);
        lists.push({ ordered: /^<ol\b/i.test(tag), next: start ? Number(start[1]) : 1 });
        return "\n";
      }
      if (/^<\/(?:ol|ul)\b/i.test(tag)) { lists.pop(); return "\n"; }
      if (/^<li\b/i.test(tag)) {
        const list = lists.at(-1);
        const value = tag.match(/\bvalue\s*=\s*["']?(\d+)/i);
        if (list?.ordered) { if (value) list.next = Number(value[1]); return `\n${list.next++}. `; }
        return "\n• ";
      }
      if (/^<h[1-6]\b/i.test(tag)) return "\n\n### ";
      if (/^<\/(?:p|div|section|article|h[1-6])|^<(?:br|hr)\b/i.test(tag)) return "\n\n";
      if (/^<\/?(?:ul|li)\b/i.test(tag)) return "\n";
      return "";
    });
  return decodeDescriptionEntities(text).replace(/\r\n?/g, "\n").replace(/[\u200B\uFEFF]/g, "").trim();
}

const HEADINGS = [
  "about this hackathon", "about the hackathon", "about the event", "about the opportunity", "event overview", "overview",
  "event details", "eligibility", "eligibility criteria", "who can participate", "prerequisites",
  "registration", "registration instructions", "how to register", "how to apply", "how to enter",
  "rules", "rules & guidelines", "rules and guidelines", "general rules", "code of conduct", "terms & conditions", "terms and conditions",
  "prizes", "prizes & rewards", "prizes and rewards", "prizes & perks", "rewards", "prize pool", "perks",
  "schedule", "timeline", "important dates", "important deadlines", "deadlines", "venue",
  "important links", "useful links", "contact", "contact us", "contact & support", "stay connected",
  "judging", "judging criteria", "evaluation criteria", "selection criteria", "competition format", "rounds", "stages",
  "tracks", "themes", "problem statements", "what to build", "what to submit", "submission requirements", "important notes",
];
const HEADING_SET = new Set(HEADINGS);
const SECONDARY = new Set(["prizes", "prizes & rewards", "prizes and rewards", "prizes & perks", "rewards", "perks", "judging", "judging criteria", "evaluation criteria", "selection criteria", "tracks", "themes", "problem statements"]);
const FACT_LABEL = /^(Event|Theme|Dates?|Event Dates?|Venue|Location|Organizer|Organiser|Mode|Format|Team Size|Registration Fee|Registration Fees|Registration Deadline|Deadline|Time|Duration|Contact|Email|WhatsApp Group|Discord Server|Official [\p{L}\p{N} &'’–-]{1,60} Registration):\s*(.+)$/iu;
// Deliberately broad: false positives mean more visible text, never hidden instructions.
const CRITICAL = /\b(?:must|required?|mandatory|compulsory|registration|register\w*|eligib\w*|deadline|restrictions?|warnings?|important|only|prohibited|not|no|never|cannot|can’t|can't|before|after|last date|closing|closes|by\s+\d|submit\w*|students?|participants?|teams?|open to|aged?|citizens?|residents?|minimum|maximum|at least|at most|need|should|bring|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const INLINE_HEADING = new RegExp(`(^|[.!?]\\s+|\\n+)(${HEADINGS.filter(title => title !== "venue").sort((a, b) => b.length - a.length).map(escapeRegex).join("|")}):\\s*`, "gi");

function normalizeStructure(text: string): string {
  // Exact source labels, not keyword prefixes. Keep preceding punctuation.
  let result = text.replace(INLINE_HEADING, (_all, boundary: string, title: string) => `${boundary.trimEnd()}\n\n${title}:\n`);
  // A title-cased source phrase at a sentence boundary is evidence of a heading.
  // This handles flattened organizer headings without event/provider exceptions.
  result = result.replace(/(^|[.!?]\s+)([\p{L}\p{N}][\p{L}\p{N} &'’/?–-]{2,90}):\s+/gu, (all, boundary: string, title: string) => {
    const words = title.split(/\s+/);
    const titleCase = words.length >= 2 && words.every(word => /^(?:[\p{Lu}\p{N}]|&$|and$|of$|the$|to$|for$|in$|on$|at$)/u.test(word));
    if (titleCase && FACT_LABEL.test(`${title}: value`)) return `${boundary.trimEnd()}\n${title}: `;
    return titleCase ? `${boundary.trimEnd()}\n\n### ${title}\n` : all;
  });
  // Metadata runs are observable when multiple explicit known labels occur on
  // one line. Do not turn arbitrary colon-containing prose into information rows.
  result = result.split("\n").map(line => {
    // A known section after a metadata run closes that run. Elsewhere a label
    // embedded in a sentence is left alone rather than partially extracted.
    if (/^(?:Event|Theme|Dates?|Venue|Organizer|Organiser):\s/.test(line)) {
      const transition = new RegExp(`\\s+(${HEADINGS.filter(title => title.includes(" ") && title !== "prize pool").map(escapeRegex).join("|")}):\\s+`, "gi");
      line = line.replace(transition, "\n\n$1:\n");
    }
    const markers = [...line.matchAll(/\b(?:Event Dates?|Event|Theme|Dates?|Venue|Location|Organizer|Organiser|Mode|Team Size|WhatsApp Group|Discord Server):\s+/g)];
    if (markers.length < 2 || markers[0].index !== 0) return line;
    let output = "", cursor = 0;
    for (const marker of markers) {
      output += line.slice(cursor, marker.index) + (marker.index ? "\n" : "");
      cursor = marker.index!;
    }
    return output + line.slice(cursor);
  }).join("\n");
  return result;
}

function blockText(block: DescriptionBlock): string {
  if (block.kind === "paragraph") return block.text;
  return block.items.map(item => "label" in item ? `${item.label}: ${item.text}` : item.text).join(" ");
}

export function sectionText(section: DescriptionSection): string {
  return [section.title ?? "", ...section.blocks.map(blockText)].join(" ");
}

/** Conservative parsing: source sequence and repeated sections are retained. */
export function parseHackathonDescription(raw: string | null | undefined): DescriptionSection[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  const sections: DescriptionSection[] = [];
  let section: DescriptionSection = { title: null, blocks: [], important: false, collapsible: false };
  const flush = () => { if (section.title || section.blocks.length) sections.push(section); };
  const lines = normalizeStructure(descriptionText(raw)).split("\n");
  const paragraph = (line: string) => {
    const sentences = line.split(/(?<=[.!?])\s+(?=[\p{Lu}])/u);
    let text = "";
    for (const sentence of sentences) {
      if (text.length >= 420) { section.blocks.push({ kind: "paragraph", text }); text = ""; }
      text += (text ? " " : "") + sentence;
    }
    if (text) section.blocks.push({ kind: "paragraph", text });
  };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const explicit = line.match(/^#{1,6}\s+(.+?)(?:\s+#+)?$/) ?? line.match(/^\*\*(.+?)\*\*:?$/);
    const label = line.replace(/:\s*$/, "");
    if (explicit || HEADING_SET.has(label.toLowerCase())) {
      flush();
      section = { title: explicit ? explicit[1] : label, blocks: [], important: false, collapsible: false };
      continue;
    }
    const list = line.match(/^(?:([-*•●▪◦▸])\s+|(\d{1,6})[.)]\s+)(.+)$/);
    if (list) {
      const ordered = Boolean(list[2]);
      let last = section.blocks.at(-1);
      if (last?.kind !== "list" || last.ordered !== ordered) {
        last = { kind: "list", ordered, items: [] };
        section.blocks.push(last);
      }
      last.items.push({ text: list[3], ...(ordered ? { value: Number(list[2]) } : {}) });
      continue;
    }
    const fact = line.match(FACT_LABEL);
    if (fact) {
      let last = section.blocks.at(-1);
      if (last?.kind !== "facts") { last = { kind: "facts", items: [] }; section.blocks.push(last); }
      const linkedValue = fact[2].match(/^(https?:\/\/\S+)\s+(.+)$/i);
      if (linkedValue && safeDescriptionUrl(linkedValue[1])) {
        last.items.push({ label: fact[1], text: linkedValue[1] });
        paragraph(linkedValue[2]);
      } else last.items.push({ label: fact[1], text: fact[2] });
      continue;
    }
    // Retain uncertain lines as paragraphs. Break very long prose only at sentence
    // boundaries; never truncate, summarize or turn semicolons into invented lists.
    paragraph(line);
  }
  flush();
  const total = sections.reduce((sum, entry) => sum + sectionText(entry).length, 0);
  for (const entry of sections) {
    const text = sectionText(entry);
    entry.important = CRITICAL.test(text) || entry.blocks.some(block => block.kind === "facts")
      || entry.blocks.some(block => block.kind === "list")
      || descriptionInlines(text).some(part => part.href)
      || /\d|[<>]/.test(text)
      || /[^\p{Script=Latin}\p{N}\p{P}\p{Z}\p{S}\s]/u.test(text);
    entry.collapsible = total > 2600 && text.length > 700 && !entry.important && SECONDARY.has(entry.title?.toLowerCase() ?? "");
  }
  return sections;
}

/** Preserve punctuation outside links, including balanced parentheses in URLs. */
export function descriptionInlines(text: string): DescriptionInline[] {
  const result: DescriptionInline[] = [];
  const pattern = /https?:\/\/[^\s<>"\u0000-\u001f]+/gi;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    let value = match[0].replace(/[.,;:!?]+$/, "");
    while (value.endsWith(")") && (value.match(/\)/g)?.length ?? 0) > (value.match(/\(/g)?.length ?? 0)) value = value.slice(0, -1);
    const href = safeDescriptionUrl(value);
    if (!href) continue;
    if (match.index! > cursor) result.push({ text: text.slice(cursor, match.index) });
    result.push({ text: value, href });
    cursor = match.index! + value.length;
  }
  if (cursor < text.length) result.push({ text: text.slice(cursor) });
  return result;
}
