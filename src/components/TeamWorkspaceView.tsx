"use client";

import { useEffect, useState, useRef } from "react";
import { supabase, subscribeWithRetry } from "@/lib/supabase";
import ChatThread from "@/components/chatThread";
import ShareModal from "@/components/ShareModal";
import { useNotification } from "@/context/NotificationContext";
import PPTEvaluatorTab from "@/components/PPTEvaluatorTab";
import SmartGapFiller from "@/components/SmartGapFiller";
import { KanbanTasksSkeleton, CommitsTimelineSkeleton, IdeationBoardSkeleton } from "@/components/workspace/WorkspaceSkeletons";
import { WorkspaceFrame } from "@/components/workspace/WorkspaceFrame";
import { CATEGORY_TONE, getTeamCategoryInfo } from "@/lib/teamCategory";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  Avatar,
  Button,
  Chip,
  Dialog,
  EmptyState,
  ErrorNotice,
  FieldLabel,
  IconButton,
  Input,
  Panel,
  Progress,
  SearchField,
  Segmented,
  Select,
  Spinner,
  StatusDot,
  Tape,
  Textarea,
} from "@/components/system";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronUp,
  Clock,
  Code,
  Copy,
  ExternalLink,
  FileText,
  GitBranch,
  GitCommit,
  Globe,
  Lightbulb,
  Link2,
  MessageSquare,
  PenTool,
  Plus,
  RefreshCw,
  Save,
  SquareKanban,
  Trash2,
  Unlink,
  UserPlus,
} from "lucide-react";

type Team = {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  max_members: number;
  college: string | null;
  hackathon_name: string | null;
  skills: string[] | null;
  roles_needed: string[] | null;
  is_recruiting?: boolean;
  github_repo_url?: string | null;
  hackathon_id?: string | null;
};


type Member = {
  id: string;
  role: string;
  project_role?: string;
  profiles: {
    id: string;
    full_name: string;
    email: string;
    avatar_url?: string | null;
    skills?: string[] | null;
  };
};

type InviteProfile = {
  id: string;
  full_name: string | null;
  college: string | null;
  avatar_url?: string | null;
  skills: string[] | null;
};

type WorkspaceTab = "chat" | "tasks" | "brainstorm" | "resources" | "github" | "activity" | "deployments" | "ppt" | "gap_filler";

type Props = {
  team: Team;
  members: Member[];
  isOwner: boolean;
  initialTab?: WorkspaceTab;
  listedHackathons?: { id: string; name: string; description?: string | null; start_date?: string; end_date?: string }[];
  refreshTeam?: () => void;
};

export default function TeamWorkspaceView({
  team,
  members,
  isOwner,
  initialTab = "chat",
  listedHackathons = [],
  refreshTeam,
}: Props) {
  const { showToast, confirm } = useNotification();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(true);
  const [showShareModal, setShowShareModal] = useState(false);

  // Workspace tab states
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>(initialTab);
  const [draggedOverColumn, setDraggedOverColumn] = useState<"todo" | "in_progress" | "completed" | null>(null);

  useEffect(() => {
    if (initialTab) {
      setWorkspaceTab(initialTab);
    }
  }, [initialTab]);

  const handleTabChange = (tab: WorkspaceTab) => {
    setWorkspaceTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.replaceState(null, "", url.toString());
    }
  };

  // GitHub Sync Tab States
  const [activeGithubRepoUrl, setActiveGithubRepoUrl] = useState<string | null>(team.github_repo_url || null);
  const [githubRepoUrlInput, setGithubRepoUrlInput] = useState(team.github_repo_url || "");
  const [commits, setCommits] = useState<any[]>([]);
  const [loadingCommits, setLoadingCommits] = useState(false);
  const [errorCommits, setErrorCommits] = useState<string | null>(null);

  // Load Hackathon-Scoped GitHub Repo
  useEffect(() => {
    const loadGithubRepo = async () => {
      if (!team.id) return;
      const primaryHackathon = listedHackathons && listedHackathons[0];
      const currentHackathonId = primaryHackathon?.id || team.hackathon_id;

      if (currentHackathonId) {
        const { data } = await supabase
          .from("team_github_repos")
          .select("github_repo_url")
          .eq("team_id", team.id)
          .eq("hackathon_id", currentHackathonId)
          .maybeSingle();

        if (data) {
          setActiveGithubRepoUrl(data.github_repo_url || null);
          setGithubRepoUrlInput(data.github_repo_url || "");
          return;
        }

        // If no row exists for this hackathon track yet, GitHub repo is not linked for this event
        setActiveGithubRepoUrl(null);
        setGithubRepoUrlInput("");
        return;
      }

      setActiveGithubRepoUrl(team.github_repo_url || null);
      setGithubRepoUrlInput(team.github_repo_url || "");
    };

    loadGithubRepo();
  }, [team.id, team.hackathon_id, listedHackathons, team.github_repo_url]);

  const handleLinkGithubRepo = async (url: string) => {
    if (!url.trim()) return;
    const primaryHackathon = listedHackathons && listedHackathons[0];
    const currentHackathonId = primaryHackathon?.id || team.hackathon_id;

    try {
      if (currentHackathonId) {
        const { error } = await supabase
          .from("team_github_repos")
          .upsert(
            {
              team_id: team.id,
              hackathon_id: currentHackathonId,
              github_repo_url: url.trim(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "team_id,hackathon_id" }
          );

        if (error) {
          console.error("Error upserting team github repo:", error);
          showToast(error.message, "error");
        } else {
          setActiveGithubRepoUrl(url.trim());
          showToast("GitHub repository linked for this track!", "success");
        }
        return;
      }

      const { error } = await supabase
        .from("teams")
        .update({ github_repo_url: url.trim() })
        .eq("id", team.id);

      if (error) {
        console.error("Error updating team github repo:", error);
        showToast(error.message, "error");
      } else {
        setActiveGithubRepoUrl(url.trim());
        showToast("GitHub repository linked successfully!", "success");
        if (refreshTeam) refreshTeam();
      }
    } catch (err) {
      console.error("Unexpected error linking repository:", err);
      showToast("Failed to link repository.", "error");
    }
  };

  const handleUnlinkGithubRepo = async () => {
    confirm({
      title: "Disconnect GitHub Repository",
      message: "Are you sure you want to disconnect this repository? Team members will no longer see commit history.",
      confirmText: "Disconnect",
      cancelText: "Cancel",
      onConfirm: async () => {
        try {
          const primaryHackathon = listedHackathons && listedHackathons[0];
          const currentHackathonId = primaryHackathon?.id || team.hackathon_id;

          if (currentHackathonId) {
            const { error } = await supabase
              .from("team_github_repos")
              .delete()
              .eq("team_id", team.id)
              .eq("hackathon_id", currentHackathonId);
            if (error) {
              console.error("Error unlinking team github repo:", error);
              showToast("Failed to disconnect repository.", "error");
              return;
            }
          } else {
            const { error } = await supabase
              .from("teams")
              .update({ github_repo_url: null })
              .eq("id", team.id);
            if (error) {
              console.error("Error unlinking team github repo from teams table:", error);
              showToast("Failed to disconnect repository.", "error");
              return;
            }
          }

          setActiveGithubRepoUrl(null);
          setGithubRepoUrlInput("");
          showToast("GitHub repository disconnected.", "info");
          if (refreshTeam) refreshTeam();
        } catch (err) {
          console.error("Unexpected error disconnecting repository:", err);
          showToast("Failed to disconnect repository.", "error");
        }
      }
    });
  };


  const fetchCommits = async () => {
    if (!activeGithubRepoUrl) {
      setCommits([]);
      return;
    }

    setLoadingCommits(true);
    setErrorCommits(null);

    try {
      const cleanUrl = activeGithubRepoUrl.endsWith("/")
        ? activeGithubRepoUrl.slice(0, -1)
        : activeGithubRepoUrl;
      const match = cleanUrl.match(new RegExp("github\\.com/([^/]+)/([^/]+)"));
      if (!match) {
        setErrorCommits("Invalid GitHub URL format. Use https://github.com/owner/repo");
        setLoadingCommits(false);
        return;
      }

      const owner = match[1];
      const repo = match[2].endsWith(".git")
        ? match[2].slice(0, -4)
        : match[2];

      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=15`);
      if (!res.ok) {
        if (res.status === 404) {
          setErrorCommits("Repository not found. Make sure it is a public repository and has at least one commit.");
        } else if (res.status === 403) {
          setErrorCommits("GitHub API rate limit exceeded. Please try again later.");
        } else {
          setErrorCommits("Failed to fetch commits from GitHub.");
        }
        setLoadingCommits(false);
        return;
      }

      const data = await res.json();
      setCommits(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setErrorCommits("Network error occurred while fetching commits.");
    } finally {
      setLoadingCommits(false);
    }
  };

  useEffect(() => {
    if (workspaceTab === "github") {
      fetchCommits();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceTab, activeGithubRepoUrl]);


  // Tasks Tab State
  type Task = {
    id: string;
    team_id: string;
    title: string;
    description: string | null;
    status: "todo" | "in_progress" | "completed";
    priority: "low" | "medium" | "high";
    assignee_id: string | null;
    due_date: string | null;
    created_at: string;
  };
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskPriority, setTaskPriority] = useState<"low" | "medium" | "high">("medium");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [savingTask, setSavingTask] = useState(false);
  const [onlineTeammates, setOnlineTeammates] = useState<{ id: string; name: string; avatarUrl: string | null }[]>([]);

  // Brainstorm Tab State
  const [documentContent, setDocumentContent] = useState("");
  const [loadingDocument, setLoadingDocument] = useState(false);
  const [savingDocument, setSavingDocument] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [documentUpdatedAt, setDocumentUpdatedAt] = useState<string | null>(null);
  const [documentUpdatedBy, setDocumentUpdatedBy] = useState<string | null>(null);
  const [documentConflict, setDocumentConflict] = useState<{
    incomingContent: string;
    incomingUpdatedAt: string | null;
    incomingUpdatedBy: string | null;
  } | null>(null);
  const documentContentRef = useRef<string>("");
  const lastSavedContentRef = useRef<string>("");

  // Workspace V2 States
  const [timeLeft, setTimeLeft] = useState("");
  const [countdownParts, setCountdownParts] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0, ended: false });
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskComments, setTaskComments] = useState<any[]>([]);
  const [newTaskComment, setNewTaskComment] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  // Deployments
  type Deployment = {
    id: string;
    team_id: string;
    name: string;
    url: string;
    created_at: string;
  };
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [newDepName, setNewDepName] = useState("");
  const [newDepUrl, setNewDepUrl] = useState("");
  const [pingStatus, setPingStatus] = useState<Record<string, { status: "checking" | "online" | "offline"; latency?: number }>>({});
  const [loadingDeployments, setLoadingDeployments] = useState(false);
  const [submittingDeployment, setSubmittingDeployment] = useState(false);

  // Brainstorm Board Ideas
  type BrainstormIdea = {
    id: string;
    team_id: string;
    user_id: string;
    title: string;
    content: string | null;
    category: "core" | "nice-to-have" | "tech-stack" | "marketing";
    upvotes: string[];
    created_at: string;
  };
  const [brainstormIdeas, setBrainstormIdeas] = useState<BrainstormIdea[]>([]);
  const [isBrainstormListView, setIsBrainstormListView] = useState(false);
  const [newIdeaTitle, setNewIdeaTitle] = useState("");
  const [newIdeaContent, setNewIdeaContent] = useState("");
  const [newIdeaCategory, setNewIdeaCategory] = useState<"core" | "nice-to-have" | "tech-stack" | "marketing">("core");
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [submittingIdea, setSubmittingIdea] = useState(false);

  // Resources Tab State
  type LinkType = {
    id: string;
    team_id: string;
    hackathon_id?: string | null;
    title: string;
    url: string;
    category: "design" | "repo" | "document" | "other";
    created_by: string | null;
    created_at: string;
  };

  const [links, setLinks] = useState<LinkType[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [showAddLinkModal, setShowAddLinkModal] = useState(false);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkCategory, setLinkCategory] = useState<"design" | "repo" | "document" | "other">("other");
  const [savingLink, setSavingLink] = useState(false);

  // Invite Builders Modal states
  const [showInviteBuilderModal, setShowInviteBuilderModal] = useState(false);
  const [inviteProfiles, setInviteProfiles] = useState<InviteProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [sessionInvitedIds, setSessionInvitedIds] = useState<Set<string>>(new Set());
  const [existingPendingInvites, setExistingPendingInvites] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!showInviteBuilderModal) return;

    async function loadInviteData() {
      setLoadingProfiles(true);
      try {
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name, college, avatar_url, skills");
        if (profilesError) {
          console.error("Error fetching profiles for invite modal:", profilesError);
        }
        setInviteProfiles(profilesData || []);

        const { data: pendingData, error: pendingError } = await supabase
          .from("team_invites")
          .select("invited_user_id")
          .eq("team_id", team.id)
          .eq("status", "pending");
        if (pendingError) {
          console.error("Error fetching pending team invites:", pendingError);
        }

        const inviteIds = new Set((pendingData || []).map((i) => i.invited_user_id));
        setExistingPendingInvites(inviteIds);
      } catch (err) {
        console.error("Unexpected error in loadInviteData:", err);
      }
      setLoadingProfiles(false);
    }

    loadInviteData();
  }, [showInviteBuilderModal, team.id]);

  // Fetch Tasks
  const fetchTasks = async () => {
    setLoadingTasks(true);
    const { data, error } = await supabase
      .from("team_tasks")
      .select("*")
      .eq("team_id", team.id)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("Error fetching team tasks:", error);
    } else {
      setTasks(data || []);
    }
    setLoadingTasks(false);
  };

  // Fetch Brainstorm Document
  const fetchDocument = async () => {
    setLoadingDocument(true);
    const { data, error } = await supabase
      .from("team_documents")
      .select("*")
      .eq("team_id", team.id)
      .maybeSingle();
    if (error) {
      console.error("Error fetching team brainstorm document:", error);
    } else if (data) {
      setDocumentId(data.id);
      setDocumentContent(data.content || "");
      documentContentRef.current = data.content || "";
      lastSavedContentRef.current = data.content || "";
      setDocumentUpdatedAt(data.updated_at || null);
      setDocumentUpdatedBy(data.updated_by || null);
    } else {
      const { data: newDoc, error: insertError } = await supabase
        .from("team_documents")
        .insert({ team_id: team.id, content: "# Brainstorm\nStart sharing ideas here..." })
        .select()
        .maybeSingle();
      if (insertError) {
        if (insertError.code === "23505") {
          const { data: retryDoc, error: retryError } = await supabase
            .from("team_documents")
            .select("*")
            .eq("team_id", team.id)
            .maybeSingle();
          if (retryError) {
            console.error("Error retrying team brainstorm document fetch:", retryError);
          } else if (retryDoc) {
            setDocumentId(retryDoc.id);
            setDocumentContent(retryDoc.content || "");
            documentContentRef.current = retryDoc.content || "";
            lastSavedContentRef.current = retryDoc.content || "";
            setDocumentUpdatedAt(retryDoc.updated_at || null);
            setDocumentUpdatedBy(retryDoc.updated_by || null);
          }
        } else {
          console.error("Error creating default brainstorm document:", insertError);
        }
      } else if (newDoc) {
        setDocumentId(newDoc.id);
        setDocumentContent(newDoc.content || "");
        documentContentRef.current = newDoc.content || "";
        lastSavedContentRef.current = newDoc.content || "";
        setDocumentUpdatedAt(newDoc.updated_at || null);
        setDocumentUpdatedBy(newDoc.updated_by || null);
      }
    }
    setLoadingDocument(false);
  };

  // Fetch Resources (Links)
  const fetchLinks = async () => {
    setLoadingLinks(true);
    const primaryHackathon = listedHackathons && listedHackathons[0];
    const currentHackathonId = primaryHackathon?.id || team.hackathon_id;

    const { data, error } = await supabase
      .from("team_links")
      .select("*")
      .eq("team_id", team.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
    } else {
      const filtered = (data || []).filter(
        (l: any) => !l.hackathon_id || (currentHackathonId && l.hackathon_id === currentHackathonId)
      );
      setLinks(filtered);
    }
    setLoadingLinks(false);
  };


  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskComment.trim() || !selectedTask || !currentUserId) return;

    setSubmittingComment(true);
    const { error } = await supabase
      .from("team_task_comments")
      .insert({
        task_id: selectedTask.id,
        user_id: currentUserId,
        content: newTaskComment.trim(),
      });

    if (error) {
      console.error(error);
      showToast(error.message, "error");
    } else {
      setNewTaskComment("");

      // Send deep-linked notification if task has an assignee
      if (selectedTask.assignee_id && selectedTask.assignee_id !== currentUserId) {
        const currentUserMember = members.find((m) => m.profiles.id === currentUserId);
        const currentUserName = currentUserMember?.profiles?.full_name || "A teammate";
        await supabase
          .from("notifications")
          .insert({
            user_id: selectedTask.assignee_id,
            message: `${currentUserName} commented on task "${selectedTask.title}" in team "${team.name}"`,
            link: `/teams/${team.id}/workspace?tab=tasks`,
          });
      }
    }
    setSubmittingComment(false);
  };

  // Fetch Deployments
  const fetchDeployments = async () => {
    if (!team.id) return;
    setLoadingDeployments(true);
    const { data, error } = await supabase
      .from("team_deployments")
      .select("*")
      .eq("team_id", team.id)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Error fetching team deployments:", error);
    } else if (data) {
      setDeployments(data);
      data.forEach((dep) => {
        pingUrl(dep.id, dep.url);
      });
    }
    setLoadingDeployments(false);
  };

  // Client-side HTTP pinger helper
  const pingUrl = async (depId: string, url: string) => {
    setPingStatus((prev) => ({ ...prev, [depId]: { status: "checking" } }));
    const startTime = Date.now();
    try {
      let fetchUrl = url;
      if (!/^https?:\/\//i.test(url)) {
        fetchUrl = "https://" + url;
      }
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      
      await fetch(fetchUrl, {
        method: "HEAD",
        mode: "no-cors",
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const latency = Date.now() - startTime;
      setPingStatus((prev) => ({
        ...prev,
        [depId]: { status: "online", latency }
      }));
    } catch {
      setPingStatus((prev) => ({
        ...prev,
        [depId]: { status: "offline" }
      }));
    }
  };

  // Add Deployment
  const handleAddDeployment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDepName.trim() || !newDepUrl.trim() || !team.id) return;

    setSubmittingDeployment(true);
    const { error } = await supabase
      .from("team_deployments")
      .insert({
        team_id: team.id,
        name: newDepName.trim(),
        url: newDepUrl.trim()
      });
    if (error) {
      console.error(error);
      showToast(error.message, "error");
    } else {
      showToast("Deployment added successfully", "success");
      setNewDepName("");
      setNewDepUrl("");
      fetchDeployments();
    }
    setSubmittingDeployment(false);
  };

  // Delete Deployment
  const handleDeleteDeployment = async (depId: string) => {
    const { error } = await supabase
      .from("team_deployments")
      .delete()
      .eq("id", depId);
    if (error) {
      console.error(error);
      showToast(error.message, "error");
    } else {
      showToast("Deployment removed", "success");
      setDeployments((prev) => prev.filter((d) => d.id !== depId));
    }
  };

  // Fetch Brainstorm Ideas
  const fetchBrainstormIdeas = async () => {
    if (!team.id) return;
    setLoadingIdeas(true);
    const { data, error } = await supabase
      .from("team_brainstorm_ideas")
      .select("*")
      .eq("team_id", team.id)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Error fetching brainstorm ideas:", error);
    } else if (data) {
      setBrainstormIdeas(data);
    }
    setLoadingIdeas(false);
  };

  // Add Brainstorm Idea
  const handleAddBrainstormIdea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIdeaTitle.trim() || !team.id || !currentUserId) return;

    setSubmittingIdea(true);
    const { error } = await supabase
      .from("team_brainstorm_ideas")
      .insert({
        team_id: team.id,
        user_id: currentUserId,
        title: newIdeaTitle.trim(),
        content: newIdeaContent.trim() || null,
        category: newIdeaCategory
      });
    if (error) {
      console.error(error);
      showToast(error.message, "error");
    } else {
      showToast("Idea posted to brainstorm board", "success");
      setNewIdeaTitle("");
      setNewIdeaContent("");
      fetchBrainstormIdeas();
    }
    setSubmittingIdea(false);
  };

  // Toggle Idea Upvote
  const handleToggleIdeaUpvote = async (ideaId: string) => {
    if (!currentUserId) return;
    const idea = brainstormIdeas.find((i) => i.id === ideaId);
    if (!idea) return;

    const currentUpvotes = idea.upvotes || [];
    let nextUpvotes: string[];
    if (currentUpvotes.includes(currentUserId)) {
      nextUpvotes = currentUpvotes.filter((uid) => uid !== currentUserId);
    } else {
      nextUpvotes = [...currentUpvotes, currentUserId];
    }

    const { error } = await supabase
      .from("team_brainstorm_ideas")
      .update({ upvotes: nextUpvotes })
      .eq("id", ideaId);

    if (error) {
      console.error(error);
      showToast(error.message, "error");
    } else {
      setBrainstormIdeas((prev) =>
        prev.map((i) => (i.id === ideaId ? { ...i, upvotes: nextUpvotes } : i))
      );
    }
  };

  // Delete Brainstorm Idea
  const handleDeleteBrainstormIdea = async (ideaId: string) => {
    const { error } = await supabase
      .from("team_brainstorm_ideas")
      .delete()
      .eq("id", ideaId);
    if (error) {
      console.error(error);
      showToast(error.message, "error");
    } else {
      showToast("Idea removed", "success");
      setBrainstormIdeas((prev) => prev.filter((i) => i.id !== ideaId));
    }
  };

  // Add Task
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    setSavingTask(true);
    const { error } = await supabase
      .from("team_tasks")
      .insert({
        team_id: team.id,
        title: taskTitle.trim(),
        description: taskDesc.trim() || null,
        priority: taskPriority,
        assignee_id: taskAssignee || null,
        due_date: taskDueDate || null,
      });
    if (error) {
      console.error(error);
      showToast(error.message, "error");
    } else {
      showToast("Task created!", "success");

      // Send deep-linked notification if assigned to someone else
      if (taskAssignee && taskAssignee !== currentUserId) {
        const currentUserMember = members.find((m) => m.profiles.id === currentUserId);
        const currentUserName = currentUserMember?.profiles?.full_name || "A teammate";
        await supabase
          .from("notifications")
          .insert({
            user_id: taskAssignee,
            message: `${currentUserName} assigned you to task "${taskTitle.trim()}" in team "${team.name}"`,
            link: `/teams/${team.id}/workspace?tab=tasks`,
          });
      }

      setShowAddTaskModal(false);
      setTaskTitle("");
      setTaskDesc("");
      setTaskPriority("medium");
      setTaskAssignee("");
      setTaskDueDate("");
      fetchTasks();
    }
    setSavingTask(false);
  };

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData("text/plain", taskId);
  };

  const handleDrop = async (e: React.DragEvent, status: "todo" | "in_progress" | "completed") => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain");
    if (!taskId) return;

    const currentTask = tasks.find((t) => t.id === taskId);
    if (currentTask && currentTask.status === status) return;

    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));

    const { error } = await supabase
      .from("team_tasks")
      .update({ status })
      .eq("id", taskId);

    if (error) {
      console.error(error);
      showToast(error.message, "error");
      fetchTasks();
    } else {
      if (currentTask && currentTask.assignee_id && currentTask.assignee_id !== currentUserId) {
        const currentUserMember = members.find((m) => m.profiles.id === currentUserId);
        const currentUserName = currentUserMember?.profiles?.full_name || "A teammate";
        const statusLabels: Record<string, string> = {
          todo: "To Do",
          in_progress: "In Progress",
          completed: "Completed",
        };
        await supabase
          .from("notifications")
          .insert({
            user_id: currentTask.assignee_id,
            message: `${currentUserName} moved your task "${currentTask.title}" to "${statusLabels[status] || status}" in team "${team.name}"`,
            link: `/teams/${team.id}/workspace?tab=tasks`,
          });
      }
    }
  };

  // Update Task Status
  const handleUpdateTaskStatus = async (taskId: string, status: "todo" | "in_progress" | "completed") => {
    const currentTask = tasks.find((t) => t.id === taskId);
    if (currentTask && currentTask.status === status) return;

    const { error } = await supabase
      .from("team_tasks")
      .update({ status })
      .eq("id", taskId);
    if (error) {
      console.error(error);
      showToast(error.message, "error");
    } else {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));

      if (currentTask && currentTask.assignee_id && currentTask.assignee_id !== currentUserId) {
        const currentUserMember = members.find((m) => m.profiles.id === currentUserId);
        const currentUserName = currentUserMember?.profiles?.full_name || "A teammate";
        const statusLabels: Record<string, string> = {
          todo: "To Do",
          in_progress: "In Progress",
          completed: "Completed",
        };
        await supabase
          .from("notifications")
          .insert({
            user_id: currentTask.assignee_id,
            message: `${currentUserName} updated your task "${currentTask.title}" status to "${statusLabels[status] || status}" in team "${team.name}"`,
            link: `/teams/${team.id}/workspace?tab=tasks`,
          });
      }
    }
  };

  // Update Task Assignee
  const handleUpdateTaskAssignee = async (taskId: string, assigneeId: string | null) => {
    const currentTask = tasks.find((t) => t.id === taskId);
    if (currentTask && currentTask.assignee_id === assigneeId) return;

    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, assignee_id: assigneeId } : t)));

    const { error } = await supabase
      .from("team_tasks")
      .update({ assignee_id: assigneeId })
      .eq("id", taskId);

    if (error) {
      console.error(error);
      showToast(error.message, "error");
      fetchTasks();
    } else {
      if (assigneeId && assigneeId !== currentUserId) {
        const currentUserMember = members.find((m) => m.profiles.id === currentUserId);
        const currentUserName = currentUserMember?.profiles?.full_name || "A teammate";
        await supabase
          .from("notifications")
          .insert({
            user_id: assigneeId,
            message: `${currentUserName} assigned you to task "${currentTask?.title || "Task"}" in team "${team.name}"`,
            link: `/teams/${team.id}/workspace?tab=tasks`,
          });
      }
    }
  };

  // Update Task Due Date
  const handleUpdateTaskDueDate = async (taskId: string, dueDate: string | null) => {
    const currentTask = tasks.find((t) => t.id === taskId);
    if (currentTask && currentTask.due_date === dueDate) return;

    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, due_date: dueDate } : t)));

    const { error } = await supabase
      .from("team_tasks")
      .update({ due_date: dueDate || null })
      .eq("id", taskId);

    if (error) {
      console.error(error);
      showToast(error.message, "error");
      fetchTasks();
    } else {
      showToast("Due date updated!", "success");
    }
  };

  // Delete Task
  const handleDeleteTask = async (taskId: string) => {
    confirm({
      title: "Delete Task",
      message: "Are you sure you want to delete this task?",
      confirmText: "Delete",
      cancelText: "Cancel",
      onConfirm: async () => {
        const { error } = await supabase
          .from("team_tasks")
          .delete()
          .eq("id", taskId);
        if (error) {
          console.error(error);
          showToast(error.message, "error");
        } else {
          showToast("Task deleted", "success");
          setTasks((prev) => prev.filter((t) => t.id !== taskId));
        }
      }
    });
  };

  // Save Document
  const handleSaveDocument = async () => {
    if (!documentId) return;
    setSavingDocument(true);
    const contentToSave = documentContentRef.current;
    const { data, error } = await supabase
      .from("team_documents")
      .update({ content: contentToSave, updated_by: currentUserId, updated_at: new Date().toISOString() })
      .eq("id", documentId)
      .select()
      .maybeSingle();
    if (error) {
      console.error("Error saving team document:", error);
      showToast(error.message, "error");
    } else {
      if (data) {
        setDocumentUpdatedAt(data.updated_at || null);
        setDocumentUpdatedBy(data.updated_by || null);
      }
      lastSavedContentRef.current = contentToSave;
      setDocumentConflict(null);
      showToast("Document saved!", "success");
    }
    setSavingDocument(false);
  };

  // Add Link
  const [linkScope, setLinkScope] = useState<"event" | "global">("event");

  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkTitle.trim() || !linkUrl.trim()) return;

    let formattedUrl = linkUrl.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = `https://${formattedUrl}`;
    }

    const primaryHackathon = listedHackathons && listedHackathons[0];
    const currentHackathonId = primaryHackathon?.id || team.hackathon_id;

    setSavingLink(true);
    const { error } = await supabase
      .from("team_links")
      .insert({
        team_id: team.id,
        hackathon_id: linkScope === "event" ? currentHackathonId : null,
        title: linkTitle.trim(),
        url: formattedUrl,
        category: linkCategory,
        created_by: currentUserId,
      });
    if (error) {
      console.error(error);
      showToast(error.message, "error");
    } else {
      showToast("Link added!", "success");
      setShowAddLinkModal(false);
      setLinkTitle("");
      setLinkUrl("");
      setLinkCategory("other");
      fetchLinks();
    }
    setSavingLink(false);
  };


  // Delete Link
  const handleDeleteLink = async (linkId: string) => {
    confirm({
      title: "Delete Resource Link",
      message: "Are you sure you want to delete this resource link?",
      confirmText: "Delete",
      cancelText: "Cancel",
      onConfirm: async () => {
        const { error } = await supabase
          .from("team_links")
          .delete()
          .eq("id", linkId);
        if (error) {
          console.error(error);
          showToast(error.message, "error");
        } else {
          showToast("Link deleted", "success");
          setLinks((prev) => prev.filter((l) => l.id !== linkId));
        }
      }
    });
  };

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setChatLoading(false);
        return;
      }

      setCurrentUserId(user.id);

      const { data: convId, error: convError } = await supabase
        .rpc("ensure_team_conversation", { p_team_id: team.id });

      if (convError) {
        console.error("Failed to ensure team conversation:", convError);
        setConversationId(null);
      } else {
        setConversationId(convId ?? null);
      }

      // Fetch initial workspace data
      fetchTasks();
      fetchDocument();
      fetchLinks();
      fetchDeployments();
      fetchBrainstormIdeas();

      setChatLoading(false);
    }

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team.id]);

  // Realtime subscription for workspace updates with clean unmount teardown
  useEffect(() => {
    const tasksChannel = supabase
      .channel(`team_tasks:${team.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "team_tasks",
          filter: `team_id=eq.${team.id}`,
        },
        () => {
          supabase
            .from("team_tasks")
            .select("*")
            .eq("team_id", team.id)
            .order("created_at", { ascending: true })
            .then(({ data }) => {
              if (data) setTasks(data);
            });
        }
      );

    const docChannel = supabase
      .channel(`team_documents:${team.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "team_documents",
          filter: `team_id=eq.${team.id}`,
        },
        (payload) => {
          const updatedDoc = payload.new as { content: string; updated_by: string; updated_at: string };
          supabase.auth.getUser().then(({ data: { user } }) => {
            if (user && updatedDoc.updated_by !== user.id) {
              const isDirty = documentContentRef.current !== lastSavedContentRef.current;
              const hasDifference = documentContentRef.current !== updatedDoc.content;

              if (isDirty && hasDifference) {
                setDocumentConflict({
                  incomingContent: updatedDoc.content,
                  incomingUpdatedAt: updatedDoc.updated_at || null,
                  incomingUpdatedBy: updatedDoc.updated_by || null,
                });
                showToast("A teammate saved changes to this document while you were editing.", "warning");
              } else {
                setDocumentContent(updatedDoc.content);
                documentContentRef.current = updatedDoc.content;
                lastSavedContentRef.current = updatedDoc.content;
                setDocumentUpdatedAt(updatedDoc.updated_at || null);
                setDocumentUpdatedBy(updatedDoc.updated_by || null);
                setDocumentConflict(null);
              }
            }
          });
        }
      );

    const linksChannel = supabase
      .channel(`team_links:${team.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "team_links",
          filter: `team_id=eq.${team.id}`,
        },
        () => {
          supabase
            .from("team_links")
            .select("*")
            .eq("team_id", team.id)
            .order("created_at", { ascending: false })
            .then(({ data }) => {
              if (data) setLinks(data);
            });
        }
      );

    const deploymentsChannel = supabase
      .channel(`team_deployments:${team.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "team_deployments",
          filter: `team_id=eq.${team.id}`,
        },
        () => {
          fetchDeployments();
        }
      );

    const brainstormChannel = supabase
      .channel(`team_brainstorm_ideas:${team.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "team_brainstorm_ideas",
          filter: `team_id=eq.${team.id}`,
        },
        () => {
          fetchBrainstormIdeas();
        }
      );

    const unsubTasks = subscribeWithRetry(tasksChannel);
    const unsubDoc = subscribeWithRetry(docChannel);
    const unsubLinks = subscribeWithRetry(linksChannel);
    const unsubDeployments = subscribeWithRetry(deploymentsChannel);
    const unsubBrainstorm = subscribeWithRetry(brainstormChannel);

    return () => {
      unsubTasks();
      unsubDoc();
      unsubLinks();
      unsubDeployments();
      unsubBrainstorm();
      supabase.removeChannel(tasksChannel);
      supabase.removeChannel(docChannel);
      supabase.removeChannel(linksChannel);
      supabase.removeChannel(deploymentsChannel);
      supabase.removeChannel(brainstormChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team.id]);

  // Realtime Presence Tracking
  useEffect(() => {
    if (!team.id || !currentUserId) return;

    const currentMemberObj = members.find((m) => m.profiles.id === currentUserId);
    const currentUserProfile = currentMemberObj?.profiles || {
      id: currentUserId,
      full_name: "A teammate",
      avatar_url: null,
    };

    const presenceChannel = supabase.channel(`presence:team:${team.id}`, {
      config: {
        presence: {
          key: currentUserId,
        },
      },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const onlineUsers: { id: string; name: string; avatarUrl: string | null }[] = [];
        
        Object.keys(state).forEach((key) => {
          const userPresences = state[key] as any[];
          if (userPresences && userPresences.length > 0) {
            const info = userPresences[0];
            onlineUsers.push({
              id: key,
              name: info.name || "Teammate",
              avatarUrl: info.avatarUrl || null,
            });
          }
        });
        
        setOnlineTeammates(onlineUsers);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            id: currentUserId,
            name: currentUserProfile.full_name,
            avatarUrl: currentUserProfile.avatar_url,
          });
        }
      });

    return () => {
      presenceChannel.unsubscribe();
      supabase.removeChannel(presenceChannel);
    };
  }, [team.id, currentUserId, members]);

  const activeHackathon = listedHackathons && listedHackathons.length > 0 ? listedHackathons[0] : null;

  // Countdown timer for active hackathon
  useEffect(() => {
    if (!activeHackathon || !activeHackathon.end_date) {
      setTimeLeft("");
      setCountdownParts({ days: 0, hours: 0, minutes: 0, seconds: 0, ended: true });
      return;
    }

    const calculateTime = () => {
      const difference = new Date(activeHackathon.end_date!).getTime() - new Date().getTime();
      if (difference <= 0) {
        setTimeLeft("Hackathon Ended");
        setCountdownParts({ days: 0, hours: 0, minutes: 0, seconds: 0, ended: true });
        return;
      }
      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((difference / 1000 / 60) % 60);
      const seconds = Math.floor((difference / 1000) % 60);

      const parts = [];
      if (days > 0) parts.push(`${days}d`);
      if (hours > 0 || days > 0) parts.push(`${hours}h`);
      parts.push(`${minutes}m`);
      parts.push(`${seconds}s`);

      setTimeLeft(parts.join(" "));
      setCountdownParts({ days, hours, minutes, seconds, ended: false });
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [activeHackathon]);

  // Load selected task comments and sync in real-time
  useEffect(() => {
    if (!selectedTask) {
      setTaskComments([]);
      return;
    }

    const fetchTaskComments = async () => {
      setLoadingComments(true);
      const { data, error } = await supabase
        .from("team_task_comments")
        .select("*")
        .eq("task_id", selectedTask.id)
        .order("created_at", { ascending: true });
      if (error) {
        console.error(error);
      } else {
        setTaskComments(data || []);
      }
      setLoadingComments(false);
    };

    fetchTaskComments();

    const commentChannel = supabase
      .channel(`task_comments:${selectedTask.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "team_task_comments",
          filter: `task_id=eq.${selectedTask.id}`,
        },
        () => {
          supabase
            .from("team_task_comments")
            .select("*")
            .eq("task_id", selectedTask.id)
            .order("created_at", { ascending: true })
            .then(({ data }) => {
              if (data) setTaskComments(data);
            });
        }
      )
      .subscribe();

    return () => {
      commentChannel.unsubscribe();
      supabase.removeChannel(commentChannel);
    };
  }, [selectedTask]);

  // Mobile-only pane switch for the shared doc (write / preview side by side on desktop).
  const [docPane, setDocPane] = useState<"write" | "preview">("write");

  // Clock for overdue / due-soon badges; refreshed every minute so render stays pure.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  /** Open the add-task dialog, optionally prefilled from a starter suggestion. */
  const openAddTask = (title = "") => {
    setTaskTitle(title);
    setShowAddTaskModal(true);
  };

  /** Open the add-link dialog, optionally prefilled from a quick-add suggestion. */
  const openAddLink = (title = "", category: "design" | "repo" | "document" | "other" = "other") => {
    setLinkTitle(title);
    setLinkCategory(category);
    setShowAddLinkModal(true);
  };

  // Markdown preview for the shared doc (same subset as V1: #, ##, ###, -, **bold**).
  const renderMarkdown = (text: string) => {
    if (!text) return null;
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      if (line.startsWith("# ")) {
        return <h1 key={idx} data-v2-heading className="mb-2 mt-4 font-display text-[18px] font-semibold tracking-[-0.01em] text-ink first:mt-0">{line.slice(2)}</h1>;
      }
      if (line.startsWith("## ")) {
        return <h2 key={idx} className="mb-1.5 mt-3.5 text-[15px] font-semibold text-ink">{line.slice(3)}</h2>;
      }
      if (line.startsWith("### ")) {
        return <h3 key={idx} className="mb-1 mt-3 text-[13.5px] font-semibold text-ink">{line.slice(4)}</h3>;
      }
      if (line.startsWith("- ") || line.startsWith("* ")) {
        return <li key={idx} className="mb-1 ml-5 list-disc text-[13.5px] leading-relaxed text-ink-2">{line.slice(2)}</li>;
      }

      let content: React.ReactNode = line;
      if (line.includes("**")) {
        const parts = line.split("**");
        content = parts.map((part, pIdx) => (pIdx % 2 === 1 ? <strong key={pIdx} className="font-semibold text-ink">{part}</strong> : part));
      }

      return <p key={idx} className="mb-1 min-h-[1.2em] text-[13.5px] leading-relaxed text-ink-2">{content}</p>;
    });
  };

  const PRIORITY_TONE = { high: "bad", medium: "warn", low: "neutral" } as const;
  const STATUS_LABEL = { todo: "To do", in_progress: "In progress", completed: "Done" } as const;
  const miniSelect =
    "h-8 min-w-0 cursor-pointer appearance-none rounded-[5px] bg-sunken px-2 text-[12px] text-ink-2 ring-1 ring-inset ring-line-strong transition-shadow hover:ring-ink-4 focus:outline-none focus-visible:ring-accent-ink";

  const renderTaskCard = (task: Task) => {
    const assignee = members.find((m) => m.profiles.id === task.assignee_id);
    const due = task.due_date ? new Date(task.due_date) : null;
    const overdue = Boolean(due && task.status !== "completed" && due.getTime() < nowMs);
    return (
      <li
        key={task.id}
        draggable
        onDragStart={(e) => handleDragStart(e, task.id)}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest("button, select, input, a")) return;
          setSelectedTask(task);
        }}
        className="group/card relative cursor-pointer rounded-md border border-line bg-raised p-3 transition-colors hover:border-line-strong"
      >
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => setSelectedTask(task)}
            className={cn(
              "min-w-0 flex-1 break-words text-left text-[13.5px] font-medium leading-snug text-ink",
              task.status === "completed" && "text-ink-3 line-through decoration-ink-4",
            )}
          >
            {task.title}
          </button>
          <IconButton
            label={`Delete task ${task.title}`}
            size="sm"
            onClick={() => handleDeleteTask(task.id)}
            className="-mr-1 -mt-1 opacity-100 hover:text-bad md:opacity-0 md:focus-visible:opacity-100 md:group-hover/card:opacity-100"
          >
            <Trash2 />
          </IconButton>
        </div>

        {task.description && <p className="mt-1 line-clamp-2 break-words text-[12.5px] leading-relaxed text-ink-3">{task.description}</p>}

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <Tape tone={PRIORITY_TONE[task.priority]}>{task.priority}</Tape>
          {overdue && <Tape tone="bad">Overdue</Tape>}
          <label className="ml-auto inline-flex items-center gap-1 text-ink-3">
            <CalendarDays className="size-3.5 shrink-0" aria-hidden />
            <span className="sr-only">Due date for {task.title}</span>
            <input
              type="date"
              value={task.due_date ? task.due_date.split("T")[0] : ""}
              onChange={(e) => handleUpdateTaskDueDate(task.id, e.target.value || null)}
              className={cn(miniSelect, "h-7 w-[124px] px-1.5 font-mono text-[12.5px] dark:[color-scheme:dark]", overdue && "text-bad")}
            />
          </label>
        </div>

        <div className="mt-2.5 flex items-center gap-1.5 border-t border-line pt-2.5">
          <select
            aria-label={`Status for ${task.title}`}
            value={task.status}
            onChange={(e) => handleUpdateTaskStatus(task.id, e.target.value as "todo" | "in_progress" | "completed")}
            className={cn(miniSelect, "w-[104px] shrink-0")}
          >
            <option value="todo">To do</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Done</option>
          </select>
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <Avatar name={assignee?.profiles.full_name || "?"} src={assignee?.profiles.avatar_url} size="xs" className={assignee ? undefined : "opacity-40"} />
            <select
              aria-label={`Assignee for ${task.title}`}
              value={task.assignee_id || ""}
              onChange={(e) => handleUpdateTaskAssignee(task.id, e.target.value || null)}
              className={cn(miniSelect, "flex-1 truncate")}
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.profiles.id} value={m.profiles.id}>
                  {m.profiles.full_name.split(" ")[0]}
                </option>
              ))}
            </select>
          </span>
        </div>
      </li>
    );
  };

  const LINK_CATEGORIES: { id: "design" | "repo" | "document" | "other"; label: string; icon: React.ReactNode; suggestion: string }[] = [
    { id: "design", label: "Design", icon: <PenTool />, suggestion: "Figma file" },
    { id: "repo", label: "Code", icon: <Code />, suggestion: "Repository" },
    { id: "document", label: "Docs & slides", icon: <FileText />, suggestion: "Pitch deck" },
    { id: "other", label: "Other", icon: <Link2 />, suggestion: "Problem statement" },
  ];

  const linkHost = (url: string) => {
    try {
      return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).host.replace(/^www\./, "");
    } catch {
      return url;
    }
  };

  const renderCategoryPanel = (cat: (typeof LINK_CATEGORIES)[number]) => {
    const catLinks = links.filter((l) => l.category === cat.id);
    if (catLinks.length === 0) return null;
    return (
      <section key={cat.id} aria-label={cat.label} className="min-w-0">
        <div className="mb-2 flex items-center gap-2 text-ink-3 [&_svg]:size-3.5">
          {cat.icon}
          <h3 className="text-[13px] font-semibold text-ink">{cat.label}</h3>
          <span className="font-mono text-[12.5px] text-ink-3 tabular">{catLinks.length}</span>
        </div>
        <ul className="divide-y divide-line rounded-lg border border-line bg-raised">
          {catLinks.map((link) => (
            <li key={link.id} className="group/link flex items-center gap-3 px-3.5 py-2.5">
              <span className="min-w-0 flex-1">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-1 truncate text-[13.5px] font-medium text-ink hover:underline decoration-line-strong underline-offset-4"
                >
                  <span className="truncate">{link.title}</span>
                  <ExternalLink className="size-3 shrink-0 text-ink-3" aria-hidden />
                </a>
                <span className="mt-0.5 flex items-center gap-2">
                  <span className="truncate font-mono text-[12.5px] text-ink-3">{linkHost(link.url)}</span>
                  {link.hackathon_id ? <Tape tone="info">This event</Tape> : <Tape>All events</Tape>}
                </span>
              </span>
              <IconButton
                label={`Delete link ${link.title}`}
                size="sm"
                onClick={() => handleDeleteLink(link.id)}
                className="opacity-100 hover:text-bad md:opacity-0 md:focus-visible:opacity-100 md:group-hover/link:opacity-100"
              >
                <Trash2 />
              </IconButton>
            </li>
          ))}
        </ul>
      </section>
    );
  };

  const knownProfiles = members.reduce((acc, m) => {
    acc[m.profiles.id] = {
      id: m.profiles.id,
      full_name: m.profiles.full_name,
      avatar_url: m.profiles.avatar_url || null,
    };
    return acc;
  }, {} as Record<string, { id: string; full_name: string; avatar_url: string | null }>);

  type ActivityEvent = {
    id: string;
    type: "commit" | "task" | "resource" | "brainstorm";
    title: string;
    description: string;
    timestamp: string;
    user: {
      name: string;
      avatarUrl: string | null;
    } | null;
  };

  const getActivityTimeline = (): ActivityEvent[] => {
    const events: ActivityEvent[] = [];

    (tasks || []).forEach((t) => {
      const assignee = members.find((m) => m.profiles.id === t.assignee_id)?.profiles;

      events.push({
        id: `task-create-${t.id}`,
        type: "task",
        title: "Task Created",
        description: `Created task "${t.title}" (Priority: ${t.priority.toUpperCase()})${
          assignee ? ` assigned to ${assignee.full_name.split(" ")[0]}` : ""
        }`,
        timestamp: t.created_at,
        user: assignee
          ? { name: assignee.full_name, avatarUrl: assignee.avatar_url || null }
          : null,
      });

      if (t.status === "completed") {
        events.push({
          id: `task-complete-${t.id}`,
          type: "task",
          title: "Task Completed",
          description: `Completed task: "${t.title}"`,
          timestamp: t.created_at,
          user: assignee
            ? { name: assignee.full_name, avatarUrl: assignee.avatar_url || null }
            : null,
        });
      }
    });

    (links || []).forEach((l) => {
      const creator = members.find((m) => m.profiles.id === l.created_by)?.profiles;
      const categoryLabels: Record<string, string> = {
        design: "Design (Figma)",
        repo: "Repo (Code)",
        document: "Document (Pitch/Slides)",
        other: "Other Link",
      };

      events.push({
        id: `link-${l.id}`,
        type: "resource",
        title: "Resource Added",
        description: `Added ${categoryLabels[l.category] || l.category}: "${l.title}"`,
        timestamp: l.created_at,
        user: creator
          ? { name: creator.full_name, avatarUrl: creator.avatar_url || null }
          : null,
      });
    });

    if (documentUpdatedAt && documentId) {
      const updater = members.find((m) => m.profiles.id === documentUpdatedBy)?.profiles;
      events.push({
        id: `doc-${documentId}-${documentUpdatedAt}`,
        type: "brainstorm",
        title: "Brainstorm Pad Synced",
        description: `Updated shared brainstorming document`,
        timestamp: documentUpdatedAt,
        user: updater
          ? { name: updater.full_name, avatarUrl: updater.avatar_url || null }
          : null,
      });
    }

    return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  };

  const teamDesiredSkills = team.skills || [];
  const teamMemberSkills = Array.from(new Set(members.map((m) => m.profiles?.skills || []).flat().map(s => s.trim().toLowerCase())));

  const coveredTeamSkills = teamDesiredSkills.filter((s) => teamMemberSkills.includes(s.trim().toLowerCase()));
  const missingTeamSkills = teamDesiredSkills.filter((s) => !teamMemberSkills.includes(s.trim().toLowerCase()));

  const totalTasksCount = tasks.length;
  const completedTasksCount = tasks.filter((t) => t.status === "completed").length;
  const taskProgressPct = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0;

  const workspaceTone = CATEGORY_TONE[
    getTeamCategoryInfo({
      hackathon_id: (team as { hackathon_id?: string | null }).hackathon_id ?? null,
      team_hackathons: listedHackathons.map((h) => ({ hackathon_id: h.id, hackathons: { id: h.id, name: h.name } })),
    }).category
  ];

  return (
    <WorkspaceFrame
      team={team}
      tone={workspaceTone}
      isOwner={isOwner}
      canShare={isOwner || Boolean(currentUserId && members?.some((m) => m.profiles?.id === currentUserId))}
      tab={workspaceTab}
      onTabChange={handleTabChange}
      listedHackathons={listedHackathons}
      activeHackathon={activeHackathon}
      countdown={countdownParts}
      tasks={{ done: completedTasksCount, total: totalTasksCount, pct: taskProgressPct }}
      coverage={{ desired: teamDesiredSkills, covered: coveredTeamSkills, missing: missingTeamSkills }}
      onlineTeammates={onlineTeammates}
      members={members}
      onShare={() => setShowShareModal(true)}
      onFindBuilders={() => setShowInviteBuilderModal(true)}
    >
      {/* Tab contents */}
      <div className="animate-hm-fade">
        {/* 1. CHAT */}
        {workspaceTab === "chat" &&
          (chatLoading ? (
            <Panel className="flex h-40 items-center justify-center">
              <Spinner label="Loading chat" />
            </Panel>
          ) : conversationId && currentUserId ? (
            // Viewport minus workspace chrome: mobile header 97px + 32px padding;
            // md adds 16px padding; lg uses the 56px desktop header + 48px padding.
            <div className="flex h-[calc(100dvh-8.125rem)] flex-col overflow-hidden rounded-lg border border-line md:h-[calc(100dvh-9.125rem)] lg:h-[calc(100dvh-6.5rem)]">
              <ChatThread conversationId={conversationId} currentUserId={currentUserId} knownProfiles={knownProfiles} />
            </div>
          ) : (
            <EmptyState
              icon={<MessageSquare />}
              title="Team chat isn't available yet"
              body="The team thread couldn't be opened. Refresh the page; if it keeps happening, the team owner can reopen the workspace."
            />
          ))}

        {/* 2. TASKS */}
        {workspaceTab === "tasks" && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-ink-3">
                {tasks.length > 0 ? (
                  <>
                    <span className="font-mono text-ink-2 tabular">{completedTasksCount}</span> of{" "}
                    <span className="font-mono text-ink-2 tabular">{totalTasksCount}</span> done · drag cards between columns or change their status
                  </>
                ) : (
                  "Plan the build as small tasks with an owner and a due date."
                )}
              </p>
              <Button variant="primary" size="sm" icon={<Plus />} onClick={() => openAddTask()}>
                New task
              </Button>
            </div>

            {loadingTasks ? (
              <KanbanTasksSkeleton />
            ) : tasks.length === 0 ? (
              <EmptyState
                icon={<SquareKanban />}
                title="No tasks yet"
                body="Break the project into pieces your team can own. Start with one of these, or write your own."
                action={
                  <>
                    <Button variant="primary" size="sm" icon={<Plus />} onClick={() => openAddTask()}>
                      Add a task
                    </Button>
                    {["Set up the repo and README", "Write the problem statement", "Design the first screen", "Record the demo video"].map((s) => (
                      <Button key={s} variant="secondary" size="sm" onClick={() => openAddTask(s)}>
                        {s}
                      </Button>
                    ))}
                  </>
                }
              />
            ) : (
              <>
                {/* Team pulse: workload, priority mix, deadlines */}
                <Panel className="grid divide-y divide-line lg:grid-cols-3 lg:divide-x lg:divide-y-0">
                  <div className="min-w-0 p-4">
                    <p className="caps-label text-ink-3">Who&apos;s on what</p>
                    <ul className="mt-2.5 max-h-[132px] space-y-2 overflow-y-auto pr-1">
                      {members.map((m) => {
                        const assigned = tasks.filter((t) => t.assignee_id === m.profiles.id);
                        const done = assigned.filter((t) => t.status === "completed").length;
                        const share = tasks.length ? Math.round((assigned.length / tasks.length) * 100) : 0;
                        return (
                          <li key={m.id} className="space-y-1">
                            <div className="flex items-center justify-between gap-2 text-[12.5px]">
                              <span className="flex min-w-0 items-center gap-1.5 text-ink-2">
                                <Avatar name={m.profiles.full_name} src={m.profiles.avatar_url} size="xs" />
                                <span className="truncate">{m.profiles.full_name.split(" ")[0]}</span>
                              </span>
                              <span className="shrink-0 font-mono text-[12.5px] text-ink-3 tabular">
                                {assigned.length - done} open · {done} done
                              </span>
                            </div>
                            <Progress value={share} />
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  <div className="min-w-0 p-4">
                    <p className="caps-label text-ink-3">Priority mix</p>
                    <ul className="mt-2.5 space-y-2 text-[12.5px]">
                      {(["high", "medium", "low"] as const).map((p) => (
                        <li key={p} className="flex items-center justify-between">
                          <Tape tone={PRIORITY_TONE[p]}>{p}</Tape>
                          <span className="font-mono text-ink-2 tabular">{tasks.filter((t) => t.priority === p).length}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="min-w-0 p-4">
                    <p className="caps-label text-ink-3">Deadlines</p>
                    {(() => {
                      const now = nowMs;
                      const alerts = tasks
                        .filter((t) => t.status !== "completed" && t.due_date)
                        .map((t) => {
                          const hrs = (new Date(t.due_date!).getTime() - now) / 3600000;
                          return hrs < 0 ? { t, label: "Overdue", tone: "bad" as const } : hrs <= 24 ? { t, label: "Due soon", tone: "warn" as const } : null;
                        })
                        .filter((a): a is { t: Task; label: string; tone: "bad" | "warn" } => Boolean(a));
                      if (!alerts.length)
                        return (
                          <p className="mt-2.5 flex items-center gap-1.5 text-[12.5px] text-ok">
                            <CheckCircle2 className="size-3.5" aria-hidden /> Nothing overdue or due in the next 24h
                          </p>
                        );
                      return (
                        <ul className="mt-2.5 max-h-[132px] space-y-1.5 overflow-y-auto pr-1">
                          {alerts.map((a) => (
                            <li key={a.t.id}>
                              <button type="button" onClick={() => setSelectedTask(a.t)} className="flex w-full min-w-0 items-center gap-2 text-left text-[12.5px] text-ink-2 hover:text-ink">
                                <Tape tone={a.tone}>{a.label}</Tape>
                                <span className="truncate">{a.t.title}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      );
                    })()}
                  </div>
                </Panel>

                <div className="grid gap-4 md:grid-cols-3">
                  {(["todo", "in_progress", "completed"] as const).map((col) => {
                    const colTasks = tasks.filter((t) => t.status === col);
                    const over = draggedOverColumn === col;
                    return (
                      <section key={col} aria-label={STATUS_LABEL[col]} className="min-w-0">
                        <div className="mb-2 flex items-center gap-2 px-0.5">
                          <span className={cn("size-2 rounded-full", col === "todo" ? "bg-ink-4" : col === "in_progress" ? "bg-warn" : "bg-ok")} aria-hidden />
                          <h3 className="text-[13px] font-semibold text-ink">{STATUS_LABEL[col]}</h3>
                          <span className="font-mono text-[12.5px] text-ink-3 tabular">{colTasks.length}</span>
                        </div>
                        <ul
                          onDragOver={(e) => e.preventDefault()}
                          onDragEnter={() => setDraggedOverColumn(col)}
                          onDragLeave={() => setDraggedOverColumn(null)}
                          onDrop={(e) => {
                            setDraggedOverColumn(null);
                            handleDrop(e, col);
                          }}
                          className={cn(
                            "min-h-[120px] space-y-2 rounded-lg p-2 transition-colors md:min-h-[320px]",
                            over ? "bg-accent-soft ring-1 ring-inset ring-accent/40" : "bg-sunken ring-1 ring-inset ring-line",
                          )}
                        >
                          {colTasks.map((task) => renderTaskCard(task))}
                          {colTasks.length === 0 && (
                            <li className="flex h-[100px] items-center justify-center rounded-md border border-dashed border-line-strong px-3 text-center text-[12.5px] text-ink-3">
                              {col === "completed" ? "Finished tasks land here" : "Drop a task here"}
                            </li>
                          )}
                        </ul>
                      </section>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* 3. BRAINSTORM */}
        {workspaceTab === "brainstorm" && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Segmented<"board" | "doc">
                label="Brainstorm view"
                value={isBrainstormListView ? "doc" : "board"}
                onChange={(v) => setIsBrainstormListView(v === "doc")}
                options={[
                  { value: "board", label: "Ideas", count: brainstormIdeas.length },
                  { value: "doc", label: "Shared doc" },
                ]}
              />
              {isBrainstormListView && (
                <div className="flex items-center gap-3">
                  {documentUpdatedAt && (
                    <span className="hidden text-[12px] text-ink-3 sm:inline">
                      Saved {relativeTime(documentUpdatedAt, { suffix: true })}
                      {documentUpdatedBy && members.find((m) => m.profiles.id === documentUpdatedBy)
                        ? ` by ${members.find((m) => m.profiles.id === documentUpdatedBy)!.profiles.full_name.split(" ")[0]}`
                        : ""}
                    </span>
                  )}
                  <Button variant="primary" size="sm" icon={<Save />} loading={savingDocument} disabled={loadingDocument} onClick={handleSaveDocument}>
                    Save doc
                  </Button>
                </div>
              )}
            </div>

            {!isBrainstormListView ? (
              <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
                <Panel className="h-fit p-4">
                  <h3 className="text-[13.5px] font-semibold text-ink">Post an idea</h3>
                  <p className="mt-0.5 text-[12.5px] text-ink-3">A feature, a stack choice, a pitch angle. Teammates vote on it.</p>
                  <form onSubmit={handleAddBrainstormIdea} className="mt-3.5 space-y-3">
                    <div>
                      <FieldLabel htmlFor="idea-title">Idea</FieldLabel>
                      <Input id="idea-title" required value={newIdeaTitle} onChange={(e) => setNewIdeaTitle(e.target.value)} placeholder="e.g. Offline mode for field workers" />
                    </div>
                    <div>
                      <FieldLabel htmlFor="idea-details" hint="Optional">Details</FieldLabel>
                      <Textarea id="idea-details" value={newIdeaContent} onChange={(e) => setNewIdeaContent(e.target.value)} rows={3} className="min-h-20 resize-none" placeholder="Why it matters, what it needs…" />
                    </div>
                    <div>
                      <FieldLabel htmlFor="idea-category">Type</FieldLabel>
                      <Select id="idea-category" value={newIdeaCategory} onChange={(e) => setNewIdeaCategory(e.target.value as typeof newIdeaCategory)}>
                        <option value="core">Core feature</option>
                        <option value="nice-to-have">Nice to have</option>
                        <option value="tech-stack">Tech stack</option>
                        <option value="marketing">Pitch / story</option>
                      </Select>
                    </div>
                    <Button type="submit" variant="primary" className="w-full" loading={submittingIdea} disabled={!newIdeaTitle.trim()}>
                      Post idea
                    </Button>
                  </form>
                </Panel>

                <div className="min-w-0">
                  {loadingIdeas ? (
                    <IdeationBoardSkeleton />
                  ) : brainstormIdeas.length === 0 ? (
                    <EmptyState
                      icon={<Lightbulb />}
                      title="No ideas yet"
                      body="Post the problem you want to solve, a feature, or a stack choice. Teammates vote, and the top ideas become your plan."
                    />
                  ) : (
                    <ul className="grid gap-3 sm:grid-cols-2" data-stagger>
                      {brainstormIdeas.map((idea) => {
                        const creator = members.find((m) => m.profiles.id === idea.user_id)?.profiles;
                        const voted = Boolean(currentUserId && idea.upvotes?.includes(currentUserId));
                        const cat = {
                          core: { label: "Core feature", tone: "accent" },
                          "nice-to-have": { label: "Nice to have", tone: "info" },
                          "tech-stack": { label: "Tech stack", tone: "warn" },
                          marketing: { label: "Pitch / story", tone: "proj" },
                        }[idea.category] || { label: idea.category, tone: "neutral" };
                        return (
                          <li key={idea.id} className="group flex flex-col rounded-lg border border-line bg-raised p-4 transition-colors hover:border-line-strong">
                            <div className="flex items-start justify-between gap-2">
                              <Tape tone={cat.tone as "accent" | "info" | "warn" | "proj" | "neutral"}>{cat.label}</Tape>
                              {idea.user_id === currentUserId && (
                                <IconButton
                                  label={`Delete idea ${idea.title}`}
                                  size="sm"
                                  onClick={() => handleDeleteBrainstormIdea(idea.id)}
                                  className="-mr-1 -mt-1 opacity-100 hover:text-bad md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100"
                                >
                                  <Trash2 />
                                </IconButton>
                              )}
                            </div>
                            <h4 className="mt-2 break-words text-[14px] font-semibold leading-snug text-ink">{idea.title}</h4>
                            {idea.content && <p className="mt-1 line-clamp-4 break-words text-[13px] leading-relaxed text-ink-2">{idea.content}</p>}
                            <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                              <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-ink-3">
                                <Avatar name={creator?.full_name || "Teammate"} src={creator?.avatar_url} size="xs" />
                                <span className="truncate">{creator?.full_name?.split(" ")[0] || "Teammate"}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => handleToggleIdeaUpvote(idea.id)}
                                aria-pressed={voted}
                                aria-label={`${voted ? "Remove your vote from" : "Vote for"} ${idea.title}`}
                                className={cn(
                                  "inline-flex h-8 items-center gap-1 rounded-md px-2.5 font-mono text-[12px] font-semibold tabular ring-1 ring-inset transition-colors",
                                  voted ? "bg-accent-soft text-accent-ink ring-accent/40" : "text-ink-2 ring-line-strong hover:text-ink hover:ring-ink-4",
                                )}
                              >
                                <ChevronUp className="size-4" aria-hidden />
                                {idea.upvotes?.length || 0}
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            ) : loadingDocument ? (
              <Panel className="flex h-40 items-center justify-center">
                <Spinner label="Loading the shared doc" />
              </Panel>
            ) : (
              <div className="space-y-4">
                {documentConflict && (
                  <div role="alert" className="flex flex-col gap-3 rounded-lg bg-warn-soft px-4 py-3 ring-1 ring-inset ring-warn/30 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
                      <div>
                        <p className="text-[13px] font-semibold text-ink">A teammate saved this doc while you were editing</p>
                        <p className="mt-0.5 text-[12.5px] text-ink-3">Loading their version discards your unsaved edits. Keeping yours overwrites theirs.</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setDocumentContent(documentConflict.incomingContent);
                          documentContentRef.current = documentConflict.incomingContent;
                          lastSavedContentRef.current = documentConflict.incomingContent;
                          setDocumentUpdatedAt(documentConflict.incomingUpdatedAt);
                          setDocumentUpdatedBy(documentConflict.incomingUpdatedBy);
                          setDocumentConflict(null);
                          showToast("Loaded latest teammate version.", "info");
                        }}
                      >
                        Load theirs
                      </Button>
                      <Button
                        size="sm"
                        variant="inverse"
                        onClick={() => {
                          handleSaveDocument();
                          setDocumentConflict(null);
                        }}
                      >
                        Keep mine
                      </Button>
                    </div>
                  </div>
                )}

                <Segmented<"write" | "preview">
                  label="Doc view"
                  size="sm"
                  className="md:hidden"
                  value={docPane}
                  onChange={setDocPane}
                  options={[
                    { value: "write", label: "Write" },
                    { value: "preview", label: "Preview" },
                  ]}
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <div className={cn("min-w-0", docPane !== "write" && "hidden md:block")}>
                    <FieldLabel htmlFor="ws-doc" hint="Markdown">Write</FieldLabel>
                    <Textarea
                      id="ws-doc"
                      value={documentContent}
                      onChange={(e) => {
                        setDocumentContent(e.target.value);
                        documentContentRef.current = e.target.value;
                      }}
                      className="h-[52dvh] min-h-[280px] resize-none font-mono text-[13px] md:h-[420px]"
                      placeholder={"# Our idea\n- Problem we're solving\n- Who it's for\n- **Must-have** features"}
                    />
                  </div>
                  <div className={cn("min-w-0", docPane !== "preview" && "hidden md:block")}>
                    <p className="mb-1.5 caps-label text-ink-3">Preview</p>
                    <div className="h-[52dvh] min-h-[280px] overflow-y-auto rounded-md bg-raised p-4 ring-1 ring-inset ring-line md:h-[420px]">
                      {renderMarkdown(documentContent) || <p className="text-[13px] text-ink-3">Nothing written yet.</p>}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 4. RESOURCES */}
        {workspaceTab === "resources" && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-ink-3">
                {links.length > 0 ? (
                  <>
                    <span className="font-mono text-ink-2 tabular">{links.length}</span> shared {links.length === 1 ? "link" : "links"}
                    {activeHackathon ? ` for ${activeHackathon.name} and all events` : ""}
                  </>
                ) : (
                  "Everything the team keeps opening, in one place."
                )}
              </p>
              <Button variant="primary" size="sm" icon={<Plus />} onClick={() => openAddLink()}>
                Add link
              </Button>
            </div>

            {loadingLinks ? (
              <Panel className="flex h-40 items-center justify-center">
                <Spinner label="Loading links" />
              </Panel>
            ) : links.length === 0 ? (
              <EmptyState
                icon={<Link2 />}
                title="No shared links yet"
                body="Keep the Figma file, repo, pitch deck and problem statement one tap away for the whole team."
                action={
                  <>
                    <Button variant="primary" size="sm" icon={<Plus />} onClick={() => openAddLink()}>
                      Add a link
                    </Button>
                    {LINK_CATEGORIES.map((c) => (
                      <Button key={c.id} variant="secondary" size="sm" icon={c.icon} onClick={() => openAddLink(c.suggestion, c.id)}>
                        {c.suggestion}
                      </Button>
                    ))}
                  </>
                }
              />
            ) : (
              <>
                <div className="grid gap-5 lg:grid-cols-2">{LINK_CATEGORIES.map((c) => renderCategoryPanel(c))}</div>
                {LINK_CATEGORIES.some((c) => !links.some((l) => l.category === c.id)) && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
                    <span className="text-[12.5px] text-ink-3">Add a</span>
                    {LINK_CATEGORIES.filter((c) => !links.some((l) => l.category === c.id)).map((c) => (
                      <Button key={c.id} variant="ghost" size="sm" icon={c.icon} onClick={() => openAddLink(c.suggestion, c.id)}>
                        {c.suggestion}
                      </Button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* 5. GITHUB */}
        {workspaceTab === "github" && (
          <div className="space-y-5">
            {!activeGithubRepoUrl ? (
              <EmptyState
                icon={<GitBranch />}
                title="Connect your repo"
                body="Link the team's public GitHub repository to see recent commits and who's pushing code, right here in the workspace."
                action={
                  isOwner ? (
                    <form
                      className="flex w-full max-w-lg flex-col gap-2 sm:flex-row"
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleLinkGithubRepo(githubRepoUrlInput);
                      }}
                    >
                      <Input
                        aria-label="GitHub repository URL"
                        value={githubRepoUrlInput}
                        onChange={(e) => setGithubRepoUrlInput(e.target.value)}
                        placeholder="https://github.com/owner/repo"
                        className="font-mono text-[13px]"
                      />
                      <Button type="submit" variant="primary" disabled={!githubRepoUrlInput.trim()}>
                        Link repo
                      </Button>
                    </form>
                  ) : (
                    <p className="text-[12.5px] text-ink-3">Only the team owner can link a repository.</p>
                  )
                }
              />
            ) : (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                <Panel className="min-w-0">
                  <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                    <h3 className="text-[13.5px] font-semibold text-ink">
                      Recent commits <span className="ml-1 font-mono text-[12.5px] font-normal text-ink-3 tabular">{commits.length}</span>
                    </h3>
                    <Button size="sm" variant="ghost" icon={<RefreshCw className={loadingCommits ? "animate-spin" : undefined} />} disabled={loadingCommits} onClick={fetchCommits}>
                      Refresh
                    </Button>
                  </div>
                  {loadingCommits ? (
                    <div className="p-4">
                      <CommitsTimelineSkeleton />
                    </div>
                  ) : errorCommits ? (
                    <div className="p-4">
                      <ErrorNotice title="Couldn't load commits" detail={errorCommits} onRetry={fetchCommits} />
                    </div>
                  ) : commits.length === 0 ? (
                    <p className="px-4 py-8 text-center text-[13px] text-ink-3">No commits in this repository yet.</p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {commits.map((c, index) => {
                        const author = c.commit?.author?.name || c.author?.login || "Unknown author";
                        const message = c.commit?.message?.split("\n")[0] || "No message";
                        const when = c.commit?.author?.date as string | undefined;
                        const sha = (c.sha as string | undefined)?.substring(0, 7) || "";
                        return (
                          <li key={c.sha || index} className="flex items-start gap-3 px-4 py-3">
                            <Avatar name={author} src={c.author?.avatar_url} size="sm" />
                            <div className="min-w-0 flex-1">
                              <p className="break-words text-[13.5px] text-ink">{message}</p>
                              <p className="mt-0.5 text-[12px] text-ink-3">
                                {author}
                                {when && ` · ${relativeTime(when, { suffix: true })}`}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5">
                              {c.html_url ? (
                                <a href={c.html_url} target="_blank" rel="noreferrer" className="rounded px-1.5 py-1 font-mono text-[12.5px] text-ink-2 ring-1 ring-inset ring-line-strong hover:text-ink">
                                  {sha}
                                </a>
                              ) : (
                                <span className="font-mono text-[12.5px] text-ink-3">{sha}</span>
                              )}
                              <IconButton
                                label="Copy commit hash"
                                size="sm"
                                onClick={() => {
                                  navigator.clipboard.writeText(c.sha);
                                  showToast("Commit hash copied!", "success");
                                }}
                              >
                                <Copy />
                              </IconButton>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Panel>

                <div className="space-y-5">
                  <Panel className="p-4">
                    <p className="caps-label text-ink-3">Repository</p>
                    <a href={activeGithubRepoUrl} target="_blank" rel="noreferrer" className="mt-1.5 flex items-center gap-1 break-all font-mono text-[12.5px] text-ink hover:underline decoration-line-strong underline-offset-4">
                      {activeGithubRepoUrl.replace(/^https?:\/\/(www\.)?/, "")}
                      <ExternalLink className="size-3 shrink-0 text-ink-3" aria-hidden />
                    </a>
                    {isOwner && (
                      <Button size="sm" variant="ghost" icon={<Unlink />} className="mt-3 -ml-2 text-bad hover:text-bad" onClick={handleUnlinkGithubRepo}>
                        Disconnect repo
                      </Button>
                    )}
                  </Panel>
                  <Panel className="p-4">
                    <p className="caps-label text-ink-3">Contributors</p>
                    {loadingCommits ? (
                      <Spinner className="mt-3" />
                    ) : commits.length === 0 ? (
                      <p className="mt-2 text-[12.5px] text-ink-3">No commits yet.</p>
                    ) : (
                      <ul className="mt-2.5 space-y-2">
                        {(() => {
                          const map: Record<string, { count: number; avatar?: string }> = {};
                          commits.forEach((c) => {
                            const name = c.commit?.author?.name || c.author?.login || "Unknown";
                            if (!map[name]) map[name] = { count: 0, avatar: c.author?.avatar_url };
                            map[name].count++;
                          });
                          return Object.entries(map)
                            .sort((a, b) => b[1].count - a[1].count)
                            .map(([name, info]) => (
                              <li key={name} className="flex items-center justify-between gap-2 text-[13px]">
                                <span className="flex min-w-0 items-center gap-2 text-ink-2">
                                  <Avatar name={name} src={info.avatar} size="xs" />
                                  <span className="truncate">{name}</span>
                                </span>
                                <span className="font-mono text-[12.5px] text-ink-3 tabular">{info.count}</span>
                              </li>
                            ));
                        })()}
                      </ul>
                    )}
                  </Panel>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 6. DEPLOYMENTS */}
        {workspaceTab === "deployments" && (
          <div className="space-y-5">
            <p className="text-[13px] text-ink-3">Add your live demo, staging or API URLs. The workspace checks whether each one is reachable.</p>
            <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
              <Panel className="h-fit p-4">
                <h3 className="text-[13.5px] font-semibold text-ink">Add a URL</h3>
                <form onSubmit={handleAddDeployment} className="mt-3 space-y-3">
                  <div>
                    <FieldLabel htmlFor="dep-name">Name</FieldLabel>
                    <Input id="dep-name" required value={newDepName} onChange={(e) => setNewDepName(e.target.value)} placeholder="e.g. Live demo" />
                  </div>
                  <div>
                    <FieldLabel htmlFor="dep-url">URL</FieldLabel>
                    <Input id="dep-url" required value={newDepUrl} onChange={(e) => setNewDepUrl(e.target.value)} placeholder="myapp.vercel.app" className="font-mono text-[13px]" />
                  </div>
                  <Button type="submit" variant="primary" className="w-full" loading={submittingDeployment} disabled={!newDepName.trim() || !newDepUrl.trim()}>
                    Add URL
                  </Button>
                </form>
              </Panel>

              <div className="min-w-0">
                {loadingDeployments ? (
                  <Panel className="flex h-40 items-center justify-center">
                    <Spinner label="Loading deployments" />
                  </Panel>
                ) : deployments.length === 0 ? (
                  <EmptyState
                    icon={<Globe />}
                    title="No URLs yet"
                    body="Add the link judges will open. You'll see at a glance whether it's up before the demo."
                  />
                ) : (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {deployments.map((dep) => {
                      const state = pingStatus[dep.id] || { status: "checking" };
                      const href = /^https?:\/\//i.test(dep.url) ? dep.url : "https://" + dep.url;
                      return (
                        <li key={dep.id} className="group flex flex-col rounded-lg border border-line bg-raised p-4">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="min-w-0 truncate text-[14px] font-semibold text-ink">{dep.name}</h4>
                            <div className="-mr-1 -mt-1 flex shrink-0 items-center">
                              <IconButton label={`Recheck ${dep.name}`} size="sm" onClick={() => pingUrl(dep.id, dep.url)}>
                                <RefreshCw className={state.status === "checking" ? "animate-spin" : undefined} />
                              </IconButton>
                              <IconButton
                                label={`Remove ${dep.name}`}
                                size="sm"
                                onClick={() => handleDeleteDeployment(dep.id)}
                                className="opacity-100 hover:text-bad md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100"
                              >
                                <Trash2 />
                              </IconButton>
                            </div>
                          </div>
                          <a href={href} target="_blank" rel="noopener noreferrer" className="mt-0.5 truncate font-mono text-[12px] text-ink-3 hover:text-ink hover:underline">
                            {dep.url}
                          </a>
                          <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                            <span className="flex items-center gap-2 text-[12.5px]">
                              {state.status === "checking" ? (
                                <>
                                  <Spinner className="size-3" label="Checking" />
                                  <span className="text-ink-3">Checking…</span>
                                </>
                              ) : state.status === "online" ? (
                                <>
                                  <StatusDot tone="ok" />
                                  <span className="text-ok">Reachable</span>
                                </>
                              ) : (
                                <>
                                  <StatusDot tone="bad" />
                                  <span className="text-bad">Not reachable</span>
                                </>
                              )}
                            </span>
                            {state.status === "online" && state.latency ? <span className="font-mono text-[12.5px] text-ink-3 tabular">{state.latency}ms</span> : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 7. ACTIVITY */}
        {workspaceTab === "activity" &&
          (() => {
            const timeline = getActivityTimeline();
            const starters = (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={<SquareKanban />} onClick={() => handleTabChange("tasks")}>
                  Plan a task
                </Button>
                <Button size="sm" variant="secondary" icon={<Link2 />} onClick={() => handleTabChange("resources")}>
                  Share a link
                </Button>
                <Button size="sm" variant="secondary" icon={<Lightbulb />} onClick={() => handleTabChange("brainstorm")}>
                  Post an idea
                </Button>
              </div>
            );
            if (timeline.length === 0)
              return (
                <EmptyState
                  icon={<Clock />}
                  title="Nothing has happened here yet"
                  body="New tasks, finished tasks, shared links and saves to the shared doc show up here, newest first."
                  action={starters}
                />
              );
            const icon = { commit: <GitCommit />, task: <CheckSquare />, resource: <Link2 />, brainstorm: <Lightbulb /> } as const;
            return (
              <div className="space-y-5">
                <Panel>
                  <ul className="divide-y divide-line">
                    {timeline.map((event) => (
                      <li key={event.id} className="flex items-start gap-3 px-4 py-3">
                        <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-selected text-ink-2 [&_svg]:size-3.5">
                          {icon[event.type] || <Bell />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-ink">{event.title}</p>
                          <p className="mt-0.5 break-words text-[12.5px] text-ink-2">{event.description}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="font-mono text-[12.5px] text-ink-3 tabular">{relativeTime(event.timestamp)}</span>
                          {event.user && (
                            <span className="flex items-center gap-1 text-[12px] text-ink-3">
                              <Avatar name={event.user.name} src={event.user.avatarUrl} size="xs" />
                              <span className="hidden sm:inline">{event.user.name.split(" ")[0]}</span>
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Panel>
                {timeline.length < 4 && (
                  <div className="rounded-lg border border-dashed border-line-strong px-4 py-4">
                    <p className="text-[13px] font-medium text-ink">Keep the log useful</p>
                    <p className="mt-0.5 text-[12.5px] text-ink-3">Tasks, shared links and doc saves are recorded automatically as the team works.</p>
                    <div className="mt-3">{starters}</div>
                  </div>
                )}
              </div>
            );
          })()}

        {/* 8. PITCH REVIEW */}
        {workspaceTab === "ppt" && (
          <div className="text-left">
            <PPTEvaluatorTab teamId={team.id} />
          </div>
        )}

        {/* 9. SQUAD MATCHER */}
        {workspaceTab === "gap_filler" && (
          <div className="text-left">
            <SmartGapFiller
              teamId={team.id}
              teamName={team.name}
              requiredSkills={team.skills}
              rolesNeeded={team.roles_needed}
              members={members as any}
              isOwnerOrMember={isOwner || members.some((m) => m.profiles?.id === currentUserId || (m as any).user_id === currentUserId)}
              onInviteSent={refreshTeam}
            />
          </div>
        )}
      </div>

      {/* Task details + discussion */}
      <Dialog
        open={Boolean(selectedTask)}
        onClose={() => setSelectedTask(null)}
        size="lg"
        title={selectedTask?.title || "Task"}
        description={selectedTask ? `${STATUS_LABEL[selectedTask.status]} · ${selectedTask.priority} priority` : undefined}
      >
        {selectedTask &&
          (() => {
            const assignee = members.find((m) => m.profiles.id === selectedTask.assignee_id);
            return (
              <div className="space-y-4">
                <dl className="grid grid-cols-2 gap-4 rounded-md bg-sunken p-3 ring-1 ring-inset ring-line">
                  <div>
                    <dt className="caps-label text-ink-3">Owner</dt>
                    <dd className="mt-1 flex items-center gap-1.5 text-[13px] text-ink">
                      {assignee ? (
                        <>
                          <Avatar name={assignee.profiles.full_name} src={assignee.profiles.avatar_url} size="xs" />
                          {assignee.profiles.full_name}
                        </>
                      ) : (
                        <span className="text-ink-3">Unassigned</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="caps-label text-ink-3">Due</dt>
                    <dd className="mt-1 font-mono text-[13px] text-ink">
                      {selectedTask.due_date ? (
                        new Date(selectedTask.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                      ) : (
                        <span className="font-sans text-ink-3">No due date</span>
                      )}
                    </dd>
                  </div>
                </dl>

                {selectedTask.description && <p className="whitespace-pre-line break-words text-[13.5px] leading-relaxed text-ink-2">{selectedTask.description}</p>}

                <div>
                  <p className="caps-label text-ink-3">Discussion</p>
                  <div className="mt-2 max-h-[40dvh] space-y-3 overflow-y-auto pr-1">
                    {loadingComments ? (
                      <Spinner />
                    ) : taskComments.length === 0 ? (
                      <p className="text-[13px] text-ink-3">No comments yet. Ask a question or post an update.</p>
                    ) : (
                      taskComments.map((comment) => {
                        const who = members.find((m) => m.profiles.id === comment.user_id)?.profiles;
                        return (
                          <div key={comment.id} className="flex items-start gap-2.5">
                            <Avatar name={who?.full_name || "Teammate"} src={who?.avatar_url} size="sm" />
                            <div className="min-w-0 flex-1">
                              <p className="text-[12.5px]">
                                <span className="font-semibold text-ink">{who?.full_name || "Teammate"}</span>{" "}
                                <span className="font-mono text-[12.5px] text-ink-3">{relativeTime(comment.created_at)}</span>
                              </p>
                              <p className="mt-0.5 whitespace-pre-line break-words text-[13.5px] leading-relaxed text-ink-2">{comment.content}</p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <form onSubmit={handleAddComment} className="mt-3 flex gap-2 border-t border-line pt-3">
                    <Input
                      aria-label="Write a comment"
                      value={newTaskComment}
                      onChange={(e) => setNewTaskComment(e.target.value)}
                      placeholder="Write a comment…"
                      disabled={submittingComment}
                      className="flex-1"
                    />
                    <Button type="submit" variant="primary" loading={submittingComment} disabled={!newTaskComment.trim()}>
                      Post
                    </Button>
                  </form>
                </div>
              </div>
            );
          })()}
      </Dialog>

      {/* New task */}
      <Dialog
        open={showAddTaskModal}
        onClose={() => setShowAddTaskModal(false)}
        title="New task"
        description="Give it an owner and a due date so nothing falls through."
        footer={
          <>
            <Button variant="ghost" disabled={savingTask} onClick={() => setShowAddTaskModal(false)}>
              Cancel
            </Button>
            <Button type="submit" form="ws-add-task" variant="primary" loading={savingTask} disabled={!taskTitle.trim()}>
              Create task
            </Button>
          </>
        }
      >
        <form id="ws-add-task" onSubmit={handleAddTask} className="space-y-3.5">
          <div>
            <FieldLabel htmlFor="task-title">Title</FieldLabel>
            <Input id="task-title" data-autofocus required value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="e.g. Build the login screen" />
          </div>
          <div>
            <FieldLabel htmlFor="task-desc" hint="Optional">Details</FieldLabel>
            <Textarea id="task-desc" value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} rows={2} className="min-h-16" placeholder="What does done look like?" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="task-priority">Priority</FieldLabel>
              <Select id="task-priority" value={taskPriority} onChange={(e) => setTaskPriority(e.target.value as "low" | "medium" | "high")}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor="task-assignee">Owner</FieldLabel>
              <Select id="task-assignee" value={taskAssignee} onChange={(e) => setTaskAssignee(e.target.value)}>
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.profiles.id} value={m.profiles.id}>
                    {m.profiles.full_name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <FieldLabel htmlFor="task-due" hint="Optional">Due date</FieldLabel>
            <Input id="task-due" type="date" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)} className="font-mono dark:[color-scheme:dark]" />
          </div>
        </form>
      </Dialog>

      {/* Add link */}
      <Dialog
        open={showAddLinkModal}
        onClose={() => setShowAddLinkModal(false)}
        title="Add a link"
        description="Shared with everyone on the team."
        footer={
          <>
            <Button variant="ghost" disabled={savingLink} onClick={() => setShowAddLinkModal(false)}>
              Cancel
            </Button>
            <Button type="submit" form="ws-add-link" variant="primary" loading={savingLink} disabled={!linkTitle.trim() || !linkUrl.trim()}>
              Add link
            </Button>
          </>
        }
      >
        <form id="ws-add-link" onSubmit={handleAddLink} className="space-y-3.5">
          <div>
            <FieldLabel htmlFor="link-title">Name</FieldLabel>
            <Input id="link-title" required value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder="e.g. Figma file" />
          </div>
          <div>
            <FieldLabel htmlFor="link-url">URL</FieldLabel>
            <Input id="link-url" data-autofocus required value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="figma.com/file/…" className="font-mono text-[13px]" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="link-category">Type</FieldLabel>
              <Select id="link-category" value={linkCategory} onChange={(e) => setLinkCategory(e.target.value as "design" | "repo" | "document" | "other")}>
                <option value="design">Design</option>
                <option value="repo">Code</option>
                <option value="document">Docs &amp; slides</option>
                <option value="other">Other</option>
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor="link-scope">Visible for</FieldLabel>
              <Select id="link-scope" value={linkScope} onChange={(e) => setLinkScope(e.target.value as "event" | "global")}>
                <option value="event">{activeHackathon?.name ? `${activeHackathon.name} only` : "This event only"}</option>
                <option value="global">All of the team&apos;s events</option>
              </Select>
            </div>
          </div>
        </form>
      </Dialog>

      {/* Invite builders to fill skill gaps */}
      <Dialog
        open={showInviteBuilderModal}
        onClose={() => setShowInviteBuilderModal(false)}
        size="lg"
        title="Invite builders"
        description={missingTeamSkills.length ? `Still missing: ${missingTeamSkills.join(", ")}` : "Send a team invite to builders on HackerMate."}
        footer={
          <Button variant="secondary" onClick={() => setShowInviteBuilderModal(false)}>
            Done
          </Button>
        }
      >
        <SearchField value={searchQuery} onChange={setSearchQuery} placeholder="Search by name, college or skill" label="Search builders" />
        <div className="mt-3 min-h-[240px]">
          {loadingProfiles ? (
            <div className="flex h-40 items-center justify-center">
              <Spinner label="Loading builders" />
            </div>
          ) : (
            (() => {
              const memberIds = new Set(members.map((m) => m.profiles.id));
              const q = searchQuery.toLowerCase();
              const filtered = inviteProfiles.filter((p) => {
                if (p.id === currentUserId || memberIds.has(p.id)) return false;
                if (!q) return true;
                return p.full_name?.toLowerCase().includes(q) || p.college?.toLowerCase().includes(q) || p.skills?.some((s) => s.toLowerCase().includes(q));
              });
              if (filtered.length === 0) return <p className="py-10 text-center text-[13px] text-ink-3">No builders match that search.</p>;
              const shown = filtered.slice(0, 60);
              return (
                <>
                  <ul className="divide-y divide-line">
                    {shown.map((p) => {
                      const invited = existingPendingInvites.has(p.id) || sessionInvitedIds.has(p.id);
                      return (
                        <li key={p.id} className="flex items-center gap-3 py-2.5">
                          <Avatar name={p.full_name} src={p.avatar_url} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13.5px] font-medium text-ink">{p.full_name || "Builder"}</p>
                            {p.college && <p className="truncate text-[12px] text-ink-3">{p.college}</p>}
                            {p.skills && p.skills.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {p.skills.slice(0, 3).map((s) => (
                                  <Chip key={s} active={missingTeamSkills.some((m) => m.toLowerCase() === s.toLowerCase())}>
                                    {s}
                                  </Chip>
                                ))}
                                {p.skills.length > 3 && <Chip className="text-ink-3">+{p.skills.length - 3}</Chip>}
                              </div>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant={invited ? "ghost" : "secondary"}
                            icon={invited ? <Check /> : <UserPlus />}
                            disabled={invited}
                            onClick={async () => {
                              try {
                                const { error } = await supabase.rpc("send_team_invite", { p_team_id: team.id, p_invited_user_id: p.id });
                                if (error) {
                                  console.error("[workspace] send_team_invite failed:", error);
                                  showToast(error.message, "error");
                                } else {
                                  showToast(`Invite sent to ${p.full_name}!`, "success");
                                  setSessionInvitedIds((prev) => new Set(prev).add(p.id));
                                }
                              } catch (err) {
                                console.error(err);
                                showToast("Failed to send invite", "error");
                              }
                            }}
                          >
                            {invited ? "Invited" : "Invite"}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                  {filtered.length > shown.length && (
                    <p className="pt-3 text-center text-[12px] text-ink-3">
                      Showing {shown.length} of {filtered.length}. Search to narrow it down.
                    </p>
                  )}
                </>
              );
            })()
          )}
        </div>
      </Dialog>

      {/* Share */}
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        title={`Share workspace · ${team.name}`}
        subtitle="Share the team workspace with collaborators"
        shareUrl={typeof window !== "undefined" ? window.location.href : `https://hackermate.in/teams/${team.id}/workspace`}
        shareText={`Check out our team workspace for '${team.name}' on HackerMate:`}
        type="team"
        metadata={{
          teamName: team.name,
          hackathonName: team.hackathon_name || undefined,
        }}
      />
    </WorkspaceFrame>
  );
}

