import { jsPDF } from "jspdf";

export type SIHReportData = {
  summary: {
    totalBuilders: number;
    totalLookingForTeam: number;
    totalTeams: number;
    totalColleges: number;
    highPotentialZeroTeamColleges: number;
  };
  collegeStats: {
    collegeName: string;
    builderCount: number;
    lookingForTeamCount: number;
    teamCount: number;
    totalTeamMembers: number;
    avgTeamSize: string;
    isHighPotentialZeroTeams: boolean;
    builders: { full_name?: string; email?: string; looking_for_team?: boolean }[];
    teams: { name: string; team_members?: any[] }[];
  }[];
};

/**
 * Generates an executive PDF report for SIH 2026 telemetry & college breakdown.
 * Returns a Buffer of the generated PDF document.
 */
export function generateSIHPdfReport(data: SIHReportData): Buffer {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const currentDateStr = new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });

  let y = 15;

  // 1. Header Banner
  doc.setFillColor(15, 23, 42); // Slate-900 background
  doc.rect(0, 0, 210, 38, "F");

  // Title text
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(163, 230, 53); // Lime-400
  doc.text("HACKERMATE", 14, 16);

  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text("Smart India Hackathon (SIH 2026) — Daily Telemetry Report", 14, 25);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184); // Slate-400
  doc.text(`Generated: ${currentDateStr} IST  |  Target: yashshah7117@gmail.com`, 14, 32);

  y = 48;

  // 2. Summary KPI Metric Boxes
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text("OVERALL TELEMETRY SUMMARY", 14, y);
  y += 6;

  const boxWidth = 36;
  const boxHeight = 22;
  const gap = 3;

  const metrics = [
    { label: "TOTAL BUILDERS", val: `${data.summary.totalBuilders}`, sub: "Registered", color: [241, 245, 249], textColor: [15, 23, 42] },
    { label: "LOOKING FOR TEAM", val: `${data.summary.totalLookingForTeam}`, sub: "Active Searchers", color: [254, 243, 199], textColor: [180, 83, 9] },
    { label: "TEAMS FORMED", val: `${data.summary.totalTeams}`, sub: "Created Teams", color: [209, 250, 229], textColor: [4, 120, 87] },
    { label: "COLLEGES", val: `${data.summary.totalColleges}`, sub: "Institutions", color: [224, 242, 254], textColor: [3, 105, 161] },
    { label: "BOTTLENECK", val: `${data.summary.highPotentialZeroTeamColleges}`, sub: "0 Teams (2+ bldrs)", color: [254, 226, 226], textColor: [190, 18, 60] },
  ];

  metrics.forEach((m, idx) => {
    const x = 14 + idx * (boxWidth + gap);
    
    // Background fill
    doc.setFillColor(m.color[0], m.color[1], m.color[2]);
    doc.roundedRect(x, y, boxWidth, boxHeight, 2, 2, "F");

    // Label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(m.textColor[0], m.textColor[1], m.textColor[2]);
    doc.text(m.label, x + 3, y + 6);

    // Value
    doc.setFontSize(14);
    doc.text(m.val, x + 3, y + 14);

    // Subtitle
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text(m.sub, x + 3, y + 19);
  });

  y += boxHeight + 12;

  // 3. College Telemetry Table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text("COLLEGE-WISE BREAKDOWN", 14, y);
  y += 6;

  // Table Header
  doc.setFillColor(30, 41, 59); // Slate-800
  doc.rect(14, y, 182, 8, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text("#", 17, y + 5.5);
  doc.text("College Name", 26, y + 5.5);
  doc.text("Builders", 115, y + 5.5, { align: "right" });
  doc.text("Searching", 140, y + 5.5, { align: "right" });
  doc.text("Teams", 162, y + 5.5, { align: "right" });
  doc.text("Avg Size", 182, y + 5.5, { align: "right" });
  doc.text("Status", 193, y + 5.5, { align: "right" });

  y += 8;

  // Table Rows
  data.collegeStats.forEach((c, idx) => {
    // Page break check
    if (y > 270) {
      doc.addPage();
      y = 15;
    }

    const isEven = idx % 2 === 0;
    if (isEven) {
      doc.setFillColor(248, 250, 252);
      doc.rect(14, y, 182, 8, "F");
    }

    doc.setFont("helvetica", c.isHighPotentialZeroTeams ? "bold" : "normal");
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);

    doc.text(`${idx + 1}`, 17, y + 5.5);
    
    // Truncate long college names cleanly
    const truncatedCollege = c.collegeName.length > 52 ? `${c.collegeName.substring(0, 49)}...` : c.collegeName;
    doc.text(truncatedCollege, 26, y + 5.5);

    doc.text(`${c.builderCount}`, 115, y + 5.5, { align: "right" });
    
    doc.setTextColor(180, 83, 9);
    doc.text(`${c.lookingForTeamCount}`, 140, y + 5.5, { align: "right" });

    doc.setTextColor(4, 120, 87);
    doc.text(`${c.teamCount}`, 162, y + 5.5, { align: "right" });

    doc.setTextColor(71, 85, 105);
    doc.text(`${c.avgTeamSize}`, 182, y + 5.5, { align: "right" });

    if (c.isHighPotentialZeroTeams) {
      doc.setTextColor(225, 29, 72); // Rose red
      doc.text("⚠️ BOTTLENECK", 193, y + 5.5, { align: "right" });
    } else {
      doc.setTextColor(100, 116, 139);
      doc.text("Active", 193, y + 5.5, { align: "right" });
    }

    y += 8;
  });

  y += 10;

  // 4. Team Roster Detail Section
  if (y > 240) {
    doc.addPage();
    y = 15;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text("FORMED SIH TEAMS ROSTER SUMMARY", 14, y);
  y += 6;

  let hasTeams = false;
  data.collegeStats.forEach((c) => {
    if (c.teams && c.teams.length > 0) {
      hasTeams = true;
      if (y > 265) {
        doc.addPage();
        y = 15;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(30, 41, 59);
      doc.text(`🏫 ${c.collegeName} (${c.teams.length} Teams)`, 14, y);
      y += 5;

      c.teams.forEach((t) => {
        if (y > 270) {
          doc.addPage();
          y = 15;
        }

        const memberNames = (t.team_members || [])
          .map((m: any) => m.profiles?.full_name || m.profiles?.email || "Member")
          .join(", ");

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text(`  • Team "${t.name}" (${(t.team_members || []).length} members): ${memberNames || "No roster data"}`, 16, y);
        y += 4.5;
      });

      y += 2;
    }
  });

  if (!hasTeams) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text("No teams created yet across institutions.", 14, y);
  }

  // Footer on all pages
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`HackerMate SIH 2026 Telemetry Report  |  Page ${i} of ${pageCount}`, 105, 290, { align: "center" });
  }

  const pdfArrayBuffer = doc.output("arraybuffer");
  return Buffer.from(pdfArrayBuffer);
}
