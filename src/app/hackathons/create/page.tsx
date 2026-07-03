"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";
import { useRouter as useAppRouter } from "next/navigation";
import { useNotification } from "@/context/NotificationContext";

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
  const [tagsInput, setTagsInput] = useState("");
  const [loading, setLoading] = useState(false);

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
          tags: tags.length > 0 ? tags : null,
          organizer_id: user.id,
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
            List a Hackathon
          </h1>
          <p className="text-xs text-zinc-400">
            Publish your university, local, or external hackathon on HackerMate to start building teams.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div>
            <label className="section-label block mb-1.5">Hackathon Name</label>
            <input
              type="text"
              placeholder="e.g. Smart India Hackathon, Mumbai Hacks, DJSCE Hackathon"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input text-xs"
              required
            />
          </div>

          {/* Type Selector (Native vs External) */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setType("external")}
              className={`p-3.5 rounded border text-left flex flex-col justify-between min-h-[90px] transition-colors ${
                type === "external"
                  ? "bg-zinc-900 border-zinc-700 text-white"
                  : "bg-transparent border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white"
              }`}
            >
              <span className="text-xs font-semibold">External Listing</span>
              <span className="text-[10px] text-zinc-500 leading-normal">
                Directs builders to register on Devpost, Devfolio, or your website.
              </span>
            </button>

            <button
              type="button"
              onClick={() => setType("native")}
              className={`p-3.5 rounded border text-left flex flex-col justify-between min-h-[90px] transition-colors ${
                type === "native"
                  ? "bg-zinc-900 border-zinc-700 text-white"
                  : "bg-transparent border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white"
              }`}
            >
              <span className="text-xs font-semibold">Native Hosting (Free)</span>
              <span className="text-[10px] text-zinc-500 leading-normal">
                Manage registrations, teams, and submissions directly on HackerMate.
              </span>
            </button>
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
