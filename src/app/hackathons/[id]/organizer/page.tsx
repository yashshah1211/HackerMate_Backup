"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";
import { useNotification } from "@/context/NotificationContext";

type Hackathon = {
  id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  mode: string | null;
  prize_pool: string | null;
  currency?: string | null;
  max_participants: number | null;
  min_team_size?: number | null;
  max_team_size?: number | null;
  rounds_count?: number | null;
  rounds_info?: any | null;
  organizer_id: string | null;
  type: string | null;
};

type Registration = {
  id: string;
  user_id: string;
  team_id: string | null;
  looking_for_team: boolean;
  status: string;
  created_at: string;
  profiles: {
    id: string;
    full_name: string;
    email: string;
    college: string | null;
    avatar_url: string | null;
    skills: string[] | null;
    is_available?: boolean;
  } | null;
  teams: {
    id: string;
    name: string;
  } | null;
};

type Resource = {
  id: string;
  hackathon_id: string;
  title: string;
  url: string;
  category: string;
  created_at: string;
};

type Stage = {
  id: string;
  hackathon_id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string | null;
  stage_type: string;
  sort_order: number;
  created_at: string;
};

type Announcement = {
  id: string;
  hackathon_id: string;
  organizer_id: string;
  title: string;
  message: string;
  linked_stage_id: string | null;
  sent_at: string | null;
  created_at: string;
  hackathon_stages?: { title: string } | null;
};

export default function OrganizerPortalPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useNotification();
  const hackathonId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [hackathon, setHackathon] = useState<Hackathon | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [search, setSearch] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Resource modal states
  const [showAddResourceModal, setShowAddResourceModal] = useState(false);
  const [resourceTitle, setResourceTitle] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");
  const [resourceCategory, setResourceCategory] = useState("docs");
  const [resourceLoading, setResourceLoading] = useState(false);

  // Stage modal states
  const [showAddStageModal, setShowAddStageModal] = useState(false);
  const [editingStage, setEditingStage] = useState<Stage | null>(null);
  const [stageTitle, setStageTitle] = useState("");
  const [stageDesc, setStageDesc] = useState("");
  const [stageStartTime, setStageStartTime] = useState("");
  const [stageEndTime, setStageEndTime] = useState("");
  const [stageType, setStageType] = useState("ceremony");
  const [stageSortOrder, setStageSortOrder] = useState(0);
  const [stageLoading, setStageLoading] = useState(false);

  // Broadcast composer states
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastStageId, setBroadcastStageId] = useState("");
  const [broadcastLoading, setBroadcastLoading] = useState(false);

  async function loadOrganizerData() {
    try {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push(`/?next=${encodeURIComponent(`/hackathons/${hackathonId}/organizer`)}&auth=true`);
        return;
      }

      setCurrentUserId(user.id);

      // 1. Fetch Hackathon details
      const { data: hackathonData, error: hackathonErr } = await supabase
        .from("hackathons")
        .select("*")
        .eq("id", hackathonId)
        .single();

      if (hackathonErr || !hackathonData) {
        showToast("Hackathon not found.", "error");
        router.push("/hackathons");
        return;
      }

      // Check organizer authorization
      if (hackathonData.organizer_id !== user.id) {
        showToast("Access Denied: Only the organizer can access this portal.", "error");
        router.push(`/hackathons/${hackathonId}`);
        return;
      }

      setHackathon(hackathonData);

      // 2. Fetch Registrations joined with Profiles & Teams
      const { data: regData, error: regErr } = await supabase
        .from("hackathon_registrations")
        .select(`
          id,
          user_id,
          team_id,
          looking_for_team,
          status,
          created_at,
          profiles (
            id,
            full_name,
            college,
            avatar_url,
            skills,
            is_available
          ),
          teams (
            id,
            name
          )
        `)
        .eq("hackathon_id", hackathonId)
        .order("created_at", { ascending: false });

      if (regErr) {
        console.error(regErr);
      } else {
        setRegistrations((regData as unknown as Registration[]) || []);
      }

      // 3. Fetch custom resources
      const { data: resData } = await supabase
        .from("hackathon_resources")
        .select("*")
        .eq("hackathon_id", hackathonId)
        .order("created_at", { ascending: false });

      setResources(resData || []);

      // 4. Fetch hackathon stages
      const { data: stageData } = await supabase
        .from("hackathon_stages")
        .select("*")
        .eq("hackathon_id", hackathonId)
        .order("sort_order", { ascending: true })
        .order("start_time", { ascending: true });

      setStages(stageData || []);

      // 5. Fetch announcements
      const { data: announceData } = await supabase
        .from("hackathon_announcements")
        .select("*, hackathon_stages:linked_stage_id(title)")
        .eq("hackathon_id", hackathonId)
        .order("created_at", { ascending: false });

      setAnnouncements(announceData || []);
    } catch (err) {
      console.error(err);
      showToast("Failed to load organizer dashboard.", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (hackathonId) {
      loadOrganizerData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hackathonId]);

  async function handleSendBroadcast(e: React.FormEvent) {
    e.preventDefault();
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) {
      showToast("Announcement title and message are required.", "warning");
      return;
    }

    setBroadcastLoading(true);
    try {
      const res = await fetch("/api/organizer/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hackathonId,
          title: broadcastTitle.trim(),
          message: broadcastMessage.trim(),
          linkedStageId: broadcastStageId || null,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast(data.error || "Failed to send announcement broadcast.", "error");
      } else {
        showToast(`Announcement broadcast sent to ${data.count} participants!`, "success");
        setBroadcastTitle("");
        setBroadcastMessage("");
        setBroadcastStageId("");
        loadOrganizerData();
      }
    } catch (err) {
      console.error(err);
      showToast("An error occurred while broadcasting.", "error");
    } finally {
      setBroadcastLoading(false);
    }
  }

  function openAddStageModal() {
    setEditingStage(null);
    setStageTitle("");
    setStageDesc("");
    setStageStartTime("");
    setStageEndTime("");
    setStageType("ceremony");
    setStageSortOrder(stages.length);
    setShowAddStageModal(true);
  }

  function openEditStageModal(stage: Stage) {
    setEditingStage(stage);
    setStageTitle(stage.title);
    setStageDesc(stage.description || "");
    setStageStartTime(stage.start_time ? new Date(stage.start_time).toISOString().slice(0, 16) : "");
    setStageEndTime(stage.end_time ? new Date(stage.end_time).toISOString().slice(0, 16) : "");
    setStageType(stage.stage_type || "ceremony");
    setStageSortOrder(stage.sort_order || 0);
    setShowAddStageModal(true);
  }

  async function handleSaveStage(e: React.FormEvent) {
    e.preventDefault();
    if (!stageTitle.trim() || !stageStartTime) {
      showToast("Title and Start Time are required.", "warning");
      return;
    }

    setStageLoading(true);
    try {
      const payload = {
        hackathon_id: hackathonId,
        title: stageTitle.trim(),
        description: stageDesc.trim() || null,
        start_time: new Date(stageStartTime).toISOString(),
        end_time: stageEndTime ? new Date(stageEndTime).toISOString() : null,
        stage_type: stageType,
        sort_order: stageSortOrder,
      };

      if (editingStage) {
        const { error } = await supabase
          .from("hackathon_stages")
          .update(payload)
          .eq("id", editingStage.id);

        if (error) {
          showToast(error.message, "error");
        } else {
          showToast("Event stage updated successfully!", "success");
          setShowAddStageModal(false);
          loadOrganizerData();
        }
      } else {
        const { error } = await supabase.from("hackathon_stages").insert(payload);

        if (error) {
          showToast(error.message, "error");
        } else {
          showToast("Event stage added to schedule!", "success");
          setShowAddStageModal(false);
          loadOrganizerData();
        }
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to save stage.", "error");
    } finally {
      setStageLoading(false);
    }
  }

  async function handleDeleteStage(stageId: string) {
    try {
      const { error } = await supabase
        .from("hackathon_stages")
        .delete()
        .eq("id", stageId);

      if (error) {
        showToast(error.message, "error");
      } else {
        showToast("Stage removed from schedule.", "info");
        loadOrganizerData();
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to delete stage.", "error");
    }
  }

  async function handleMoveStage(stage: Stage, direction: "up" | "down") {
    const currentIndex = stages.findIndex((s) => s.id === stage.id);
    if (currentIndex === -1) return;
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= stages.length) return;

    const targetStage = stages[targetIndex];
    const currentOrder = stage.sort_order;
    const targetOrder = targetStage.sort_order === currentOrder ? (direction === "up" ? currentOrder - 1 : currentOrder + 1) : targetStage.sort_order;

    try {
      await supabase
        .from("hackathon_stages")
        .update({ sort_order: targetOrder })
        .eq("id", stage.id);

      await supabase
        .from("hackathon_stages")
        .update({ sort_order: currentOrder })
        .eq("id", targetStage.id);

      loadOrganizerData();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleAddResource(e: React.FormEvent) {
    e.preventDefault();
    if (!resourceTitle.trim() || !resourceUrl.trim()) {
      showToast("Title and URL are required.", "warning");
      return;
    }

    setResourceLoading(true);
    try {
      const { error } = await supabase.from("hackathon_resources").insert({
        hackathon_id: hackathonId,
        title: resourceTitle.trim(),
        url: resourceUrl.trim(),
        category: resourceCategory,
      });

      if (error) {
        showToast(error.message, "error");
      } else {
        showToast("Resource link added successfully!", "success");
        setShowAddResourceModal(false);
        setResourceTitle("");
        setResourceUrl("");
        loadOrganizerData();
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to add resource.", "error");
    } finally {
      setResourceLoading(false);
    }
  }

  async function handleDeleteResource(resourceId: string) {
    try {
      const { error } = await supabase
        .from("hackathon_resources")
        .delete()
        .eq("id", resourceId);

      if (error) {
        showToast(error.message, "error");
      } else {
        showToast("Resource link removed.", "info");
        loadOrganizerData();
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to delete resource.", "error");
    }
  }

  function handleExportCSV(filteredRegs: Registration[]) {
    if (!hackathon) return;
    const headers = "Name,Email,College,Skills,Registration Status,Team Status,Registered At\n";
    const rows = filteredRegs
      .map((r) => {
        const skillsStr = (r.profiles?.skills || []).join("; ");
        const teamStatusStr = r.teams
          ? `Matched (${r.teams.name})`
          : r.looking_for_team
          ? "Looking for team"
          : "Solo";
        const statusStr = r.status || "confirmed";
        return `"${(r.profiles?.full_name || "").replace(/"/g, '""')}","${(r.profiles?.email || "").replace(/"/g, '""')}","${(r.profiles?.college || "").replace(/"/g, '""')}","${skillsStr.replace(/"/g, '""')}","${statusStr}","${teamStatusStr.replace(/"/g, '""')}","${r.created_at}"`;
      })
      .join("\n");

    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${hackathon.name.replace(/\s+/g, "_")}_participants.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <AuthGuard>
        <main className="max-w-7xl mx-auto px-6 pt-32 pb-16">
          <div className="flex flex-col items-center justify-center min-h-[40vh]">
            <div className="w-8 h-8 border-2 border-zinc-800 border-t-[#B4F461] rounded-full animate-spin mb-4" />
            <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Loading Organizer Portal...</p>
          </div>
        </main>
      </AuthGuard>
    );
  }

  if (!hackathon) return null;

  const confirmedCount = registrations.filter((r) => (r.status || "confirmed") === "confirmed").length;
  const waitlistedCount = registrations.filter((r) => r.status === "waitlisted").length;
  const maxCap = hackathon.max_participants;

  const filteredRegs = registrations.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const name = r.profiles?.full_name?.toLowerCase() || "";
    const college = r.profiles?.college?.toLowerCase() || "";
    const email = r.profiles?.email?.toLowerCase() || "";
    return name.includes(q) || college.includes(q) || email.includes(q);
  });

  return (
    <AuthGuard>
      <main className="max-w-7xl mx-auto px-6 pt-28 pb-16">
        {/* Back Link to Hackathon Detail Page */}
        <div className="mb-6 animate-fade-in-up">
          <Link
            href={`/hackathons/${hackathonId}`}
            className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-white transition-colors font-medium"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            <span>Back to {hackathon.name}</span>
          </Link>
        </div>

        {/* Portal Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b border-zinc-800/80 animate-fade-in-up">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-mono px-2.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60 uppercase font-semibold">
                ORGANIZER PORTAL
              </span>
              <span className="text-xs text-zinc-500">•</span>
              <span className="text-xs text-zinc-400 font-mono">{hackathon.name}</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              Event Management & Participant Roster
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAddResourceModal(true)}
              className="btn btn-secondary btn-sm flex items-center gap-1.5 cursor-pointer"
            >
              <span>+ Add Resource Link</span>
            </button>

            <button
              onClick={() => handleExportCSV(filteredRegs)}
              className="btn btn-primary btn-sm flex items-center gap-1.5 cursor-pointer"
            >
              <span>📥 Export CSV</span>
            </button>
          </div>
        </div>

        {/* Stats & Capacity Banners Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-emerald-950/80 border border-emerald-800/60 flex items-center justify-center text-emerald-400 text-lg">
              ✓
            </div>
            <div>
              <span className="text-xs text-zinc-400 font-mono uppercase block">Confirmed Registrations</span>
              <span className="text-xl font-bold text-white">
                {confirmedCount} {maxCap !== null && maxCap !== undefined ? `/ ${maxCap}` : "(Unlimited)"}
              </span>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-amber-950/80 border border-amber-800/60 flex items-center justify-center text-amber-400 text-lg">
              ⏳
            </div>
            <div>
              <span className="text-xs text-zinc-400 font-mono uppercase block">Waitlisted Participants</span>
              <span className="text-xl font-bold text-white">{waitlistedCount}</span>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-blue-950/80 border border-blue-800/60 flex items-center justify-center text-blue-400 text-lg">
              👥
            </div>
            <div>
              <span className="text-xs text-zinc-400 font-mono uppercase block">Matched Teams</span>
              <span className="text-xl font-bold text-white">
                {registrations.filter((r) => r.teams !== null).length}
              </span>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-950/80 border border-purple-300 dark:border-purple-800/60 flex items-center justify-center text-purple-700 dark:text-purple-400 text-lg">
              🏆
            </div>
            <div>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono uppercase block">Rounds & Team Rules</span>
              <span className="text-base font-bold text-zinc-900 dark:text-white block">
                {hackathon?.rounds_count || 1} {(hackathon?.rounds_count || 1) === 1 ? "Round" : "Rounds"}
              </span>
              <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono font-semibold">
                {hackathon?.min_team_size === 1 && hackathon?.max_team_size === 1
                  ? "Solo Only"
                  : `${hackathon?.min_team_size || 1}–${hackathon?.max_team_size || 4} Members`}
              </span>
            </div>
          </div>
        </div>

        {/* Section 1: Participant Roster */}
        <div className="card card-static p-6 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="text-base font-bold text-white">Registered Participants ({registrations.length})</h2>
              <p className="text-xs text-zinc-400">Search and manage all builders who signed up for this event.</p>
            </div>

            <input
              type="text"
              placeholder="Search by name, college, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input text-xs w-full sm:w-72"
            />
          </div>

          {filteredRegs.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-zinc-800 rounded-xl">
              <p className="text-xs text-zinc-500 font-mono">
                {search ? "No participants match your search query." : "No registered participants yet."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-zinc-800/80 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/40 text-zinc-400 font-mono uppercase tracking-wider text-[10px]">
                    <th className="py-3.5 px-4">Participant</th>
                    <th className="py-3.5 px-4">College</th>
                    <th className="py-3.5 px-4">Skills</th>
                    <th className="py-3.5 px-4">Registration Status</th>
                    <th className="py-3.5 px-4">Team Status</th>
                    <th className="py-3.5 px-4 text-right">Registered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {filteredRegs.map((reg) => {
                    const isWaitlisted = reg.status === "waitlisted";
                    return (
                      <tr key={reg.id} className="hover:bg-zinc-900/30 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-white">{reg.profiles?.full_name || "Anonymous Builder"}</div>
                          <span className="text-[11px] text-zinc-400 block mt-0.5">{reg.profiles?.email}</span>
                        </td>
                        <td className="py-3.5 px-4 text-zinc-300 font-medium">
                          {reg.profiles?.college || "N/A"}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap gap-1 max-w-[220px]">
                            {(reg.profiles?.skills || []).slice(0, 3).map((skill, idx) => (
                              <span
                                key={idx}
                                className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800"
                              >
                                {skill}
                              </span>
                            ))}
                            {(reg.profiles?.skills || []).length > 3 && (
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-500">
                                +{(reg.profiles?.skills || []).length - 3}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          {isWaitlisted ? (
                            <span className="text-[10px] font-mono px-2.5 py-1 rounded bg-amber-950 text-amber-400 border border-amber-800/60 inline-flex items-center gap-1 font-semibold">
                              <span>⏳ Waitlisted</span>
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono px-2.5 py-1 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60 inline-flex items-center gap-1 font-semibold">
                              <span>✓ Confirmed</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          {reg.teams ? (
                            <Link
                              href={`/teams/${reg.teams.id}`}
                              className="text-[11px] font-medium text-emerald-400 hover:underline flex items-center gap-1"
                            >
                              <span>👥 {reg.teams.name}</span>
                            </Link>
                          ) : reg.looking_for_team ? (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800/60">
                              🔍 Looking for Team
                            </span>
                          ) : (
                            <span className="text-zinc-500 text-[11px] italic">Solo</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-zinc-500 text-right font-mono text-[11px]">
                          {new Date(reg.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Section 2: Organizer Announcement Broadcast */}
        <div className="card card-static p-6 mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-zinc-800/80">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-base font-bold text-white">Broadcast Announcement</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800/60 uppercase font-semibold">
                  Multi-Channel Dispatch
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Send an official event announcement via email and in-app notifications to all {registrations.length} registered builder{registrations.length === 1 ? "" : "s"}.
              </p>
            </div>
          </div>

          <form onSubmit={handleSendBroadcast} className="space-y-4 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="section-label block mb-1.5">Announcement Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Checkpoint 1 Submissions Now Open!"
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  className="input text-xs"
                />
              </div>

              <div>
                <label className="section-label block mb-1.5">Link to Schedule Stage (Optional)</label>
                <select
                  value={broadcastStageId}
                  onChange={(e) => setBroadcastStageId(e.target.value)}
                  className="input text-xs"
                >
                  <option value="">-- No Stage Linked --</option>
                  {stages.map((stg) => (
                    <option key={stg.id} value={stg.id}>
                      📍 {stg.title} ({stg.stage_type})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="section-label block mb-1.5">Announcement Message *</label>
              <textarea
                rows={4}
                required
                placeholder="Write your announcement details here. All registered participants will receive an email and in-app notification..."
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                className="input text-xs resize-none"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] font-mono text-zinc-500">
                📩 Target Recipients: <strong className="text-white">{registrations.length}</strong> registered participant{registrations.length === 1 ? "" : "s"}
              </span>

              <button
                type="submit"
                disabled={broadcastLoading || registrations.length === 0}
                className="btn btn-primary btn-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {broadcastLoading ? (
                  <span>Broadcasting Announcement...</span>
                ) : (
                  <>
                    <span>📢 Broadcast Announcement</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Broadcast History */}
          <div className="pt-6 border-t border-zinc-900">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono mb-4">
              Broadcast History ({announcements.length})
            </h3>

            {announcements.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-zinc-800 rounded-xl">
                <p className="text-xs text-zinc-500 font-mono">No broadcasts sent yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {announcements.map((ann) => (
                  <div
                    key={ann.id}
                    className="p-4 rounded-xl bg-zinc-950/40 border border-zinc-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60 uppercase font-semibold">
                          SENT ✓
                        </span>
                        <h4 className="text-sm font-bold text-white">{ann.title}</h4>
                        {ann.hackathon_stages?.title && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-violet-950 text-violet-400 border border-violet-800/60">
                            📍 {ann.hackathon_stages.title}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 whitespace-pre-line leading-relaxed mb-2">
                        {ann.message}
                      </p>
                      <span className="text-[10px] font-mono text-zinc-500">
                        Dispatched: {ann.sent_at ? new Date(ann.sent_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Pending..."}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Section 3: Event Schedule & Stage Builder */}
        <div className="card card-static p-6 mb-8">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-base font-bold text-white">Event Schedule & Stage Builder</h2>
              <p className="text-xs text-zinc-400">Define milestone ceremonies, checkpoints, submission deadlines, and judging stages.</p>
            </div>
            <button
              onClick={openAddStageModal}
              className="btn btn-primary btn-sm flex items-center gap-1.5 cursor-pointer"
            >
              <span>+ Add Event Stage</span>
            </button>
          </div>

          {stages.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-zinc-800 rounded-xl">
              <p className="text-xs text-zinc-500 font-mono">No event stages added to schedule yet.</p>
              <button
                onClick={openAddStageModal}
                className="btn btn-secondary btn-sm mt-3 cursor-pointer"
              >
                Create First Stage
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {stages.map((stg, idx) => {
                const typeBadges: Record<string, string> = {
                  ceremony: "bg-violet-950 text-violet-400 border-violet-800/60",
                  checkpoint: "bg-blue-950 text-blue-400 border-blue-800/60",
                  deadline: "bg-rose-950 text-rose-400 border-rose-800/60",
                  judging: "bg-amber-950 text-amber-400 border-amber-800/60",
                  other: "bg-zinc-900 text-zinc-400 border-zinc-800",
                };
                const badgeClass = typeBadges[stg.stage_type] || typeBadges.other;

                return (
                  <div
                    key={stg.id}
                    className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-zinc-700/80 transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col items-center justify-center pt-1">
                        <button
                          disabled={idx === 0}
                          onClick={() => handleMoveStage(stg, "up")}
                          className="text-zinc-500 hover:text-white disabled:opacity-20 text-xs cursor-pointer p-0.5"
                          title="Move up"
                        >
                          ▲
                        </button>
                        <span className="text-[10px] font-mono text-zinc-500">{idx + 1}</span>
                        <button
                          disabled={idx === stages.length - 1}
                          onClick={() => handleMoveStage(stg, "down")}
                          className="text-zinc-500 hover:text-white disabled:opacity-20 text-xs cursor-pointer p-0.5"
                          title="Move down"
                        >
                          ▼
                        </button>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-semibold ${badgeClass}`}>
                            {stg.stage_type}
                          </span>
                          <h3 className="text-sm font-bold text-white">{stg.title}</h3>
                        </div>

                        {stg.description && (
                          <p className="text-xs text-zinc-400 mb-2 leading-relaxed">{stg.description}</p>
                        )}

                        <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-zinc-500">
                          <span>
                            📅 Start: {new Date(stg.start_time).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {stg.end_time && (
                            <span>
                              → End: {new Date(stg.end_time).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end md:self-center">
                      <button
                        onClick={() => openEditStageModal(stg)}
                        className="btn btn-secondary btn-sm text-xs cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteStage(stg.id)}
                        className="btn btn-danger btn-sm text-xs cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Section 3: Custom Resource Management */}
        <div className="card card-static p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-base font-bold text-white">Custom Resource Links</h2>
              <p className="text-xs text-zinc-400">Post challenge docs, API references, or slides for participants.</p>
            </div>
            <button
              onClick={() => setShowAddResourceModal(true)}
              className="btn btn-secondary btn-sm flex items-center gap-1.5 cursor-pointer"
            >
              <span>+ Add Link</span>
            </button>
          </div>

          {resources.length === 0 ? (
            <div className="text-center py-6 border border-dashed border-zinc-800 rounded-xl">
              <p className="text-xs text-zinc-500 font-mono">No custom resource links posted yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/60 border border-zinc-800/80 rounded-xl overflow-hidden">
              {resources.map((res) => (
                <div key={res.id} className="p-4 bg-zinc-950/40 flex items-center justify-between gap-4 hover:bg-zinc-900/30 transition-colors">
                  <div>
                    <a
                      href={res.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-white hover:text-emerald-400 transition-colors inline-flex items-center gap-1.5"
                    >
                      {res.title} ↗
                    </a>
                    <span className="text-[10px] font-mono text-zinc-500 block mt-0.5 uppercase">
                      Category: {res.category}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDeleteResource(res.id)}
                    className="text-xs font-mono text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                  >
                    Delete Link
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal: Add Resource */}
        {showAddResourceModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 px-4 animate-fade-in">
            <div className="card card-static p-6 w-full max-w-md">
              <h3 className="text-base font-bold text-white mb-1">Add Custom Resource Link</h3>
              <p className="text-xs text-zinc-400 mb-4">Post a link to developer docs, slides, or guidelines.</p>
              <form onSubmit={handleAddResource} className="space-y-4">
                <div>
                  <label className="section-label block mb-1.5">Resource Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Official Challenge Guidelines & Rules"
                    value={resourceTitle}
                    onChange={(e) => setResourceTitle(e.target.value)}
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label className="section-label block mb-1.5">Resource URL *</label>
                  <input
                    type="url"
                    required
                    placeholder="https://..."
                    value={resourceUrl}
                    onChange={(e) => setResourceUrl(e.target.value)}
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label className="section-label block mb-1.5">Category</label>
                  <select
                    value={resourceCategory}
                    onChange={(e) => setResourceCategory(e.target.value)}
                    className="input text-xs"
                  >
                    <option value="docs">Documentation & Guidelines</option>
                    <option value="apis">APIs & SDKs</option>
                    <option value="starter">Starter Templates</option>
                    <option value="rules">Rules & Judging</option>
                  </select>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddResourceModal(false)}
                    className="btn btn-secondary btn-sm cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={resourceLoading}
                    className="btn btn-primary btn-sm cursor-pointer"
                  >
                    {resourceLoading ? "Adding..." : "Add Resource Link"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Add/Edit Stage */}
        {showAddStageModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 px-4 animate-fade-in">
            <div className="card card-static p-6 w-full max-w-lg">
              <h3 className="text-base font-bold text-white mb-1">
                {editingStage ? "Edit Event Stage" : "Add Event Stage"}
              </h3>
              <p className="text-xs text-zinc-400 mb-4">
                Define key ceremonies, checkpoints, deadlines, or judging rounds.
              </p>
              <form onSubmit={handleSaveStage} className="space-y-4">
                <div>
                  <label className="section-label block mb-1.5">Stage Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Opening Ceremony & Keynote"
                    value={stageTitle}
                    onChange={(e) => setStageTitle(e.target.value)}
                    className="input text-xs"
                  />
                </div>

                <div>
                  <label className="section-label block mb-1.5">Stage Type</label>
                  <select
                    value={stageType}
                    onChange={(e) => setStageType(e.target.value)}
                    className="input text-xs"
                  >
                    <option value="ceremony">🎉 Ceremony / Keynote</option>
                    <option value="checkpoint">🚩 Checkpoint / Mentorship</option>
                    <option value="deadline">⏰ Submission Deadline</option>
                    <option value="judging">⚖️ Judging & Evaluation</option>
                    <option value="other">📌 Other Event Milestone</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="section-label block mb-1.5">Start Time *</label>
                    <input
                      type="datetime-local"
                      required
                      value={stageStartTime}
                      onChange={(e) => setStageStartTime(e.target.value)}
                      className="input text-xs"
                    />
                  </div>
                  <div>
                    <label className="section-label block mb-1.5">End Time (Optional)</label>
                    <input
                      type="datetime-local"
                      value={stageEndTime}
                      onChange={(e) => setStageEndTime(e.target.value)}
                      className="input text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="section-label block mb-1.5">Description (Optional)</label>
                  <textarea
                    rows={3}
                    placeholder="Brief details about what happens during this stage..."
                    value={stageDesc}
                    onChange={(e) => setStageDesc(e.target.value)}
                    className="input text-xs resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddStageModal(false)}
                    className="btn btn-secondary btn-sm cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={stageLoading}
                    className="btn btn-primary btn-sm cursor-pointer"
                  >
                    {stageLoading ? "Saving..." : editingStage ? "Save Changes" : "Add Stage"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </AuthGuard>
  );
}
