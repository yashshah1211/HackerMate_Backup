"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";

type Hackathon = {
  id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  mode: string | null;
  prize_pool: string | null;
  website_url: string | null;
  tags: string[] | null;
  type: string | null;
  organizer_id: string | null;
};

type Team = {
  id: string;
  name: string;
  description: string;
  college: string | null;
  skills: string[] | null;
  roles_needed: string[] | null;
  max_members: number;
};

type Registration = {
  id: string;
  user_id: string;
  team_id: string | null;
  created_at: string;
  profiles: {
    id: string;
    full_name: string;
    email: string;
    college: string | null;
  };
  teams?: {
    id: string;
    name: string;
  } | null;
};

function formatDateRange(start: string | null, end: string | null) {
  if (!start) return "Date TBA";
  const opts: Intl.DateTimeFormatOptions = {
    month: "long",
    day: "numeric",
    year: "numeric",
  };
  const startStr = new Date(start).toLocaleDateString("en-US", opts);
  if (!end || end === start) return startStr;
  const endStr = new Date(end).toLocaleDateString("en-US", opts);
  return `${startStr} – ${endStr}`;
}

function htmlToPlainText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function HackathonDetailContent() {
  const params = useParams();
  const hackathonId = params.id as string;

  const [hackathon, setHackathon] = useState<Hackathon | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  // Hybrid system states
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [userOwnedTeams, setUserOwnedTeams] = useState<{ id: string; name: string; hackathon_id: string | null; owner_id: string }[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  
  // Modals & form states
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);

  // Tab controls
  const [activeTab, setActiveTab] = useState<"teams" | "participants" | "organizer">("teams");
  
  // Description expansion state
  const [isDescExpanded, setIsDescExpanded] = useState(false);

  async function loadData() {
    try {
      const { data: hackathonData, error: hackathonError } = await supabase
        .from("hackathons")
        .select("*")
        .eq("id", hackathonId)
        .single();

      if (hackathonError) {
        console.error(hackathonError);
        setLoading(false);
        return;
      }

      setHackathon(hackathonData);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setCurrentUserId(user.id);
        if (hackathonData.type === "native" && hackathonData.organizer_id === user.id) {
          setIsOrganizer(true);
        }

        // Check if user is registered for native hackathon
        const { data: regCheck } = await supabase
          .from("hackathon_registrations")
          .select("id")
          .eq("hackathon_id", hackathonId)
          .eq("user_id", user.id)
          .maybeSingle();

        setIsRegistered(!!regCheck);

        // Load user-owned teams to support linking/registering
        const { data: ownedTeams } = await supabase
          .from("teams")
          .select("id, name, hackathon_id, owner_id")
          .eq("owner_id", user.id);

        setUserOwnedTeams(ownedTeams || []);
      }

      // Load teams participating in this hackathon
      const { data: teamsData, error: teamsError } = await supabase
        .from("teams")
        .select("*")
        .eq("hackathon_id", hackathonId)
        .order("created_at", { ascending: false });

      if (teamsError) {
        console.error(teamsError);
      } else {
        setTeams(teamsData || []);
      }

      // Load native registrations if it's a native hackathon
      if (hackathonData.type === "native") {
        const { data: regData } = await supabase
          .from("hackathon_registrations")
          .select(`
            id,
            user_id,
            team_id,
            created_at,
            profiles (
              id,
              full_name,
              email,
              college
            ),
            teams (
              id,
              name
            )
          `)
          .eq("hackathon_id", hackathonId)
          .order("created_at", { ascending: false });

        setRegistrations((regData as unknown as Registration[]) || []);
      }
    } catch (err) {
      console.error(err);
    }

    setLoading(false);
  }

  useEffect(() => {
    if (hackathonId) {
      Promise.resolve().then(() => {
        loadData();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hackathonId]);

  // Handle Native Registration Flow
  async function handleRegisterNatively() {
    if (!currentUserId || !hackathon) return;
    setInviteLoading(true);

    try {
      // 1. Insert native registration row
      const { error: regError } = await supabase
        .from("hackathon_registrations")
        .insert({
          hackathon_id: hackathon.id,
          user_id: currentUserId,
          team_id: selectedTeam || null,
        });

      if (regError) {
        alert(regError.message);
        setInviteLoading(false);
        return;
      }

      // 2. If registering with a team, update the team's hackathon_id association
      if (selectedTeam) {
        await supabase
          .from("teams")
          .update({ hackathon_id: hackathon.id })
          .eq("id", selectedTeam);
      }

      alert("Successfully registered for the hackathon!");
      setShowRegisterModal(false);
      setSelectedTeam("");
      loadData();
    } catch (err) {
      console.error(err);
      alert("Failed to register.");
    }
    setInviteLoading(false);
  }

  // Handle External Claim Team Flow
  async function handleClaimTeam() {
    if (!selectedTeam || !hackathon) return;
    setInviteLoading(true);

    try {
      const { error } = await supabase
        .from("teams")
        .update({ hackathon_id: hackathon.id })
        .eq("id", selectedTeam);

      if (error) {
        alert(error.message);
      } else {
        alert("Your team has been linked to this hackathon!");
        setShowClaimModal(false);
        setSelectedTeam("");
        loadData();
      }
    } catch (err) {
      console.error(err);
      alert("Failed to claim team.");
    }
    setInviteLoading(false);
  }

  // Cancel Native Registration
  async function handleCancelRegistration() {
    if (!currentUserId || !hackathon) return;
    if (!confirm("Are you sure you want to cancel your registration?")) return;

    try {
      // Find team_id first to unlink if needed
      const { data: reg } = await supabase
        .from("hackathon_registrations")
        .select("team_id")
        .eq("hackathon_id", hackathon.id)
        .eq("user_id", currentUserId)
        .single();

      if (reg?.team_id) {
        await supabase
          .from("teams")
          .update({ hackathon_id: null })
          .eq("id", reg.team_id);
      }

      await supabase
        .from("hackathon_registrations")
        .delete()
        .eq("hackathon_id", hackathon.id)
        .eq("user_id", currentUserId);

      alert("Registration cancelled.");
      loadData();
    } catch (err) {
      console.error(err);
      alert("Failed to cancel registration.");
    }
  }

  if (loading) {
    return (
      <main className="max-w-7xl mx-auto px-6 pt-36 pb-12">
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="w-6 h-6 border-2 border-zinc-800 border-t-white rounded-full animate-spin mb-3" />
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Loading hackathon details...</p>
        </div>
      </main>
    );
  }

  if (!hackathon) {
    return (
      <main className="max-w-7xl mx-auto px-6 pt-36 pb-12">
        <div className="card card-static p-16 text-center">
          <h3 className="text-sm font-semibold text-white mb-2">
            Hackathon not found
          </h3>
          <Link href="/hackathons" className="link text-xs mt-2 inline-block">
            Back to hackathons
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-6 pt-24 pb-12">
      {/* Back link */}
      <div className="mb-6 animate-fade-in-up">
        <Link
          href="/hackathons"
          className="inline-flex items-center gap-2 text-xs text-zinc-500 hover:text-white transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to hackathons
        </Link>
      </div>

      {/* Main Grid */}
      <section className="grid lg:grid-cols-[2fr_1fr] gap-6 mb-10">
        {/* Left - Hackathon Info */}
        <div className="card card-static p-6 md:p-8 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-4">
            <p className="section-label mb-0">HACKATHON DETAILS</p>
            <span className={`badge text-[9px] font-mono py-0.5 px-1.5 uppercase ${
              hackathon.type === "native" ? "badge-success" : "badge-warning"
            }`}>
              {hackathon.type === "native" ? "HackerMate Host" : "External Event"}
            </span>
          </div>

          <h1 className="text-3xl font-semibold tracking-tight text-white mb-3">
            {hackathon.name}
          </h1>

          {(() => {
            const desc = htmlToPlainText(
              hackathon.description || "No description provided."
            );
            const limit = 400;
            const shouldTruncate = desc.length > limit;
            return (
              <div className="mb-6">
                <div 
                  className={`relative overflow-hidden transition-all duration-300 ${
                    shouldTruncate && !isDescExpanded ? "max-h-[240px]" : "max-h-none"
                  }`}
                >
                  <div className="prose-hackathon whitespace-pre-line text-zinc-400 text-sm leading-relaxed">
                    {desc}
                  </div>
                  {shouldTruncate && !isDescExpanded && (
                    <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent pointer-events-none" />
                  )}
                </div>
                {shouldTruncate && (
                  <div className="flex justify-center mt-3 pt-3 border-t border-zinc-900/50">
                    <button
                      onClick={() => setIsDescExpanded(!isDescExpanded)}
                      className="text-xs font-semibold text-white hover:text-zinc-300 transition-colors inline-flex items-center gap-1 font-mono uppercase tracking-wider"
                    >
                      {isDescExpanded ? (
                        <>
                          <span>Read Less</span>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                          </svg>
                        </>
                      ) : (
                        <>
                          <span>Read More</span>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Tags */}
          <div className="pt-5 border-t border-zinc-900">
            <h3 className="section-label mb-3">Tags</h3>
            <div className="flex flex-wrap gap-1.5">
              {hackathon.tags?.length ? (
                hackathon.tags.map((tag) => (
                  <span key={tag} className="badge text-[10px] py-0.5 px-1.5">
                    {tag}
                  </span>
                ))
              ) : (
                <span className="badge text-[10px] text-zinc-600">No tags listed</span>
              )}
            </div>
          </div>
        </div>

        {/* Right - Stats & Actions */}
        <div className="card card-static p-6 md:p-8 animate-fade-in-up stagger-1 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-6">
              {hackathon.mode && (
                <span className="badge badge-primary text-[10px] py-0.5 px-1.5 capitalize">
                  {hackathon.mode}
                </span>
              )}

              <div className="text-right">
                <div className="text-2xl font-semibold text-white leading-none mb-1">
                  {hackathon.type === "native" ? registrations.length : teams.length}
                </div>
                <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-wider">
                  {hackathon.type === "native" ? "Builders Joined" : "Teams Joined"}
                </div>
              </div>
            </div>

            {/* Stats row */}
            <div className="space-y-4 mb-8">
              {/* Date */}
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 rounded bg-zinc-900 border border-zinc-800 text-zinc-500">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-500 font-mono uppercase">Dates</p>
                  <p className="text-xs font-semibold text-white">
                    {formatDateRange(hackathon.start_date, hackathon.end_date)}
                  </p>
                </div>
              </div>

              {/* Location */}
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 rounded bg-zinc-900 border border-zinc-800 text-zinc-500">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-500 font-mono uppercase">Location</p>
                  <p className="text-xs font-semibold text-white">
                    {hackathon.location || "TBA"}
                  </p>
                </div>
              </div>

              {/* Prize Pool */}
              {hackathon.prize_pool && (
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center justify-center w-8 h-8 rounded bg-zinc-900 border border-zinc-800 text-zinc-500">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500 font-mono uppercase">Prize Pool</p>
                    <p className="text-xs font-semibold text-white">
                      {hackathon.prize_pool}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="space-y-2 pt-5 border-t border-zinc-900/50">
            {hackathon.type === "native" ? (
              <>
                {isRegistered ? (
                  <div className="space-y-2">
                    <div className="badge badge-success w-full justify-center py-2 text-xs font-semibold">
                      Registered Natively ✓
                    </div>
                    <button
                      onClick={handleCancelRegistration}
                      className="btn btn-danger btn-sm w-full"
                    >
                      Cancel Registration
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowRegisterModal(true)}
                    className="btn btn-primary w-full"
                  >
                    Register Natively
                  </button>
                )}
              </>
            ) : (
              <>
                {hackathon.website_url && (
                  <a
                    href={hackathon.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary w-full"
                  >
                    Register Externally ↗
                  </a>
                )}
                {userOwnedTeams.length > 0 && (
                  <button
                    onClick={() => setShowClaimModal(true)}
                    className="btn btn-secondary w-full"
                  >
                    Claim Team on HackerMate
                  </button>
                )}
              </>
            )}

            <Link
              href={`/teams/create?hackathon=${hackathon.id}`}
              className="btn btn-secondary w-full btn-sm"
            >
              + Create a Team
            </Link>
          </div>
        </div>
      </section>

      {/* Tabs / Sub-Sections */}
      <section className="animate-fade-in-up stagger-2">
        <div className="flex border-b border-zinc-900 mb-6">
          <button
            onClick={() => setActiveTab("teams")}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 -mb-[2px] transition-colors ${
              activeTab === "teams"
                ? "border-white text-white"
                : "border-transparent text-zinc-500 hover:text-white"
            }`}
          >
            Teams ({teams.length})
          </button>

          {hackathon.type === "native" && (
            <button
              onClick={() => setActiveTab("participants")}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 -mb-[2px] transition-colors ${
                activeTab === "participants"
                  ? "border-white text-white"
                  : "border-transparent text-zinc-500 hover:text-white"
              }`}
            >
              Registered Builders ({registrations.length})
            </button>
          )}

          {isOrganizer && (
            <button
              onClick={() => setActiveTab("organizer")}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 -mb-[2px] transition-colors ${
                activeTab === "organizer"
                  ? "border-white text-white"
                  : "border-transparent text-zinc-500 hover:text-white"
              }`}
            >
              Organizer Portal (Dashboard)
            </button>
          )}
        </div>

        {/* Tab 1: Teams Grid */}
        {activeTab === "teams" && (
          <>
            {teams.length === 0 ? (
              <div className="card card-static p-12 text-center">
                <div className="w-10 h-10 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4 text-zinc-500">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.03a.005.005 0 01.003.006A9.49 9.49 0 0112 21.75a9.49 9.49 0 01-9.12-6.923.004.004 0 01-.003-.007.003.003 0 01.001-.002m15.063 3.902h.001M12 12a3.75 3.75 0 100-7.5A3.75 3.75 0 0012 12z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-white mb-1">No teams yet</h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto mb-4">
                  Be the first to create a team for this hackathon on HackerMate!
                </p>
                <Link href={`/teams/create?hackathon=${hackathon.id}`} className="btn btn-primary btn-sm inline-flex">
                  Create a Team
                </Link>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {teams.map((team) => (
                  <Link
                    key={team.id}
                    href={`/teams/${team.id}`}
                    className={`card p-5 group flex flex-col justify-between min-h-[140px]`}
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <h3 className="font-semibold text-sm text-white group-hover:text-white truncate">
                        {team.name}
                      </h3>
                      <span className="badge badge-primary text-[9px] py-0.5 px-1.5 flex-shrink-0">
                        Recruiting
                      </span>
                    </div>

                    <p className="text-zinc-400 text-xs leading-relaxed mb-4 line-clamp-2">
                      {team.description || "No description provided."}
                    </p>

                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {team.skills?.length ? (
                        team.skills.slice(0, 3).map((skill) => (
                          <span key={skill} className="badge text-[9px] py-0.5 px-1.5">
                            {skill}
                          </span>
                        ))
                      ) : (
                        <span className="badge text-[9px] text-zinc-600">No skills listed</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-zinc-900">
                      <span className="text-[10px] text-zinc-500 truncate">
                        {team.college || "Independent Team"}
                      </span>
                      <span className="text-[10px] font-semibold text-white group-hover:text-zinc-300 transition-colors">
                        View Team →
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        {/* Tab 2: Registered Builders */}
        {activeTab === "participants" && (
          <>
            {registrations.length === 0 ? (
              <div className="card card-static p-12 text-center">
                <p className="text-xs text-zinc-500">No builders registered natively yet.</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {registrations.map((reg) => (
                  <Link
                    key={reg.id}
                    href={`/profile/${reg.profiles.id}`}
                    className="card card-static p-4 flex items-center justify-between group"
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm text-white truncate group-hover:text-zinc-300 transition-colors">
                        {reg.profiles.full_name}
                      </h3>
                      <p className="text-zinc-500 text-[10px] truncate">
                        {reg.profiles.college || "Independent Builder"}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      <span className="badge badge-success text-[8px] font-mono py-0.5 px-1 uppercase">
                        Registered
                      </span>
                      {reg.teams && (
                        <span className="text-[9px] text-zinc-400 font-semibold truncate max-w-[80px]">
                          Team: {reg.teams.name}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        {/* Tab 3: Organizer Dashboard */}
        {activeTab === "organizer" && isOrganizer && (
          <div className="card card-static p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-base font-semibold text-white mb-0.5">Organizer Dashboard</h3>
                <p className="text-xs text-zinc-500">Manage registrants, exports, and status for {hackathon.name}.</p>
              </div>

              <button
                onClick={() => {
                  const headers = "Name,Email,College,Team,Registered At\n";
                  const rows = registrations
                    .map(
                      (r) =>
                        `"${r.profiles.full_name}","${r.profiles.email}","${r.profiles.college || ""}","${
                          r.teams?.name || ""
                        }","${r.created_at}"`
                    )
                    .join("\n");
                  
                  const blob = new Blob([headers + rows], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${hackathon.name.replace(/\s+/g, "_")}_registrants.csv`;
                  a.click();
                }}
                className="btn btn-primary btn-sm"
              >
                Export Registrants (.CSV)
              </button>
            </div>

            {/* Table */}
            {registrations.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-6">No registrants found to manage.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-900 text-zinc-500 font-mono uppercase tracking-wider">
                      <th className="py-2.5 pb-2">Name</th>
                      <th className="py-2.5 pb-2">Email</th>
                      <th className="py-2.5 pb-2">College</th>
                      <th className="py-2.5 pb-2">Team</th>
                      <th className="py-2.5 pb-2 text-right">Registration Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrations.map((reg) => (
                      <tr key={reg.id} className="border-b border-zinc-900/50 hover:bg-zinc-900/10">
                        <td className="py-3 font-semibold text-white">{reg.profiles.full_name}</td>
                        <td className="py-3 text-zinc-400">{reg.profiles.email}</td>
                        <td className="py-3 text-zinc-500">{reg.profiles.college || "N/A"}</td>
                        <td className="py-3 font-semibold text-primary-400">
                          {reg.teams ? (
                            <Link href={`/teams/${reg.teams.id}`} className="hover:underline">
                              {reg.teams.name}
                            </Link>
                          ) : (
                            <span className="text-zinc-600 font-normal italic">None</span>
                          )}
                        </td>
                        <td className="py-3 text-zinc-500 text-right">
                          {new Date(reg.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {/* MODAL 1: Register Natively */}
      {showRegisterModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="card card-static p-5 w-full max-w-sm">
            <h2 className="text-sm font-semibold text-white mb-1.5">
              Confirm Registration
            </h2>

            <p className="text-xs text-zinc-400 mb-4">
              Register for {hackathon.name}. Choose if you are registering with an existing team.
            </p>

            <label className="section-label block mb-1.5">Register with Team (Optional)</label>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="input text-xs w-full mb-4"
            >
              <option value="">No team (Individual)</option>
              {userOwnedTeams
                .filter((t) => !t.hackathon_id)
                .map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
            </select>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-900">
              <button
                onClick={() => setShowRegisterModal(false)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>

              <button
                onClick={handleRegisterNatively}
                disabled={inviteLoading}
                className="btn btn-primary btn-sm"
              >
                {inviteLoading ? "Registering..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Claim Team Status */}
      {showClaimModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="card card-static p-5 w-full max-w-sm">
            <h2 className="text-sm font-semibold text-white mb-1.5">
              Link Team to Hackathon
            </h2>

            <p className="text-xs text-zinc-400 mb-4">
              If your team has registered externally, associate your HackerMate team with {hackathon.name} to recruit builders and collaborate.
            </p>

            <label className="section-label block mb-1.5">Select Team</label>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="input text-xs w-full mb-4"
            >
              <option value="">Choose your team</option>
              {userOwnedTeams
                .filter((t) => !t.hackathon_id)
                .map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
            </select>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-900">
              <button
                onClick={() => setShowClaimModal(false)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>

              <button
                onClick={handleClaimTeam}
                disabled={!selectedTeam || inviteLoading}
                className="btn btn-primary btn-sm"
              >
                {inviteLoading ? "Linking..." : "Link Team"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function HackathonDetailPage() {
  return (
    <AuthGuard>
      <HackathonDetailContent />
    </AuthGuard>
  );
}
