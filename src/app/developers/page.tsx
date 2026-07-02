"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";

type Profile = {
  id: string;
  full_name: string;
  email: string;
  college: string;
  bio: string;
  avatar_url: string;
  skills: string[];
};

type Team = {
  id: string;
  name: string;
  owner_id: string;
};

function DevelopersContent() {
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

  async function loadData() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

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
      }

      // Fetch all developers
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
      } else {
        setDevelopers(data || []);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  useEffect(() => {
    Promise.resolve().then(() => {
      loadData();
    });
  }, []);

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
        alert("This builder is already a member of that team.");
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
        alert("An invite has already been sent to this builder.");
        setInviteLoading(false);
        return;
      }

      // 3. Send invite and notification atomically
      const { error } = await supabase.rpc("send_team_invite", {
        p_team_id: selectedTeam,
        p_invited_user_id: selectedDevId,
      });

      if (error) {
        alert(error.message);
        setInviteLoading(false);
        return;
      }

      alert("Invite sent successfully!");
      setShowInviteModal(false);
      setSelectedTeam("");
    } catch (err) {
      console.error(err);
      alert("Failed to send invite.");
    }
    setInviteLoading(false);
  }

  // Filter developers: exclude current logged-in user
  const filteredDevelopers = developers
    .filter((dev) => dev.id !== currentUserProfile?.id)
    .filter((dev) => {
      const query = search.toLowerCase();

      return (
        dev.full_name?.toLowerCase().includes(query) ||
        dev.college?.toLowerCase().includes(query) ||
        dev.bio?.toLowerCase().includes(query) ||
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

      {/* Stats & Search row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 animate-fade-in-up stagger-1">
        <div className="relative max-w-md w-full">
          <input
            type="text"
            placeholder="Search builders, skills, college..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input !pl-10 text-xs"
          />
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 105.65 5.65a7.5 7.5 0 0011 11z" />
          </svg>
        </div>

        {/* Stats inline */}
        <div className="flex items-center gap-4 text-xs font-mono text-zinc-500">
          <div>
            Total Builders: <span className="text-white font-semibold">{filteredDevelopers.length}</span>
          </div>
          <div className="w-1.5 h-1.5 rounded-full bg-zinc-800" />
          <div>
            Status: <span className="text-emerald-400 font-semibold">Active</span>
          </div>
        </div>
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
                      <span className="badge badge-success text-[9px] py-0.5 px-1.5">
                        Available
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
          <div className="col-span-full card card-static p-12 text-center">
            <h3 className="text-sm font-semibold text-white mb-1.5">No builders found</h3>
            <p className="text-xs text-zinc-500 mb-4">Try adjusting your query.</p>
            <button onClick={() => setSearch("")} className="btn btn-secondary btn-sm">
              Clear Search
            </button>
          </div>
        )}
      </div>

      {/* Empty Database State */}
      {developers.length === 0 && (
        <div className="card card-static p-12 text-center mt-6">
          <h3 className="text-sm font-semibold text-white mb-1">No builders yet</h3>
          <p className="text-xs text-zinc-500">Be the first to join the network!</p>
        </div>
      )}

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
