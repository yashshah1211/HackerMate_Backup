import { SupabaseClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";

export interface DatabaseActivityData {
  timeWindow: {
    since: string;
    until: string;
    isFallback24h: boolean;
  };
  summary: {
    totalNewItems: number;
    newBuilders: number;
    newTeams: number;
    newMembers: number;
    newInvites: number;
    newRequests: number;
    newHackathons: number;
    newFeedback: number;
    newMessages: number;
    updatedDocs: number;
  };
  profiles: {
    id: string;
    full_name: string | null;
    email: string;
    college: string | null;
    role: string | null;
    skills: string[] | null;
    created_at: string;
  }[];
  teams: {
    id: string;
    name: string;
    description: string | null;
    college: string | null;
    is_recruiting: boolean | null;
    owner_id: string;
    created_at: string;
    owner_name?: string;
  }[];
  team_members: {
    id: string;
    team_id: string;
    user_id: string;
    role: string | null;
    project_role: string | null;
    created_at: string;
    team_name?: string;
    user_name?: string;
  }[];
  team_hackathons: {
    team_id: string;
    hackathon_id: string;
    created_at: string;
    team_name?: string;
    hackathon_name?: string;
  }[];
  team_invites: {
    id: string;
    team_id: string;
    invited_user_id: string;
    invited_by: string;
    status: string;
    created_at: string;
    team_name?: string;
    invited_name?: string;
    invited_email?: string;
  }[];
  friend_requests: {
    id: string;
    sender_id: string;
    receiver_id: string;
    status: string;
    created_at: string;
    sender_name?: string;
    receiver_name?: string;
  }[];
  hackathons: {
    id: string;
    name: string;
    start_date: string | null;
    end_date: string | null;
    location: string | null;
    mode: string | null;
    prize_pool: string | null;
    created_at: string;
  }[];
  feedback: {
    id: string;
    user_id: string | null;
    user_email: string | null;
    type: string;
    message: string;
    created_at: string;
    user_name?: string;
  }[];
  team_documents: {
    id: string;
    team_id: string;
    updated_by: string;
    updated_at: string;
    team_name?: string;
    updater_name?: string;
  }[];
  messages_count_24h: number;
}

/**
 * Fetches incremental database activity since the specified timestamp
 * or defaults to the last 24 hours.
 */
export async function fetchDatabaseActivity(
  supabaseAdmin: SupabaseClient,
  sinceTimestamp?: string
): Promise<DatabaseActivityData> {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  let since = sinceTimestamp;
  let isFallback24h = false;

  if (!since) {
    // Try to load last_db_report_run from app_settings
    try {
      const { data: setting } = await supabaseAdmin
        .from("app_settings")
        .select("key, value")
        .eq("key", "last_db_report_run")
        .maybeSingle();

      if (setting?.value) {
        since = setting.value;
      }
    } catch (err) {
      console.warn("[Database Activity Report] Could not read app_settings last_db_report_run:", err);
    }
  }

  if (!since) {
    since = twentyFourHoursAgo;
    isFallback24h = true;
  }

  const until = now.toISOString();

  // 1. Fetch new profiles
  const { data: rawProfiles } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, college, role, skills, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  // 2. Fetch new teams
  const { data: rawTeams } = await supabaseAdmin
    .from("teams")
    .select("id, name, description, college, is_recruiting, owner_id, created_at, profiles!teams_owner_id_fkey(full_name)")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  // 3. Fetch new team members
  const { data: rawMembers } = await supabaseAdmin
    .from("team_members")
    .select("id, team_id, user_id, role, project_role, created_at, teams(name), profiles(full_name, email)")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  // 4. Fetch new team hackathon registrations
  const { data: rawTeamHackathons } = await supabaseAdmin
    .from("team_hackathons")
    .select("team_id, hackathon_id, created_at, teams(name), hackathons(name)")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  // 5. Fetch new team invites
  const { data: rawInvites } = await supabaseAdmin
    .from("team_invites")
    .select("id, team_id, invited_user_id, invited_by, status, created_at, teams(name), profiles!team_invites_invited_user_id_fkey(full_name, email)")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  // 6. Fetch new connection requests
  const { data: rawRequests } = await supabaseAdmin
    .from("friend_requests")
    .select("id, sender_id, receiver_id, status, created_at, sender:profiles!friend_requests_sender_id_fkey(full_name), receiver:profiles!friend_requests_receiver_id_fkey(full_name, email)")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  // 7. Fetch new hackathons
  const { data: rawHackathons } = await supabaseAdmin
    .from("hackathons")
    .select("id, name, start_date, end_date, location, mode, prize_pool, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  // 8. Fetch new feedback submissions
  const { data: rawFeedback } = await supabaseAdmin
    .from("feedback")
    .select("id, user_id, user_email, type, message, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  // 9. Fetch updated team documents
  const { data: rawDocs } = await supabaseAdmin
    .from("team_documents")
    .select("id, team_id, updated_by, updated_at, teams(name)")
    .gte("updated_at", since)
    .order("updated_at", { ascending: false });

  // 10. Count messages in window
  const { count: msgCount } = await supabaseAdmin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);

  // Map and sanitize records
  const profiles = (rawProfiles || []).map((p: any) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    college: p.college,
    role: p.role,
    skills: p.skills,
    created_at: p.created_at,
  }));

  const teams = (rawTeams || []).map((t: any) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    college: t.college,
    is_recruiting: t.is_recruiting,
    owner_id: t.owner_id,
    created_at: t.created_at,
    owner_name: t.profiles?.full_name || "Unknown",
  }));

  const team_members = (rawMembers || []).map((m: any) => ({
    id: m.id,
    team_id: m.team_id,
    user_id: m.user_id,
    role: m.role,
    project_role: m.project_role,
    created_at: m.created_at,
    team_name: m.teams?.name || "Unknown Team",
    user_name: m.profiles?.full_name || m.profiles?.email || "Unknown User",
  }));

  const team_hackathons = (rawTeamHackathons || []).map((th: any) => ({
    team_id: th.team_id,
    hackathon_id: th.hackathon_id,
    created_at: th.created_at,
    team_name: th.teams?.name || "Unknown Team",
    hackathon_name: th.hackathons?.name || "Unknown Hackathon",
  }));

  const team_invites = (rawInvites || []).map((inv: any) => ({
    id: inv.id,
    team_id: inv.team_id,
    invited_user_id: inv.invited_user_id,
    invited_by: inv.invited_by,
    status: inv.status,
    created_at: inv.created_at,
    team_name: inv.teams?.name || "Unknown Team",
    invited_name: inv.profiles?.full_name || "Teammate",
    invited_email: inv.profiles?.email || "N/A",
  }));

  const friend_requests = (rawRequests || []).map((req: any) => ({
    id: req.id,
    sender_id: req.sender_id,
    receiver_id: req.receiver_id,
    status: req.status,
    created_at: req.created_at,
    sender_name: req.sender?.full_name || "Unknown",
    receiver_name: req.receiver?.full_name || req.receiver?.email || "Unknown",
  }));

  const hackathons = (rawHackathons || []).map((h: any) => ({
    id: h.id,
    name: h.name,
    start_date: h.start_date,
    end_date: h.end_date,
    location: h.location,
    mode: h.mode,
    prize_pool: h.prize_pool,
    created_at: h.created_at,
  }));

  const feedback = (rawFeedback || []).map((f: any) => ({
    id: f.id,
    user_id: f.user_id,
    user_email: f.user_email,
    type: f.type,
    message: f.message,
    created_at: f.created_at,
  }));

  const team_documents = (rawDocs || []).map((d: any) => ({
    id: d.id,
    team_id: d.team_id,
    updated_by: d.updated_by,
    updated_at: d.updated_at,
    team_name: d.teams?.name || "Unknown Team",
  }));

  const messages_count_24h = msgCount || 0;

  const totalNewItems =
    profiles.length +
    teams.length +
    team_members.length +
    team_hackathons.length +
    team_invites.length +
    friend_requests.length +
    hackathons.length +
    feedback.length +
    team_documents.length;

  return {
    timeWindow: {
      since,
      until,
      isFallback24h,
    },
    summary: {
      totalNewItems,
      newBuilders: profiles.length,
      newTeams: teams.length,
      newMembers: team_members.length,
      newInvites: team_invites.length,
      newRequests: friend_requests.length,
      newHackathons: hackathons.length,
      newFeedback: feedback.length,
      newMessages: messages_count_24h,
      updatedDocs: team_documents.length,
    },
    profiles,
    teams,
    team_members,
    team_hackathons,
    team_invites,
    friend_requests,
    hackathons,
    feedback,
    team_documents,
    messages_count_24h,
  };
}

/**
 * Formats ISO date into clean human-readable date & time (IST)
 */
function formatDateTime(isoStr?: string | null): string {
  if (!isoStr) return "-";
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return isoStr;
  }
}

function truncate(str: string | null | undefined, maxLen = 30): string {
  if (!str) return "-";
  return str.length > maxLen ? str.substring(0, maxLen - 2) + "..." : str;
}

/**
 * Generates an executive, styled, multi-page PDF of database activity
 */
export function generateDatabaseActivityPdf(data: DatabaseActivityData): Buffer {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  let y = 14;

  const dateHeaderStr = new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });

  const windowStr = `Window: Since ${formatDateTime(data.timeWindow.since)} IST (${data.summary.totalNewItems} new records)`;

  // --- 1. Top Brand Header Banner ---
  doc.setFillColor(10, 13, 18); // Dark Navy / Slate-950
  doc.rect(0, 0, pageWidth, 36, "F");

  // Lime Accent Top Border
  doc.setFillColor(180, 244, 97); // HackerMate Lime (#B4F461)
  doc.rect(0, 0, pageWidth, 3, "F");

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(180, 244, 97);
  doc.text("HACKERMATE", margin, 14);

  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text("Daily Database Activity & System Audit Report", margin, 22);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`Generated: ${dateHeaderStr} IST  •  ${windowStr}`, margin, 30);

  y = 44;

  // --- 2. KPI Summary Metric Cards (4 Cards) ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text("ACTIVITY SUMMARY OVERVIEW", margin, y);
  y += 5;

  const cardW = (contentWidth - 9) / 4;
  const cardH = 20;

  const kpis = [
    { label: "NEW BUILDERS", val: `+${data.summary.newBuilders}`, color: [240, 253, 244], textColor: [21, 128, 61] },
    { label: "NEW TEAMS", val: `+${data.summary.newTeams}`, color: [254, 243, 199], textColor: [180, 83, 9] },
    { label: "INVITES SENT", val: `+${data.summary.newInvites}`, color: [238, 242, 255], textColor: [67, 56, 202] },
    { label: "CONNECTION REQS", val: `+${data.summary.newRequests}`, color: [254, 226, 226], textColor: [185, 28, 28] },
  ];

  kpis.forEach((kpi, idx) => {
    const cx = margin + idx * (cardW + 3);
    doc.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.roundedRect(cx, y, cardW, cardH, 2, 2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(kpi.textColor[0], kpi.textColor[1], kpi.textColor[2]);
    doc.text(kpi.label, cx + 3, y + 6);

    doc.setFontSize(13);
    doc.text(kpi.val, cx + 3, y + 15);
  });

  y += cardH + 8;

  // Helper function for rendering structured table sections
  function checkPageBreak(neededHeight: number) {
    if (y + neededHeight > pageHeight - 18) {
      doc.addPage();
      y = 16;
    }
  }

  function renderSectionHeader(title: string, count: number) {
    checkPageBreak(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(`${title} (${count})`, margin, y);
    y += 4;
  }

  function renderTableHeader(columns: { label: string; width: number; align?: "left" | "right" }[]) {
    checkPageBreak(8);
    doc.setFillColor(30, 41, 59); // Slate-800
    doc.rect(margin, y, contentWidth, 6.5, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);

    let cx = margin + 2;
    columns.forEach((col) => {
      if (col.align === "right") {
        doc.text(col.label, cx + col.width - 4, y + 4.5, { align: "right" });
      } else {
        doc.text(col.label, cx, y + 4.5);
      }
      cx += col.width;
    });

    y += 6.5;
  }

  // --- SECTION 1: New Builders / Profiles ---
  renderSectionHeader("1. New Registered Builders (public.profiles)", data.profiles.length);
  if (data.profiles.length === 0) {
    checkPageBreak(6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("No new builder registrations in this window.", margin, y + 4);
    y += 8;
  } else {
    const profileCols = [
      { label: "NAME", width: 44 },
      { label: "EMAIL", width: 52 },
      { label: "COLLEGE / INSTITUTION", width: 50 },
      { label: "REGISTERED (IST)", width: 36, align: "right" as const },
    ];
    renderTableHeader(profileCols);

    data.profiles.forEach((p, idx) => {
      checkPageBreak(6);
      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, contentWidth, 6, "F");
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);

      let cx = margin + 2;
      doc.text(truncate(p.full_name || "Builder", 24), cx, y + 4.2);
      cx += 44;
      doc.setTextColor(71, 85, 105);
      doc.text(truncate(p.email, 28), cx, y + 4.2);
      cx += 52;
      doc.text(truncate(p.college, 26), cx, y + 4.2);
      cx += 50;
      doc.text(formatDateTime(p.created_at), cx + 36 - 4, y + 4.2, { align: "right" });

      y += 6;
    });
    y += 4;
  }

  // --- SECTION 2: New Teams ---
  renderSectionHeader("2. New Teams Formed (public.teams)", data.teams.length);
  if (data.teams.length === 0) {
    checkPageBreak(6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("No new teams created in this window.", margin, y + 4);
    y += 8;
  } else {
    const teamCols = [
      { label: "TEAM NAME", width: 50 },
      { label: "LEADER / OWNER", width: 44 },
      { label: "COLLEGE", width: 52 },
      { label: "CREATED (IST)", width: 36, align: "right" as const },
    ];
    renderTableHeader(teamCols);

    data.teams.forEach((t, idx) => {
      checkPageBreak(6);
      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, contentWidth, 6, "F");
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);

      let cx = margin + 2;
      doc.text(truncate(t.name, 28), cx, y + 4.2);
      cx += 50;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text(truncate(t.owner_name, 24), cx, y + 4.2);
      cx += 44;

      doc.text(truncate(t.college, 28), cx, y + 4.2);
      cx += 52;

      doc.text(formatDateTime(t.created_at), cx + 36 - 4, y + 4.2, { align: "right" });

      y += 6;
    });
    y += 4;
  }

  // --- SECTION 3: New Team Members Joined ---
  renderSectionHeader("3. New Team Member Additions (public.team_members)", data.team_members.length);
  if (data.team_members.length === 0) {
    checkPageBreak(6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("No new team member additions in this window.", margin, y + 4);
    y += 8;
  } else {
    const memberCols = [
      { label: "TEAM NAME", width: 55 },
      { label: "DEVELOPER", width: 50 },
      { label: "ROLE", width: 41 },
      { label: "JOINED (IST)", width: 36, align: "right" as const },
    ];
    renderTableHeader(memberCols);

    data.team_members.forEach((m, idx) => {
      checkPageBreak(6);
      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, contentWidth, 6, "F");
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);

      let cx = margin + 2;
      doc.text(truncate(m.team_name, 30), cx, y + 4.2);
      cx += 55;

      doc.setTextColor(71, 85, 105);
      doc.text(truncate(m.user_name, 26), cx, y + 4.2);
      cx += 50;

      const roleStr = m.project_role || m.role || "Member";
      doc.text(truncate(roleStr, 22), cx, y + 4.2);
      cx += 41;

      doc.text(formatDateTime(m.created_at), cx + 36 - 4, y + 4.2, { align: "right" });

      y += 6;
    });
    y += 4;
  }

  // --- SECTION 4: Team Hackathon Links ---
  renderSectionHeader("4. Hackathon Team Registrations (public.team_hackathons)", data.team_hackathons.length);
  if (data.team_hackathons.length === 0) {
    checkPageBreak(6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("No new hackathon registrations in this window.", margin, y + 4);
    y += 8;
  } else {
    const thCols = [
      { label: "TEAM NAME", width: 70 },
      { label: "HACKATHON EVENT", width: 76 },
      { label: "REGISTERED (IST)", width: 36, align: "right" as const },
    ];
    renderTableHeader(thCols);

    data.team_hackathons.forEach((th, idx) => {
      checkPageBreak(6);
      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, contentWidth, 6, "F");
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);

      let cx = margin + 2;
      doc.text(truncate(th.team_name, 38), cx, y + 4.2);
      cx += 70;

      doc.setTextColor(71, 85, 105);
      doc.text(truncate(th.hackathon_name, 42), cx, y + 4.2);
      cx += 76;

      doc.text(formatDateTime(th.created_at), cx + 36 - 4, y + 4.2, { align: "right" });

      y += 6;
    });
    y += 4;
  }

  // --- SECTION 5: Team Invites & Connection Requests ---
  const totalInvitesAndRequests = data.team_invites.length + data.friend_requests.length;
  renderSectionHeader("5. Outreach, Team Invites & Connection Requests", totalInvitesAndRequests);
  if (totalInvitesAndRequests === 0) {
    checkPageBreak(6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("No new team invites or connection requests in this window.", margin, y + 4);
    y += 8;
  } else {
    const invCols = [
      { label: "TYPE", width: 35 },
      { label: "SENDER / TEAM", width: 60 },
      { label: "RECIPIENT", width: 51 },
      { label: "SENT (IST)", width: 36, align: "right" as const },
    ];
    renderTableHeader(invCols);

    data.team_invites.forEach((inv, idx) => {
      checkPageBreak(6);
      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, contentWidth, 6, "F");
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(67, 56, 202);

      let cx = margin + 2;
      doc.text("Invite", cx, y + 4.2);
      cx += 35;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(15, 23, 42);
      doc.text(truncate(inv.team_name, 32), cx, y + 4.2);
      cx += 60;

      doc.setTextColor(71, 85, 105);
      doc.text(truncate(inv.invited_name, 26), cx, y + 4.2);
      cx += 51;

      doc.text(formatDateTime(inv.created_at), cx + 36 - 4, y + 4.2, { align: "right" });
      y += 6;
    });

    data.friend_requests.forEach((req, idx) => {
      checkPageBreak(6);
      if ((idx + data.team_invites.length) % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, contentWidth, 6, "F");
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(185, 28, 28);

      let cx = margin + 2;
      doc.text("Connect", cx, y + 4.2);
      cx += 35;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(15, 23, 42);
      doc.text(truncate(req.sender_name, 32), cx, y + 4.2);
      cx += 60;

      doc.setTextColor(71, 85, 105);
      doc.text(truncate(req.receiver_name, 26), cx, y + 4.2);
      cx += 51;

      doc.text(formatDateTime(req.created_at), cx + 36 - 4, y + 4.2, { align: "right" });
      y += 6;
    });
    y += 4;
  }

  // --- SECTION 6: User Feedback & Reports ---
  if (data.feedback.length > 0) {
    renderSectionHeader("6. User Feedback Submissions (public.feedback)", data.feedback.length);
    const fbCols = [
      { label: "USER / EMAIL", width: 50 },
      { label: "CATEGORY", width: 28 },
      { label: "MESSAGE CONTENT", width: 68 },
      { label: "SUBMITTED (IST)", width: 36, align: "right" as const },
    ];
    renderTableHeader(fbCols);

    data.feedback.forEach((f, idx) => {
      checkPageBreak(6);
      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, contentWidth, 6, "F");
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);

      let cx = margin + 2;
      doc.text(truncate(f.user_email || f.user_id, 26), cx, y + 4.2);
      cx += 50;

      doc.setTextColor(180, 83, 9);
      doc.text(truncate(f.type, 14), cx, y + 4.2);
      cx += 28;

      doc.setTextColor(71, 85, 105);
      doc.text(truncate(f.message, 38), cx, y + 4.2);
      cx += 68;

      doc.text(formatDateTime(f.created_at), cx + 36 - 4, y + 4.2, { align: "right" });
      y += 6;
    });
    y += 4;
  }

  // Add Footers and Page Numbers
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240); // Slate-200
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // Slate-400
    doc.text("HackerMate Automated Database Activity Digest • System Confidential", margin, pageHeight - 7);
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - 7, { align: "right" });
  }

  const pdfArrayBuffer = doc.output("arraybuffer");
  return Buffer.from(pdfArrayBuffer);
}
