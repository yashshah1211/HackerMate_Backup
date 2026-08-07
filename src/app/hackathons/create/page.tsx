"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";
import { useRouter as useAppRouter } from "next/navigation";
import { useNotification } from "@/context/NotificationContext";
import { COLLEGES } from "@/lib/colleges";

export default function CreateHackathonPage() {
  const router = useAppRouter();
  const { showToast } = useNotification();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [mode, setMode] = useState("online");
  const [location, setLocation] = useState("");
  const [prizePool, setPrizePool] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [type, setType] = useState("external");
  const [maxParticipants, setMaxParticipants] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Team Size States
  const [teamPreset, setTeamPreset] = useState<"solo" | "1-3" | "2-4" | "custom">("2-4");
  const [minTeamSize, setMinTeamSize] = useState(2);
  const [maxTeamSize, setMaxTeamSize] = useState(4);

  // Hackathon Rounds States
  type RoundInput = {
    name: string;
    type: string;
    startDate: string;
    endDate: string;
    description: string;
  };

  const [roundsCount, setRoundsCount] = useState(1);
  const [rounds, setRounds] = useState<RoundInput[]>([
    {
      name: "Round 1: Idea & Proposal Submission",
      type: "Online Screening",
      startDate: "",
      endDate: "",
      description: "Submit your problem statement, solution deck, and project architecture.",
    },
  ]);

  const [college, setCollege] = useState("");
  const [customCollege, setCustomCollege] = useState("");
  const [collegeSearch, setCollegeSearch] = useState("");
  const [showCollegeDropdown, setShowCollegeDropdown] = useState(false);

  function handleRoundsCountChange(newCount: number) {
    setRoundsCount(newCount);
    setRounds((prev) => {
      const updated = [...prev];
      if (newCount > updated.length) {
        for (let i = updated.length; i < newCount; i++) {
          updated.push({
            name: `Round ${i + 1}: ${i === 1 ? "Prototype Building & Hackathon" : i === 2 ? "Final Pitch & Judging" : "Stage " + (i + 1)}`,
            type: i === 1 ? "Coding Phase" : i === 2 ? "Final Demo & Pitch" : "Online Screening",
            startDate: "",
            endDate: "",
            description: "",
          });
        }
      } else {
        return updated.slice(0, newCount);
      }
      return updated;
    });
  }

  function updateRoundField(idx: number, field: keyof RoundInput, val: string) {
    setRounds((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };
      return copy;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      showToast("Please enter a hackathon name", "warning");
      return;
    }

    if (minTeamSize > maxTeamSize) {
      showToast("Minimum team size cannot be greater than maximum team size.", "warning");
      return;
    }

    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        showToast("You must be logged in to create a hackathon.", "warning");
        setLoading(false);
        return;
      }

      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const initialStatus = type === "native" ? "pending" : "approved";

      const formattedRounds = rounds.map((r, i) => ({
        round_number: i + 1,
        name: r.name.trim() || `Round ${i + 1}`,
        type: r.type || "Online Screening",
        start_date: r.startDate || startDate || null,
        end_date: r.endDate || endDate || null,
        description: r.description.trim() || null,
      }));

      const { data: createdHackathon, error } = await supabase
        .from("hackathons")
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          start_date: startDate || null,
          end_date: endDate || null,
          location: mode === "online" ? "Online" : location.trim() || null,
          mode,
          prize_pool: prizePool.trim() || null,
          currency,
          website_url: websiteUrl.trim() || null,
          type,
          max_participants: maxParticipants ? parseInt(maxParticipants, 10) : null,
          min_team_size: minTeamSize,
          max_team_size: maxTeamSize,
          rounds_count: roundsCount,
          rounds_info: formattedRounds,
          tags: tags.length > 0 ? tags : null,
          organizer_id: user.id,
          college: college === "Other" ? customCollege.trim() || null : college || null,
          status: initialStatus,
          ai_feedback: { status: initialStatus, submitted_at: new Date().toISOString() },
        })
        .select()
        .single();

      if (error) {
        showToast(error.message, "error");
      } else {
        // Also sync stages table if native hackathon
        if (createdHackathon && type === "native" && formattedRounds.length > 0) {
          const stagesToInsert = formattedRounds.map((rd, i) => ({
            hackathon_id: createdHackathon.id,
            title: rd.name,
            description: rd.description,
            start_time: rd.start_date ? new Date(rd.start_date).toISOString() : new Date().toISOString(),
            end_time: rd.end_date ? new Date(rd.end_date).toISOString() : null,
            stage_type: rd.type.toLowerCase().includes("pitch") ? "ceremony" : rd.type.toLowerCase().includes("coding") ? "other" : "submission",
            sort_order: i + 1,
          }));
          await supabase.from("hackathon_stages").insert(stagesToInsert);
        }

        if (type === "native") {
          showToast("🎉 Native hackathon hosting request submitted! An admin will review and approve your listing shortly.", "success");
        } else {
          showToast("Hackathon listed successfully!", "success");
        }
        router.push("/hackathons");
      }
    } catch (err) {
      console.error(err);
      showToast("An error occurred while listing the hackathon.", "error");
    }

    setLoading(false);
  }

  return (
    <AuthGuard>
      <main className="max-w-xl mx-auto px-6 pt-24 pb-12">
        {/* Header */}
        <div className="mb-8">
          <p className="section-label">HOST PORTAL</p>
          <h1 className="text-2xl font-semibold tracking-tight text-white mb-1.5">
            Host a Hackathon
          </h1>
          <p className="text-xs text-zinc-400">
            Choose how you want to run your event: cross-list an external link or host natively with built-in team workspaces.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Hackathon Name */}
          <div>
            <label className="section-label block mb-1.5">Hackathon Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. AI Innovation Hackathon 2026"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input text-xs"
            />
          </div>

          {/* Hosting Mode Selection Cards */}
          <div>
            <label className="section-label block mb-2">Hosting Mode *</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setType("external")}
                className={`p-4 rounded-lg border text-left flex flex-col justify-between min-h-[110px] transition-all cursor-pointer ${
                  type === "external"
                    ? "bg-zinc-900 border-[#B4F461] text-white shadow-[0_0_15px_rgba(180,244,97,0.1)]"
                    : "bg-zinc-950/40 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <span>🔗 Cross-List Event</span>
                    </span>
                    {type === "external" && (
                      <span className="w-2 h-2 rounded-full bg-[#B4F461]" />
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed mt-1">
                    Cross-post your Devfolio, Unstop, or website link. Teammate matching happens on HackerMate while registrations stay on your portal.
                  </p>
                </div>
                <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider mt-3">
                  Fast 1-Min Setup
                </span>
              </button>

              <button
                type="button"
                onClick={() => setType("native")}
                className={`p-4 rounded-lg border text-left flex flex-col justify-between min-h-[110px] transition-all cursor-pointer ${
                  type === "native"
                    ? "bg-zinc-900 border-[#B4F461] text-white shadow-[0_0_15px_rgba(180,244,97,0.1)]"
                    : "bg-zinc-950/40 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <span>⚡ Organize Natively</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                        Full Suite
                      </span>
                    </span>
                    {type === "native" && (
                      <span className="w-2 h-2 rounded-full bg-[#B4F461]" />
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed mt-1">
                    Run native registrations, announcements feed, resources, live team workspaces, and project submissions directly on HackerMate.
                  </p>
                </div>
                <span className="text-[9px] font-mono text-emerald-400 uppercase tracking-wider mt-3">
                  Native Event OS
                </span>
              </button>
            </div>
          </div>

          {type === "native" && (
            <div>
              <label className="section-label block mb-1.5">Max Participants (Capacity Limit)</label>
              <input
                type="number"
                min="1"
                placeholder="e.g. 100 (Leave empty for unlimited capacity)"
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(e.target.value)}
                className="input text-xs"
              />
              <p className="text-[10px] text-zinc-500 mt-1">
                Leave blank for unlimited registrations. When capacity is reached, new registrants will automatically join the waitlist.
              </p>
            </div>
          )}

          {/* Participant Team Sizes */}
          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-950/60 space-y-3">
            <div className="flex items-center justify-between">
              <label className="section-label text-zinc-700 dark:text-zinc-300 flex items-center gap-2 mb-0">
                <span>👥 Participant Team Sizes *</span>
                {type === "native" && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800/60 font-medium">
                    Enforced
                  </span>
                )}
              </label>
              <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                {teamPreset === "solo"
                  ? "Solo Only (1)"
                  : teamPreset === "custom"
                  ? `${minTeamSize}–${maxTeamSize} Members`
                  : teamPreset === "1-3"
                  ? "1–3 Members"
                  : "2–4 Members"}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => {
                  setTeamPreset("solo");
                  setMinTeamSize(1);
                  setMaxTeamSize(1);
                }}
                className={`p-2.5 rounded-lg border text-center transition-all cursor-pointer ${
                  teamPreset === "solo"
                    ? "bg-emerald-500/10 border-emerald-500 text-emerald-950 dark:bg-emerald-950/40 dark:border-[#B4F461] dark:text-white font-semibold shadow-xs"
                    : "bg-white dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                }`}
              >
                <div className="text-xs font-medium">👤 Solo</div>
                <div className="text-[10px] text-zinc-500 dark:text-zinc-500">1 member</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTeamPreset("1-3");
                  setMinTeamSize(1);
                  setMaxTeamSize(3);
                }}
                className={`p-2.5 rounded-lg border text-center transition-all cursor-pointer ${
                  teamPreset === "1-3"
                    ? "bg-emerald-500/10 border-emerald-500 text-emerald-950 dark:bg-emerald-950/40 dark:border-[#B4F461] dark:text-white font-semibold shadow-xs"
                    : "bg-white dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                }`}
              >
                <div className="text-xs font-medium">👥 1 – 3</div>
                <div className="text-[10px] text-zinc-500 dark:text-zinc-500">Members</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTeamPreset("2-4");
                  setMinTeamSize(2);
                  setMaxTeamSize(4);
                }}
                className={`p-2.5 rounded-lg border text-center transition-all cursor-pointer ${
                  teamPreset === "2-4"
                    ? "bg-emerald-500/10 border-emerald-500 text-emerald-950 dark:bg-emerald-950/40 dark:border-[#B4F461] dark:text-white font-semibold shadow-xs"
                    : "bg-white dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                }`}
              >
                <div className="text-xs font-medium">👥 2 – 4</div>
                <div className="text-[10px] text-zinc-500 dark:text-zinc-500">Members</div>
              </button>

              <button
                type="button"
                onClick={() => setTeamPreset("custom")}
                className={`p-2.5 rounded-lg border text-center transition-all cursor-pointer ${
                  teamPreset === "custom"
                    ? "bg-emerald-500/10 border-emerald-500 text-emerald-950 dark:bg-emerald-950/40 dark:border-[#B4F461] dark:text-white font-semibold shadow-xs"
                    : "bg-white dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                }`}
              >
                <div className="text-xs font-medium">⚙️ Custom</div>
                <div className="text-[10px] text-zinc-500 dark:text-zinc-500">Range</div>
              </button>
            </div>

            {teamPreset === "custom" && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[11px] text-zinc-600 dark:text-zinc-400 block mb-1">Min Members</label>
                  <input
                    type="number"
                    min="1"
                    max={maxTeamSize}
                    value={minTeamSize}
                    onChange={(e) => setMinTeamSize(Math.max(1, parseInt(e.target.value) || 1))}
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-600 dark:text-zinc-400 block mb-1">Max Members</label>
                  <input
                    type="number"
                    min={minTeamSize}
                    max="20"
                    value={maxTeamSize}
                    onChange={(e) => setMaxTeamSize(Math.max(minTeamSize, parseInt(e.target.value) || minTeamSize))}
                    className="input text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Hackathon Rounds Breakdown */}
          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-950/60 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <label className="section-label text-zinc-700 dark:text-zinc-300 block mb-0.5">🏆 Hackathon Rounds</label>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Specify the number of rounds and timeline stages for your event.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-zinc-600 dark:text-zinc-400">Number of Rounds:</span>
                <select
                  value={roundsCount}
                  onChange={(e) => handleRoundsCountChange(parseInt(e.target.value, 10))}
                  className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 text-zinc-900 dark:text-white text-xs rounded-md px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 dark:focus:border-[#B4F461] cursor-pointer"
                >
                  <option value={1}>1 Round</option>
                  <option value={2}>2 Rounds</option>
                  <option value={3}>3 Rounds</option>
                  <option value={4}>4 Rounds</option>
                  <option value={5}>5 Rounds</option>
                </select>
              </div>
            </div>

            <div className="space-y-3">
              {rounds.map((rd, idx) => (
                <div key={idx} className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/40 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 flex items-center justify-center text-[10px]">
                        {idx + 1}
                      </span>
                      <span>Round {idx + 1}</span>
                    </span>
                    <select
                      value={rd.type}
                      onChange={(e) => updateRoundField(idx, "type", e.target.value)}
                      className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 text-zinc-800 dark:text-zinc-300 text-[11px] rounded px-2 py-1 focus:outline-none focus:border-emerald-500 dark:focus:border-[#B4F461]"
                    >
                      <option value="Online Screening">Online Screening / Proposal</option>
                      <option value="Prototype Submission">Prototype Submission</option>
                      <option value="Coding Phase">Coding Phase / Hackathon</option>
                      <option value="Final Demo & Pitch">Final Demo & Pitch</option>
                      <option value="Other">Other Stage</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      placeholder={`Round Name (e.g. ${idx === 0 ? "Ideation & Proposal" : idx === 1 ? "Prototype Building" : "Grand Finale Pitch"})`}
                      value={rd.name}
                      onChange={(e) => updateRoundField(idx, "name", e.target.value)}
                      className="input text-xs"
                    />
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="date"
                        placeholder="Start Date"
                        value={rd.startDate}
                        onChange={(e) => updateRoundField(idx, "startDate", e.target.value)}
                        className="input text-xs"
                      />
                      <input
                        type="date"
                        placeholder="End Date"
                        value={rd.endDate}
                        onChange={(e) => updateRoundField(idx, "endDate", e.target.value)}
                        className="input text-xs"
                      />
                    </div>
                  </div>

                  <textarea
                    placeholder="Short description or instructions for participants in this round..."
                    value={rd.description}
                    onChange={(e) => updateRoundField(idx, "description", e.target.value)}
                    className="input text-xs min-h-[60px]"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="section-label block mb-1.5">Description</label>
            <textarea
              placeholder="Provide details about themes, judges, rules, and timelines..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input text-xs min-h-[100px]"
            />
          </div>

          {/* Dates row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="section-label block mb-1.5">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input text-xs"
              />
            </div>
            <div>
              <label className="section-label block mb-1.5">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="input text-xs"
              />
            </div>
          </div>

          {/* Mode & Location row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="section-label block mb-1.5">Participation Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="input text-xs"
              >
                <option value="online">Online</option>
                <option value="in-person">In-person</option>
              </select>
            </div>
            <div>
              <label className="section-label block mb-1.5">
                {mode === "online" ? "Virtual Venue" : "Physical Venue"}
              </label>
              <input
                type="text"
                placeholder={mode === "online" ? "Discord / Zoom" : "e.g. College Campus, Mumbai"}
                value={mode === "online" ? "Virtual / Online" : location}
                disabled={mode === "online"}
                onChange={(e) => setLocation(e.target.value)}
                className="input text-xs disabled:opacity-50"
              />
            </div>
          </div>

          {/* Prize Pool & Currency & Registration Link */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 flex gap-2">
              <div className="w-28 shrink-0">
                <label className="section-label block mb-1.5">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="input text-xs"
                >
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="section-label block mb-1.5">Prize Pool</label>
                <input
                  type="text"
                  placeholder="e.g. 1,00,000 or Perks"
                  value={prizePool}
                  onChange={(e) => setPrizePool(e.target.value)}
                  className="input text-xs"
                />
              </div>
            </div>
            <div>
              <label className="section-label block mb-1.5">
                {type === "external" ? "Registration Link" : "Official Website (Optional)"}
              </label>
              <input
                type="url"
                placeholder="https://..."
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                className="input text-xs"
                required={type === "external"}
              />
            </div>
          </div>

          {/* College / University (Optional) */}
          <div>
            <label className="section-label block mb-1.5">College / University (Optional)</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search or select college..."
                value={showCollegeDropdown ? collegeSearch : (college || "")}
                onFocus={() => {
                  setCollegeSearch("");
                  setShowCollegeDropdown(true);
                }}
                onChange={(e) => {
                  setCollegeSearch(e.target.value);
                  setShowCollegeDropdown(true);
                }}
                className="input text-xs w-full"
              />
              
              {showCollegeDropdown && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setShowCollegeDropdown(false)}
                  />
                  <div className="absolute left-0 right-0 top-full mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-1.5 shadow-xl z-20">
                    {COLLEGES.filter((col) => 
                      col !== "Other" && col.toLowerCase().includes(collegeSearch.toLowerCase())
                    ).map((collegeName) => (
                      <button
                        type="button"
                        key={collegeName}
                        onClick={() => {
                          setCollege(collegeName);
                          setCollegeSearch("");
                          setShowCollegeDropdown(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-md text-xs text-zinc-300 hover:bg-zinc-900 hover:text-white transition-colors cursor-pointer"
                      >
                        {collegeName}
                      </button>
                    ))}
                    {COLLEGES.filter((col) => 
                      col !== "Other" && col.toLowerCase().includes(collegeSearch.toLowerCase())
                    ).length === 0 && (
                      <div className="text-center py-4 text-xs text-zinc-600 mb-1.5">
                        No colleges match your search.
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setCollege("Other");
                        setCollegeSearch("");
                        setShowCollegeDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2 rounded-md text-xs text-zinc-300 hover:bg-zinc-900 hover:text-white transition-colors border-t border-zinc-900/60 font-semibold cursor-pointer"
                    >
                      Other (Type custom college name...)
                    </button>
                  </div>
                </>
              )}
            </div>

            {college === "Other" && (
              <input
                type="text"
                placeholder="Enter custom college name"
                value={customCollege}
                onChange={(e) => setCustomCollege(e.target.value)}
                className="input text-xs mt-2"
              />
            )}
          </div>

          {/* Tags */}
          <div>
            <label className="section-label block mb-1.5">
              Event Tags <span className="text-[10px] text-zinc-500 font-mono lowercase normal-case">(comma separated)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. AI, Web3, Mobile, Beginners, FinTech"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="input text-xs"
            />
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-900">
            <button
              type="button"
              onClick={() => router.back()}
              className="btn btn-secondary btn-sm"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={loading}
            >
              {loading ? "Publishing..." : "Publish Event"}
            </button>
          </div>
        </form>
      </main>
    </AuthGuard>
  );
}
