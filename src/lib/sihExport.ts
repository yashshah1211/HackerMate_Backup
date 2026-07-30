/**
 * Smart India Hackathon (SIH) 2026 SPOC Dossier Export Utility
 * Generates official nomination packages in CSV, JSON, Printable HTML/PDF, and SPOC Email format.
 */

export type SIHTeamMemberExport = {
  id: string;
  role: string;
  project_role?: string;
  profiles: {
    id: string;
    full_name: string;
    email: string;
    avatar_url?: string | null;
    skills?: string[] | null;
    gender?: string | null;
    college?: string | null;
    year_of_study?: string | number | null;
    stream_branch?: string | null;
    phone?: string | null;
  };
};

export type SIHTeamExport = {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  max_members: number;
  college: string | null;
  hackathon_name?: string | null;
  skills?: string[] | null;
  roles_needed?: string[] | null;
  github_repo_url?: string | null;
  problem_statement_id?: string | null;
  problem_statement_title?: string | null;
};

export type SIHComplianceResult = {
  isCompliant: boolean;
  memberCount: number;
  hasSixMembers: boolean;
  hasFemaleMember: boolean;
  femaleCount: number;
  sameCollege: boolean;
  missingRoles: string[];
  issues: string[];
};

/**
 * Audit SIH Compliance rules for a given team and member list
 */
export function checkSIHCompliance(
  team: SIHTeamExport,
  members: SIHTeamMemberExport[]
): SIHComplianceResult {
  const memberCount = members.length;
  const hasSixMembers = memberCount === 6;

  const femaleCount = members.filter(
    (m) => m.profiles?.gender?.toLowerCase() === "female"
  ).length;
  const hasFemaleMember = femaleCount >= 1;

  // Check college consistency
  const teamCollege = team.college?.trim().toLowerCase();
  const mismatchedColleges = members.filter(
    (m) =>
      m.profiles?.college &&
      teamCollege &&
      m.profiles.college.trim().toLowerCase() !== teamCollege
  );
  const sameCollege = mismatchedColleges.length === 0;

  // Check skills coverage
  const combinedSkillsSet = new Set<string>();
  members.forEach((m) => {
    (m.profiles?.skills || []).forEach((s) => combinedSkillsSet.add(s));
  });
  const combinedSkills = Array.from(combinedSkillsSet);

  const coreRoles = ["Frontend", "Backend", "AI/ML", "UI/UX", "Mobile"];
  const missingRoles = coreRoles.filter(
    (role) =>
      !combinedSkills.some((s) => s.toLowerCase().includes(role.toLowerCase()))
  );

  const issues: string[] = [];
  if (!hasSixMembers) {
    issues.push(`SIH requires exactly 6 team members (Currently: ${memberCount}/6)`);
  }
  if (!hasFemaleMember) {
    issues.push("SIH mandates at least 1 female team member.");
  }
  if (!sameCollege) {
    issues.push("All team members must belong to the same college/institution.");
  }

  const isCompliant = hasSixMembers && hasFemaleMember && sameCollege;

  return {
    isCompliant,
    memberCount,
    hasSixMembers,
    hasFemaleMember,
    femaleCount,
    sameCollege,
    missingRoles,
    issues,
  };
}

/**
 * Clean string helper for CSV escaping
 */
function escapeCSV(str: string | null | undefined): string {
  if (!str) return '""';
  const escaped = String(str).replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * 1. Export Official SIH CSV File
 */
export function exportSIHTeamCSV(
  team: SIHTeamExport,
  members: SIHTeamMemberExport[]
): void {
  const compliance = checkSIHCompliance(team, members);

  // Headers matching standard SIH SPOC upload template
  const headers = [
    "SIH Registration ID",
    "Team Name",
    "Institution / College Name",
    "Compliance Status",
    "Problem Statement ID / Title",
    "Project Abstract / Description",
    "Leader Full Name",
    "Leader Email",
    "Leader Gender",
    "Leader Project Role",
    "Member 2 Full Name",
    "Member 2 Email",
    "Member 2 Gender",
    "Member 2 Project Role",
    "Member 3 Full Name",
    "Member 3 Email",
    "Member 3 Gender",
    "Member 3 Project Role",
    "Member 4 Full Name",
    "Member 4 Email",
    "Member 4 Gender",
    "Member 4 Project Role",
    "Member 5 Full Name",
    "Member 5 Email",
    "Member 5 Gender",
    "Member 5 Project Role",
    "Member 6 Full Name",
    "Member 6 Email",
    "Member 6 Gender",
    "Member 6 Project Role",
    "GitHub / Demo Repo",
  ];

  // Sort members: Leader (owner) first
  const sortedMembers = [...members].sort((a, b) => {
    if (a.role === "owner" || a.profiles.id === team.owner_id) return -1;
    if (b.role === "owner" || b.profiles.id === team.owner_id) return 1;
    return 0;
  });

  const rowValues: string[] = [
    escapeCSV("PENDING_SPOC_ASSIGNMENT"),
    escapeCSV(team.name),
    escapeCSV(team.college || "Unspecified College"),
    escapeCSV(compliance.isCompliant ? "VERIFIED COMPLIANT" : "ACTION REQUIRED"),
    escapeCSV(team.problem_statement_title || team.problem_statement_id || "To Be Finalized"),
    escapeCSV(team.description || "SIH 2026 Innovation Proposal"),
  ];

  // Fill 6 member columns
  for (let i = 0; i < 6; i++) {
    const m = sortedMembers[i];
    if (m) {
      rowValues.push(escapeCSV(m.profiles.full_name || "Anonymous Member"));
      rowValues.push(escapeCSV(m.profiles.email || "No email provided"));
      rowValues.push(escapeCSV(m.profiles.gender || "Unspecified"));
      rowValues.push(escapeCSV(m.project_role || (m.role === "owner" ? "Team Leader" : "Developer")));
    } else {
      rowValues.push(escapeCSV("[Vacant Member Slot]"));
      rowValues.push(escapeCSV("N/A"));
      rowValues.push(escapeCSV("N/A"));
      rowValues.push(escapeCSV("N/A"));
    }
  }

  rowValues.push(escapeCSV(team.github_repo_url || "N/A"));

  const csvContent = "\uFEFF" + headers.join(",") + "\n" + rowValues.join(",");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const fileName = `SIH2026_SPOC_Nomination_${team.name.replace(/\s+/g, "_")}.csv`;

  link.setAttribute("href", url);
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 2. Export Structured JSON File
 */
export function exportSIHTeamJSON(
  team: SIHTeamExport,
  members: SIHTeamMemberExport[]
): void {
  const compliance = checkSIHCompliance(team, members);

  const payload = {
    sih_meta: {
      generated_by: "HackerMate Platform",
      generated_at: new Date().toISOString(),
      hackathon: "Smart India Hackathon 2026",
      compliance_audit: compliance,
    },
    team: {
      id: team.id,
      name: team.name,
      college: team.college,
      description: team.description,
      github_repo: team.github_repo_url || null,
      problem_statement: team.problem_statement_title || team.problem_statement_id || null,
    },
    members: members.map((m, idx) => ({
      slot: idx + 1,
      is_leader: m.role === "owner" || m.profiles.id === team.owner_id,
      full_name: m.profiles.full_name,
      email: m.profiles.email,
      gender: m.profiles.gender || "Unspecified",
      project_role: m.project_role || (m.role === "owner" ? "Team Leader" : "Member"),
      skills: m.profiles.skills || [],
    })),
  };

  const jsonString = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const fileName = `SIH2026_Team_${team.name.replace(/\s+/g, "_")}.json`;

  link.setAttribute("href", url);
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 3. Generate Copyable SPOC Email Brief
 */
export function generateSPOCEmailSummary(
  team: SIHTeamExport,
  members: SIHTeamMemberExport[]
): string {
  const compliance = checkSIHCompliance(team, members);
  const leader = members.find((m) => m.role === "owner" || m.profiles.id === team.owner_id) || members[0];

  let emailText = `Subject: Official Nomination Request - Smart India Hackathon (SIH) 2026 | Team ${team.name}\n\n`;
  emailText += `Respected College SPOC / Faculty Coordinator,\n\n`;
  emailText += `We are pleased to submit our team nomination for Smart India Hackathon (SIH) 2026 internal college selection.\n\n`;
  emailText += `--- TEAM INFORMATION ---\n`;
  emailText += `Team Name: ${team.name}\n`;
  emailText += `Institution: ${team.college || "Our Institution"}\n`;
  emailText += `SIH Compliance Status: ${compliance.isCompliant ? "VERIFIED PASS (6 Members + Female Member Included)" : "IN PROGRESS (" + compliance.issues.join("; ") + ")"}\n\n`;

  emailText += `--- TEAM ROSTER (6 MEMBERS) ---\n`;
  members.forEach((m, i) => {
    const isL = m.role === "owner" || m.profiles.id === team.owner_id;
    emailText += `${i + 1}. ${m.profiles.full_name || "Member"} ${isL ? "(Team Leader)" : ""}\n`;
    emailText += `   Email: ${m.profiles.email || "N/A"} | Gender: ${m.profiles.gender || "Not Specified"} | Role: ${m.project_role || "Developer"}\n`;
  });

  emailText += `\n--- PROBLEM STATEMENT & SUMMARY ---\n`;
  emailText += `Project Description: ${team.description || "SIH 2026 Submission Proposal"}\n`;
  if (team.github_repo_url) {
    emailText += `Repository / Prototype: ${team.github_repo_url}\n`;
  }
  emailText += `\nKindly register our team on the official SIH portal (sih.gov.in) under our institution's quota.\n\n`;
  emailText += `Sincerely,\n`;
  emailText += `${leader?.profiles?.full_name || "Team Leader"}\n`;
  emailText += `${leader?.profiles?.email || ""}\n`;
  emailText += `Created via HackerMate Platform`;

  return emailText;
}

/**
 * 4. Open Printable Official PDF/HTML Nomination Sheet
 */
export function openSIHPrintDossier(
  team: SIHTeamExport,
  members: SIHTeamMemberExport[]
): void {
  const compliance = checkSIHCompliance(team, members);
  const leader = members.find((m) => m.role === "owner" || m.profiles.id === team.owner_id) || members[0];

  const printWindow = window.open("", "_blank", "width=900,height=1000");
  if (!printWindow) {
    alert("Please allow popups to open the printable SIH dossier.");
    return;
  }

  const membersHTML = members
    .map(
      (m, idx) => `
    <tr style="border-bottom: 1px solid #E4E4E7;">
      <td style="padding: 10px; font-weight: bold;">${idx + 1}</td>
      <td style="padding: 10px;">
        <strong>${m.profiles.full_name || "Anonymous Member"}</strong>
        ${(m.role === "owner" || m.profiles.id === team.owner_id) ? '<span style="background: #FEF3C7; color: #92400E; font-size: 10px; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">TEAM LEADER</span>' : ""}
      </td>
      <td style="padding: 10px; font-family: monospace;">${m.profiles.email || "N/A"}</td>
      <td style="padding: 10px;">${m.profiles.gender || "Unspecified"}</td>
      <td style="padding: 10px;">${m.project_role || (m.role === "owner" ? "Team Leader" : "Developer")}</td>
    </tr>
  `
    )
    .join("");

  const issuesHTML = compliance.issues.length > 0
    ? `<div style="background: #FEF2F2; border: 1px solid #FCA5A5; color: #991B1B; padding: 12px; border-radius: 8px; margin-bottom: 20px; font-size: 13px;">
        <strong>⚠️ Pending SIH Compliance Requirements:</strong>
        <ul style="margin: 6px 0 0 18px; padding: 0;">
          ${compliance.issues.map((issue) => `<li>${issue}</li>`).join("")}
        </ul>
       </div>`
    : `<div style="background: #ECFDF5; border: 1px solid #6EE7B7; color: #065F46; padding: 12px; border-radius: 8px; margin-bottom: 20px; font-size: 13px;">
        <strong>✅ Verified SIH Compliant:</strong> 6 Members registered, Female member included, same college verified.
       </div>`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>SIH 2026 Official SPOC Dossier - ${team.name}</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; color: #18181B; margin: 0; padding: 40px; background: #fff; }
          .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #F97316; padding-bottom: 20px; margin-bottom: 24px; }
          .title { font-size: 24px; font-weight: 800; color: #09090B; }
          .subtitle { font-size: 13px; color: #71717A; margin-top: 4px; font-family: monospace; }
          .badge { background: #FFF7ED; color: #C2410C; border: 1px solid #FFEDD5; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: bold; font-family: monospace; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
          .card { background: #FAFAFA; border: 1px solid #E4E4E7; border-radius: 8px; padding: 16px; }
          .card-title { font-size: 11px; font-weight: bold; color: #71717A; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
          .card-value { font-size: 15px; font-weight: bold; color: #18181B; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
          th { background: #F4F4F5; padding: 10px; text-align: left; font-size: 11px; color: #52525B; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #E4E4E7; }
          .footer { font-size: 11px; color: #A1A1AA; text-align: center; margin-top: 40px; border-top: 1px solid #E4E4E7; padding-top: 16px; }
          @media print {
            body { padding: 20px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 20px; text-align: right;">
          <button onclick="window.print()" style="background: #F97316; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer;">
            🖨️ Print / Save as PDF
          </button>
        </div>

        <div class="header">
          <div>
            <div class="title">Official SIH 2026 SPOC Dossier</div>
            <div class="subtitle">Smart India Hackathon Institution Nomination Record</div>
          </div>
          <div class="badge">🇮🇳 HACKERMATE VERIFIED</div>
        </div>

        ${issuesHTML}

        <div class="grid">
          <div class="card">
            <div class="card-title">Team Name</div>
            <div class="card-value">${team.name}</div>
          </div>
          <div class="card">
            <div class="card-title">Institution / College</div>
            <div class="card-value">${team.college || "Unspecified Institution"}</div>
          </div>
          <div class="card">
            <div class="card-title">Team Leader</div>
            <div class="card-value">${leader?.profiles?.full_name || "N/A"} (${leader?.profiles?.email || "N/A"})</div>
          </div>
          <div class="card">
            <div class="card-title">Total Headcount</div>
            <div class="card-value">${members.length} / 6 Members</div>
          </div>
        </div>

        <div class="card" style="margin-bottom: 24px;">
          <div class="card-title">Project Summary / Proposal Abstract</div>
          <div style="font-size: 13px; color: #3F3F46; margin-top: 4px; line-height: 1.5;">
            ${team.description || "Smart India Hackathon 2026 proposal."}
          </div>
        </div>

        <div class="card-title" style="margin-bottom: 8px;">Official 6-Member Team Roster</div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Member Name</th>
              <th>Email Address</th>
              <th>Gender</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            ${membersHTML}
          </tbody>
        </table>

        <div class="footer">
          Generated automatically via HackerMate Platform for Smart India Hackathon 2026 • Verified on ${new Date().toLocaleDateString()}
        </div>
      </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}
