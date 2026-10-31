import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import { safeDescriptionUrl } from "./urls";
export type DescriptionNode = string | { tag: string; children: DescriptionNode[]; href?: string; start?: number; value?: number; reversed?: boolean };
const allowed = new Set(["p", "div", "ul", "ol", "li", "br", "strong", "b", "em", "i", "u", "s", "pre", "code", "blockquote", "hr", "table", "thead", "tbody", "tr", "td", "th", "dl", "dt", "dd", "sup", "sub"]);
const excluded = new Set(["script", "style", "iframe", "object", "embed", "template", "svg", "math", "noscript"]);
function htmlNodes(nodes: DefaultTreeAdapterMap["childNode"][], baseUrl?: string | null): DescriptionNode[] {
  return nodes.flatMap((node): DescriptionNode[] => {
    if (node.nodeName === "#text" && "value" in node) return [node.value];
    if (!("tagName" in node) || excluded.has(node.tagName)) return [];
    if (node.tagName === "img") return node.attrs.find(attr => attr.name === "alt")?.value ? [node.attrs.find(attr => attr.name === "alt")!.value] : [];
    const children = htmlNodes(node.childNodes, baseUrl);
    if (node.tagName === "a") {
      const href = safeDescriptionUrl(node.attrs.find(attr => attr.name === "href")?.value, baseUrl);
      return href ? [{ tag: "a", href, children }] : children;
    }
    const tag = /^h[1-6]$/.test(node.tagName) ? "h3" : node.tagName;
    if (!allowed.has(tag) && tag !== "h3") return children;
    const rawStart = node.attrs.find(attr => attr.name === "start")?.value;
    const start = rawStart && /^-?\d+$/.test(rawStart) ? Number(rawStart) : undefined;
    const rawValue = node.attrs.find(attr => attr.name === "value")?.value;
    const value = rawValue && /^-?\d+$/.test(rawValue) ? Number(rawValue) : undefined;
    return [{ tag, children, ...(tag === "ol" && Number.isSafeInteger(start) ? { start } : {}),
      ...(tag === "li" && Number.isSafeInteger(value) ? { value } : {}),
      ...(tag === "ol" && node.attrs.some(attr => attr.name === "reversed") ? { reversed: true } : {}) }];
  });
}
function inline(text: string, baseUrl?: string | null): DescriptionNode[] {
  const parts: DescriptionNode[] = [];
  const pattern = /\[([^\]]+)\]\(([^\s)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    parts.push(text.slice(offset, match.index));
    if (match[1]) { const href = safeDescriptionUrl(match[2], baseUrl); parts.push(href ? { tag: "a", href, children: [match[1]] } : match[1]); }
    else parts.push({ tag: match[3] ? "strong" : "code", children: [match[3] || match[4]] });
    offset = match.index! + match[0].length;
  }
  parts.push(text.slice(offset));
  return parts;
}
/** Preserve source order and meaning, without keyword inference or numeric stripping. */
export function parseEventDescription(source: string, baseUrl?: string | null): DescriptionNode[] {
  if (/<\/?[a-z][^>]*>/i.test(source)) return htmlNodes(parseFragment(source).childNodes, baseUrl);
  const decoded = htmlNodes(parseFragment(source.replace(/</g, "&lt;").replace(/>/g, "&gt;")).childNodes).filter((node): node is string => typeof node === "string").join("");
  const blocks: DescriptionNode[] = [];
  let paragraph: string[] = [];
  let list: { tag: string; children: DescriptionNode[]; start?: number } | null = null;
  const flush = () => { if (paragraph.length) blocks.push({ tag: "p", children: inline(paragraph.join("\n"), baseUrl) }); paragraph = []; list = null; };
  for (const line of decoded.split(/\r?\n/)) {
    if (!line.trim()) { flush(); continue; }
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) { flush(); blocks.push({ tag: "h3", children: inline(heading[1], baseUrl) }); continue; }
    const item = line.match(/^\s*(?:([-*•])\s+|(\d+)[.)]\s+)(.+)$/);
    if (item) {
      const tag = item[2] ? "ol" : "ul";
      if (!list || list.tag !== tag) { flush(); list = { tag, children: [], ...(item[2] ? { start: Number(item[2]) } : {}) }; blocks.push(list); }
      list.children.push({ tag: "li", children: inline(item[3], baseUrl), ...(item[2] ? { value: Number(item[2]) } : {}) });
    } else { if (list) flush(); paragraph.push(line); }
  }
  flush(); return blocks;
}

export function descriptionText(source: string): string {
  const text = (nodes: DescriptionNode[]): string => nodes.map(node => typeof node === "string" ? node : text(node.children) + (["p", "div", "li", "br", "h3", "pre"].includes(node.tag) ? " " : "")).join("");
  return text(parseEventDescription(source)).replace(/\s+/g, " ").trim();
}
