"use client";

import { useState } from "react";
import { jsPDF } from "jspdf";

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
  const hackathonTitle = badge.badge_name || "All India Hackathon 2026";
  const issuer = badge.issuer_name || "HackerMate x Axcentra";
  const rank = badge.rank_title || "Verified Winner";
  const teamName = badge.metadata?.team_name || "";

  function generatePDF() {
    setDownloading(true);
    try {
      // Create landscape A4 PDF (842 x 595 pt)
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "pt",
        format: "a4",
      });

      const width = 842;
      const height = 595;

      // Dark background (#090D16)
      doc.setFillColor(9, 13, 22);
      doc.rect(0, 0, width, height, "F");

      // Outer Decorative Border (Blue Gradient Accent #3B82F6 & #8B5CF6)
      doc.setLineWidth(3);
      doc.setDrawColor(59, 130, 246);
      doc.rect(20, 20, width - 40, height - 40, "S");

      doc.setLineWidth(1);
      doc.setDrawColor(139, 92, 246);
      doc.rect(26, 26, width - 52, height - 52, "S");

      // Top Header Stripe
      doc.setFillColor(59, 130, 246);
      doc.rect(30, 30, width - 60, 6, "F");

      // Brand Logo Header: HackerMate x Axcentra
      doc.setTextColor(180, 244, 97); // Lime accent #B4F461
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("HACKERMATE", 60, 75);

      doc.setTextColor(148, 163, 184); // Zinc 400
      doc.setFont("helvetica", "normal");
      doc.setFontSize(14);
      doc.text("×", 175, 75);

      doc.setTextColor(59, 130, 246); // Axcentra Blue
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("AXCENTRA", 195, 75);

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
      doc.setTextColor(180, 244, 97); // #B4F461 Lime
      doc.setFont("helvetica", "bold");
      doc.setFontSize(32);
      doc.text(recipientName.toUpperCase(), width / 2, 230, {
        align: "center",
      });

      // Gold/Blue Divider Line under Name
      doc.setLineWidth(2);
      doc.setDrawColor(59, 130, 246);
      doc.line(width / 2 - 150, 245, width / 2 + 150, 245);

      // Achievement Text
      doc.setTextColor(226, 232, 240);
      doc.setFontSize(14);
      doc.setFont("helvetica", "normal");
      doc.text(
        `For outstanding performance as a ${rank.toUpperCase()} in the`,
        width / 2,
        285,
        { align: "center" }
      );

      // Event Name
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.text(hackathonTitle, width / 2, 325, { align: "center" });

      if (teamName) {
        doc.setTextColor(148, 163, 184);
        doc.setFontSize(12);
        doc.setFont("helvetica", "normal");
        doc.text(`Team: ${teamName}`, width / 2, 355, { align: "center" });
      }

      // Badge Chip Box
      doc.setFillColor(30, 41, 59);
      doc.setDrawColor(59, 130, 246);
      doc.roundedRect(width / 2 - 130, 385, 260, 36, 6, 6, "FD");

      doc.setTextColor(59, 130, 246);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(`★  VERIFIED HACKATHON WINNER  ★`, width / 2, 408, {
        align: "center",
      });

      // Footer Details
      doc.setLineWidth(1);
      doc.setDrawColor(51, 65, 85);
      doc.line(60, 480, width - 60, 480);

      // Signatures & Issuer Info
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("HackerMate Engineering", 120, 510);
      doc.setTextColor(148, 163, 184);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text("Official Platform Verifier", 120, 525);

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Axcentra Organizing Committee", width - 260, 510);
      doc.setTextColor(148, 163, 184);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text("All India Hackathon 2026", width - 260, 525);

      doc.setTextColor(100, 116, 139);
      doc.setFontSize(9);
      doc.text(
        `Issued: ${issueDateStr}  |  Verify online: https://hackermate.in/verify/${certId}`,
        width / 2,
        555,
        { align: "center" }
      );

      // Save PDF
      const filename = `${recipientName.toLowerCase().replace(/\s+/g, "_")}_axcentra_certificate.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error(err);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-3xl rounded-2xl border border-white/10 bg-[#0c0d12] p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400 font-bold">
              🏆
            </span>
            <div>
              <h3 className="text-lg font-bold text-white">
                Co-Branded Verified Certificate
              </h3>
              <p className="text-xs text-zinc-400">
                Issued by {issuer} • ID: {certId}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Certificate Visual Preview */}
        <div className="my-6 rounded-xl border border-blue-500/30 bg-[#090D16] p-8 text-center shadow-inner relative overflow-hidden">
          <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-lime-400" />
          
          <div className="flex justify-center items-center gap-2 mb-4">
            <span className="font-bold tracking-wider text-[#B4F461] text-xs">
              HACKERMATE
            </span>
            <span className="text-zinc-500 text-xs">×</span>
            <span className="font-bold tracking-wider text-blue-400 text-xs">
              AXCENTRA
            </span>
          </div>

          <h4 className="text-xs font-semibold tracking-widest text-zinc-400 uppercase">
            Certificate of Achievement
          </h4>
          <h2 className="mt-2 text-2xl font-extrabold text-[#B4F461]">
            {recipientName}
          </h2>
          <p className="mt-2 text-xs text-zinc-300">
            For outstanding achievement as a <span className="font-semibold text-blue-400">{rank}</span> in
          </p>
          <h3 className="mt-1 text-lg font-bold text-white">
            {hackathonTitle}
          </h3>

          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-blue-500/40 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-400">
            <span>Verified Winner Badge Attached</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between border-t border-white/10 pt-4">
          <div className="text-xs text-zinc-400">
            Issued on {issueDateStr}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5 transition"
            >
              Close
            </button>
            <button
              onClick={generatePDF}
              disabled={downloading}
              className="flex items-center gap-2 rounded-lg bg-[#B4F461] px-5 py-2 text-sm font-semibold text-black hover:bg-[#a3e64f] transition disabled:opacity-50"
            >
              {downloading ? "Generating PDF..." : "Download Official PDF"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
