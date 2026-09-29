"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, ChevronDown, ChevronUp, Download, Megaphone, PenLine, Plus, Search, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";
import { useNotification } from "@/context/NotificationContext";
import {
  Button,
  Chip,
  Dialog,
  EmptyState,
  FieldLabel,
  IconButton,
  Input,
  Page,
  PageHeader,
  PageLoader,
  Section,
  SearchField,
  Select,
  Stat,
  Tape,
  Textarea,
} from "@/components/system";

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
        if (hackathonErr) console.error("Failed to load hackathon for organizer portal:", hackathonErr);
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
      const { data: resData, error: resErr } = await supabase
        .from("hackathon_resources")
        .select("*")
        .eq("hackathon_id", hackathonId)
        .order("created_at", { ascending: false });

      if (resErr) console.error("Failed to load hackathon resources:", resErr);
      setResources(resData || []);

      // 4. Fetch hackathon stages
      const { data: stageData, error: stageErr } = await supabase
        .from("hackathon_stages")
        .select("*")
        .eq("hackathon_id", hackathonId)
        .order("sort_order", { ascending: true })
        .order("start_time", { ascending: true });

      if (stageErr) console.error("Failed to load hackathon stages:", stageErr);
      setStages(stageData || []);

      // 5. Fetch announcements
      const { data: announceData, error: announceErr } = await supabase
        .from("hackathon_announcements")
        .select("*, hackathon_stages:linked_stage_id(title)")
        .eq("hackathon_id", hackathonId)
        .order("created_at", { ascending: false });

      if (announceErr) console.error("Failed to load announcements:", announceErr);
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
        <Page>
          <PageLoader label="Loading organizer portal" />
        </Page>
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

  const teamRuleLabel =
    hackathon?.min_team_size === 1 && hackathon?.max_team_size === 1
      ? "Solo only"
      : hackathon?.min_team_size && hackathon?.max_team_size
        ? `${hackathon.min_team_size}–${hackathon.max_team_size} members`
        : hackathon?.max_team_size
          ? `Up to ${hackathon.max_team_size} members`
          : "Flexible team size";

  const stageTone: Record<string, "info" | "neutral" | "bad" | "warn"> = {
    ceremony: "info",
    checkpoint: "neutral",
    deadline: "bad",
    judging: "warn",
    other: "neutral",
  };
  const dateOpts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" };

  const statusTape = (reg: Registration) =>
    reg.status === "waitlisted" ? <Tape tone="warn">Waitlisted</Tape> : <Tape tone="ok">Confirmed</Tape>;

  const teamStatus = (reg: Registration) =>
    reg.teams ? (
      <Link href={`/teams/${reg.teams.id}`} className="min-w-0 truncate text-[12.5px] font-medium text-ink hover:underline decoration-line-strong underline-offset-4">
        {reg.teams.name}
      </Link>
    ) : reg.looking_for_team ? (
      <Tape tone="accent">Looking for team</Tape>
    ) : (
      <span className="text-[12.5px] text-ink-3">Solo</span>
    );

  const registeredOn = (reg: Registration) =>
    new Date(reg.created_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

  return (
    <AuthGuard>
      <Page>
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center pt-5 text-[12.5px] text-ink-3 md:pt-6">
          <Link href={`/hackathons/${hackathonId}`} className="inline-flex min-w-0 items-center gap-1.5 hover:text-ink">
            <ArrowLeft className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">Back to {hackathon.name}</span>
          </Link>
        </nav>

        <PageHeader
          className="pt-4 md:pt-5"
          eyebrow="Organizer portal"
          title={<span className="break-words [overflow-wrap:anywhere]">{hackathon.name}</span>}
          meta="Participant roster, announcements, schedule and resource links."
          actions={
            <>
              <Button variant="secondary" icon={<Plus />} onClick={() => setShowAddResourceModal(true)}>
                Add resource
              </Button>
              <Button variant="primary" icon={<Download />} onClick={() => handleExportCSV(filteredRegs)}>
                Export CSV
              </Button>
            </>
          }
        />

        <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-5 sm:grid-cols-4">
          <Stat
            label="Confirmed"
            value={confirmedCount}
            hint={maxCap !== null && maxCap !== undefined ? `of ${maxCap} places` : "Unlimited places"}
          />
          <Stat label="Waitlisted" value={waitlistedCount} />
          <Stat label="Matched teams" value={registrations.filter((r) => r.teams !== null).length} />
          <Stat
            label="Rounds"
            value={hackathon?.rounds_count || 1}
            hint={teamRuleLabel}
          />
        </div>

        <div className="mt-8 space-y-12">
          {/* ── Participant roster ─────────────────────────────── */}
          <Section
            title="Registered participants"
            count={registrations.length}
            description="Everyone who signed up for this event."
          >
            <SearchField value={search} onChange={setSearch} placeholder="Name, college or email" label="Search participants" className="mb-3 w-full sm:max-w-xs" />
            {filteredRegs.length === 0 ? (
              <EmptyState
                icon={<Search />}
                title={search ? "No participants match your search" : "No registered participants yet"}
                compact
              />
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden overflow-x-auto rounded-lg border border-line bg-raised md:block">
                  <table className="w-full text-left text-[13px]">
                    <thead>
                      <tr className="border-b border-line">
                        <th className="px-4 py-2.5 font-normal caps-label text-ink-3">Participant</th>
                        <th className="px-4 py-2.5 font-normal caps-label text-ink-3">College</th>
                        <th className="px-4 py-2.5 font-normal caps-label text-ink-3">Skills</th>
                        <th className="px-4 py-2.5 font-normal caps-label text-ink-3">Registration</th>
                        <th className="px-4 py-2.5 font-normal caps-label text-ink-3">Team</th>
                        <th className="px-4 py-2.5 text-right font-normal caps-label text-ink-3">Registered</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {filteredRegs.map((reg) => (
                        <tr key={reg.id} className="transition-colors hover:bg-hover">
                          <td className="px-4 py-3 align-top">
                            <div className="font-semibold text-ink">{reg.profiles?.full_name || "Anonymous Builder"}</div>
                            {reg.profiles?.email && <span className="mt-0.5 block text-[12px] text-ink-3">{reg.profiles.email}</span>}
                          </td>
                          <td className="px-4 py-3 align-top text-ink-2">{reg.profiles?.college || "N/A"}</td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex max-w-[240px] flex-wrap gap-1">
                              {(reg.profiles?.skills || []).slice(0, 3).map((skill, idx) => (
                                <Chip key={idx}>{skill}</Chip>
                              ))}
                              {(reg.profiles?.skills || []).length > 3 && (
                                <span className="self-center font-mono text-[11px] text-ink-3">+{(reg.profiles?.skills || []).length - 3}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top">{statusTape(reg)}</td>
                          <td className="max-w-[200px] px-4 py-3 align-top">{teamStatus(reg)}</td>
                          <td className="px-4 py-3 text-right align-top font-mono text-[12px] text-ink-3 tabular">{registeredOn(reg)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile list */}
                <ul className="divide-y divide-line rounded-lg border border-line bg-raised md:hidden">
                  {filteredRegs.map((reg) => (
                    <li key={reg.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-semibold text-ink">{reg.profiles?.full_name || "Anonymous Builder"}</p>
                          <p className="truncate text-[12.5px] text-ink-3">{reg.profiles?.college || "N/A"}</p>
                        </div>
                        <span className="shrink-0 font-mono text-[12px] text-ink-3 tabular">{registeredOn(reg)}</span>
                      </div>
                      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                        {statusTape(reg)}
                        {teamStatus(reg)}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Section>

          {/* ── Broadcast announcement ─────────────────────────── */}
          <Section
            title="Broadcast announcement"
            description={`Sent by email and in-app notification to all ${registrations.length} registered builder${registrations.length === 1 ? "" : "s"}.`}
          >
            <form onSubmit={handleSendBroadcast} className="space-y-4 rounded-lg border border-line bg-raised p-4 md:p-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="md:col-span-2">
                  <FieldLabel htmlFor="broadcast-title">Title</FieldLabel>
                  <Input
                    id="broadcast-title"
                    type="text"
                    required
                    placeholder="e.g. Checkpoint 1 submissions are open"
                    value={broadcastTitle}
                    onChange={(e) => setBroadcastTitle(e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="broadcast-stage" hint="optional">
                    Linked stage
                  </FieldLabel>
                  <Select id="broadcast-stage" value={broadcastStageId} onChange={(e) => setBroadcastStageId(e.target.value)}>
                    <option value="">No stage linked</option>
                    {stages.map((stg) => (
                      <option key={stg.id} value={stg.id}>
                        {stg.title} ({stg.stage_type})
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <FieldLabel htmlFor="broadcast-message">Message</FieldLabel>
                <Textarea
                  id="broadcast-message"
                  rows={4}
                  required
                  placeholder="Write the announcement. Every registered participant gets an email and an in-app notification."
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  className="resize-none"
                />
              </div>

              <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-[12.5px] text-ink-3">
                  Recipients: <span className="font-mono text-ink tabular">{registrations.length}</span> registered participant
                  {registrations.length === 1 ? "" : "s"}
                </span>
                <Button
                  type="submit"
                  variant="inverse"
                  icon={<Megaphone />}
                  loading={broadcastLoading}
                  disabled={registrations.length === 0}
                  className="self-start sm:self-auto"
                >
                  {broadcastLoading ? "Sending…" : "Send announcement"}
                </Button>
              </div>
            </form>

            <div className="mt-6">
              <h3 className="mb-2.5 flex items-baseline gap-2 text-[13px] font-semibold text-ink">
                History
                <span className="font-mono text-[11.5px] font-normal text-ink-4 tabular">{announcements.length}</span>
              </h3>
              {announcements.length === 0 ? (
                <p className="text-[13px] text-ink-3">No announcements sent yet.</p>
              ) : (
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {announcements.map((ann) => (
                    <li key={ann.id} className="px-4 py-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Tape tone="ok">Sent</Tape>
                        <h4 className="min-w-0 break-words text-[14px] font-semibold text-ink">{ann.title}</h4>
                        {ann.hackathon_stages?.title && <Tape>{ann.hackathon_stages.title}</Tape>}
                      </div>
                      <p className="mt-1.5 whitespace-pre-line break-words text-[13.5px] leading-relaxed text-ink-2">{ann.message}</p>
                      <p className="mt-1.5 font-mono text-[12px] text-ink-3 tabular">
                        {ann.sent_at ? new Date(ann.sent_at).toLocaleString("en-US", dateOpts) : "Pending…"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Section>

          {/* ── Schedule & stages ──────────────────────────────── */}
          <Section
            title="Schedule & stages"
            count={stages.length}
            description="Ceremonies, checkpoints, submission deadlines and judging."
            action={
              <Button size="sm" variant="secondary" icon={<Plus />} onClick={openAddStageModal}>
                Add stage
              </Button>
            }
          >
            {stages.length === 0 ? (
              <EmptyState
                title="No stages on the schedule yet"
                body="Stages show up as a timeline on the public hackathon page."
                action={
                  <Button size="sm" variant="secondary" onClick={openAddStageModal}>
                    Create first stage
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line bg-raised">
                {stages.map((stg, idx) => (
                  <li key={stg.id} className="flex flex-col gap-3 px-3 py-3.5 sm:flex-row sm:items-start sm:justify-between md:px-4">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <div className="flex shrink-0 flex-col items-center">
                        <IconButton label="Move up" size="sm" disabled={idx === 0} onClick={() => handleMoveStage(stg, "up")} className="disabled:opacity-30">
                          <ChevronUp />
                        </IconButton>
                        <span className="font-mono text-[11px] text-ink-3 tabular">{idx + 1}</span>
                        <IconButton
                          label="Move down"
                          size="sm"
                          disabled={idx === stages.length - 1}
                          onClick={() => handleMoveStage(stg, "down")}
                          className="disabled:opacity-30"
                        >
                          <ChevronDown />
                        </IconButton>
                      </div>
                      <div className="min-w-0 pt-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Tape tone={stageTone[stg.stage_type] || "neutral"}>{stg.stage_type}</Tape>
                          <h3 className="min-w-0 break-words text-[14px] font-semibold text-ink">{stg.title}</h3>
                        </div>
                        {stg.description && <p className="mt-1 break-words text-[13px] leading-relaxed text-ink-2">{stg.description}</p>}
                        <p className="mt-1 font-mono text-[12px] text-ink-3 tabular">
                          {new Date(stg.start_time).toLocaleString("en-US", dateOpts)}
                          {stg.end_time && (
                            <>
                              <span className="mx-1.5 text-ink-4">→</span>
                              {new Date(stg.end_time).toLocaleString("en-US", dateOpts)}
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 pl-10 sm:pl-0">
                      <Button size="sm" variant="secondary" icon={<PenLine />} onClick={() => openEditStageModal(stg)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="danger" icon={<Trash2 />} onClick={() => handleDeleteStage(stg.id)}>
                        Delete
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* ── Resource links ─────────────────────────────────── */}
          <Section
            title="Resource links"
            count={resources.length}
            description="Challenge docs, API references or slides for participants."
            action={
              <Button size="sm" variant="secondary" icon={<Plus />} onClick={() => setShowAddResourceModal(true)}>
                Add link
              </Button>
            }
          >
            {resources.length === 0 ? (
              <p className="text-[13px] text-ink-3">No resource links posted yet.</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line bg-raised">
                {resources.map((res) => (
                  <li key={res.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <a
                        href={res.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex max-w-full items-start gap-1 text-[13.5px] font-medium text-ink hover:underline decoration-line-strong underline-offset-4"
                      >
                        <span className="min-w-0 break-words">{res.title}</span>
                        <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-ink-4" aria-hidden />
                      </a>
                      <span className="mt-0.5 block caps-label text-ink-3">{res.category}</span>
                    </div>
                    <button type="button" onClick={() => handleDeleteResource(res.id)} className="shrink-0 text-[12.5px] text-ink-3 hover:text-bad">
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        {/* ── Add resource ─────────────────────────────────────── */}
        <Dialog
          open={showAddResourceModal}
          onClose={() => setShowAddResourceModal(false)}
          title="Add resource link"
          description="Link developer docs, slides or guidelines."
          footer={
            <>
              <Button variant="ghost" onClick={() => setShowAddResourceModal(false)}>
                Cancel
              </Button>
              <Button type="submit" form="organizer-resource-form" variant="primary" loading={resourceLoading}>
                Add link
              </Button>
            </>
          }
        >
          <form id="organizer-resource-form" onSubmit={handleAddResource} className="space-y-4">
            <div>
              <FieldLabel htmlFor="org-resource-title">Title</FieldLabel>
              <Input
                id="org-resource-title"
                data-autofocus
                type="text"
                required
                placeholder="e.g. Official challenge guidelines"
                value={resourceTitle}
                onChange={(e) => setResourceTitle(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="org-resource-url">URL</FieldLabel>
              <Input id="org-resource-url" type="url" required placeholder="https://..." value={resourceUrl} onChange={(e) => setResourceUrl(e.target.value)} />
            </div>
            <div>
              <FieldLabel htmlFor="org-resource-category">Category</FieldLabel>
              <Select id="org-resource-category" value={resourceCategory} onChange={(e) => setResourceCategory(e.target.value)}>
                <option value="docs">Documentation & Guidelines</option>
                <option value="apis">APIs & SDKs</option>
                <option value="starter">Starter Templates</option>
                <option value="rules">Rules & Judging</option>
              </Select>
            </div>
          </form>
        </Dialog>

        {/* ── Add / edit stage ─────────────────────────────────── */}
        <Dialog
          open={showAddStageModal}
          onClose={() => setShowAddStageModal(false)}
          size="lg"
          title={editingStage ? "Edit stage" : "Add stage"}
          description="Ceremonies, checkpoints, deadlines or judging rounds."
          footer={
            <>
              <Button variant="ghost" onClick={() => setShowAddStageModal(false)}>
                Cancel
              </Button>
              <Button type="submit" form="organizer-stage-form" variant="primary" loading={stageLoading}>
                {editingStage ? "Save changes" : "Add stage"}
              </Button>
            </>
          }
        >
          <form id="organizer-stage-form" onSubmit={handleSaveStage} className="space-y-4">
            <div>
              <FieldLabel htmlFor="stage-title">Title</FieldLabel>
              <Input
                id="stage-title"
                data-autofocus
                type="text"
                required
                placeholder="e.g. Opening ceremony & keynote"
                value={stageTitle}
                onChange={(e) => setStageTitle(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="stage-type">Type</FieldLabel>
              <Select id="stage-type" value={stageType} onChange={(e) => setStageType(e.target.value)}>
                <option value="ceremony">Ceremony / Keynote</option>
                <option value="checkpoint">Checkpoint / Mentorship</option>
                <option value="deadline">Submission Deadline</option>
                <option value="judging">Judging & Evaluation</option>
                <option value="other">Other Event Milestone</option>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="stage-start">Starts</FieldLabel>
                <Input id="stage-start" type="datetime-local" required value={stageStartTime} onChange={(e) => setStageStartTime(e.target.value)} />
              </div>
              <div>
                <FieldLabel htmlFor="stage-end" hint="optional">
                  Ends
                </FieldLabel>
                <Input id="stage-end" type="datetime-local" value={stageEndTime} onChange={(e) => setStageEndTime(e.target.value)} />
              </div>
            </div>
            <div>
              <FieldLabel htmlFor="stage-desc" hint="optional">
                Description
              </FieldLabel>
              <Textarea
                id="stage-desc"
                rows={3}
                placeholder="What happens during this stage"
                value={stageDesc}
                onChange={(e) => setStageDesc(e.target.value)}
                className="resize-none"
              />
            </div>
          </form>
        </Dialog>
      </Page>
    </AuthGuard>
  );
}
