"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

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
  website_url: string | null;
  tags: string[] | null;
};

type ProjectSubmission = {
  team_id: string;
  project_title: string;
  demo_url: string;
  github_url: string;
  pitch_video_url: string;
  slides_url: string;
  checklist: { id: string; label: string; checked: boolean }[];
  completion_status: string;
  screenshot_url: string | null;
  updated_at: string;
  teams: {
    id: string;
    name: string;
    description: string | null;
    college: string | null;
    skills: string[] | null;
    max_members: number;
    team_members: {
      id: string;
      user_id: string;
      profiles: {
        id: string;
        full_name: string;
        avatar_url: string | null;
        college: string | null;
      };
    }[];
  };
};

type PaginationMeta = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export default function PublicShowcasePage() {
  const params = useParams();
  const router = useRouter();
  const hackathonId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [hackathon, setHackathon] = useState<Hackathon | null>(null);
  const [projects, setProjects] = useState<ProjectSubmission[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    total: 0,
    page: 1,
    limit: 6,
    totalPages: 0,
  });

  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null);

  async function fetchShowcase(pageNum: number, searchQuery: string) {
    setLoading(true);
    try {
      const url = new URL(`/api/public-showcase`, window.location.origin);
      url.searchParams.set("hackathon_id", hackathonId);
      url.searchParams.set("page", pageNum.toString());
      url.searchParams.set("limit", "6");
      if (searchQuery.trim()) {
        url.searchParams.set("search", searchQuery.trim());
      }

      const res = await fetch(url.toString());
      const data = await res.json();

      if (res.ok) {
        setHackathon(data.hackathon);
        setProjects(data.projects || []);
        setPagination(
          data.pagination || { total: 0, page: 1, limit: 6, totalPages: 0 }
        );
      } else {
        console.error("Showcase API error:", data.error);
      }
    } catch (err) {
      console.error("Failed to fetch showcase:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (hackathonId) {
      fetchShowcase(currentPage, search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hackathonId, currentPage]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchShowcase(1, search);
  };

  const parseEmbedVideoUrl = (url: string) => {
    if (!url) return null;
    if (url.includes("youtube.com/watch?v=")) {
      return url.replace("watch?v=", "embed/");
    }
    if (url.includes("youtu.be/")) {
      const id = url.split("youtu.be/")[1]?.split("?")[0];
      return `https://www.youtube.com/embed/${id}`;
    }
    if (url.includes("vimeo.com/")) {
      const id = url.split("vimeo.com/")[1]?.split("?")[0];
      return `https://player.vimeo.com/video/${id}`;
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)] flex flex-col font-sans transition-colors duration-200">
      {/* Header Bar */}
      <header className="border-b border-[var(--card-border)] bg-[var(--surface-1)]/90 backdrop-blur-md sticky top-0 z-40 px-4 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href={`/hackathons/${hackathonId}`}
              className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] flex items-center gap-1 font-mono transition-colors"
            >
              ← Back to Event Hub
            </Link>
            <span className="text-[var(--card-border)]">|</span>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              PROJECT SHOWCASE
            </span>
          </div>

          {hackathon && (
            <span className="text-xs text-[var(--text-secondary)] font-mono truncate max-w-[200px] sm:max-w-xs">
              {hackathon.name}
            </span>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        {/* Hero Banner */}
        <div className="card card-static p-6 md:p-8 mb-8 relative overflow-hidden bg-[var(--surface-1)] border border-[var(--card-border)] rounded-2xl shadow-xs">
          <div className="relative z-10">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
              <span className="badge text-[10px] font-mono uppercase bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/25 px-2.5 py-1 rounded-md font-semibold">
                Official Submissions Gallery
              </span>
              <span className="text-xs font-mono text-[var(--text-secondary)]">
                🏆 {pagination.total} Completed Project{pagination.total === 1 ? "" : "s"}
              </span>
            </div>

            <h1 className="text-2xl md:text-3xl font-extrabold text-[var(--text-primary)] mb-2 tracking-tight">
              {hackathon?.name || "Hackathon"} Project Showcase
            </h1>
            <p className="text-xs md:text-sm text-[var(--text-secondary)] max-w-2xl leading-relaxed mb-6">
              Explore completed project submissions, code repositories, demo links, presentation decks, and video pitches created by builder teams.
            </p>

            {/* Search Bar */}
            <form onSubmit={handleSearchSubmit} className="flex gap-2 max-w-md">
              <input
                type="text"
                placeholder="Search project title, team, or repository..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input text-xs flex-1 bg-[var(--surface-2)] text-[var(--text-primary)] border-[var(--card-border)]"
              />
              <button type="submit" className="btn btn-primary btn-sm text-xs cursor-pointer">
                Search
              </button>
            </form>
          </div>
        </div>

        {/* Projects Grid */}
        {loading ? (
          <div className="text-center py-16">
            <div className="inline-block w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-xs text-[var(--text-tertiary)] font-mono">Loading showcase submissions...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-[var(--card-border)] rounded-2xl bg-[var(--surface-1)] p-8 shadow-xs">
            <div className="text-3xl mb-3">🚀</div>
            <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1">No Submitted Projects Found</h3>
            <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto mb-4">
              {search
                ? `No completed submissions matched your query "${search}". Try resetting your search.`
                : "No completed project submissions have been published for this event yet."}
            </p>
            {search && (
              <button
                onClick={() => {
                  setSearch("");
                  setCurrentPage(1);
                  fetchShowcase(1, "");
                }}
                className="btn btn-secondary btn-sm text-xs cursor-pointer"
              >
                Reset Search Filter
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {projects.map((proj) => {
                const team = proj.teams;
                const embedUrl = parseEmbedVideoUrl(proj.pitch_video_url);

                return (
                  <div
                    key={proj.team_id}
                    className="card card-static p-5 flex flex-col justify-between hover:border-[var(--card-hover-border)] transition-all group bg-[var(--surface-1)] border border-[var(--card-border)] rounded-xl shadow-xs"
                  >
                    <div>
                      {/* Thumbnail Header */}
                      <div className="relative w-full h-40 rounded-lg overflow-hidden bg-[var(--surface-2)] border border-[var(--card-border)] mb-4 flex items-center justify-center">
                        {proj.screenshot_url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={proj.screenshot_url}
                            alt={proj.project_title || team?.name || "Submission"}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full bg-[var(--surface-2)] p-4 flex flex-col items-center justify-center text-center">
                            <span className="text-2xl mb-1">💻</span>
                            <span className="text-xs font-bold text-[var(--text-secondary)] font-mono line-clamp-1">
                              {proj.project_title || team?.name || "Project Submission"}
                            </span>
                          </div>
                        )}

                        <span className="absolute top-2 right-2 text-[9px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 uppercase font-semibold">
                          SUBMITTED
                        </span>
                      </div>

                      {/* Project Title & Team Name */}
                      <h3 className="text-base font-bold text-[var(--text-primary)] mb-1 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors line-clamp-1">
                        {proj.project_title || "Untitled Submission"}
                      </h3>

                      <p className="text-xs text-[var(--text-tertiary)] font-mono mb-3">
                        by <span className="text-[var(--text-primary)] font-semibold">{team?.name || "Anonymous Team"}</span>
                      </p>

                      {/* Description / Tech details */}
                      {team?.description && (
                        <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed mb-4">
                          {team.description}
                        </p>
                      )}

                      {/* Team Member Avatars */}
                      {team?.team_members && team.team_members.length > 0 && (
                        <div className="flex items-center gap-1.5 mb-4 pt-3 border-t border-[var(--card-border)]">
                          <span className="text-[10px] font-mono text-[var(--text-tertiary)] mr-1">Builders:</span>
                          <div className="flex -space-x-2 overflow-hidden">
                            {team.team_members.slice(0, 4).map((m) => (
                              <div
                                key={m.id}
                                className="inline-block h-6 w-6 rounded-full ring-2 ring-[var(--surface-1)] overflow-hidden bg-[var(--surface-2)]"
                                title={m.profiles?.full_name}
                              >
                                {m.profiles?.avatar_url ? (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <img
                                    src={m.profiles.avatar_url}
                                    alt={m.profiles.full_name}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="h-full w-full flex items-center justify-center text-[9px] font-bold text-[var(--text-secondary)] bg-[var(--surface-2)]">
                                    {m.profiles?.full_name?.charAt(0) || "U"}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                          {team.team_members.length > 4 && (
                            <span className="text-[10px] font-mono text-[var(--text-tertiary)] pl-1">
                              +{team.team_members.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Media Action Buttons */}
                    <div className="pt-3 border-t border-[var(--card-border)] flex flex-wrap items-center gap-2">
                      {proj.demo_url && (
                        <a
                          href={proj.demo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-primary btn-sm text-[11px] py-1 px-2.5 flex-1 text-center justify-center cursor-pointer"
                        >
                          🌐 Live Demo
                        </a>
                      )}
                      {proj.github_url && (
                        <a
                          href={proj.github_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-secondary btn-sm text-[11px] py-1 px-2.5 flex-1 text-center justify-center cursor-pointer"
                        >
                          💻 Code Repo
                        </a>
                      )}
                      {proj.pitch_video_url && (
                        <button
                          onClick={() => setSelectedVideoUrl(proj.pitch_video_url)}
                          className="btn btn-secondary btn-sm text-[11px] py-1 px-2.5 text-center justify-center cursor-pointer border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                        >
                          🎥 Pitch
                        </button>
                      )}
                      {proj.slides_url && (
                        <a
                          href={proj.slides_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-secondary btn-sm text-[11px] py-1 px-2.5 text-center justify-center cursor-pointer text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                        >
                          📊 Deck
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 card card-static bg-[var(--surface-1)] border border-[var(--card-border)] rounded-xl shadow-xs">
                <span className="text-xs font-mono text-[var(--text-secondary)]">
                  Showing Page <strong className="text-[var(--text-primary)]">{pagination.page}</strong> of{" "}
                  <strong className="text-[var(--text-primary)]">{pagination.totalPages}</strong> ({pagination.total} total submissions)
                </span>

                <div className="flex items-center gap-2">
                  <button
                    disabled={pagination.page <= 1}
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    className="btn btn-secondary btn-sm text-xs cursor-pointer disabled:opacity-40"
                  >
                    ← Previous
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(
                      (p) => (
                        <button
                          key={p}
                          onClick={() => setCurrentPage(p)}
                          className={`w-7 h-7 rounded text-xs font-mono transition-colors ${
                            p === pagination.page
                              ? "bg-emerald-500 text-white font-bold"
                              : "bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                          }`}
                        >
                          {p}
                        </button>
                      )
                    )}
                  </div>

                  <button
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() =>
                      setCurrentPage((prev) => Math.min(pagination.totalPages, prev + 1))
                    }
                    className="btn btn-secondary btn-sm text-xs cursor-pointer disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Video Pitch Modal */}
      {selectedVideoUrl && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4 animate-fade-in">
          <div className="card card-static p-6 w-full max-w-2xl relative bg-[var(--surface-1)] border border-[var(--card-border)] shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-[var(--text-primary)]">🎥 Video Pitch Presentation</h3>
              <button
                onClick={() => setSelectedVideoUrl(null)}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-xs font-mono cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            {parseEmbedVideoUrl(selectedVideoUrl) ? (
              <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-[var(--card-border)] bg-black">
                <iframe
                  src={parseEmbedVideoUrl(selectedVideoUrl)!}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="p-6 text-center border border-[var(--card-border)] rounded-lg bg-[var(--surface-2)]">
                <p className="text-xs text-[var(--text-secondary)] mb-4">
                  This video is hosted externally. Click below to watch the video pitch:
                </p>
                <a
                  href={selectedVideoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary btn-sm text-xs cursor-pointer"
                >
                  Open Pitch Video Link ↗
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
