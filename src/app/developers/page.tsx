"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";
import { useNotification } from "@/context/NotificationContext";

type Profile = {
  id: string;
  full_name: string;
  email: string;
  college: string;
  bio: string;
  avatar_url: string;
  skills: string[];
  is_available?: boolean;
};

type Team = {
  id: string;
  name: string;
  owner_id: string;
};

function DevelopersContent() {
  const { showToast } = useNotification();
  const [developers, setDevelopers] = useState<Profile[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<Profile | null>(null);
  const [userOwnedTeams, setUserOwnedTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Invite states
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedDevId, setSelectedDevId] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);

  async function loadData(searchQuery?: string) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const blockedUserIds: string[] = [];

      if (user) {
        // Fetch current user profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();

        setCurrentUserProfile(profile);

        // Fetch owned teams
        const { data: teams } = await supabase
          .from("teams")
          .select("id, name, owner_id")
          .eq("owner_id", user.id);

        setUserOwnedTeams(teams || []);

        // Fetch user blocklists
        const { data: myBlocks } = await supabase
          .from("blocked_users")
          .select("blocked_id")
          .eq("blocker_id", user.id);

        const { data: theirBlocks } = await supabase
          .from("blocked_users")
          .select("blocker_id")
          .eq("blocked_id", user.id);

        if (myBlocks) {
          blockedUserIds.push(...myBlocks.map((b) => b.blocked_id));
        }
        if (theirBlocks) {
          blockedUserIds.push(...theirBlocks.map((b) => b.blocker_id));
        }
      }

      // Fetch developers with database-level filters and a limit of 60
      let queryBuilder = supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      const term = (searchQuery !== undefined ? searchQuery : search).trim();
      if (term) {
        queryBuilder = queryBuilder.or(`full_name.ilike.%${term}%,college.ilike.%${term}%,skills.cs.{${term}}`);
      }

      queryBuilder = queryBuilder.limit(60);

      const { data, error } = await queryBuilder;

      if (error) {
        console.error(error);
      } else {
        const filteredDevs = (data || []).filter(
          (d) => d.id !== user?.id && !blockedUserIds.includes(d.id)
        );
        setDevelopers(filteredDevs);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  useEffect(() => {
    const handler = setTimeout(() => {
      loadData();
    }, 300);

    return () => {
      clearTimeout(handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Calculate compatibility score between current user and other builder
  function calculateCompatibility(other: Profile) {
    if (!currentUserProfile) return 0;
    let score = 30; // base compatibility

    // College alignment (+35%)
    if (
      currentUserProfile.college &&
      other.college &&
      currentUserProfile.college.toLowerCase().trim() === other.college.toLowerCase().trim()
    ) {
      score += 35;
    }

    // Skills bonus (+12% per shared skill)
    if (currentUserProfile.skills && other.skills) {
      const shared = other.skills.filter((s) =>
        currentUserProfile.skills.map(sk => sk.toLowerCase()).includes(s.toLowerCase())
      );
      score += shared.length * 12;
    }

    return Math.min(score, 98); // Realism cap at 98%
  }

  // Handle direct invite
  async function handleSendInvite() {
    if (!selectedTeam || !selectedDevId || !currentUserProfile) return;
    setInviteLoading(true);

    try {
      // 1. Check if already a member
      const { data: existingMember } = await supabase
        .from("team_members")
        .select("id")
        .eq("team_id", selectedTeam)
        .eq("user_id", selectedDevId)
        .maybeSingle();

      if (existingMember) {
        showToast("This builder is already a member of that team.", "warning");
        setInviteLoading(false);
        return;
      }

      // 2. Check if already invited
      const { data: existingInvite } = await supabase
        .from("team_invites")
        .select("id")
        .eq("team_id", selectedTeam)
        .eq("invited_user_id", selectedDevId)
        .eq("status", "pending")
        .maybeSingle();

      if (existingInvite) {
        showToast("An invite has already been sent to this builder.", "warning");
        setInviteLoading(false);
        return;
      }

      // 3. Send invite and notification atomically
      const { error } = await supabase.rpc("send_team_invite", {
        p_team_id: selectedTeam,
        p_invited_user_id: selectedDevId,
      });

      if (error) {
        showToast(error.message, "error");
        setInviteLoading(false);
        return;
      }

      showToast("Invite sent successfully!", "success");
      setShowInviteModal(false);
      setSelectedTeam("");

      // Trigger email alert
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senderId: user.id,
            recipientId: selectedDevId,
            type: "team_invite",
            teamId: selectedTeam,
          }),
        }).catch((err) => console.error("Failed to send fallback notification email:", err));
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to send invite.", "error");
    }
    setInviteLoading(false);
  }

  // Filter developers: exclude current logged-in user + apply search
  const filteredDevelopers = developers
    .filter((dev) => dev.id !== currentUserProfile?.id)
    .filter((dev) => {
      if (!search.trim()) return true;
      const query = search.toLowerCase();
      return (
        dev.full_name?.toLowerCase().includes(query) ||
        dev.college?.toLowerCase().includes(query) ||
        dev.skills?.some((skill) => skill.toLowerCase().includes(query))
      );
    });

  if (loading) {
    return (
      <main className="max-w-7xl mx-auto px-6 pt-36 pb-12">
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="w-6 h-6 border-2 border-zinc-800 border-t-white rounded-full animate-spin mb-3" />
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Loading builders...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-6 pt-24 pb-12">
      {/* Hero */}
      <section className="mb-10 animate-fade-in-up">
        <p className="section-label">BUILDER NETWORK</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">
          Discover developers
        </h1>
        <p className="text-sm text-zinc-400 max-w-xl leading-relaxed">
          Find teammates, collaborators, and future co-founders for your next hackathon project.
        </p>
      </section>


      {/* Search bar */}
      <div className="relative max-w-md mb-8 animate-fade-in-up stagger-1">
        <input
          type="text"
          placeholder="Search by name, skill, or college..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input !pl-10 text-xs w-full"
        />
        <svg
          className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 105.65 5.65a7.5 7.5 0 0011 11z" />
        </svg>
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Developers Grid */}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredDevelopers.length > 0 ? (
          filteredDevelopers.map((dev) => {
            const matchScore = calculateCompatibility(dev);
            return (
              <div key={dev.id} className="card card-static group p-5 flex flex-col justify-between min-h-[220px]">
                <div>
                  <div className="flex items-start justify-between mb-4">
                    <Link href={`/profile/${dev.id}`} className="flex items-center gap-3 min-w-0 hover:opacity-90">
                      {dev.avatar_url ? (
                        <img
                          src={dev.avatar_url}
                          alt={dev.full_name}
                          className="w-10 h-10 rounded object-cover border border-zinc-800"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center font-bold text-zinc-400 text-xs">
                          {dev.full_name?.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h2 className="font-semibold text-sm text-white truncate group-hover:text-white">
                          {dev.full_name}
                        </h2>
                        <p className="text-zinc-500 text-[10px] truncate">
                          {dev.college || "Independent Builder"}
                        </p>
                      </div>
                    </Link>

                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={`badge text-[9px] py-0.5 px-1.5 ${
                        dev.is_available !== false
                          ? "badge-success"
                          : "bg-zinc-800 text-zinc-500 border-zinc-700"
                      }`}>
                        {dev.is_available !== false ? "Available" : "Busy"}
                      </span>
                      {matchScore > 0 && (
                        <span className="text-[9px] text-emerald-400 font-semibold font-mono bg-emerald-500/5 border border-emerald-500/10 rounded px-1 py-0.5">
                          ✨ {matchScore}% Match
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-zinc-400 text-xs mb-4 line-clamp-2 min-h-[32px] leading-relaxed">
                    {dev.bio || "No bio added yet."}
                  </p>

                  <div className="flex flex-wrap gap-1.5 mb-5">
                    {dev.skills?.length ? (
                      <>
                        {dev.skills.slice(0, 3).map((skill) => (
                          <span key={skill} className="badge text-[9px] py-0.5 px-1.5">
                            {skill}
                          </span>
                        ))}
                        {dev.skills.length > 3 && (
                          <span className="badge text-[9px] py-0.5 px-1.5">
                            +{dev.skills.length - 3}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="badge text-[9px] text-zinc-600">No skills added</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-zinc-800/80">
                  <Link href={`/profile/${dev.id}`} className="text-[10px] font-medium text-zinc-500 hover:text-white transition-colors">
                    View Profile →
                  </Link>

                  {userOwnedTeams.length > 0 && (
                    <button
                      onClick={() => {
                        setSelectedDevId(dev.id);
                        setShowInviteModal(true);
                      }}
                      className="btn btn-primary text-[10px] py-1.5 px-3 rounded"
                    >
                      Invite to Team
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-full flex flex-col items-center justify-center py-24 text-center">
            <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600 mb-5">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.03c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584.036-.219.05-.44.05-.666l.001-.03m11.911 0a9.1 9.1 0 00-11.911 0M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-white mb-1.5">No builders yet</h3>
            <p className="text-xs text-zinc-500 max-w-xs leading-relaxed">
              You&apos;re the first one here. Share HackerMate with fellow builders to grow the network!
            </p>
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="card card-static p-5 w-full max-w-sm">
            <h2 className="text-sm font-semibold text-white mb-1.5">Invite to Team</h2>
            <p className="text-xs text-zinc-400 mb-4">
              Select which team you would like to invite this developer to join.
            </p>

            <label className="section-label block mb-1.5">Your Teams</label>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="input text-xs w-full mb-4"
            >
              <option value="">Select a team</option>
              {userOwnedTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-900">
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  setSelectedTeam("");
                  setSelectedDevId(null);
                }}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSendInvite}
                disabled={!selectedTeam || inviteLoading}
                className="btn btn-primary btn-sm"
              >
                {inviteLoading ? "Sending..." : "Send Invite"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function DevelopersPage() {
  return (
    <AuthGuard>
      <DevelopersContent />
    </AuthGuard>
  );
}
