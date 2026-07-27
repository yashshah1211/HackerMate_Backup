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
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [type, setType] = useState("external");
  const [maxParticipants, setMaxParticipants] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [loading, setLoading] = useState(false);

  const [college, setCollege] = useState("");
  const [customCollege, setCustomCollege] = useState("");
  const [collegeSearch, setCollegeSearch] = useState("");
  const [showCollegeDropdown, setShowCollegeDropdown] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      showToast("Please enter a hackathon name", "warning");
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

      const { error } = await supabase
        .from("hackathons")
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          start_date: startDate || null,
          end_date: endDate || null,
          location: mode === "online" ? "Online" : location.trim() || null,
          mode,
          prize_pool: prizePool.trim() || null,
          website_url: websiteUrl.trim() || null,
          type,
          max_participants: maxParticipants ? parseInt(maxParticipants, 10) : null,
          tags: tags.length > 0 ? tags : null,
          organizer_id: user.id,
          college: college === "Other" ? customCollege.trim() || null : college || null,
        })
        .select()
        .single();

      if (error) {
        showToast(error.message, "error");
      } else {
        showToast("Hackathon listed successfully!", "success");
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
                onClick={() => setType("internal")}
                className={`p-4 rounded-lg border text-left flex flex-col justify-between min-h-[110px] transition-all cursor-pointer ${
                  type === "internal"
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
                    {type === "internal" && (
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

          {type === "internal" && (
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

          {/* Prize Pool & Registration Link */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="section-label block mb-1.5">Prize Pool</label>
              <input
                type="text"
                placeholder="e.g. ₹ 1,00,000, Rs. 50,000, Swags"
                value={prizePool}
                onChange={(e) => setPrizePool(e.target.value)}
                className="input text-xs"
              />
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
