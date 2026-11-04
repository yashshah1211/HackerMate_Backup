import { jsPDF } from "jspdf";
import type { FounderBrief } from "./founderBrief";

/**
 * Founder edition: an editorial executive readout, intentionally without raw
 * customer emails, message bodies, feedback text, or unverified outreach claims.
 */
export function generateFounderBriefPdf(brief: FounderBrief): Buffer {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 17, CW = W - M * 2;
  let y = 0;
  const charcoal = [13, 20, 21] as const;
  const ink = [28, 41, 46] as const;
  const muted = [90, 105, 112] as const;
  const lime = [180, 244, 97] as const;
  function color(rgb: readonly number[]) { pdf.setTextColor(rgb[0], rgb[1], rgb[2]); }
  function fill(rgb: readonly number[]) { pdf.setFillColor(rgb[0], rgb[1], rgb[2]); }
  function lines(text: string, width: number, size: number): string[] {
    pdf.setFontSize(size);
    const split = pdf.splitTextToSize(text, width);
    return Array.isArray(split) ? split.map(String) : [String(split)];
  }
  function page(title?: string) {
    if (title) pdf.addPage();
    fill([251, 252, 250]); pdf.rect(0, 0, W, H, "F");
    fill(charcoal); pdf.rect(0, 0, W, title ? 27 : 53, "F");
    fill(lime); pdf.rect(0, 0, W, 2.5, "F");
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); color(lime);
    pdf.text("HACKERMATE", M, title ? 15 : 16);
    pdf.setFontSize(8); color([189, 207, 197]);
    pdf.text("FOUNDER INTELLIGENCE / PRIVATE", W - M, title ? 15 : 16, { align: "right" });
    if (!title) {
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(21); color([255, 255, 255]);
      pdf.text("THE DAILY FOUNDER BRIEF", M, 33);
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); color([190, 202, 198]);
      pdf.text(brief.date, M, 44);
    } else {
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); color([255, 255, 255]);
      pdf.text(title, M, 23);
    }
    y = title ? 39 : 62;
  }
  function ensure(needed: number) {
    if (y + needed > H - 25) page("FOUNDER BRIEF / CONTINUED");
  }
  function textBlock(text: string, options?: { size?: number; leading?: number; x?: number; width?: number; weight?: "bold" | "normal"; tone?: readonly number[]; after?: number }) {
    const size = options?.size || 9.5, leading = options?.leading || 5.1;
    const x = options?.x ?? M, width = options?.width ?? CW;
    const wrapped = lines(text, width, size);
    ensure(wrapped.length * leading + (options?.after ?? 4));
    pdf.setFont("helvetica", options?.weight || "normal"); pdf.setFontSize(size);
    color(options?.tone || ink);
    pdf.text(wrapped, x, y, { lineHeightFactor: 1.35 });
    y += wrapped.length * leading + (options?.after ?? 4);
  }
  function heading(label: string) {
    ensure(18);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(10);
    color([49, 91, 60]); pdf.text(label.toUpperCase(), M, y);
    y += 8;
  }
  function insight(label: string, headline: string, detail: string) {
    const detailLines = lines(detail, CW - 13, 9.3);
    const h = 15 + detailLines.length * 5.2 + 6;
    ensure(h + 5);
    fill([238, 242, 236]); pdf.roundedRect(M, y - 4, CW, h, 3, 3, "F");
    fill(lime); pdf.rect(M, y - 4, 1.8, h, "F");
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.2); color([77, 100, 76]);
    pdf.text(label, M + 7, y + 2);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(12); color(ink);
    const title = lines(headline, CW - 14, 12);
    pdf.text(title, M + 7, y + 10, { lineHeightFactor: 1.25 });
    const offset = (title.length - 1) * 5.4;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9.3); color(muted);
    pdf.text(detailLines, M + 7, y + 18 + offset, { lineHeightFactor: 1.3 });
    y += h + offset + 4;
  }
  function bullet(item: string) {
    const wrap = lines(item, CW - 9, 9.4);
    ensure(wrap.length * 5.3 + 7);
    fill([92, 143, 81]); pdf.circle(M + 2.3, y - 1.1, 1.25, "F");
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9.4); color(ink);
    pdf.text(wrap, M + 8, y, { lineHeightFactor: 1.32 });
    y += wrap.length * 5.3 + 6;
  }

  page();
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(17); color(ink);
  const titleLines = lines(brief.headline, CW, 17);
  ensure(titleLines.length * 7.4 + 12);
  pdf.text(titleLines, M, y, { lineHeightFactor: 1.25 });
  y += titleLines.length * 7.4 + 2;
  textBlock(brief.subhead, { size: 9.2, tone: muted, after: 10 });

  ensure(29);
  const cardWidth = (CW - 8) / 3;
  const cards = [
    ["NEW BUILDERS", brief.metrics.builders],
    ["NEW TEAMS", brief.metrics.teams],
    ["EVENT SAVES", brief.metrics.saves],
  ] as const;
  cards.forEach(([label, value], idx) => {
    const x = M + (cardWidth + 4) * idx;
    fill(charcoal); pdf.roundedRect(x, y - 3, cardWidth, 28, 3.2, 3.2, "F");
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.5); color([191, 205, 195]);
    pdf.text(label, x + 4, y + 4);
    pdf.setFontSize(16); color(lime);
    pdf.text(value === null ? "N/A" : (idx === 2 ? String(value) : "+" + value), x + 4, y + 17);
  });
  y += 40;

  heading("What actually moved");
  brief.sections.forEach(s => insight(s.label, s.headline, s.detail));

  y += 2;
  heading("What deserves your attention");
  brief.attention.forEach(bullet);
  y += 5;
  heading("Three moves for the next workday");
  brief.nextSteps.forEach(bullet);

  if (brief.events.length) {
    y += 5;
    heading("Some of the new hackathons");
    brief.events.forEach(name => bullet(name));
  }
  y += 4;
  heading("Reading this responsibly");
  brief.caveats.forEach(bullet);

  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setDrawColor(219, 225, 220);
    pdf.line(M, H - 17, W - M, H - 17);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.2); color(muted);
    pdf.text("HackerMate - founder-only operational brief | " + brief.date, M, H - 11);
    pdf.text("Page " + i + " / " + pages, W - M, H - 11, { align: "right" });
  }
  return Buffer.from(pdf.output("arraybuffer"));
}
