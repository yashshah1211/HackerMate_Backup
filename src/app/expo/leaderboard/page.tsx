"use client";

import React, { useState, useEffect, useRef } from "react";
import Logo from "@/components/Logo";
import { supabase } from "@/lib/supabase";

type LeaderboardEntry = {
  id: string;
  name: string;
  score: number;
  timeSeconds: number;
  createdAt: number;
};

export default function LeaderboardPage() {
  const [top5, setTop5] = useState<LeaderboardEntry[]>([]);
  const [totalParticipants, setTotalParticipants] = useState(0);
  const [allEntries, setAllEntries] = useState<LeaderboardEntry[]>([]);
  const [isOrganizerMode, setIsOrganizerMode] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const isPollingRef = useRef(false);

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [score, setScore] = useState("");
  const [time, setTime] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const fetchPublicLeaderboard = async () => {
    if (isPollingRef.current) return;
    isPollingRef.current = true;
    try {
      const { data, count, error } = await supabase
        .from("expo_leaderboard_entries")
        .select("id, display_name, score, time_seconds, created_at", { count: "exact" })
        .order("score", { ascending: false })
        .order("time_seconds", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(5);

      if (!error && data !== null) {
        setTop5(data.map((d: any) => ({
          id: d.id,
          name: d.display_name,
          score: d.score,
          timeSeconds: d.time_seconds,
          createdAt: new Date(d.created_at).getTime()
        })));
        if (count !== null) setTotalParticipants(count);
      }
    } finally {
      isPollingRef.current = false;
    }
  };

  const fetchAllEntries = async () => {
    const { data, error } = await supabase
      .from("expo_leaderboard_entries")
      .select("id, display_name, score, time_seconds, created_at")
      .order("score", { ascending: false })
      .order("time_seconds", { ascending: true })
      .order("created_at", { ascending: true });

    if (!error && data) {
      setAllEntries(data.map((d: any) => ({
        id: d.id,
        name: d.display_name,
        score: d.score,
        timeSeconds: d.time_seconds,
        createdAt: new Date(d.created_at).getTime()
      })));
    }
  };

  useEffect(() => {
    if (isOrganizerMode) {
      fetchAllEntries();
    }
  }, [isOrganizerMode]);

  useEffect(() => {
    setIsMounted(true);
    fetchPublicLeaderboard();
    const interval = setInterval(fetchPublicLeaderboard, 3000);

    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    const parsedScore = parseInt(score, 10);
    const parsedTime = parseFloat(time);

    if (!name.trim()) return alert("Name is required.");
    if (isNaN(parsedScore) || parsedScore < 0 || parsedScore > 100) return alert("Score must be an integer between 0 and 100.");
    if (isNaN(parsedTime) || parsedTime <= 0 || parsedTime > 300) return alert("Time must be between 0 and 300 seconds.");

    setIsSaving(true);

    if (editingId) {
      const { error } = await supabase
        .from("expo_leaderboard_entries")
        .update({
          display_name: name.trim().substring(0, 30),
          score: parsedScore,
          time_seconds: parsedTime
        })
        .eq("id", editingId);

      if (error) {
        alert("Failed to update: " + error.message);
      } else {
        setEditingId(null);
        setName("");
        setScore("");
        setTime("");
        fetchPublicLeaderboard();
        fetchAllEntries();
      }
    } else {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) {
        alert("Must be logged in to add entry.");
        setIsSaving(false);
        return;
      }

      const { error } = await supabase
        .from("expo_leaderboard_entries")
        .insert({
          display_name: name.trim().substring(0, 30),
          score: parsedScore,
          time_seconds: parsedTime,
          challenge_id: null,
          builder_ids: null,
          created_by: userId
        });

      if (error) {
        alert("Failed to insert: " + error.message);
      } else {
        setName("");
        setScore("");
        setTime("");
        fetchPublicLeaderboard();
        fetchAllEntries();
      }
    }

    setIsSaving(false);
  };

  const handleEdit = (entry: LeaderboardEntry) => {
    setEditingId(entry.id);
    setName(entry.name);
    setScore(entry.score.toString());
    setTime(entry.timeSeconds.toString());
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this entry?")) {
      const { error } = await supabase.from("expo_leaderboard_entries").delete().eq("id", id);
      if (error) {
        alert("Failed to delete: " + error.message);
      } else {
        if (editingId === id) {
          setEditingId(null);
          setName("");
          setScore("");
          setTime("");
        }
        fetchPublicLeaderboard();
        fetchAllEntries();
      }
    }
  };

  const handleResetAll = async () => {
    if (confirm("Reset all leaderboard scores? This cannot be undone.")) {
      const { error } = await supabase.from("expo_leaderboard_entries").delete().not("id", "is", null);
      if (error) {
        alert("Failed to reset: " + error.message);
      } else {
        fetchPublicLeaderboard();
        setIsOrganizerMode(false);
      }
    }
  };

  if (!isMounted) return <div className="min-h-screen bg-[#0F0F0E]" />;

  return (
    <div ref={containerRef} className="min-h-screen bg-[#0F0F0E] text-[#F2F0EA] flex flex-col font-sans overflow-hidden">

      {/* PUBLIC DISPLAY */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 max-w-6xl mx-auto w-full">

        {/* Header */}
        <div className="flex flex-col items-center text-center mb-10 w-full">
          <div className="uppercase tracking-widest text-[#737069] mb-4 font-semibold" style={{ fontFamily: 'var(--font-code)', fontSize: '0.875rem' }}>
            30 SECOND TEAM CHALLENGE
          </div>
          <Logo className="w-48 h-auto text-[#F2F0EA] mb-6" />
          <h1 style={{ fontFamily: 'var(--font-display-face)' }} className="text-6xl md:text-7xl font-bold tracking-tight mb-2 uppercase">
            Top Builders
          </h1>
          <p style={{ fontFamily: 'var(--font-ui)' }} className="text-xl md:text-2xl text-[#737069]">
            Can you take #1?
          </p>
        </div>

        {/* Leaderboard Table */}
        <div className="w-full max-w-4xl bg-[#161615] rounded-xl border border-[#2A2825] p-6 shadow-2xl relative">

          {/* Header Row */}
          <div className="flex items-center text-[#737069] uppercase tracking-wider text-sm pb-4 border-b border-[#2A2825] font-semibold" style={{ fontFamily: 'var(--font-ui)' }}>
            <div className="w-20 text-center">Rank</div>
            <div className="flex-1 px-4">Name / Team</div>
            <div className="w-24 text-right px-4">Score</div>
            <div className="w-24 text-right">Time</div>
          </div>

          {/* Rows */}
          <div className="flex flex-col gap-2 mt-4">
            {top5.length === 0 ? (
              <div className="py-16 text-center">
                <div style={{ fontFamily: 'var(--font-display-face)' }} className="text-3xl text-[#737069] font-bold mb-2 uppercase">No Scores Yet</div>
                <div style={{ fontFamily: 'var(--font-ui)' }} className="text-[#737069] text-lg">Be the first to set the benchmark.</div>
              </div>
            ) : (
              [0, 1, 2, 3, 4].map(index => {
                const entry = top5[index];
                if (!entry) {
                  return (
                    <div key={index} className="flex items-center py-4 text-[#737069]/30 border border-transparent">
                      <div className="w-20 text-center" style={{ fontFamily: 'var(--font-code)' }}>—</div>
                      <div className="flex-1 px-4">—</div>
                      <div className="w-24 text-right px-4">—</div>
                      <div className="w-24 text-right">—</div>
                    </div>
                  );
                }

                const isFirst = index === 0;
                const isWinnerScore = entry.score >= 90;

                return (
                  <div key={entry.id} className={`flex items-center py-4 rounded-lg transition-all ${isFirst ? 'bg-[#2A2825] border border-[#B4F461]/30 scale-[1.02] shadow-lg mb-2' : 'border border-transparent hover:bg-[#2A2825]/50'}`}>
                    <div className="w-20 text-center font-bold text-2xl" style={{ fontFamily: 'var(--font-code)', color: isFirst ? '#B4F461' : '#737069' }}>
                      0{index + 1}
                    </div>
                    <div className="flex-1 px-4 truncate font-bold text-xl md:text-2xl" style={{ fontFamily: 'var(--font-ui)', color: isFirst ? '#F2F0EA' : '#D4D1C9' }}>
                      {entry.name}
                    </div>
                    <div className="w-24 text-right px-4 text-xl md:text-2xl font-semibold flex items-center justify-end gap-2" style={{ fontFamily: 'var(--font-code)' }}>
                      {isWinnerScore && <div className="w-2 h-2 rounded-full bg-[#B4F461]" />}
                      {entry.score}
                    </div>
                    <div className="w-24 text-right text-[#737069] text-lg md:text-xl font-medium" style={{ fontFamily: 'var(--font-code)' }}>
                      {entry.timeSeconds.toFixed(1)}s
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-8 flex items-center justify-between w-full max-w-4xl text-[#737069] text-sm" style={{ fontFamily: 'var(--font-code)' }}>
          <div>
            {totalParticipants > 0 ? `${totalParticipants} challenger${totalParticipants === 1 ? '' : 's'}` : 'Waiting for participants...'}
          </div>
          <div className="flex gap-4 opacity-50 hover:opacity-100 transition-opacity">
            <button onClick={handleToggleFullscreen} className="uppercase tracking-widest hover:text-[#F2F0EA]">
              {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            </button>
            <button onClick={() => setIsOrganizerMode(true)} className="uppercase tracking-widest hover:text-[#F2F0EA]">
              Manage Leaderboard
            </button>
          </div>
        </div>
      </div>

      {/* ORGANIZER MODE MODAL */}
      {isOrganizerMode && (
        <div className="fixed inset-0 bg-[#0F0F0E]/90 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-full max-w-md bg-[#161615] h-full border-l border-[#2A2825] shadow-2xl flex flex-col">

            <div className="p-6 border-b border-[#2A2825] flex justify-between items-center">
              <h2 className="font-bold text-xl" style={{ fontFamily: 'var(--font-display-face)' }}>Manage Leaderboard</h2>
              <button onClick={() => setIsOrganizerMode(false)} className="text-[#737069] hover:text-[#F2F0EA]">
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">

              {/* Form */}
              <div className="bg-[#2A2825] p-4 rounded-lg mb-8 border border-[#403D39]">
                <h3 className="font-semibold mb-4 text-[#B4F461]">{editingId ? "Edit Entry" : "Add New Entry"}</h3>
                <form onSubmit={handleSaveEntry} className="flex flex-col gap-4">
                  <div>
                    <label className="block text-sm text-[#737069] mb-1">Name / Team</label>
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      maxLength={30}
                      className="w-full bg-[#0F0F0E] border border-[#403D39] rounded px-3 py-2 text-[#F2F0EA] focus:outline-none focus:border-[#B4F461]"
                      placeholder="Team Awesome"
                      required
                      disabled={isSaving}
                    />
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm text-[#737069] mb-1">Score (0-100)</label>
                      <input
                        type="number"
                        value={score}
                        onChange={e => setScore(e.target.value)}
                        min="0"
                        max="100"
                        className="w-full bg-[#0F0F0E] border border-[#403D39] rounded px-3 py-2 text-[#F2F0EA] focus:outline-none focus:border-[#B4F461]"
                        placeholder="100"
                        required
                        disabled={isSaving}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm text-[#737069] mb-1">Time (seconds)</label>
                      <input
                        type="number"
                        value={time}
                        onChange={e => setTime(e.target.value)}
                        step="0.1"
                        min="0.1"
                        max="300"
                        className="w-full bg-[#0F0F0E] border border-[#403D39] rounded px-3 py-2 text-[#F2F0EA] focus:outline-none focus:border-[#B4F461]"
                        placeholder="14.5"
                        required
                        disabled={isSaving}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button type="submit" disabled={isSaving} className="flex-1 bg-[#B4F461] text-[#0F0F0E] font-bold py-2 rounded hover:bg-[#a1e250] transition-colors disabled:opacity-50">
                      {isSaving ? "Saving..." : (editingId ? "Save Changes" : "Add to Leaderboard")}
                    </button>
                    {editingId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setName("");
                          setScore("");
                          setTime("");
                        }}
                        disabled={isSaving}
                        className="px-4 py-2 bg-[#403D39] text-[#F2F0EA] rounded hover:bg-[#524E4A] transition-colors disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              </div>

              <div className="mb-4">
                <h3 className="font-semibold text-[#737069] mb-4">All Entries ({allEntries.length})</h3>
                <div className="flex flex-col gap-2">
                  {allEntries.map((entry, idx) => (
                    <div key={entry.id} className="bg-[#2A2825] p-3 rounded flex justify-between items-center border border-[#403D39]">
                      <div>
                        <div className="font-semibold text-sm">#{idx + 1} {entry.name}</div>
                        <div className="text-xs text-[#737069]" style={{ fontFamily: 'var(--font-code)' }}>{entry.score} pts • {entry.timeSeconds.toFixed(1)}s</div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleEdit(entry)} className="text-xs text-blue-400 hover:text-blue-300 uppercase tracking-wide">Edit</button>
                        <button onClick={() => handleDelete(entry.id)} className="text-xs text-red-400 hover:text-red-300 uppercase tracking-wide">Delete</button>
                      </div>
                    </div>
                  ))}
                  {allEntries.length === 0 && (
                    <div className="text-sm text-[#737069] italic">No entries yet.</div>
                  )}
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="p-6 border-t border-[#2A2825] bg-[#0F0F0E]">
              <button
                onClick={handleResetAll}
                className="w-full border border-red-900/50 text-red-500 hover:bg-red-950/30 font-semibold py-2 rounded text-sm transition-colors"
              >
                Reset entire leaderboard
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
