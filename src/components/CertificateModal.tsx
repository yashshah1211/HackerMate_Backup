"use client";

import { useState } from "react";
import { Award, Download } from "lucide-react";
import { Button, Dialog, Tape } from "@/components/system";

export type UserBadge = {
  id: string;
  user_id: string;
  hackathon_id?: string | null;
  badge_type: string;
  badge_name: string;
  issuer_name: string;
  rank_title?: string | null;
  metadata?: {
    certificate_id?: string;
    track?: string;
    team_name?: string;
    [key: string]: any;
  } | null;
  issued_at: string;
};

type CertificateModalProps = {
  isOpen: boolean;
  onClose: () => void;
  badge: UserBadge | null;
  recipientName: string;
};

export default function CertificateModal({
  isOpen,
  onClose,
  badge,
  recipientName,
}: CertificateModalProps) {
  const [downloading, setDownloading] = useState(false);

  if (!isOpen || !badge) return null;

  const certId =
    badge.metadata?.certificate_id ||
    `HM-CERT-${badge.id.slice(0, 8).toUpperCase()}`;
  const issueDateStr = new Date(badge.issued_at).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const rawTitle = badge.badge_name || "All India Hackathon 2026";
  const eventTitle = rawTitle.replace(/^(Verified Winner|Winner|Finalist|Participant)\s*[\u2014\u2013-]\s*/i, "");
  const issuer = badge.issuer_name || "HackerMate Partner Network";
  const partnerOrg = (badge.issuer_name || "").replace(/^HackerMate\s*[×x]\s*/i, "").trim() || "PARTNER NETWORK";
  const rank = badge.rank_title || "Verified Winner";
  const teamName = badge.metadata?.team_name || "";

  async function generatePDF() {
    setDownloading(true);
    try {
      // Loaded on first click only — keeps ~350KB of PDF-generation code out
      // of the initial bundles for hackathons/[id]/, partners/[slug]/ and profile/[id]/.
      const { jsPDF } = await import("jspdf");

      // Create landscape A4 PDF (842 x 595 pt)
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "pt",
        format: "a4",
      });

      const width = 842;
      const height = 595;

      // Dark background (RGB 9,13,22)
      doc.setFillColor(9, 13, 22);
      doc.rect(0, 0, width, height, "F");

      // Outer decorative border (two RGB accent strokes; PDF output only)
      doc.setLineWidth(3);
      doc.setDrawColor(59, 130, 246);
      doc.rect(20, 20, width - 40, height - 40, "S");

      doc.setLineWidth(1);
      doc.setDrawColor(139, 92, 246);
      doc.rect(26, 26, width - 52, height - 52, "S");

      // Top Header Stripe
      doc.setFillColor(59, 130, 246);
      doc.rect(30, 30, width - 60, 6, "F");

      // Brand Logo Header: HackerMate x Partner Org
      doc.setTextColor(180, 244, 97); // Lime accent
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("HACKERMATE", 60, 75);

      doc.setTextColor(148, 163, 184); // Zinc 400
      doc.setFont("helvetica", "normal");
      doc.setFontSize(14);
      doc.text("×", 175, 75);

      doc.setTextColor(59, 130, 246); // Partner Accent Blue
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(partnerOrg.toUpperCase(), 195, 75);

      doc.setTextColor(148, 163, 184);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`CERTIFICATE ID: ${certId}`, width - 220, 75);

      // Certificate Title
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(30);
      doc.text("CERTIFICATE OF ACHIEVEMENT", width / 2, 145, {
        align: "center",
      });

      doc.setTextColor(148, 163, 184);
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.text("PROUDLY PRESENTED TO", width / 2, 180, { align: "center" });

      // Recipient Name
      doc.setTextColor(180, 244, 97); // Lime
      doc.setFont("helvetica", "bold");
      doc.setFontSize(28);
      doc.text(recipientName, width / 2, 230, { align: "center" });

      // Divider underline under recipient name
      doc.setDrawColor(180, 244, 97);
      doc.setLineWidth(1.5);
      doc.line(width / 2 - 120, 245, width / 2 + 120, 245);

      // Body text
      doc.setTextColor(226, 232, 240); // Slate 200
      doc.setFont("helvetica", "normal");
      doc.setFontSize(14);
      const achievementLine = `has successfully demonstrated outstanding engineering and problem-solving excellence,`;
      const rankLine = `awarded the prestigious title of ${rank.toUpperCase()}${teamName ? ` (Team: ${teamName})` : ""}.`;
      doc.text(achievementLine, width / 2, 280, { align: "center" });
      doc.text(rankLine, width / 2, 305, { align: "center" });

      // Event Details Box
      doc.setFillColor(15, 23, 42); // Slate 900
      doc.roundedRect(width / 2 - 250, 345, 500, 75, 8, 8, "F");
      doc.setDrawColor(51, 65, 85);
      doc.roundedRect(width / 2 - 250, 345, 500, 75, 8, 8, "S");

      doc.setTextColor(148, 163, 184);
      doc.setFontSize(10);
      doc.text("EVENT", width / 2 - 230, 370);
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(eventTitle || "National Innovation Sprint", width / 2 - 230, 395);

      doc.setTextColor(148, 163, 184);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text("TRACK / RANK", width / 2 + 50, 370);
      doc.setTextColor(59, 130, 246);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(rank, width / 2 + 50, 395);

      // Signatures
      // Left: HackerMate Verification Lead
      doc.setDrawColor(100, 116, 139);
      doc.setLineWidth(1);
      doc.line(60, 495, 240, 495);
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("HackerMate Verification Engine", 60, 510);
      doc.setTextColor(148, 163, 184);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text("Official Platform Verifier", 120, 525);

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(`${partnerOrg} Organizing Committee`, width - 260, 510);
      doc.setTextColor(148, 163, 184);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(eventTitle || "Hackathon Championship", width - 260, 525);

      doc.setTextColor(100, 116, 139);
      doc.setFontSize(9);
      doc.text(
        `Issued: ${issueDateStr}  |  Verify online: https://hackermate.in/verify/${certId}`,
        width / 2,
        555,
        { align: "center" }
      );

      // Save PDF
      const filename = `${recipientName.toLowerCase().replace(/\s+/g, "_")}_achievement_certificate.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error(err);
      alert("Could not generate the PDF. Please check your connection and try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      size="lg"
      title="Verified certificate"
      description={
        <>
          Issued by {issuer} · <span className="font-mono text-[12px]">{certId}</span>
        </>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" icon={<Download />} loading={downloading} onClick={generatePDF}>
            {downloading ? "Generating PDF…" : "Download official PDF"}
          </Button>
        </>
      }
    >
      {/* Certificate preview */}
      <div className="rounded-lg border border-line-strong bg-sunken px-5 py-7 text-center sm:px-8">
        <div className="mb-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 caps-label">
          <span className="text-accent-ink">HackerMate</span>
          <span className="text-ink-4" aria-hidden>
            ×
          </span>
          <span className="text-ink-2">{partnerOrg}</span>
        </div>

        <p className="caps-label text-ink-3">Certificate of achievement</p>
        <p className="mt-2 break-words font-display text-[24px] font-semibold leading-tight tracking-[-0.02em] text-ink [font-variation-settings:'wdth'_92]">
          {recipientName}
        </p>
        <p className="mt-3 text-[12.5px] text-ink-3">For outstanding achievement in</p>
        <p className="mt-1 break-words text-[15px] font-semibold text-ink">{eventTitle}</p>

        <div className="mt-5 flex justify-center">
          <Tape tone="accent" icon={<Award />}>
            {rank}
          </Tape>
        </div>
      </div>

      <p className="mt-3 text-[12.5px] text-ink-3">Issued on {issueDateStr}</p>
    </Dialog>
  );
}
