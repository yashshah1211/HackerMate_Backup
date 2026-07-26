"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import CertificateModal, { UserBadge } from "@/components/CertificateModal";

type PartnerConfig = {
  id: string;
  slug: string;
  hackathon_id: string;
  partner_name: string;
  tagline: string | null;
  brand_color: string | null;
  accent_color: string | null;
  logo_url: string | null;
  banner_url: string | null;
  override_prize_pool: string | null;
  features?: any;
};

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
  college?: string | null;
};

type Team = {
  id: string;
  name: string;
  description: string;
  college: string | null;
  skills: string[] | null;
  roles_needed: string[] | null;
  max_members: number;
  is_recruiting?: boolean;
  owner_id?: string;
  team_members?: { id: string }[];
};

type RegisteredBuilder = {
  id: string;
  full_name: string;
  email: string;
  college: string | null;
  avatar_url: string | null;
  skills: string[] | null;
  is_available?: boolean;
};

function PartnerPageContent() {
  const { showToast, confirm } = useNotification();
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [partner, setPartner] = useState<PartnerConfig | null>(null);
  const [hackathon, setHackathon] = useState<Hackathon | null>(null);
  const [loading, setLoading] = useState(true);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [builders, setBuilders] = useState<RegisteredBuilder[]>([]);
  const [userWinnerBadge, setUserWinnerBadge] = useState<UserBadge | null>(null);
  const [userName, setUserName] = useState("");
  const [showCertModal, setShowCertModal] = useState(false);

  const [activeTab, setActiveTab] = useState<"teams" | "builders">("teams");

  function handleProtectedAction(targetUrl: string) {
    if (!currentUserId) {
      router.push(`/?next=${encodeURIComponent(`/partners/${slug}`)}&auth=true`);
    } else {
      router.push(targetUrl);
    }
  }

  async function loadPartnerData() {
    try {
      setLoading(true);

      // 1. Fetch Partner Config by slug
      const { data: partnerData, error: partnerErr } = await supabase
        .from("partner_configs")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      if (partnerErr || !partnerData) {
        setPartner(null);
        setLoading(false);
        return;
      }

      setPartner(partnerData);

      // 2. Fetch Hackathon details
      const { data: hackathonData } = await supabase
        .from("hackathons")
        .select("*")
        .eq("id", partnerData.hackathon_id)
        .maybeSingle();

      setHackathon(hackathonData);

      // 3. Fetch Teams registered for this hackathon
      const { data: teamHackathonsData } = await supabase
        .from("team_hackathons")
        .select("team_id, teams(*, team_members(id))")
        .eq("hackathon_id", partnerData.hackathon_id);

      const parsedTeams = (teamHackathonsData || [])
        .map((item: any) => item.teams)
        .filter(Boolean);
      setTeams(parsedTeams);

      // 4. Fetch Builders registered for this hackathon
      const { data: regData } = await supabase
        .from("hackathon_registrations")
        .select("user_id, profiles(id, full_name, email, college, avatar_url, skills, is_available)")
        .eq("hackathon_id", partnerData.hackathon_id);

      const parsedBuilders = (regData || [])
        .map((r: any) => r.profiles)
        .filter(Boolean);
      setBuilders(parsedBuilders);

      // 5. Check if logged in user has won a badge for this hackathon
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setCurrentUserId(user.id);
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();
        if (profile) setUserName(profile.full_name);

        const { data: badgeData } = await supabase
          .from("user_badges")
          .select("*")
          .eq("user_id", user.id)
          .eq("hackathon_id", partnerData.hackathon_id)
          .maybeSingle();

        if (badgeData) {
          setUserWinnerBadge(badgeData as UserBadge);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (slug) {
      loadPartnerData();
    }
  }, [slug]);

  if (loading) {
    return (
      <main className="max-w-5xl mx-auto px-6 pt-36 pb-16">
        <div className="flex flex-col items-center justify-center min-h-[40vh]">
          <div className="w-8 h-8 border-2 border-zinc-800 border-t-[#3B82F6] rounded-full animate-spin mb-4" />
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Loading Partner Portal...</p>
        </div>
      </main>
    );
  }

  if (!partner) {
    return (
      <main className="max-w-4xl mx-auto px-6 pt-36 pb-16">
        <div className="card card-static p-12 text-center">
          <h1 className="text-xl font-bold text-white mb-2">Partner Portal Not Found</h1>
          <p className="text-xs text-zinc-400 mb-6">The requested partner page does not exist or has been updated.</p>
          <Link href="/hackathons" className="btn btn-primary btn-sm inline-flex">
            Browse All Hackathons
          </Link>
        </div>
      </main>
    );
  }

  const brandColor = partner.brand_color || "#3B82F6";
  const displayPrize = partner.override_prize_pool || hackathon?.prize_pool || "Prize Pool TBA";

  return (
    <main className="max-w-5xl mx-auto px-6 pt-32 pb-16">
      {/* Partner Hero Header */}
      <div
        className="relative overflow-hidden rounded-2xl border bg-zinc-950 p-8 md:p-10 shadow-2xl animate-fade-in-up mb-8"
        style={{ borderColor: `${brandColor}40` }}
      >
        <div
          className="absolute top-0 right-0 left-0 h-1.5"
          style={{ background: `linear-gradient(to right, ${brandColor}, #6366f1, #B4F461)` }}
        />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            {/* Co-Branded Tag */}
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-mono uppercase tracking-wider mb-4">
              <span className="text-[#B4F461] font-bold">HACKERMATE</span>
              <span className="text-zinc-500">×</span>
              <span style={{ color: brandColor }} className="font-bold">
                OFFICIAL PARTNER
              </span>
            </div>

            <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
              {partner.partner_name}
            </h1>
            <p className="text-sm text-zinc-300 max-w-2xl mt-2 leading-relaxed font-sans">
              {partner.tagline || hackathon?.description?.slice(0, 180) + "..."}
            </p>

            {/* Event Metrics Pills */}
            <div className="flex flex-wrap items-center gap-3 mt-6">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-xs">
                <span className="text-amber-400 font-bold">💰</span>
                <span className="font-bold text-white">{displayPrize}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-xs">
                <span className="text-blue-400">📅</span>
                <span className="text-zinc-300">
                  {hackathon?.start_date ? new Date(hackathon.start_date).toLocaleDateString() : "Date TBA"} —{" "}
                  {hackathon?.end_date ? new Date(hackathon.end_date).toLocaleDateString() : "Date TBA"}
                </span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-xs">
                <span className="text-emerald-400">🌐</span>
                <span className="text-zinc-300 capitalize">{hackathon?.mode || "Online"} Sprint</span>
              </div>
            </div>
          </div>

          {/* Unstop / Official Listing CTA */}
          {hackathon?.website_url && (
            <div className="shrink-0">
              <a
                href={hackathon.website_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-bold text-white shadow-xl transition-transform hover:scale-105"
                style={{ backgroundColor: brandColor }}
              >
                <span>Register on Unstop</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Winner Congratulations Banner */}
      {userWinnerBadge && (
        <div className="mb-8 p-6 rounded-xl border border-blue-500/40 bg-gradient-to-r from-blue-950/40 via-indigo-950/40 to-zinc-950 flex flex-col sm:flex-row items-center justify-between gap-4 animate-fade-in-up">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🏆</span>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Verified Winner of {partner.partner_name}!</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 uppercase">
                  {userWinnerBadge.rank_title || "Verified Winner"}
                </span>
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">Your official badge & co-branded certificate are verified on HackerMate.</p>
            </div>
          </div>
          <button
            onClick={() => setShowCertModal(true)}
            className="btn btn-primary text-xs py-2 px-4 font-bold bg-[#B4F461] text-black hover:bg-[#a3e64f] shrink-0"
          >
            View & Download Certificate
          </button>
        </div>
      )}

      {/* Team Matching Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>Partner Team Matching Hub</span>
          </h2>
          <p className="text-xs text-zinc-400">Find compatible teammates or join recruiting teams specifically for {partner.partner_name}.</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-zinc-950 border border-zinc-900 rounded-lg p-1 text-xs">
            <button
              onClick={() => setActiveTab("teams")}
              className={`px-4 py-1.5 rounded-md font-mono uppercase tracking-wider text-[10px] transition ${
                activeTab === "teams" ? "bg-zinc-900 text-white font-bold" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Teams ({teams.length})
            </button>
            <button
              onClick={() => setActiveTab("builders")}
              className={`px-4 py-1.5 rounded-md font-mono uppercase tracking-wider text-[10px] transition ${
                activeTab === "builders" ? "bg-zinc-900 text-white font-bold" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Registered Builders ({builders.length})
            </button>
          </div>

          <button
            onClick={() => handleProtectedAction(`/teams/create?hackathon=${partner.hackathon_id}`)}
            className="btn btn-primary text-xs py-2 px-3 flex items-center gap-1.5 cursor-pointer"
          >
            <span>+ Create Team</span>
          </button>
        </div>
      </div>

      {/* Teams Feed */}
      {activeTab === "teams" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {teams.length === 0 ? (
            <div className="col-span-2 p-12 text-center card card-static border-dashed border-zinc-800">
              <p className="text-xs text-zinc-400 mb-4">No recruiting teams created for this partner event yet.</p>
              <button
                onClick={() => handleProtectedAction(`/teams/create?hackathon=${partner.hackathon_id}`)}
                className="btn btn-primary btn-sm inline-flex cursor-pointer"
              >
                Be the first to create a team
              </button>
            </div>
          ) : (
            teams.map((team) => (
              <div
                key={team.id}
                className="card card-static p-5 flex flex-col justify-between hover:border-zinc-700 transition-all"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="text-sm font-bold text-white">{team.name}</h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {team.team_members?.length || 1} / {team.max_members} Members
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 line-clamp-2 mb-3">{team.description}</p>

                  {team.skills && team.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {team.skills.map((s) => (
                        <span key={s} className="skill-chip text-[10px]">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-zinc-900 flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {team.college || "Cross-College"}
                  </span>
                  <button
                    onClick={() => handleProtectedAction(`/teams/${team.id}`)}
                    className="btn btn-secondary btn-xs py-1.5 px-3 text-xs cursor-pointer"
                  >
                    View Workspace & Apply →
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Builders Feed */}
      {activeTab === "builders" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {builders.length === 0 ? (
            <div className="col-span-3 p-12 text-center card card-static border-dashed border-zinc-800">
              <p className="text-xs text-zinc-400">No individual builders registered for this partner event yet.</p>
            </div>
          ) : (
            builders.map((builder) => (
              <div
                key={builder.id}
                className="card card-static p-4 flex flex-col justify-between hover:border-zinc-700 transition-all"
              >
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center font-bold text-white overflow-hidden text-sm">
                      {builder.avatar_url ? (
                        <img src={builder.avatar_url} alt={builder.full_name} className="w-full h-full object-cover" />
                      ) : (
                        builder.full_name?.charAt(0)
                      )}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white leading-tight">{builder.full_name}</h4>
                      <p className="text-[10px] text-zinc-500 truncate max-w-[150px]">{builder.college || "Developer"}</p>
                    </div>
                  </div>

                  {builder.skills && builder.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {builder.skills.slice(0, 3).map((s) => (
                        <span key={s} className="skill-chip text-[9px]">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-zinc-900">
                  <button
                    onClick={() => handleProtectedAction(`/profile/${builder.id}`)}
                    className="btn btn-secondary btn-xs w-full py-1.5 text-center block text-[11px] cursor-pointer"
                  >
                    View Profile
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Certificate Modal */}
      {userWinnerBadge && (
        <CertificateModal
          isOpen={showCertModal}
          onClose={() => setShowCertModal(false)}
          badge={userWinnerBadge}
          recipientName={userName || "Verified Winner"}
        />
      )}
    </main>
  );
}

export default function PartnerPage() {
  return <PartnerPageContent />;
}
