"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, subscribeWithRetry } from "@/lib/supabase";
import ChatThread from "@/components/chatThread";
import { useNotification } from "@/context/NotificationContext";
import { COLLEGES } from "@/lib/colleges";

const SKILLS = [
  "React", "Next.js", "TypeScript", "JavaScript", "Node.js", "Express",
  "Python", "Java", "C++", "Flutter", "React Native", "AI/ML",
  "TensorFlow", "PyTorch", "Docker", "Kubernetes", "AWS", "Terraform",
  "Supabase", "PostgreSQL", "MongoDB", "UI/UX", "Figma", "DevOps",
  "Public Speaking", "Presenting", "Pitching", "Technical Writing",
  "Graphic Design", "Video Editing",
];

const ROLES = [
  "Frontend Developer", "Backend Developer", "Full Stack Developer",
  "UI/UX Designer", "AI/ML Engineer", "Data Scientist", "Mobile Developer",
  "DevOps Engineer", "Cloud Engineer", "Product Manager", "Blockchain Developer",
];

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

type Props = {
  team: Team;
  members: Member[];
  isMember: boolean;
  isOwner: boolean;
  teamFull: boolean;
  requestLoading: boolean;
  requestSent: boolean;
  requestToJoin: () => void;
  removeMember: (memberId: string) => void;
  disbandTeam?: () => void;
  leaveTeam?: (memberId: string) => void;
  toggleRecruiting?: () => void;

  matchScore?: number;

  matchedSkills?: string[];
  missingSkills?: string[];
  refreshTeam?: () => void;
  pendingInvite?: { id: string; status: string } | null;
  listedHackathons?: { id: string; name: string; description?: string | null; start_date?: string; end_date?: string }[];
  unlinkHackathon?: (hackathonId: string) => void;
  initialTab?: "chat" | "tasks" | "brainstorm" | "resources" | "submission" | "github" | "activity" | "deployments";
};

function parseHackathonRequirements(description: string | null | undefined): { id: string; label: string; checked: boolean }[] {
  const defaults = [
    { id: "1", label: "Push source code to GitHub repository", checked: false },
    { id: "2", label: "Deploy project to production (Live Demo URL)", checked: false },
    { id: "3", label: "Finalize presentation deck / slides", checked: false },
    { id: "4", label: "Record and upload project video pitch", checked: false },
    { id: "5", label: "Submission created on Devpost/Portal", checked: false },
  ];

  if (!description) return defaults;

  const descLower = description.toLowerCase();
  const requirements = [];
  let currentId = 1;

  // 1. GitHub / Repository
  if (
    descLower.includes("github") ||
    descLower.includes("repository") ||
    descLower.includes("source code") ||
    descLower.includes("repo")
  ) {
    requirements.push({
      id: String(currentId++),
      label: "Push source code to GitHub repository",
      checked: false,
    });
  }

  // 2. Deployed / Live Link
  if (
    descLower.includes("deploy") ||
    descLower.includes("live link") ||
    descLower.includes("live demo") ||
    descLower.includes("vercel") ||
    descLower.includes("netlify") ||
    descLower.includes("prototype link") ||
    descLower.includes("working prototype")
  ) {
    requirements.push({
      id: String(currentId++),
      label: "Deploy project to production (Live Demo URL)",
      checked: false,
    });
  }

  // 3. PPT / Slides
  if (
    descLower.includes("ppt") ||
    descLower.includes("pitch deck") ||
    descLower.includes("slides") ||
    descLower.includes("presentation") ||
    descLower.includes("powerpoint") ||
    descLower.includes("proposal document")
  ) {
    requirements.push({
      id: String(currentId++),
      label: "Finalize presentation deck / slides",
      checked: false,
    });
  }

  // 4. Video Pitch
  if (
    descLower.includes("video") ||
    descLower.includes("pitch video") ||
    descLower.includes("loom") ||
    descLower.includes("demonstration video") ||
    descLower.includes("youtube")
  ) {
    requirements.push({
      id: String(currentId++),
      label: "Record and upload project video pitch",
      checked: false,
    });
  }

  // 5. Figma / Design
  if (
    descLower.includes("figma") ||
    descLower.includes("ui/ux") ||
    descLower.includes("design prototype") ||
    descLower.includes("wireframe") ||
    descLower.includes("poster")
  ) {
    requirements.push({
      id: String(currentId++),
      label: "Complete UI/UX design prototype in Figma",
      checked: false,
    });
  }

  // If nothing matched, fallback to defaults
  return requirements.length > 0 ? requirements : defaults;
}

export default function TeamDetailsView({
  team,
  members,
  isMember,
  isOwner,
  teamFull,
  requestLoading,
  requestSent,
  requestToJoin,
  removeMember,
  disbandTeam,
  leaveTeam,
  toggleRecruiting,
  matchScore,
  matchedSkills = [],
  missingSkills = [],
  refreshTeam,
  pendingInvite,
  listedHackathons = [],
  unlinkHackathon,
  initialTab,
}: Props) {
  const { showToast, confirm } = useNotification();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(true);

  // Invitation banner states
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [inviteActionLoading, setInviteActionLoading] = useState(false);

  useEffect(() => {
    if (pendingInvite) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInviteStatus(pendingInvite.status);
    } else {
      setInviteStatus(null);
    }
  }, [pendingInvite]);

  const handleAcceptInvite = async () => {
    if (!pendingInvite) return;
    setInviteActionLoading(true);
    const { error } = await supabase.rpc("accept_team_invite", {
      p_invite_id: pendingInvite.id,
    });
    if (error) {
      showToast(error.message, "error");
    } else {
      showToast("You have successfully joined the team!", "success");
      setInviteStatus("accepted");
      if (refreshTeam) refreshTeam();
    }
    setInviteActionLoading(false);
  };

  const handleRejectInvite = async () => {
    if (!pendingInvite) return;
    setInviteActionLoading(true);
    const { error } = await supabase.rpc("reject_team_invite", {
      p_invite_id: pendingInvite.id,
    });
    if (error) {
      showToast(error.message, "error");
    } else {
      showToast("Invitation declined.", "info");
      setInviteStatus("rejected");
      if (refreshTeam) refreshTeam();
    }
    setInviteActionLoading(false);
  };

  // Workspace tab states
  const [workspaceTab, setWorkspaceTab] = useState<"chat" | "tasks" | "brainstorm" | "resources" | "submission" | "github" | "activity" | "deployments">(initialTab ?? "chat");
  const [draggedOverColumn, setDraggedOverColumn] = useState<"todo" | "in_progress" | "completed" | null>(null);

  // GitHub Sync Tab States
  const [githubRepoUrlInput, setGithubRepoUrlInput] = useState(team.github_repo_url || "");
  const [commits, setCommits] = useState<any[]>([]);
  const [loadingCommits, setLoadingCommits] = useState(false);
  const [errorCommits, setErrorCommits] = useState<string | null>(null);

  useEffect(() => {
    setGithubRepoUrlInput(team.github_repo_url || "");
  }, [team.github_repo_url]);

  const handleLinkGithubRepo = async (url: string) => {
    if (!url.trim()) return;
    try {
      const { error } = await supabase
        .from("teams")
        .update({ github_repo_url: url.trim() })
        .eq("id", team.id);

      if (error) {
        showToast(error.message, "error");
      } else {
        showToast("GitHub repository linked successfully!", "success");
        if (refreshTeam) refreshTeam();
      }
    } catch (err) {
      console.error(err);
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
          const { error } = await supabase
            .from("teams")
            .update({ github_repo_url: null })
            .eq("id", team.id);

          if (error) {
            showToast(error.message, "error");
          } else {
            showToast("GitHub repository disconnected.", "info");
            if (refreshTeam) refreshTeam();
          }
        } catch (err) {
          console.error(err);
          showToast("Failed to disconnect repository.", "error");
        }
      }
    });
  };

  const fetchCommits = async () => {
    if (!team.github_repo_url) {
      setCommits([]);
      return;
    }

    setLoadingCommits(true);
    setErrorCommits(null);

    try {
      const cleanUrl = team.github_repo_url.endsWith("/")
        ? team.github_repo_url.slice(0, -1)
        : team.github_repo_url;
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
  }, [workspaceTab, team.github_repo_url]);

  // Project Submission Tab State
  type ChecklistItem = {
    id: string;
    label: string;
    checked: boolean;
  };
  type SubmissionData = {
    projectTitle: string;
    demoUrl: string;
    githubUrl: string;
    pitchVideoUrl: string;
    slidesUrl: string;
    checklist: ChecklistItem[];
  };

  const [submission, setSubmission] = useState<SubmissionData>({
    projectTitle: "",
    demoUrl: "",
    githubUrl: "",
    pitchVideoUrl: "",
    slidesUrl: "",
    checklist: [],
  });

  const [newChecklistItem, setNewChecklistItem] = useState("");

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

  // Workspace V2 States
  const [timeLeft, setTimeLeft] = useState("");
  const [countdownParts, setCountdownParts] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0, ended: false });
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskComments, setTaskComments] = useState<any[]>([]);
  const [newTaskComment, setNewTaskComment] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  // Workspace V3 States
  
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

  // Project Role editing states
  const [isEditingProjectRoleForMemberId, setIsEditingProjectRoleForMemberId] = useState<string | null>(null);
  const [projectRoleInput, setProjectRoleInput] = useState("");
  const [isCustomProjectRole, setIsCustomProjectRole] = useState(false);

  // Edit Team Details states
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState(team.name);
  const [editDesc, setEditDesc] = useState(team.description || "");
  const [editCollege, setEditCollege] = useState("");
  const [editCustomCollege, setEditCustomCollege] = useState("");
  const [editCollegeSearch, setEditCollegeSearch] = useState("");
  const [showEditCollegeDropdown, setShowEditCollegeDropdown] = useState(false);
  const [editMaxMembers, setEditMaxMembers] = useState(team.max_members || 4);
  const [editSkills, setEditSkills] = useState<string[]>(team.skills || []);
  const [editRoles, setEditRoles] = useState<string[]>(team.roles_needed || []);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    Promise.resolve().then(() => {
      setEditName(team.name);
      setEditDesc(team.description || "");
      const isCustom = team.college && !COLLEGES.includes(team.college);
      setEditCollege(isCustom ? "Other" : (team.college || ""));
      setEditCustomCollege(isCustom ? team.college! : "");
      setEditMaxMembers(team.max_members || 4);
      setEditSkills(team.skills || []);
      setEditRoles(team.roles_needed || []);
    });
  }, [team]);

  const handleSaveProjectRole = async (memberId: string) => {
    const roleToSave = projectRoleInput.trim() || "Developer";
    try {
      const { error } = await supabase
        .from("team_members")
        .update({ project_role: roleToSave })
        .eq("id", memberId);

      if (error) {
        showToast(error.message, "error");
      } else {
        showToast("Project role updated successfully", "success");
        setIsEditingProjectRoleForMemberId(null);
        if (refreshTeam) refreshTeam();
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to update project role", "error");
    }
  };

  const toggleEditSkill = (skill: string) => {
    setEditSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    );
  };

  const toggleEditRole = (role: string) => {
    setEditRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleSaveTeamDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) { showToast("Team name is required", "warning"); return; }
    if (!editDesc.trim()) { showToast("Team description is required", "warning"); return; }
    if (editCollege === "Other" && !editCustomCollege.trim()) { showToast("Please enter your college name", "warning"); return; }
    if (editSkills.length === 0) { showToast("Please select at least one skill", "warning"); return; }
    if (editRoles.length === 0) { showToast("Please select at least one role", "warning"); return; }

    setSavingEdit(true);
    const finalCollege = editCollege === "Other" ? editCustomCollege.trim() : editCollege || null;

    const { error } = await supabase
      .from("teams")
      .update({
        name: editName.trim(),
        description: editDesc.trim(),
        college: finalCollege,
        max_members: editMaxMembers,
        skills: editSkills,
        roles_needed: editRoles,
      })
      .eq("id", team.id);

    if (error) {
      console.error(error);
      showToast(error.message, "error");
      setSavingEdit(false);
      return;
    }

    showToast("Team details updated successfully!", "success");
    setSavingEdit(false);
    setShowEditModal(false);
    if (refreshTeam) refreshTeam();
  };

  // Invite Builders Modal states
  const [showInviteBuilderModal, setShowInviteBuilderModal] = useState(false);
  const [inviteProfiles, setInviteProfiles] = useState<InviteProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [sessionInvitedIds, setSessionInvitedIds] = useState<Set<string>>(new Set());
  const [existingPendingInvites, setExistingPendingInvites] = useState<Set<string>>(new Set());

  const canSeeChat = isMember || isOwner;

  useEffect(() => {
    if (!showInviteBuilderModal) return;

    async function loadInviteData() {
      setLoadingProfiles(true);
      try {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, full_name, college, avatar_url, skills");
        setInviteProfiles(profilesData || []);

        const { data: pendingData } = await supabase
          .from("team_invites")
          .select("invited_user_id")
          .eq("team_id", team.id)
          .eq("status", "pending");

        const inviteIds = new Set((pendingData || []).map((i) => i.invited_user_id));
        setExistingPendingInvites(inviteIds);
      } catch (err) {
        console.error(err);
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
      console.error(error);
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
      console.error(error);
    } else if (data) {
      setDocumentId(data.id);
      setDocumentContent(data.content || "");
      setDocumentUpdatedAt(data.updated_at || null);
      setDocumentUpdatedBy(data.updated_by || null);
    } else {
      // Document row doesn't exist, create default
      const { data: newDoc, error: insertError } = await supabase
        .from("team_documents")
        .insert({ team_id: team.id, content: "# Brainstorm\nStart sharing ideas here..." })
        .select()
        .maybeSingle();
      if (insertError) {
         if (insertError.code === "23505") {
          // Concurrently created by another render/session, fetch it again
          const { data: retryDoc } = await supabase
            .from("team_documents")
            .select("*")
            .eq("team_id", team.id)
            .maybeSingle();
          if (retryDoc) {
            setDocumentId(retryDoc.id);
            setDocumentContent(retryDoc.content || "");
            setDocumentUpdatedAt(retryDoc.updated_at || null);
            setDocumentUpdatedBy(retryDoc.updated_by || null);
          }
        } else {
          console.error(insertError);
        }
      } else if (newDoc) {
        setDocumentId(newDoc.id);
        setDocumentContent(newDoc.content || "");
        setDocumentUpdatedAt(newDoc.updated_at || null);
        setDocumentUpdatedBy(newDoc.updated_by || null);
      }
    }
    setLoadingDocument(false);
  };

  // Fetch Resources (Links)
  const fetchLinks = async () => {
    setLoadingLinks(true);
    const { data, error } = await supabase
      .from("team_links")
      .select("*")
      .eq("team_id", team.id)
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
    } else {
      setLinks(data || []);
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
    if (!error && data) {
      setDeployments(data);
      // Trigger a ping check for each deployment URL
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
      // Clean up url by prepending protocol if missing
      let fetchUrl = url;
      if (!/^https?:\/\//i.test(url)) {
        fetchUrl = "https://" + url;
      }
      
      // Use client-side fetch (with no-cors to prevent blocking by CORS policies)
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
    } catch (e) {
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
    if (!error && data) {
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

      // Send notification if assigned to someone else
      if (taskAssignee && taskAssignee !== currentUserId) {
        const currentUserMember = members.find((m) => m.profiles.id === currentUserId);
        const currentUserName = currentUserMember?.profiles?.full_name || "A teammate";
        await supabase
          .from("notifications")
          .insert({
            user_id: taskAssignee,
            message: `${currentUserName} assigned you to task "${taskTitle.trim()}" in team "${team.name}"`,
            link: `/teams/${team.id}`,
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
            link: `/teams/${team.id}`,
          });
      }
    }
  };

  const [savingSubmission, setSavingSubmission] = useState(false);

  // Load and save submission checklist
  useEffect(() => {
    if (!team.id) return;
    
    const loadSubmission = async () => {
      try {
        const { data, error } = await supabase
          .from("team_submissions")
          .select("*")
          .eq("team_id", team.id)
          .maybeSingle();

        if (error) {
          console.error("Error loading team submissions:", error);
          return;
        }

        // Determine default checklist based on primary hackathon
        const primaryHackathon = listedHackathons && listedHackathons[0];
        const parsedChecklist = parseHackathonRequirements(primaryHackathon?.description);

        if (data) {
          setSubmission({
            projectTitle: data.project_title || "",
            demoUrl: data.demo_url || "",
            githubUrl: data.github_url || "",
            pitchVideoUrl: data.pitch_video_url || "",
            slidesUrl: data.slides_url || "",
            checklist: data.checklist && data.checklist.length > 0 ? data.checklist : parsedChecklist,
          });
        } else {
          setSubmission({
            projectTitle: "",
            demoUrl: "",
            githubUrl: "",
            pitchVideoUrl: "",
            slidesUrl: "",
            checklist: parsedChecklist,
          });
        }
      } catch (err) {
        console.error("Failed to load submission:", err);
      }
    };

    loadSubmission();
  }, [team.id, listedHackathons]);

  const handleSaveSubmission = async () => {
    setSavingSubmission(true);
    try {
      const { error } = await supabase
        .from("team_submissions")
        .upsert({
          team_id: team.id,
          project_title: submission.projectTitle,
          demo_url: submission.demoUrl,
          github_url: submission.githubUrl,
          pitch_video_url: submission.pitchVideoUrl,
          slides_url: submission.slidesUrl,
          checklist: submission.checklist,
          updated_at: new Date().toISOString(),
        });

      if (error) {
        showToast(error.message, "error");
      } else {
        showToast("Submission deck saved successfully!", "success");
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to save submission.", "error");
    } finally {
      setSavingSubmission(false);
    }
  };

  const handleToggleChecklist = (itemId: string) => {
    setSubmission((prev) => ({
      ...prev,
      checklist: prev.checklist.map((item) =>
        item.id === itemId ? { ...item, checked: !item.checked } : item
      ),
    }));
  };

  const handleAddChecklistItem = () => {
    if (!newChecklistItem.trim()) return;
    const newItem: ChecklistItem = {
      id: Date.now().toString(),
      label: newChecklistItem.trim(),
      checked: false,
    };
    setSubmission((prev) => ({
      ...prev,
      checklist: [...prev.checklist, newItem],
    }));
    setNewChecklistItem("");
  };

  const handleDeleteChecklistItem = (itemId: string) => {
    setSubmission((prev) => ({
      ...prev,
      checklist: prev.checklist.filter((item) => item.id !== itemId),
    }));
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
            link: `/teams/${team.id}`,
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
            link: `/teams/${team.id}`,
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
    const { data, error } = await supabase
      .from("team_documents")
      .update({ content: documentContent, updated_by: currentUserId, updated_at: new Date().toISOString() })
      .eq("id", documentId)
      .select()
      .maybeSingle();
    if (error) {
      console.error(error);
      showToast(error.message, "error");
    } else {
      if (data) {
        setDocumentUpdatedAt(data.updated_at || null);
        setDocumentUpdatedBy(data.updated_by || null);
      }
      showToast("Document saved!", "success");
    }
    setSavingDocument(false);
  };

  // Add Link
  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkTitle.trim() || !linkUrl.trim()) return;

    let formattedUrl = linkUrl.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = `https://${formattedUrl}`;
    }

    setSavingLink(true);
    const { error } = await supabase
      .from("team_links")
      .insert({
        team_id: team.id,
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

      if (canSeeChat) {
        // Use the RPC which handles missing conversation rows safely via
        // SECURITY DEFINER — direct table inserts are blocked by RLS.
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
      }

      setChatLoading(false);
    }

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team.id, canSeeChat]);

  // Realtime subscription for workspace updates
  useEffect(() => {
    if (!canSeeChat) return;

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
              setDocumentContent(updatedDoc.content);
              setDocumentUpdatedAt(updatedDoc.updated_at || null);
              setDocumentUpdatedBy(updatedDoc.updated_by || null);
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
    };
  }, [team.id, canSeeChat]);

  // Realtime Presence Tracking
  useEffect(() => {
    if (!canSeeChat || !team.id || !currentUserId) return;

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
    };
  }, [team.id, canSeeChat, currentUserId, members]);

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
    };
  }, [selectedTask]);

  // Markdown renderer helper
  const renderMarkdown = (text: string) => {
    if (!text) return null;
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      if (line.startsWith("# ")) {
        return <h1 key={idx} className="text-sm font-bold text-white mt-4 mb-2">{line.slice(2)}</h1>;
      }
      if (line.startsWith("## ")) {
        return <h2 key={idx} className="text-xs font-bold text-white mt-3 mb-2">{line.slice(3)}</h2>;
      }
      if (line.startsWith("### ")) {
        return <h3 key={idx} className="text-[11px] font-semibold text-white mt-2 mb-1">{line.slice(4)}</h3>;
      }
      if (line.startsWith("- ") || line.startsWith("* ")) {
        return <li key={idx} className="list-disc ml-5 text-zinc-300 text-xs mb-1">{line.slice(2)}</li>;
      }

      let content: React.ReactNode = line;
      if (line.includes("**")) {
        const parts = line.split("**");
        content = parts.map((part, pIdx) => {
          if (pIdx % 2 === 1) {
            return <strong key={pIdx} className="font-bold text-white">{part}</strong>;
          }
          return part;
        });
      }

      return <p key={idx} className="text-zinc-300 text-xs min-h-[1.2em] leading-relaxed mb-1">{content}</p>;
    });
  };

  // Helper renderers for tasks and links
  const renderTaskCard = (task: Task) => {
    const assignee = members.find((m) => m.profiles.id === task.assignee_id);
    return (
      <div
        key={task.id}
        draggable
        onDragStart={(e) => handleDragStart(e, task.id)}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (
            target.tagName === "SELECT" || 
            target.tagName === "OPTION" || 
            target.tagName === "INPUT" || 
            target.tagName === "BUTTON" || 
            target.closest("button") || 
            target.closest("select") || 
            target.closest("input")
          ) {
            return;
          }
          setSelectedTask(task);
        }}
        className="p-3 bg-zinc-900/80 border border-zinc-800 rounded-lg space-y-3 relative group/card hover:border-zinc-600 transition-all cursor-pointer shadow-md hover:shadow-lg"
      >
        <div className="flex justify-between items-start gap-2">
          <h4 className="text-xs font-semibold text-white break-words pr-4">{task.title}</h4>
          <button
            onClick={() => handleDeleteTask(task.id)}
            className="opacity-0 group-hover/card:opacity-100 absolute top-2 right-2 text-zinc-600 hover:text-rose-400 transition-opacity"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {task.description && (
          <p className="text-[10px] text-zinc-400 leading-relaxed break-words">{task.description}</p>
        )}
        <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
          <div className="flex items-center gap-1">
            <select
              value={task.status}
              onChange={(e) => handleUpdateTaskStatus(task.id, e.target.value as "todo" | "in_progress" | "completed")}
              className="text-[9px] font-semibold bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-zinc-300 focus:outline-none hover:border-zinc-700 cursor-pointer"
            >
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>

            <span className={`text-[8px] font-semibold px-1 py-0.5 rounded border uppercase ${
              task.priority === "high"
                ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                : task.priority === "medium"
                  ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400"
            }`}>
              {task.priority}
            </span>
          </div>

          <div className="flex items-center gap-1.5 min-w-0">
            {assignee ? (
              assignee.profiles.avatar_url ? (
                <img
                  src={assignee.profiles.avatar_url}
                  alt={assignee.profiles.full_name}
                  className="w-4 h-4 rounded-full object-cover border border-zinc-800 shrink-0"
                />
              ) : (
                <div className="w-4 h-4 rounded-full bg-zinc-850 border border-zinc-700 flex items-center justify-center font-bold text-zinc-400 text-[8px] shrink-0">
                  {assignee.profiles.full_name.charAt(0)}
                </div>
              )
            ) : (
              <div className="w-4 h-4 rounded-full bg-zinc-950 border border-zinc-900 flex items-center justify-center text-zinc-600 text-[8px] shrink-0">
                👤
              </div>
            )}
            <select
              value={task.assignee_id || ""}
              onChange={(e) => handleUpdateTaskAssignee(task.id, e.target.value || null)}
              className="text-[9px] font-semibold bg-zinc-955 border border-zinc-800 rounded px-1 py-0.5 text-zinc-300 focus:outline-none hover:border-zinc-700 truncate max-w-[85px] cursor-pointer"
            >
              <option value="">Assignee</option>
              {members.map((m) => (
                <option key={m.profiles.id} value={m.profiles.id}>
                  {m.profiles.full_name.split(" ")[0]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Due Date Indicator & Date Input */}
        <div className="flex items-center justify-between border-t border-zinc-900/60 pt-2 mt-1">
          {(() => {
            if (!task.due_date) return <span className="text-[9px] text-zinc-600 font-mono italic">No due date</span>;
            const dueDate = new Date(task.due_date);
            const now = new Date();
            const isOverdue = task.status !== "completed" && dueDate < now;
            const formatted = dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric" });
            return (
              <div className={`flex items-center gap-1 text-[9px] font-semibold font-mono ${
                isOverdue ? "text-rose-455" : "text-zinc-500"
              }`}>
                <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="truncate">{formatted} {isOverdue ? "(Overdue)" : ""}</span>
              </div>
            );
          })()}

          <input
            type="date"
            value={task.due_date ? task.due_date.split("T")[0] : ""}
            onChange={(e) => handleUpdateTaskDueDate(task.id, e.target.value || null)}
            className="text-[9px] bg-zinc-950 border border-zinc-900 rounded px-1.5 py-0.5 text-zinc-500 focus:outline-none hover:border-zinc-800 cursor-pointer w-20 leading-none shrink-0"
          />
        </div>
      </div>
    );
  };

  const renderCategoryPanel = (cat: "design" | "repo" | "document" | "other", title: string, iconPath: string) => {
    const catLinks = links.filter((l) => l.category === cat);
    return (
      <div className="card card-static p-4 flex flex-col justify-between min-h-[220px]">
        <div>
          <div className="flex items-center gap-2 mb-4 border-b border-zinc-900 pb-2">
            <svg className="w-4 h-4 text-zinc-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
            </svg>
            <h4 className="text-xs font-semibold text-white truncate">{title}</h4>
          </div>

          <div className="space-y-2 overflow-y-auto max-h-[140px] pr-0.5">
            {catLinks.map((link) => (
              <div key={link.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-zinc-950/60 border border-zinc-900 hover:border-zinc-850 transition-colors group/link">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-zinc-300 hover:text-white truncate font-medium flex-1 underline underline-offset-2"
                >
                  {link.title}
                </a>
                <button
                  onClick={() => handleDeleteLink(link.id)}
                  className="opacity-0 group-hover/link:opacity-100 text-zinc-650 hover:text-rose-400 transition-opacity shrink-0"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}

            {catLinks.length === 0 && (
              <p className="text-[9px] text-zinc-600 italic py-8 text-center font-mono">No links saved</p>
            )}
          </div>
        </div>
      </div>
    );
  };


  const handleLeaveTeam = (memberId: string) => {

    if (isOwner) {
      confirm({
        title: "Disband Team",
        message: "As the team leader, leaving will disband the team completely. Are you sure you want to proceed?",
        confirmText: "Leave & Disband",
        cancelText: "Cancel",
        onConfirm: () => {
          if (disbandTeam) disbandTeam();
        },
      });
    } else {
      confirm({
        title: "Leave Team",
        message: "Are you sure you want to leave this team?",
        confirmText: "Leave",
        cancelText: "Cancel",
        onConfirm: () => {
          if (leaveTeam) {
            leaveTeam(memberId);
          } else {
            removeMember(memberId);
          }
        },
      });
    }
  };

  // Build known profiles map from members so ChatThread doesn't refetch

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

    // 1. Tasks
    (tasks || []).forEach((t) => {
      const creator = members.find((m) => m.profiles.id === t.assignee_id)?.profiles; // Fallback to assignee if creator id not tracked, or assignee as default user
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

    // 3. Resources (Links)
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

    // 4. Brainstorm Document Sync
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

    // Sort by timestamp descending
    return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  };

  const teamDesiredSkills = team.skills || [];
  const teamMemberSkills = Array.from(new Set(members.map((m) => m.profiles?.skills || []).flat().map(s => s.trim().toLowerCase())));

  const coveredTeamSkills = teamDesiredSkills.filter((s) => teamMemberSkills.includes(s.trim().toLowerCase()));
  const missingTeamSkills = teamDesiredSkills.filter((s) => !teamMemberSkills.includes(s.trim().toLowerCase()));

  const totalTasksCount = tasks.length;
  const completedTasksCount = tasks.filter((t) => t.status === "completed").length;
  const taskProgressPct = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0;

  const totalChecklistCount = submission?.checklist?.length || 0;
  const completedChecklistCount = submission?.checklist?.filter((c) => c.checked).length || 0;
  const checklistProgressPct = totalChecklistCount > 0 ? Math.round((completedChecklistCount / totalChecklistCount) * 100) : 0;

  return (
    <main className="max-w-7xl mx-auto px-6 pt-24 pb-12">
      {pendingInvite && inviteStatus === "pending" && (
        <div className="mb-6 animate-fade-in-up p-4 bg-gradient-to-r from-violet-950/40 to-indigo-950/40 border border-violet-500/30 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">✉</span>
            <div className="text-left">
              <p className="text-xs font-semibold text-white">You have a pending invite to join this team</p>
              <p className="text-[10px] text-zinc-400">Review the team details below and make your decision.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleAcceptInvite}
              disabled={inviteActionLoading}
              className="flex-1 sm:flex-initial px-4 py-2 text-xs font-bold bg-white text-black hover:bg-zinc-200 rounded-lg transition-colors disabled:opacity-50"
            >
              {inviteActionLoading ? "Joining..." : "Accept"}
            </button>
            <button
              onClick={handleRejectInvite}
              disabled={inviteActionLoading}
              className="flex-1 sm:flex-initial px-4 py-2 text-xs font-bold bg-zinc-900 hover:bg-zinc-850 text-rose-400 border border-zinc-800 rounded-lg transition-colors disabled:opacity-50"
            >
              {inviteActionLoading ? "Declining..." : "Decline"}
            </button>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="mb-6 animate-fade-in-up">
        <Link
          href="/teams"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white transition-colors mb-2 font-mono uppercase tracking-wider"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
            />
          </svg>
          Back to teams
        </Link>
      </div>

      {/* Main Grid */}
      <section className="grid lg:grid-cols-[2fr_1fr] gap-6 mb-10">
        {/* Left - Team Info */}
        <div className="card card-static p-6 animate-fade-in-up">
          <p className="section-label mb-3">TEAM PROFILE</p>

          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-white mb-3">
            {team.name}
          </h1>

          <p className="text-sm text-zinc-400 leading-relaxed mb-8">
            {team.description || "No description provided."}
          </p>

          {/* Match score */}
          {typeof matchScore === "number" && team.skills && team.skills.length > 0 && (
            <div className="mb-8 p-4 rounded-lg bg-zinc-900/40 border border-zinc-800">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-xs font-semibold text-zinc-300">
                  Your Skill Match
                </h3>
                <span
                  className={`text-lg font-bold ${
                    matchScore >= 70
                      ? "text-emerald-400"
                      : matchScore >= 40
                      ? "text-amber-400"
                      : "text-zinc-500"
                  }`}
                >
                  {matchScore}%
                </span>
              </div>

              {matchedSkills.length > 0 && (
                <div className="mb-2">
                  <p className="text-[10px] text-zinc-500 mb-1">You have</p>
                  <div className="flex flex-wrap gap-1">
                    {matchedSkills.map((s) => (
                      <span key={s} className="badge badge-success text-[10px] py-0.5 px-1.5">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {missingSkills.length > 0 && (
                <div>
                  <p className="text-[10px] text-zinc-500 mb-1">Still needed</p>
                  <div className="flex flex-wrap gap-1">
                    {missingSkills.map((s) => (
                      <span key={s} className="badge text-[10px] text-zinc-500 py-0.5 px-1.5">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Skills */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-zinc-300 mb-2">
              Skills Needed
            </h3>

            <div className="flex flex-wrap gap-1.5">
              {team.skills?.length ? (
                team.skills.map((skill) => (
                  <span key={skill} className="badge badge-primary text-[10px] py-0.5 px-1.5">
                    {skill}
                  </span>
                ))
              ) : (
                <span className="badge text-[10px] text-zinc-600">No skills listed</span>
              )}
            </div>
          </div>

          {/* Roles */}
          <div>
            <h3 className="text-xs font-semibold text-zinc-300 mb-2">
              Roles Needed
            </h3>

            <div className="flex flex-wrap gap-1.5">
              {team.roles_needed?.length ? (
                team.roles_needed.map((role) => (
                  <span key={role} className="badge text-[10px] py-0.5 px-1.5">
                    {role}
                  </span>
                ))
              ) : (
                <span className="badge text-[10px] text-zinc-600">No roles listed</span>
              )}
            </div>
          </div>
        </div>
        {/* Right - Stats & Actions */}
        <div className="space-y-6">
          <div className="card card-static p-6 animate-fade-in-up stagger-1 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-6">
                <span className={`badge text-[10px] ${
                  teamFull 
                    ? "badge-error" 
                    : (team.is_recruiting === false) 
                      ? "bg-zinc-800 text-zinc-400 border border-zinc-700" 
                      : "badge-success"
                }`}>
                  {teamFull ? "FULL" : (team.is_recruiting === false) ? "CLOSED" : "RECRUITING"}
                </span>


                <div className="text-right">
                  <div className="text-xl font-bold text-white">
                    {members.length}/{team.max_members}
                  </div>
                  <div className="text-zinc-500 text-xs font-mono uppercase">Members</div>
                </div>
              </div>

              {/* Stats */}
              <div className="space-y-4 mb-6 border-t border-zinc-900 pt-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.485a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-zinc-500 font-mono uppercase">College</p>
                    <p className="text-xs font-medium text-white truncate">
                      {team.college || "N/A"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-zinc-500 font-mono uppercase">Hackathon</p>
                    <p className="text-xs font-medium text-white truncate">
                      {listedHackathons.length > 0
                        ? (listedHackathons.length === 1 ? listedHackathons[0].name : `${listedHackathons.length} Hackathons`)
                        : (team.hackathon_name || "N/A")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72M12 12a3.75 3.75 0 100-7.5A3.75 3.75 0 0012 12zM3 20.25v-1.5a6 6 0 016-6h1.5" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500 font-mono uppercase">Open Spots</p>
                    <p className="text-xs font-medium text-white">
                      {Math.max(team.max_members - members.length, 0)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {!isMember && !isOwner && !teamFull && (
              team.is_recruiting === false ? (
                <button
                  disabled
                  className="btn bg-zinc-800 text-zinc-500 border border-zinc-800/80 w-full cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                  <span>Recruitment Closed</span>
                </button>
              ) : (
                <button
                  onClick={requestToJoin}
                  disabled={requestLoading || requestSent}
                  className="btn btn-primary w-full"
                >
                  {requestSent ? (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      <span>Request Sent</span>
                    </>
                  ) : requestLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span>Sending...</span>
                    </div>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                      <span>Request To Join</span>
                    </>
                  )}
                </button>
              )
            )}


            {isOwner && (
              <>
                <button
                  type="button"
                  onClick={() => setShowEditModal(true)}
                  className="btn btn-secondary w-full mb-2 flex items-center justify-center gap-1.5"
                >
                  <svg className="w-4.5 h-4.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                  <span>Edit Team Details</span>
                </button>

                <Link
                  href={`/teams/${team.id}/requests`}
                  className="btn btn-secondary w-full mb-2"
                >
                  <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Manage Requests
                </Link>

                <button
                  type="button"
                  onClick={() => setShowInviteBuilderModal(true)}
                  className="btn btn-secondary w-full mb-2 flex items-center justify-center gap-1.5"
                >
                  <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235A10.18 10.18 0 0112.5 15c2.2 0 4.254.688 5.94 1.855" />
                  </svg>
                  <span>Invite builders to team</span>
                </button>

                <button
                  type="button"
                  onClick={toggleRecruiting}
                  className="btn btn-secondary w-full mb-2 flex items-center justify-center gap-1.5"
                >
                  {team.is_recruiting === false ? (
                    <>
                      <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Open Recruitment</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                      <span>Close Recruitment</span>
                    </>
                  )}
                </button>

              </>
            )}
          </div>

          {/* Hackathons Section */}
          <div className="card card-static p-6 animate-fade-in-up stagger-2">
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-zinc-900">
              <div className="flex items-center justify-center w-8 h-8 rounded bg-zinc-900 border border-zinc-800 text-violet-400">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-zinc-500 font-mono uppercase">Hackathon Listings</p>
                <p className="text-xs font-semibold text-white">
                  Listed in {listedHackathons.length} hackathon{listedHackathons.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {listedHackathons.length > 0 ? (
              <div className="space-y-3">
                {listedHackathons.map((hackathon) => (
                  <div key={hackathon.id} className="p-3 rounded-lg bg-zinc-900/40 border border-zinc-800/60 hover:border-zinc-700/80 transition-all flex flex-col gap-2">
                    <Link
                      href={`/hackathons/${hackathon.id}`}
                      className="text-xs font-medium text-white hover:text-violet-400 transition-colors line-clamp-2"
                    >
                      {hackathon.name}
                    </Link>
                    {isOwner && unlinkHackathon && (
                      <button
                        onClick={() => unlinkHackathon(hackathon.id)}
                        className="btn btn-danger btn-sm py-1 px-2 text-[10px] w-full flex items-center justify-center gap-1 mt-1"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
                        </svg>
                        Remove Listing
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-500 text-center py-2">
                This team is not currently listed in any hackathons.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Team Members Section */}
      <section className="mb-10 animate-fade-in-up stagger-2">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="section-label mb-1">TEAM</p>
            <h2 className="text-lg font-semibold text-white">Team Members</h2>
          </div>

          <span className="text-zinc-500 text-xs font-mono">{members.length} builders</span>
        </div>

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {members.map((member, i) => (
            <div
              key={member.id}
              className={`card card-static p-4 animate-fade-in-up stagger-${
                Math.min(i % 6, 6) + 1
              } flex flex-col justify-between`}
            >
              <div className="flex items-center gap-3">
                {member.profiles?.avatar_url ? (
                  <img
                    src={member.profiles.avatar_url}
                    alt={member.profiles.full_name}
                    className="w-10 h-10 rounded object-cover border border-zinc-800"
                  />
                ) : (
                  <div className="w-10 h-10 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center font-bold text-zinc-400 text-xs">
                    {member.profiles?.full_name?.charAt(0)}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Link
                      href={`/profile/${member.profiles.id}`}
                      className="font-semibold text-sm text-white hover:text-zinc-300 transition-colors truncate"
                    >
                      {member.profiles?.full_name}
                    </Link>

                    <span
                      className={`badge text-[10px] py-0.5 px-1.5 ${
                        member.role === "owner"
                          ? "badge-primary"
                          : "badge-success"
                      }`}
                    >
                      {member.role}
                    </span>
                  </div>

                  <p className="text-zinc-500 text-xs truncate font-mono">
                    {member.profiles?.email}
                  </p>

                  {/* Project Role Badge */}
                  <div className="mt-2 flex items-center gap-1.5 min-h-[24px]">
                    {isEditingProjectRoleForMemberId === member.id ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <select
                          value={isCustomProjectRole ? "Custom..." : projectRoleInput}
                          onChange={(e) => {
                            if (e.target.value === "Custom...") {
                              setIsCustomProjectRole(true);
                              setProjectRoleInput("");
                            } else {
                              setIsCustomProjectRole(false);
                              setProjectRoleInput(e.target.value);
                            }
                          }}
                          className="bg-zinc-950 border border-zinc-800 text-[10px] text-white rounded px-1.5 py-0.5 focus:outline-none focus:border-zinc-700"
                        >
                          <option value="Developer">Developer</option>
                          <option value="Frontend Developer">Frontend Developer</option>
                          <option value="Backend Developer">Backend Developer</option>
                          <option value="Full Stack Developer">Full Stack Developer</option>
                          <option value="UI/UX Designer">UI/UX Designer</option>
                          <option value="AI/ML Engineer">AI/ML Engineer</option>
                          <option value="AI Lead">AI Lead</option>
                          <option value="Project Manager">Project Manager</option>
                          <option value="Custom...">Custom...</option>
                        </select>
                        
                        {isCustomProjectRole && (
                          <input
                            type="text"
                            placeholder="Role..."
                            value={projectRoleInput}
                            onChange={(e) => setProjectRoleInput(e.target.value)}
                            className="bg-zinc-950 border border-zinc-800 text-[10px] text-white rounded px-1.5 py-0.5 w-20 focus:outline-none focus:border-zinc-700"
                          />
                        )}
                        
                        <button
                          onClick={() => handleSaveProjectRole(member.id)}
                          className="text-[9px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded px-1.5 py-0.5 font-semibold"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setIsEditingProjectRoleForMemberId(null)}
                          className="text-[9px] bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700 rounded px-1.5 py-0.5"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 group/role">
                        <span className="text-[10px] font-semibold font-mono uppercase bg-zinc-900 border border-zinc-800/80 text-zinc-400 rounded px-2 py-0.5">
                          {member.project_role || "Developer"}
                        </span>
                        
                        {isOwner && (
                          <button
                            onClick={() => {
                              setIsEditingProjectRoleForMemberId(member.id);
                              setProjectRoleInput(member.project_role || "Developer");
                              setIsCustomProjectRole(
                                !["Developer", "Frontend Developer", "Backend Developer", "Full Stack Developer", "UI/UX Designer", "AI/ML Engineer", "AI Lead", "Project Manager"].includes(member.project_role || "Developer")
                              );
                            }}
                            className="p-1 text-zinc-600 hover:text-white transition-colors opacity-0 group-hover/role:opacity-100 focus:opacity-100"
                            title="Edit project role"
                          >
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                            </svg>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {member.profiles.id === currentUserId ? (
                <button
                  onClick={() => handleLeaveTeam(member.id)}
                  className="btn btn-danger btn-sm w-full mt-3"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                  </svg>
                  {isOwner ? "Leave & Disband Team" : "Leave Team"}
                </button>
              ) : (
                isOwner && member.profiles.id !== team.owner_id && (
                  <button
                    onClick={() => removeMember(member.id)}
                    className="btn btn-danger btn-sm w-full mt-3"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Remove Member
                  </button>
                )
              )}

            </div>
          ))}
        </div>

        {members.length === 0 && (
          <div className="card card-static p-8 text-center">
            <p className="text-zinc-500 text-xs">No team members yet.</p>
          </div>
        )}
      </section>

      {/* Team Collaborate & Workspace Section — members & owner only */}
      {canSeeChat && (
        <section className="animate-fade-in-up stagger-3 space-y-6">
          {/* Top Countdown & Milestone Dashboard banner */}
          {activeHackathon && (
            <div className="card p-6 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border border-zinc-800/80 rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-6 text-left shadow-2xl relative overflow-hidden group">
              {/* Background accent glow */}
              <div className="absolute -right-24 -top-24 w-48 h-48 rounded-full bg-violet-600/10 blur-3xl pointer-events-none group-hover:bg-violet-600/15 transition-all duration-700" />
              <div className="absolute -left-24 -bottom-24 w-48 h-48 rounded-full bg-emerald-600/5 blur-3xl pointer-events-none group-hover:bg-emerald-600/10 transition-all duration-700" />

              <div className="flex flex-col sm:flex-row sm:items-center gap-6 flex-1 z-10">
                <div className="space-y-1">
                  <span className="text-[9px] font-mono font-semibold tracking-widest text-emerald-400 uppercase flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Event Track Cockpit
                  </span>
                  <h3 className="text-sm font-bold text-white tracking-tight leading-snug">
                    {activeHackathon.name}
                  </h3>
                  <p className="text-[10px] text-zinc-500 font-medium">Chronological hackathon workspace coordination dashboard.</p>
                </div>

                {/* Digital Pods Countdown Timer */}
                {!countdownParts.ended ? (
                  <div className="flex gap-2 bg-black/40 border border-zinc-800/60 p-2 rounded-xl backdrop-blur-sm shadow-inner">
                    {/* Days */}
                    <div className="flex flex-col items-center">
                      <div className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 min-w-[42px] text-center">
                        <span className="font-mono text-xs font-bold text-white tracking-tight">
                          {String(countdownParts.days).padStart(2, "0")}
                        </span>
                      </div>
                      <span className="text-[7px] font-mono text-zinc-500 uppercase tracking-widest mt-1">Days</span>
                    </div>

                    <span className="text-zinc-700 self-center font-bold text-xs -mt-3">:</span>

                    {/* Hours */}
                    <div className="flex flex-col items-center">
                      <div className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 min-w-[42px] text-center">
                        <span className="font-mono text-xs font-bold text-violet-400 tracking-tight">
                          {String(countdownParts.hours).padStart(2, "0")}
                        </span>
                      </div>
                      <span className="text-[7px] font-mono text-zinc-500 uppercase tracking-widest mt-1">Hours</span>
                    </div>

                    <span className="text-zinc-700 self-center font-bold text-xs -mt-3">:</span>

                    {/* Mins */}
                    <div className="flex flex-col items-center">
                      <div className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 min-w-[42px] text-center">
                        <span className="font-mono text-xs font-bold text-violet-300 tracking-tight">
                          {String(countdownParts.minutes).padStart(2, "0")}
                        </span>
                      </div>
                      <span className="text-[7px] font-mono text-zinc-500 uppercase tracking-widest mt-1">Mins</span>
                    </div>

                    <span className="text-zinc-700 self-center font-bold text-xs -mt-3">:</span>

                    {/* Secs */}
                    <div className="flex flex-col items-center">
                      <div className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 min-w-[42px] text-center">
                        <span className="font-mono text-xs font-bold text-indigo-400 tracking-tight">
                          {String(countdownParts.seconds).padStart(2, "0")}
                        </span>
                      </div>
                      <span className="text-[7px] font-mono text-zinc-500 uppercase tracking-widest mt-1">Secs</span>
                    </div>
                  </div>
                ) : (
                  <span className="text-[9px] font-mono font-bold text-zinc-400 bg-zinc-800 border border-zinc-700 px-3 py-1 rounded-full uppercase tracking-wider">
                    Event Closed
                  </span>
                )}
              </div>

              {/* Metrics */}
              <div className="flex items-center gap-6 z-10 flex-wrap shrink-0">
                {/* Tasks Progress Gauge */}
                <div className="flex flex-col gap-1.5 min-w-[125px]">
                  <div className="flex items-center justify-between text-[9px] font-mono">
                    <span className="text-zinc-500 uppercase tracking-wider">Tasks</span>
                    <span className="text-zinc-350 font-bold">{completedTasksCount}/{totalTasksCount} ({taskProgressPct}%)</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-950 border border-zinc-900 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(139,92,246,0.3)]" 
                      style={{ width: `${taskProgressPct}%` }}
                    />
                  </div>
                </div>

                {/* Submissions checklist Progress Gauge */}
                <div className="flex flex-col gap-1.5 min-w-[125px]">
                  <div className="flex items-center justify-between text-[9px] font-mono">
                    <span className="text-zinc-500 uppercase tracking-wider">Milestones</span>
                    <span className="text-zinc-350 font-bold">{completedChecklistCount}/{totalChecklistCount} ({checklistProgressPct}%)</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-950 border border-zinc-900 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]" 
                      style={{ width: `${checklistProgressPct}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Skills Gap Visualizer */}
          {teamDesiredSkills.length > 0 && (() => {
            const skillCoveragePct = teamDesiredSkills.length > 0 ? Math.round((coveredTeamSkills.length / teamDesiredSkills.length) * 100) : 100;
            return (
              <div className="card p-6 bg-zinc-900/10 border border-zinc-800/80 rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-6 text-left shadow-lg relative overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center gap-6 flex-1">
                  {/* Glowing dynamic match circle widget */}
                  <div className="relative w-16 h-16 rounded-full border-2 border-zinc-850 flex items-center justify-center shrink-0 bg-zinc-950/60 shadow-inner group">
                    <div className="absolute inset-0.5 rounded-full border border-dashed border-zinc-800 animate-[spin_20s_linear_infinite]" />
                    <div className="text-center z-10">
                      <span className="text-[11px] font-bold text-white block -mb-0.5">{skillCoveragePct}%</span>
                      <span className="text-[6px] font-mono text-zinc-500 uppercase tracking-widest block">Match</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[9px] font-mono font-semibold tracking-widest text-amber-400 uppercase flex items-center gap-1.5">
                      📊 Stack Fit Matrix
                    </span>
                    <h4 className="text-xs font-bold text-zinc-200">Team Skills Coverage Radar</h4>
                    <p className="text-[10px] text-zinc-500 max-w-md leading-relaxed">
                      Matches requested team skills against current builders. Recruiting developers with missing competencies boosts event readiness.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-6 items-center shrink-0 z-10">
                  <div className="space-y-2">
                    <span className="text-[8px] text-zinc-500 font-mono uppercase block font-bold tracking-wider">Acquired Stack ({coveredTeamSkills.length})</span>
                    <div className="flex flex-wrap gap-1 max-w-[240px]">
                      {coveredTeamSkills.map(s => (
                        <span key={s} className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[8px] font-mono uppercase font-bold flex items-center gap-1">
                          <span className="w-1 h-1 rounded-full bg-emerald-400" />
                          {s}
                        </span>
                      ))}
                      {coveredTeamSkills.length === 0 && <span className="text-[9px] text-zinc-650 italic">None yet</span>}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[8px] text-zinc-500 font-mono uppercase block font-bold tracking-wider text-rose-400">Needed Stack ({missingTeamSkills.length})</span>
                    <div className="flex flex-wrap gap-1 max-w-[240px]">
                      {missingTeamSkills.map(s => (
                        <span key={s} className="px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/25 text-rose-400 text-[8px] font-mono uppercase font-bold flex items-center gap-1 animate-pulse">
                          <span className="w-1 h-1 rounded-full bg-rose-400" />
                          {s}
                        </span>
                      ))}
                      {missingTeamSkills.length === 0 && <span className="text-[8px] text-emerald-400 italic font-medium">All stack requirements met</span>}
                    </div>
                  </div>

                  {isOwner && missingTeamSkills.length > 0 && (
                    <button
                      onClick={() => setShowInviteBuilderModal(true)}
                      className="btn btn-secondary text-[10px] px-3.5 py-1.5 whitespace-nowrap bg-zinc-950 border-zinc-800 hover:border-zinc-700 hover:text-white transition-all rounded-lg font-mono uppercase tracking-wider"
                    >
                      Find Builders
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Tab Selector */}
          <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div>
                <p className="section-label mb-0.5 font-mono uppercase tracking-wider">Workspace</p>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Team Workspace Hub</h2>
              </div>
              
              {onlineTeammates.length > 0 && (
                <div className="flex items-center -space-x-1.5 overflow-hidden p-1 bg-zinc-950/20 rounded-full border border-zinc-900/60 ml-2">
                  {onlineTeammates.map((u) => (
                    <div key={u.id} className="relative group shrink-0" title={`${u.name} (Online)`}>
                      {u.avatarUrl ? (
                        <img
                          src={u.avatarUrl}
                          alt={u.name}
                          className="w-5 h-5 rounded-full object-cover border border-zinc-900"
                        />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-900 flex items-center justify-center font-bold text-zinc-400 text-[8px]">
                          {u.name.charAt(0)}
                        </div>
                      )}
                      <span className="absolute bottom-0 right-0 block h-1.5 w-1.5 rounded-full bg-emerald-400 ring-1 ring-zinc-950 animate-pulse" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex bg-zinc-950/60 p-0.5 rounded-lg border border-zinc-800 overflow-x-auto whitespace-nowrap scrollbar-none max-w-full">
              <button
                onClick={() => setWorkspaceTab("chat")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors shrink-0 ${
                  workspaceTab === "chat"
                    ? "bg-zinc-850 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Chat
              </button>
              <button
                onClick={() => setWorkspaceTab("tasks")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors shrink-0 ${
                  workspaceTab === "tasks"
                    ? "bg-zinc-850 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Tasks
              </button>
              <button
                onClick={() => setWorkspaceTab("brainstorm")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors shrink-0 ${
                  workspaceTab === "brainstorm"
                    ? "bg-zinc-850 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Brainstorm
              </button>
              <button
                onClick={() => setWorkspaceTab("resources")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors shrink-0 ${
                  workspaceTab === "resources"
                    ? "bg-zinc-850 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Resources
              </button>
              <button
                onClick={() => setWorkspaceTab("submission")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors shrink-0 ${
                  workspaceTab === "submission"
                    ? "bg-zinc-850 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Submission
              </button>
               <button
                onClick={() => setWorkspaceTab("github")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors shrink-0 ${
                  workspaceTab === "github"
                    ? "bg-zinc-850 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                GitHub Sync
              </button>
              <button
                onClick={() => setWorkspaceTab("deployments")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors shrink-0 ${
                  workspaceTab === "deployments"
                    ? "bg-zinc-850 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                🚀 Deployments
              </button>
              <button
                onClick={() => setWorkspaceTab("activity")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors shrink-0 ${
                  workspaceTab === "activity"
                    ? "bg-zinc-850 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Activity Feed
              </button>
            </div>
          </div>

          {/* Tab Contents */}
          <div className="animate-fade-in">
            {/* 1. CHAT TAB */}
            {workspaceTab === "chat" && (
              chatLoading ? (
                <div className="card card-static p-8 text-center bg-[var(--surface-1)] border border-[var(--card-border)]">
                  <p className="text-[var(--text-tertiary)] text-xs">Loading chat...</p>
                </div>
              ) : conversationId && currentUserId ? (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <span className="badge badge-success text-[10px] py-0.5 px-1.5 bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
                      Live Chat Thread
                    </span>
                  </div>
                  <ChatThread
                    conversationId={conversationId}
                    currentUserId={currentUserId}
                    knownProfiles={knownProfiles}
                    height="400px"
                  />
                </div>
              ) : (
                <div className="card card-static p-8 text-center bg-[var(--surface-1)] border border-[var(--card-border)]">
                  <p className="text-[var(--text-tertiary)] text-xs">
                    Chat isn&apos;t available for this team yet.
                  </p>
                </div>
              )
            )}

            {/* 2. TASKS TAB */}
            {workspaceTab === "tasks" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-mono font-semibold text-zinc-400 uppercase tracking-widest">Collaborative Kanban</h3>
                  <button
                    onClick={() => setShowAddTaskModal(true)}
                    className="btn btn-primary btn-sm text-xs py-1 px-3 flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    Add Task
                  </button>
                </div>

                {loadingTasks ? (
                  <div className="card card-static p-12 text-center">
                    <div className="w-5 h-5 border-2 border-zinc-800 border-t-white rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-zinc-500 text-xs font-mono uppercase">Loading tasks...</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Visual Workload & Task Analytics Dashboard */}
                    {tasks.length > 0 && (
                      <div className="grid lg:grid-cols-3 gap-4 bg-zinc-950/20 border border-zinc-800/80 rounded-xl p-4 text-left">
                        {/* 1. Teammate Workload Balance */}
                        <div className="space-y-2 border-r border-zinc-900/60 pr-4">
                          <span className="text-[9px] font-mono font-semibold tracking-wider text-violet-400 uppercase">Teammate Workload Balance</span>
                          <div className="space-y-1.5 max-h-[100px] overflow-y-auto pr-1">
                            {members.map((m) => {
                              const assignedTasks = tasks.filter((t) => t.assignee_id === m.profiles.id);
                              const completed = assignedTasks.filter((t) => t.status === "completed").length;
                              const pending = assignedTasks.length - completed;
                              const taskSharePct = tasks.length > 0 ? Math.round((assignedTasks.length / tasks.length) * 100) : 0;
                              
                              return (
                                <div key={m.id} className="text-[10px] space-y-1">
                                  <div className="flex justify-between items-center text-zinc-350">
                                    <span className="font-medium truncate max-w-[100px]">{m.profiles.full_name.split(" ")[0]}</span>
                                    <span className="font-mono text-zinc-500">{pending} active / {completed} done ({taskSharePct}%)</span>
                                  </div>
                                  <div className="w-full h-1 bg-zinc-950 rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-violet-500 rounded-full" 
                                      style={{ width: `${taskSharePct}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* 2. Priority Density */}
                        <div className="space-y-2 border-r border-zinc-900/60 px-4">
                          <span className="text-[9px] font-mono font-semibold tracking-wider text-amber-400 uppercase">Priority Density</span>
                          <div className="space-y-2 text-[10px]">
                            {/* High */}
                            <div className="flex items-center justify-between text-zinc-350">
                              <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                <span>High Priority</span>
                              </div>
                              <span className="font-mono font-bold text-rose-400">{tasks.filter((t) => t.priority === "high").length} tasks</span>
                            </div>
                            {/* Medium */}
                            <div className="flex items-center justify-between text-zinc-350">
                              <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                <span>Medium Priority</span>
                              </div>
                              <span className="font-mono font-bold text-amber-400">{tasks.filter((t) => t.priority === "medium").length} tasks</span>
                            </div>
                            {/* Low */}
                            <div className="flex items-center justify-between text-zinc-350">
                              <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                                <span>Low Priority</span>
                              </div>
                              <span className="font-mono font-bold text-zinc-400">{tasks.filter((t) => t.priority === "low").length} tasks</span>
                            </div>
                          </div>
                        </div>

                        {/* 3. Event Velocity Alerts */}
                        <div className="space-y-2 pl-4">
                          <span className="text-[9px] font-mono font-semibold tracking-wider text-rose-400 uppercase">Velocity Alerts & Deadlines</span>
                          <div className="space-y-1.5 max-h-[100px] overflow-y-auto pr-1 text-[9px] font-mono">
                            {(() => {
                              const now = new Date();
                              const alerts = tasks.filter((t) => t.status !== "completed" && t.due_date).map((t) => {
                                const due = new Date(t.due_date!);
                                const diffHrs = (due.getTime() - now.getTime()) / (1000 * 60 * 60);
                                if (diffHrs < 0) {
                                  return { type: "overdue", label: "OVERDUE", title: t.title, color: "text-rose-400" };
                                } else if (diffHrs <= 24) {
                                  return { type: "soon", label: "DUE SOON", title: t.title, color: "text-amber-400" };
                                }
                                return null;
                              }).filter(Boolean);

                              if (alerts.length === 0) {
                                return <p className="text-zinc-650 italic py-2 text-center">All tasks on track</p>;
                              }

                              return alerts.map((alert, idx) => (
                                <div key={idx} className={`flex items-center gap-1.5 truncate ${alert!.color}`}>
                                  <span>⚠</span>
                                  <span className="font-bold">[{alert!.label}]</span>
                                  <span className="text-zinc-400 truncate flex-1">{alert!.title}</span>
                                </div>
                              ));
                            })()}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid md:grid-cols-3 gap-5">
                    {/* TO DO COLUMN */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-bold text-zinc-300">To Do</span>
                        <span className="badge text-[10px] bg-zinc-900 border-zinc-850 text-zinc-400 font-mono">
                          {tasks.filter((t) => t.status === "todo").length}
                        </span>
                      </div>
                      <div
                        onDragOver={(e) => e.preventDefault()}
                        onDragEnter={() => setDraggedOverColumn("todo")}
                        onDragLeave={() => setDraggedOverColumn(null)}
                        onDrop={(e) => {
                          setDraggedOverColumn(null);
                          handleDrop(e, "todo");
                        }}
                        className={`p-3 rounded-xl min-h-[300px] space-y-2 transition-all duration-200 ${
                          draggedOverColumn === "todo"
                            ? "bg-zinc-900/80 border border-dashed border-zinc-600"
                            : "bg-zinc-950/40 border border-zinc-900/60"
                        }`}
                      >
                        {tasks.filter((t) => t.status === "todo").map((task) => renderTaskCard(task))}
                        {tasks.filter((t) => t.status === "todo").length === 0 && (
                          <p className="text-zinc-600 text-[10px] text-center py-12 font-mono">No tasks</p>
                        )}
                      </div>
                    </div>

                    {/* IN PROGRESS COLUMN */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-bold text-zinc-300">In Progress</span>
                        <span className="badge text-[10px] bg-zinc-900 border-zinc-850 text-zinc-400 font-mono">
                          {tasks.filter((t) => t.status === "in_progress").length}
                        </span>
                      </div>
                      <div
                        onDragOver={(e) => e.preventDefault()}
                        onDragEnter={() => setDraggedOverColumn("in_progress")}
                        onDragLeave={() => setDraggedOverColumn(null)}
                        onDrop={(e) => {
                          setDraggedOverColumn(null);
                          handleDrop(e, "in_progress");
                        }}
                        className={`p-3 rounded-xl min-h-[300px] space-y-2 transition-all duration-200 ${
                          draggedOverColumn === "in_progress"
                            ? "bg-zinc-900/80 border border-dashed border-zinc-600"
                            : "bg-zinc-950/40 border border-zinc-900/60"
                        }`}
                      >
                        {tasks.filter((t) => t.status === "in_progress").map((task) => renderTaskCard(task))}
                        {tasks.filter((t) => t.status === "in_progress").length === 0 && (
                          <p className="text-zinc-600 text-[10px] text-center py-12 font-mono">No tasks</p>
                        )}
                      </div>
                    </div>

                    {/* COMPLETED COLUMN */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-bold text-zinc-300">Completed</span>
                        <span className="badge text-[10px] bg-zinc-900 border-zinc-850 text-zinc-400 font-mono">
                          {tasks.filter((t) => t.status === "completed").length}
                        </span>
                      </div>
                      <div
                        onDragOver={(e) => e.preventDefault()}
                        onDragEnter={() => setDraggedOverColumn("completed")}
                        onDragLeave={() => setDraggedOverColumn(null)}
                        onDrop={(e) => {
                          setDraggedOverColumn(null);
                          handleDrop(e, "completed");
                        }}
                        className={`p-3 rounded-xl min-h-[300px] space-y-2 transition-all duration-200 ${
                          draggedOverColumn === "completed"
                            ? "bg-zinc-900/80 border border-dashed border-zinc-600"
                            : "bg-zinc-950/40 border border-zinc-900/60"
                        }`}
                      >
                        {tasks.filter((t) => t.status === "completed").map((task) => renderTaskCard(task))}
                        {tasks.filter((t) => t.status === "completed").length === 0 && (
                          <p className="text-zinc-600 text-[10px] text-center py-12 font-mono">No tasks</p>
                        )}
                      </div>
                    </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3. BRAINSTORM TAB */}
            {workspaceTab === "brainstorm" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center bg-zinc-950 p-0.5 rounded-lg border border-zinc-800">
                    <button
                      onClick={() => setIsBrainstormListView(false)}
                      className={`px-3 py-1 text-[10px] font-medium rounded-md transition-colors ${
                        !isBrainstormListView
                          ? "bg-zinc-850 text-white font-semibold"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      💡 Ideas Board
                    </button>
                    <button
                      onClick={() => setIsBrainstormListView(true)}
                      className={`px-3 py-1 text-[10px] font-medium rounded-md transition-colors ${
                        isBrainstormListView
                          ? "bg-zinc-850 text-white font-semibold"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      📝 Document Pad
                    </button>
                  </div>

                  {isBrainstormListView && (
                    <button
                      onClick={handleSaveDocument}
                      disabled={savingDocument || loadingDocument}
                      className="btn btn-primary btn-sm text-xs py-1 px-3 flex items-center gap-1.5"
                    >
                      {savingDocument ? (
                        <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                      )}
                      <span>Sync Document</span>
                    </button>
                  )}
                </div>

                {!isBrainstormListView ? (
                  <div className="grid lg:grid-cols-3 gap-6">
                    {/* Input column */}
                    <div className="card card-static p-5 bg-zinc-950/20 border border-zinc-800 text-left space-y-4 h-fit">
                      <div>
                        <h4 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">Post New Idea</h4>
                        <p className="text-[10px] text-zinc-500 mt-0.5">Share concepts, features, stack ideas, or design notes.</p>
                      </div>

                      <form onSubmit={handleAddBrainstormIdea} className="space-y-3.5">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-medium text-zinc-400 uppercase font-mono">Idea Title</label>
                          <input
                            type="text"
                            required
                            value={newIdeaTitle}
                            onChange={(e) => setNewIdeaTitle(e.target.value)}
                            placeholder="e.g. Real-time push notifications"
                            className="input text-xs"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-medium text-zinc-400 uppercase font-mono">Details / Context</label>
                          <textarea
                            value={newIdeaContent}
                            onChange={(e) => setNewIdeaContent(e.target.value)}
                            placeholder="Explain the concept or stack requirements..."
                            rows={4}
                            className="input text-xs resize-none"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-medium text-zinc-400 uppercase font-mono">Category</label>
                          <select
                            value={newIdeaCategory}
                            onChange={(e) => setNewIdeaCategory(e.target.value as any)}
                            className="input text-xs bg-zinc-950"
                          >
                            <option value="core">Core MVP Feature</option>
                            <option value="nice-to-have">Nice to Have</option>
                            <option value="tech-stack">Tech Stack / Tools</option>
                            <option value="marketing">Marketing / Pitch</option>
                          </select>
                        </div>

                        <button
                          type="submit"
                          disabled={submittingIdea || !newIdeaTitle.trim()}
                          className="btn btn-primary text-xs w-full py-2 disabled:opacity-50"
                        >
                          {submittingIdea ? "Posting..." : "Post Idea note"}
                        </button>
                      </form>
                    </div>

                    {/* Ideas list column */}
                    <div className="lg:col-span-2 space-y-4">
                      {loadingIdeas ? (
                        <div className="py-12 text-center">
                          <div className="w-5 h-5 border-2 border-zinc-800 border-t-white rounded-full animate-spin mx-auto mb-2" />
                          <p className="text-zinc-550 text-xs font-mono uppercase">Loading board...</p>
                        </div>
                      ) : brainstormIdeas.length === 0 ? (
                        <div className="card card-static p-12 text-center border border-zinc-800 bg-zinc-950/20 flex flex-col items-center justify-center rounded-2xl">
                          <span className="text-2xl mb-2">💡</span>
                          <h4 className="text-sm font-semibold text-white mb-1">Ideation Tag Board is Empty</h4>
                          <p className="text-xs text-zinc-500 max-w-xs leading-relaxed">
                            Share tech stack selections, project directions, or feature drafts. Teammates can vote to establish project direction!
                          </p>
                        </div>
                      ) : (
                        <div className="grid sm:grid-cols-2 gap-4">
                          {brainstormIdeas.map((idea) => {
                            const creator = members.find((m) => m.profiles.id === idea.user_id)?.profiles;
                            const hasUpvoted = idea.upvotes?.includes(currentUserId || "");
                            
                            const catLabels: Record<string, string> = {
                              "core": "Core MVP",
                              "nice-to-have": "Nice To Have",
                              "tech-stack": "Tech Stack",
                              "marketing": "Marketing"
                            };

                            const catColors: Record<string, string> = {
                              "core": "bg-violet-500/10 border-violet-500/20 text-violet-400",
                              "nice-to-have": "bg-sky-500/10 border-sky-500/20 text-sky-400",
                              "tech-stack": "bg-amber-500/10 border-amber-500/20 text-amber-400",
                              "marketing": "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                            };

                            return (
                              <div key={idea.id} className="card card-static p-4.5 bg-zinc-900/40 border border-zinc-800/80 hover:border-zinc-700/60 rounded-2xl flex flex-col justify-between text-left space-y-3 relative group transition-all">
                                <div className="space-y-2">
                                  <div className="flex justify-between items-start gap-2">
                                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase ${catColors[idea.category] || "bg-zinc-800"}`}>
                                      {catLabels[idea.category] || idea.category}
                                    </span>

                                    {idea.user_id === currentUserId && (
                                      <button
                                        onClick={() => handleDeleteBrainstormIdea(idea.id)}
                                        className="opacity-0 group-hover:opacity-100 text-zinc-650 hover:text-rose-400 transition-opacity p-0.5 shrink-0"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                      </button>
                                    )}
                                  </div>

                                  <h4 className="text-xs font-bold text-white break-words">{idea.title}</h4>
                                  
                                  {idea.content && (
                                    <p className="text-[10px] text-zinc-400 leading-relaxed break-words line-clamp-4">{idea.content}</p>
                                  )}
                                </div>

                                <div className="flex items-center justify-between pt-2 border-t border-zinc-900/60 mt-auto">
                                  <span className="text-[9px] text-zinc-500">
                                    By <span className="font-semibold text-zinc-400">{creator?.full_name?.split(" ")[0] || "Teammate"}</span>
                                  </span>

                                  <button
                                    onClick={() => handleToggleIdeaUpvote(idea.id)}
                                    className={`px-2 py-1 rounded-lg border text-[9px] font-mono font-bold flex items-center gap-1.5 transition-colors ${
                                      hasUpvoted 
                                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                                        : "bg-zinc-950 border-zinc-900 text-zinc-500 hover:text-zinc-300 hover:border-zinc-850"
                                    }`}
                                  >
                                    <span>▲</span>
                                    <span>{idea.upvotes?.length || 0}</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  // Markdown Editor
                  loadingDocument ? (
                    <div className="card card-static p-12 text-center">
                      <div className="w-5 h-5 border-2 border-zinc-800 border-t-white rounded-full animate-spin mx-auto mb-2" />
                      <p className="text-zinc-500 text-xs font-mono uppercase">Loading document...</p>
                    </div>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-5">
                      <div className="flex flex-col space-y-2">
                        <label className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">Edit Markdown</label>
                        <textarea
                          value={documentContent}
                          onChange={(e) => setDocumentContent(e.target.value)}
                          rows={16}
                          className="input font-mono text-xs w-full h-[350px] resize-none leading-relaxed p-4 bg-zinc-955 border border-zinc-900 focus:border-zinc-800"
                          placeholder="# Brainstorming Ideas&#10;- Idea 1: Custom mobile app for matching builders&#10;- Idea 2: SaaS platform for collaborative hackathon workspaces"
                        />
                      </div>

                      <div className="flex flex-col space-y-2">
                        <label className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">Live Preview</label>
                        <div className="w-full h-[350px] overflow-y-auto p-4 bg-zinc-950/20 border border-zinc-900 rounded-xl space-y-3 prose prose-invert max-w-none">
                          {renderMarkdown(documentContent) || (
                            <p className="text-zinc-650 text-[10px] italic font-mono">Empty document</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}

            {/* 4. RESOURCES TAB */}
            {workspaceTab === "resources" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-mono font-semibold text-zinc-400 uppercase tracking-widest">Links Directory</h3>
                  <button
                    onClick={() => setShowAddLinkModal(true)}
                    className="btn btn-primary btn-sm text-xs py-1 px-3 flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    <span>Add Link</span>
                  </button>
                </div>

                {loadingLinks ? (
                  <div className="card card-static p-12 text-center">
                    <div className="w-5 h-5 border-2 border-zinc-800 border-t-white rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-zinc-500 text-xs font-mono uppercase">Loading links...</p>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {renderCategoryPanel("design", "Figma / Design", "M9.813 15.904L9 21m0 0l-.813-5.096M9 21h3.75m-3.75 0H5.25m3.935-10.957a3.75 3.75 0 11-7.37 1.29l1.625 10.155A3.75 3.75 0 007.125 18h3.75a3.75 3.75 0 003.625-2.512l1.625-10.155a3.75 3.75 0 11-7.37-1.29z")}
                    {renderCategoryPanel("repo", "GitHub / Code", "M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5")}
                    {renderCategoryPanel("document", "Documents / Slides", "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z")}
                    {renderCategoryPanel("other", "General / Other", "M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244")}
                  </div>
                )}
              </div>
            )}

            {/* 5. SUBMISSION TAB */}
            {workspaceTab === "submission" && (
              <div className="space-y-6 animate-fade-in">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-mono font-semibold text-zinc-400 uppercase tracking-widest">Submission Deck</h3>
                  <button
                    onClick={handleSaveSubmission}
                    disabled={savingSubmission}
                    className="btn btn-primary btn-sm text-xs py-1 px-3 flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {savingSubmission ? (
                      <div className="w-3.5 h-3.5 border-2 border-zinc-800 border-t-white rounded-full animate-spin" />
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    )}
                    <span>{savingSubmission ? "Saving..." : "Save Submission"}</span>
                  </button>
                </div>

                {listedHackathons && listedHackathons.length > 0 && (
                  <div className="card card-static p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl flex items-center justify-between gap-4">
                    <div className="text-left">
                      <h4 className="text-xs font-bold text-emerald-400 font-mono uppercase tracking-wider">Active Hackathon: {listedHackathons[0].name}</h4>
                      <p className="text-[10px] text-zinc-400 mt-0.5">Your submission checklist is dynamically tailored to this event's description requirements.</p>
                    </div>
                    <span className="px-2 py-0.5 text-[8px] font-extrabold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded uppercase font-mono tracking-widest leading-none shrink-0">
                      Tailored
                    </span>
                  </div>
                )}

                {/* Progress bar */}
                {(() => {
                  const completedCount = submission.checklist.filter((item) => item.checked).length;
                  const totalCount = submission.checklist.length;
                  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
                  return (
                    <div className="card card-static p-6 bg-gradient-to-r from-zinc-900 to-zinc-950 border border-zinc-800 rounded-xl">
                      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="text-left">
                          <h4 className="text-sm font-semibold text-white font-mono uppercase tracking-wider mb-1">Submission Readiness</h4>
                          <p className="text-xs text-zinc-400">Track your project completion checklist before the final hackathon deadline.</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-48 bg-zinc-955 rounded-full h-2.5 overflow-hidden border border-zinc-800">
                            <div className="bg-gradient-to-r from-violet-500 to-indigo-500 h-full rounded-full transition-all duration-300" style={{ width: `${percent}%` }} />
                          </div>
                          <span className="text-sm font-bold text-white font-mono">{percent}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Inputs */}
                  <div className="card card-static p-6 space-y-4">
                    <h4 className="text-xs font-mono font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800 pb-2 text-left">Project Metadata</h4>
                    
                    <div className="flex flex-col gap-1.5 text-left">
                      <label className="text-xs font-medium text-zinc-300">Project Title</label>
                      <input
                        type="text"
                        value={submission.projectTitle}
                        onChange={(e) => setSubmission(prev => ({ ...prev, projectTitle: e.target.value }))}
                        placeholder="e.g. HackerMate OS"
                        className="input text-xs bg-zinc-955 border-zinc-900 focus:border-zinc-800"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 text-left">
                      <label className="text-xs font-medium text-zinc-300">GitHub Repository Link</label>
                      <input
                        type="text"
                        value={submission.githubUrl}
                        onChange={(e) => setSubmission(prev => ({ ...prev, githubUrl: e.target.value }))}
                        placeholder="https://github.com/..."
                        className="input text-xs bg-zinc-955 border-zinc-900 focus:border-zinc-800"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 text-left">
                      <label className="text-xs font-medium text-zinc-300">Live Demo URL</label>
                      <input
                        type="text"
                        value={submission.demoUrl}
                        onChange={(e) => setSubmission(prev => ({ ...prev, demoUrl: e.target.value }))}
                        placeholder="https://..."
                        className="input text-xs bg-zinc-955 border-zinc-900 focus:border-zinc-800"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 text-left">
                      <label className="text-xs font-medium text-zinc-300">Video Pitch Link</label>
                      <input
                        type="text"
                        value={submission.pitchVideoUrl}
                        onChange={(e) => setSubmission(prev => ({ ...prev, pitchVideoUrl: e.target.value }))}
                        placeholder="https://youtube.com/watch?v=... or Loom"
                        className="input text-xs bg-zinc-955 border-zinc-900 focus:border-zinc-800"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 text-left">
                      <label className="text-xs font-medium text-zinc-300">Presentation Slides / PDF Link</label>
                      <input
                        type="text"
                        value={submission.slidesUrl}
                        onChange={(e) => setSubmission(prev => ({ ...prev, slidesUrl: e.target.value }))}
                        placeholder="https://docs.google.com/presentation/... or Canva"
                        className="input text-xs bg-zinc-955 border-zinc-900 focus:border-zinc-800"
                      />
                    </div>
                  </div>

                  {/* Checklist */}
                  <div className="card card-static p-6 flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-mono font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800 pb-2 mb-4">Milestones Checklist</h4>
                      
                      <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                        {submission.checklist.map((item) => (
                          <div key={item.id} className="flex items-center justify-between group/check p-2 rounded-lg bg-zinc-950/60 border border-zinc-900/60 hover:border-zinc-800/80 transition-colors">
                            <label className="flex items-center gap-2.5 cursor-pointer text-xs text-zinc-300 hover:text-white select-none min-w-0 flex-1">
                              <input
                                type="checkbox"
                                checked={item.checked}
                                onChange={() => handleToggleChecklist(item.id)}
                                className="w-3.5 h-3.5 rounded border-zinc-800 bg-zinc-900 text-primary-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                              />
                              <span className={`truncate ${item.checked ? "line-through text-zinc-500" : ""}`}>{item.label}</span>
                            </label>
                            <button
                              onClick={() => handleDeleteChecklistItem(item.id)}
                              className="opacity-0 group-hover/check:opacity-100 text-zinc-600 hover:text-rose-400 transition-opacity ml-2 shrink-0"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-zinc-800/60 flex gap-2">
                      <input
                        type="text"
                        value={newChecklistItem}
                        onChange={(e) => setNewChecklistItem(e.target.value)}
                        placeholder="Add custom task..."
                        className="input text-xs flex-1 py-1 px-3 bg-zinc-950 border-zinc-900 focus:border-zinc-800"
                        onKeyDown={(e) => { if (e.key === "Enter") handleAddChecklistItem(); }}
                      />
                      <button
                        onClick={handleAddChecklistItem}
                        disabled={!newChecklistItem.trim()}
                        className="btn btn-secondary text-xs px-3 py-1 flex items-center justify-center disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {workspaceTab === "github" && (
              <div className="space-y-6 animate-fade-in text-left">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-mono font-semibold text-zinc-400 uppercase tracking-widest">GitHub Repository Sync</h3>
                  {team.github_repo_url && (
                    <button
                      onClick={fetchCommits}
                      disabled={loadingCommits}
                      className="btn btn-secondary btn-sm text-xs py-1 px-3 flex items-center gap-1.5"
                    >
                      <svg className={`w-3.5 h-3.5 ${loadingCommits ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                      </svg>
                      <span>Sync commits</span>
                    </button>
                  )}
                </div>

                {!team.github_repo_url ? (
                  <div className="card card-static p-12 text-center flex flex-col items-center justify-center max-w-xl mx-auto border border-zinc-800 bg-zinc-950/40 rounded-2xl shadow-xl">
                    <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 mb-4 shadow-inner">
                      <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                        <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                      </svg>
                    </div>
                    <h4 className="text-sm font-semibold text-white mb-2">Connect GitHub Repository</h4>
                    <p className="text-xs text-zinc-500 max-w-sm mb-6 leading-relaxed">
                      Link your team's public GitHub repository to track commit logs, contributor statistics, and code progress directly from the workspace.
                    </p>
                    
                    {isOwner ? (
                      <div className="flex flex-col sm:flex-row gap-2 w-full max-w-md">
                        <input
                          type="text"
                          value={githubRepoUrlInput}
                          onChange={(e) => setGithubRepoUrlInput(e.target.value)}
                          placeholder="e.g. https://github.com/username/reponame"
                          className="input text-xs flex-1 bg-zinc-955 border-zinc-900 focus:border-zinc-800"
                        />
                        <button
                          onClick={() => handleLinkGithubRepo(githubRepoUrlInput)}
                          className="btn btn-primary text-xs py-2 px-4 whitespace-nowrap"
                        >
                          Link Repository
                        </button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider">Only the team owner can link a repository</span>
                    )}
                  </div>
                ) : (
                  <div className="grid lg:grid-cols-3 gap-6">
                    {/* Commits Timeline */}
                    <div className="lg:col-span-2 space-y-4">
                      <div className="card card-static p-6 space-y-4 bg-zinc-950/20 border border-zinc-800">
                        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                          <h4 className="text-xs font-mono font-semibold text-zinc-400 uppercase tracking-wider">Commit History</h4>
                          <span className="text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono">
                            {commits.length} recent commits
                          </span>
                        </div>

                        {loadingCommits ? (
                          <div className="py-12 text-center">
                            <div className="w-6 h-6 border-2 border-zinc-800 border-t-white rounded-full animate-spin mx-auto mb-2" />
                            <p className="text-zinc-500 text-xs font-mono uppercase tracking-wider">Syncing commit feed...</p>
                          </div>
                        ) : errorCommits ? (
                          <div className="py-8 text-center text-rose-400 text-xs font-mono">
                            <svg className="w-8 h-8 mx-auto mb-2 text-rose-500/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            {errorCommits}
                          </div>
                        ) : commits.length === 0 ? (
                          <div className="py-12 text-center text-zinc-500 text-xs font-mono">
                            No commits found in this repository.
                          </div>
                        ) : (
                          <div className="space-y-4 relative before:absolute before:inset-y-1 before:left-5 before:w-0.5 before:bg-zinc-800/80">
                            {commits.map((commitItem, index) => {
                              const authorName = commitItem.commit?.author?.name || commitItem.author?.login || "Unknown Author";
                              const authorAvatar = commitItem.author?.avatar_url;
                              const message = commitItem.commit?.message?.split("\n")[0] || "No message";
                              const commitDate = commitItem.commit?.author?.date ? new Date(commitItem.commit.author.date).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              }) : "";
                              const hashShort = commitItem.sha?.substring(0, 7) || "";
                              const htmlUrl = commitItem.html_url;

                              return (
                                <div key={commitItem.sha || index} className="flex gap-4 relative group">
                                  {/* Timeline marker */}
                                  <div className="relative z-10 w-10 h-10 rounded-full border border-zinc-800 bg-zinc-950 flex items-center justify-center overflow-hidden shrink-0 group-hover:border-zinc-700 transition-colors">
                                    {authorAvatar ? (
                                      <img src={authorAvatar} alt={authorName} className="w-full h-full object-cover" />
                                    ) : (
                                      <span className="text-[10px] font-bold text-zinc-400 font-mono uppercase">{authorName.substring(0, 2)}</span>
                                    )}
                                  </div>

                                  {/* Commit Info Card */}
                                  <div className="flex-1 card card-static p-4 bg-zinc-950/40 border border-zinc-900 group-hover:border-zinc-800 transition-colors text-left flex flex-col md:flex-row justify-between gap-3 items-start md:items-center">
                                    <div>
                                      <p className="text-xs font-semibold text-white tracking-wide">{message}</p>
                                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[10px] text-zinc-500">
                                        <span className="font-medium text-zinc-400">{authorName}</span>
                                        <span className="text-zinc-700">•</span>
                                        <span>{commitDate}</span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {htmlUrl ? (
                                        <a
                                          href={htmlUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-[10px] font-mono text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 px-2 py-1 rounded transition-colors flex items-center gap-1"
                                        >
                                          <span>{hashShort}</span>
                                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6a.75.75 0 0 0-1.5 0v3.586L5.97 3.556a.75.75 0 0 0-1.06 1.06L10.94 10.5H7.354a.75.75 0 0 0 0 1.5h4.9a.75.75 0 0 0 .75-.75v-4.9a.75.75 0 0 0-.75-.75z" />
                                          </svg>
                                        </a>
                                      ) : (
                                        <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 border border-zinc-800 px-2 py-1 rounded">
                                          {hashShort}
                                        </span>
                                      )}
                                      <button
                                        onClick={() => {
                                          navigator.clipboard.writeText(commitItem.sha);
                                          showToast("Commit hash copied!", "success");
                                        }}
                                        className="text-zinc-600 hover:text-zinc-300 transition-colors p-1"
                                        title="Copy SHA"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Repository Widgets */}
                    <div className="space-y-4">
                      {/* Repo info */}
                      <div className="card card-static p-6 space-y-4 bg-zinc-950/20 border border-zinc-800 text-left">
                        <h4 className="text-xs font-mono font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800 pb-2">Repository Link</h4>
                        <div className="space-y-3">
                          <div>
                            <span className="text-[9px] font-mono text-zinc-500 uppercase block">GitHub URL</span>
                            <a
                              href={team.github_repo_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-medium text-emerald-400 hover:underline break-all block mt-0.5"
                            >
                              {team.github_repo_url}
                            </a>
                          </div>

                          {isOwner && (
                            <button
                              onClick={handleUnlinkGithubRepo}
                              className="btn btn-secondary text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/20 border-rose-950/30 w-full py-2 mt-2 flex items-center justify-center gap-1.5"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15m0 0l6.75 6.75M4.5 12l6.75-6.75" />
                              </svg>
                              Disconnect Repo
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Contribution summary */}
                      <div className="card card-static p-6 space-y-4 bg-zinc-950/20 border border-zinc-800 text-left">
                        <h4 className="text-xs font-mono font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800 pb-2">Contributors</h4>
                        {loadingCommits ? (
                          <div className="w-4 h-4 border border-zinc-800 border-t-white rounded-full animate-spin" />
                        ) : commits.length === 0 ? (
                          <p className="text-xs text-zinc-500">No contribution data.</p>
                        ) : (
                          <div className="space-y-3">
                            {(() => {
                              const authorMap: Record<string, { count: number; avatar?: string }> = {};
                              commits.forEach((c) => {
                                const name = c.commit?.author?.name || c.author?.login || "Unknown";
                                const avatar = c.author?.avatar_url;
                                if (!authorMap[name]) {
                                  authorMap[name] = { count: 0, avatar };
                                }
                                authorMap[name].count++;
                              });

                              return Object.entries(authorMap)
                                .sort((a, b) => b[1].count - a[1].count)
                                .map(([name, info], idx) => (
                                  <div key={idx} className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2">
                                      <div className="w-6 h-6 rounded-full border border-zinc-900 bg-zinc-900 flex items-center justify-center overflow-hidden">
                                        {info.avatar ? (
                                          <img src={info.avatar} alt={name} className="w-full h-full object-cover" />
                                        ) : (
                                          <span className="text-[8px] font-bold text-zinc-500 font-mono uppercase">{name.substring(0, 2)}</span>
                                        )}
                                      </div>
                                      <span className="font-medium text-zinc-300">{name}</span>
                                    </div>
                                    <span className="font-mono text-zinc-500 bg-zinc-900/60 border border-zinc-900 px-2 py-0.5 rounded">
                                      {info.count} commits
                                    </span>
                                  </div>
                                ));
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {workspaceTab === "deployments" && (
              <div className="space-y-6 animate-fade-in text-left">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-xs font-mono font-semibold text-zinc-400 uppercase tracking-widest mb-1">Live Environments Cockpit</h3>
                    <p className="text-[10px] text-zinc-500 font-mono">REGISTER AND MONITOR STAGING, DEPLOYMENT, AND SERVICE ENDPOINTS IN REAL-TIME.</p>
                  </div>
                </div>

                <div className="grid lg:grid-cols-3 gap-6">
                  {/* Register Deployment Form */}
                  <div className="card card-static p-5 bg-zinc-950/20 border border-zinc-800 text-left space-y-4 h-fit">
                    <div>
                      <h4 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">Register Environment</h4>
                      <p className="text-[10px] text-zinc-550 mt-0.5">Add staging, sandbox, API, or production URLs to monitor health status.</p>
                    </div>

                    <form onSubmit={handleAddDeployment} className="space-y-3.5">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-medium text-zinc-450 uppercase font-mono">Environment Name</label>
                        <input
                          type="text"
                          required
                          value={newDepName}
                          onChange={(e) => setNewDepName(e.target.value)}
                          placeholder="e.g. Vercel Staging"
                          className="input text-xs"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-medium text-zinc-455 uppercase font-mono">Target URL</label>
                        <input
                          type="text"
                          required
                          value={newDepUrl}
                          onChange={(e) => setNewDepUrl(e.target.value)}
                          placeholder="e.g. hackermate-staging.vercel.app"
                          className="input text-xs"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={submittingDeployment || !newDepName.trim() || !newDepUrl.trim()}
                        className="btn btn-primary text-xs w-full py-2 disabled:opacity-50"
                      >
                        {submittingDeployment ? "Registering..." : "Connect Environment"}
                      </button>
                    </form>
                  </div>

                  {/* Active Deployments Monitor */}
                  <div className="lg:col-span-2 space-y-4">
                    {loadingDeployments ? (
                      <div className="py-12 text-center">
                        <div className="w-5 h-5 border-2 border-zinc-800 border-t-white rounded-full animate-spin mx-auto mb-2" />
                        <p className="text-zinc-500 text-xs font-mono uppercase">Syncing environments...</p>
                      </div>
                    ) : deployments.length === 0 ? (
                      <div className="card card-static p-12 text-center border border-zinc-800 bg-zinc-950/20 flex flex-col items-center justify-center rounded-2xl">
                        <span className="text-2xl mb-2">🚀</span>
                        <h4 className="text-sm font-semibold text-white mb-1">No Active Deployments</h4>
                        <p className="text-xs text-zinc-500 max-w-xs leading-relaxed">
                          Link staging endpoints or frontend preview URLs. The client-side dashboard will automatically ping their headers and track latency.
                        </p>
                      </div>
                    ) : (
                      <div className="grid sm:grid-cols-2 gap-4">
                        {deployments.map((dep) => {
                          const state = pingStatus[dep.id] || { status: "checking" };
                          const formattedUrl = /^https?:\/\//i.test(dep.url) ? dep.url : "https://" + dep.url;
                          
                          return (
                            <div key={dep.id} className="card card-static p-5 bg-zinc-900/40 border border-zinc-800/80 hover:border-zinc-700/60 rounded-2xl flex flex-col justify-between text-left space-y-4 group transition-all relative overflow-hidden">
                              <div className="space-y-2">
                                <div className="flex justify-between items-start gap-2">
                                  <h4 className="text-xs font-bold text-white truncate max-w-[150px]">{dep.name}</h4>
                                  
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      onClick={() => pingUrl(dep.id, dep.url)}
                                      className="p-1 rounded bg-zinc-950 border border-zinc-900 hover:border-zinc-800 text-zinc-500 hover:text-white transition-colors"
                                      title="Recheck Health"
                                    >
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                      </svg>
                                    </button>

                                    <button
                                      onClick={() => handleDeleteDeployment(dep.id)}
                                      className="opacity-0 group-hover:opacity-100 text-zinc-650 hover:text-rose-400 transition-opacity p-1 shrink-0"
                                      title="Remove Endpoint"
                                    >
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>

                                <a
                                  href={formattedUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-zinc-550 hover:text-zinc-350 truncate block hover:underline"
                                >
                                  {dep.url}
                                </a>
                              </div>

                              <div className="flex items-center justify-between pt-2 border-t border-zinc-900/60 mt-auto">
                                <div className="flex items-center gap-1.5">
                                  {state.status === "checking" ? (
                                    <>
                                      <div className="w-2 h-2 border border-zinc-800 border-t-white rounded-full animate-spin shrink-0" />
                                      <span className="text-[8px] text-zinc-500 font-mono uppercase">Pinging...</span>
                                    </>
                                  ) : state.status === "online" ? (
                                    <>
                                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                                      <span className="text-[8px] text-emerald-400 font-mono font-bold uppercase">Online</span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                                      <span className="text-[8px] text-rose-455 font-mono font-bold uppercase">Offline</span>
                                    </>
                                  )}
                                </div>

                                {state.status === "online" && state.latency && (
                                  <span className="text-[8px] font-mono text-zinc-500 bg-zinc-950 border border-zinc-900 px-2 py-0.5 rounded-md">
                                    Latency: {state.latency}ms
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {workspaceTab === "activity" && (
              <div className="space-y-6 animate-fade-in text-left">
                <div>
                  <h3 className="text-xs font-mono font-semibold text-zinc-400 uppercase tracking-widest mb-1">Team Activity Timeline</h3>
                  <p className="text-[10px] text-zinc-500 font-mono">CHRONOLOGICAL EVENT HISTORY RECORDED ACROSS ALL COLLABORATORS AND CONNECTED SERVICES.</p>
                </div>

                {(() => {
                  const timeline = getActivityTimeline();
                  if (timeline.length === 0) {
                    return (
                      <div className="card card-static p-12 text-center flex flex-col items-center justify-center border border-zinc-800 bg-zinc-950/40 rounded-2xl max-w-xl mx-auto shadow-xl">
                        <span className="text-2xl mb-2">⏳</span>
                        <h4 className="text-sm font-semibold text-white mb-1">No Activity Logged Yet</h4>
                        <p className="text-xs text-zinc-500 max-w-xs leading-relaxed">
                          Once tasks are created, resources added, brainstorm files saved, or code commits pushed, they will show up in this chronological timeline.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="relative border-l border-zinc-850 ml-4 pl-6 space-y-6">
                      {timeline.map((event) => {
                        const config = {
                          commit: { icon: "💻", bg: "bg-emerald-500/10 text-emerald-450 border-emerald-500/20" },
                          task: { icon: "📋", bg: "bg-violet-500/10 text-violet-400 border-violet-500/20" },
                          resource: { icon: "🔗", bg: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
                          brainstorm: { icon: "🧠", bg: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
                        }[event.type] || { icon: "🔔", bg: "bg-zinc-800 text-zinc-400 border-zinc-700" };

                        const formattedTime = new Date(event.timestamp).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        });

                        return (
                          <div key={event.id} className="relative group">
                            <span className="absolute -left-[31px] top-0.5 flex items-center justify-center w-5 h-5 rounded-full bg-zinc-950 border border-zinc-800 text-[10px] shadow-sm z-10 shrink-0">
                              {config.icon}
                            </span>

                            <div className="card card-static p-4 hover:border-zinc-800/80 transition-colors bg-zinc-900/40 border border-zinc-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-[9px] font-mono font-semibold uppercase px-1.5 py-0.5 rounded border ${config.bg}`}>
                                    {event.title}
                                  </span>
                                  <span className="text-[10px] text-zinc-500 font-mono">{formattedTime}</span>
                                </div>
                                <p className="text-xs text-zinc-300 font-medium leading-relaxed">{event.description}</p>
                              </div>

                              {event.user && (
                                <div className="flex items-center gap-2 shrink-0 bg-zinc-950/40 border border-zinc-900/60 rounded px-2.5 py-1.5 self-start sm:self-auto">
                                  {event.user.avatarUrl ? (
                                    <img
                                      src={event.user.avatarUrl}
                                      alt={event.user.name}
                                      className="w-4 h-4 rounded-full object-cover border border-zinc-800"
                                    />
                                  ) : (
                                    <div className="w-4 h-4 rounded-full bg-zinc-855 border border-zinc-800 flex items-center justify-center font-bold text-zinc-400 text-[8px]">
                                      {event.user.name.charAt(0)}
                                    </div>
                                  )}
                                  <span className="text-[10px] text-zinc-400 font-semibold">{event.user.name.split(" ")[0]}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Invite Builder Modal */}
      {showInviteBuilderModal && (

        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="card card-static p-5 w-full max-w-md flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-sm font-semibold text-white mb-0.5">Invite Builder</h2>
                <p className="text-[10px] text-zinc-500">Send team invitations to other builders on HackerMate.</p>
              </div>
              <button 
                onClick={() => setShowInviteBuilderModal(false)}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, college, or skills..."
                className="input text-xs w-full"
              />
            </div>

            <div className="flex-1 overflow-y-auto min-h-[250px] pr-1 space-y-2">
              {loadingProfiles ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-5 h-5 border-2 border-zinc-800 border-t-white rounded-full animate-spin mb-2" />
                  <p className="text-[10px] text-zinc-500 font-mono uppercase">Loading builders...</p>
                </div>
              ) : (() => {
                const memberUserIds = new Set(members.map((m) => m.profiles.id));
                const filtered = inviteProfiles.filter((p) => {
                  if (p.id === currentUserId || memberUserIds.has(p.id)) return false;
                  
                  if (!searchQuery) return true;
                  const query = searchQuery.toLowerCase();
                  const nameMatch = p.full_name?.toLowerCase().includes(query);
                  const collegeMatch = p.college?.toLowerCase().includes(query);
                  const skillsMatch = p.skills?.some((s: string) => s.toLowerCase().includes(query));
                  return nameMatch || collegeMatch || skillsMatch;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-12 text-zinc-500 text-xs">
                      No builders found matching your search.
                    </div>
                  );
                }

                return filtered.map((profile) => {
                  const isAlreadyInvited = existingPendingInvites.has(profile.id) || sessionInvitedIds.has(profile.id);
                  return (
                    <div key={profile.id} className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/30 border border-zinc-900/80 hover:border-zinc-800 transition-colors">
                      <div className="min-w-0 flex-1 mr-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-white truncate">{profile.full_name}</span>
                          {profile.college && (
                            <span className="text-[9px] text-zinc-500 truncate">({profile.college})</span>
                          )}
                        </div>
                        {profile.skills && profile.skills.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {profile.skills.slice(0, 3).map((s: string) => (
                              <span key={s} className="text-[8px] px-1 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">{s}</span>
                            ))}
                            {profile.skills.length > 3 && (
                              <span className="text-[8px] text-zinc-600">+{profile.skills.length - 3}</span>
                            )}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={async () => {
                          try {
                            const { error } = await supabase.rpc("send_team_invite", {
                              p_team_id: team.id,
                              p_invited_user_id: profile.id
                            });

                            if (error) {
                              showToast(error.message, "error");
                            } else {
                              showToast(`Invite sent to ${profile.full_name}!`, "success");
                              setSessionInvitedIds(prev => {
                                const next = new Set(prev);
                                next.add(profile.id);
                                return next;
                              });

                              // Trigger email alert
                              if (currentUserId) {
                                fetch("/api/send-email", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    senderId: currentUserId,
                                    recipientId: profile.id,
                                    type: "team_invite",
                                    teamId: team.id,
                                  }),
                                }).catch((err) => console.error("Failed to send fallback notification email:", err));
                              }
                            }
                          } catch (err) {
                            console.error(err);
                            showToast("Failed to send invite", "error");
                          }
                        }}
                        disabled={isAlreadyInvited}
                        className={`btn btn-sm text-[10px] py-1 px-3 ${
                          isAlreadyInvited 
                            ? "bg-zinc-800 text-zinc-600 cursor-not-allowed border-transparent" 
                            : "btn-primary"
                        }`}
                      >
                        {isAlreadyInvited ? "Invited" : "Invite"}
                      </button>
                    </div>
                  );
                });
              })()}
            </div>

            <div className="flex justify-end pt-4 border-t border-zinc-900 mt-4">
              <button
                onClick={() => setShowInviteBuilderModal(false)}
                className="btn btn-secondary btn-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Edit Team Details Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="card card-static p-5 w-full max-w-lg flex flex-col max-h-[85vh] bg-[var(--surface-1)] border border-[var(--card-border)] animate-scale-in">
            <div className="flex justify-between items-start mb-4 pb-3 border-b border-white/[0.06]">
              <div>
                <h2 className="text-sm font-semibold text-white mb-0.5">Edit Team Details</h2>
                <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">Update name, mission, context, target skills, needed roles, and capacity.</p>
              </div>
              <button 
                onClick={() => setShowEditModal(false)}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveTeamDetails} className="flex-1 overflow-y-auto pr-1 space-y-5">
              {/* Basics */}
              <div className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-zinc-300">Team name <span className="text-rose-400">*</span></label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="input text-xs"
                    placeholder="e.g. Hack Warriors"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-zinc-300">Description <span className="text-rose-400">*</span></label>
                  <textarea
                    required
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    rows={3}
                    className="input text-xs"
                    placeholder="What's your team's mission?"
                  />
                </div>
              </div>

              <div className="border-t border-white/[0.06]" />

              {/* Context */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-zinc-300">College (Optional)</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search or select your college..."
                      value={showEditCollegeDropdown ? editCollegeSearch : (editCollege || "")}
                      onFocus={() => {
                        setEditCollegeSearch("");
                        setShowEditCollegeDropdown(true);
                      }}
                      onChange={(e) => {
                        setEditCollegeSearch(e.target.value);
                        setShowEditCollegeDropdown(true);
                      }}
                      className="input text-xs px-4 w-full"
                    />
                    
                    {showEditCollegeDropdown && (
                      <>
                        <div 
                          className="fixed inset-0 z-10" 
                          onClick={() => setShowEditCollegeDropdown(false)}
                        />
                        <div className="absolute left-0 right-0 top-full mt-1.5 max-h-48 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-1.5 shadow-xl z-20 text-left">
                          {COLLEGES.filter((col) => 
                            col.toLowerCase().includes(editCollegeSearch.toLowerCase())
                          ).map((collegeName) => (
                            <button
                              type="button"
                              key={collegeName}
                              onClick={() => {
                                setEditCollege(collegeName);
                                setEditCollegeSearch("");
                                setShowEditCollegeDropdown(false);
                              }}
                              className="w-full text-left px-3 py-2 rounded-md text-xs text-zinc-300 hover:bg-zinc-900 hover:text-white transition-colors"
                            >
                              {collegeName}
                            </button>
                          ))}
                          {COLLEGES.filter((col) => 
                            col.toLowerCase().includes(editCollegeSearch.toLowerCase())
                          ).length === 0 && (
                            <div className="text-center py-4 text-xs text-zinc-600">
                              No colleges match your search.
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  {editCollege === "Other" && (
                    <input
                      type="text"
                      placeholder="Enter your college name"
                      value={editCustomCollege}
                      onChange={(e) => setEditCustomCollege(e.target.value)}
                      className="input text-xs mt-2"
                    />
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-zinc-300">Team size (Max Members)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="2"
                      max="10"
                      value={editMaxMembers}
                      onChange={(e) => setEditMaxMembers(Number(e.target.value))}
                      className="flex-1 h-1.5 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-primary-500"
                    />
                    <div className="flex items-center justify-center w-9 h-9 rounded bg-white/[0.04] border border-white/[0.06] text-xs font-medium text-white shrink-0">
                      {editMaxMembers}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-white/[0.06]" />

              {/* Skills */}
              <div>
                <span className="text-[10px] uppercase tracking-widest font-medium text-zinc-500 block mb-2">Skills needed <span className="text-rose-400">*</span></span>
                <div className="flex flex-wrap gap-1.5">
                  {SKILLS.map((skill) => {
                    const active = editSkills.includes(skill);
                    return (
                      <button
                        type="button"
                        key={skill}
                        onClick={() => toggleEditSkill(skill)}
                        className={`px-2 py-1 rounded text-[10px] font-medium transition-all border ${
                          active
                            ? "bg-[var(--primary-500)] text-white border-[var(--primary-500)]"
                            : "bg-white/[0.03] text-zinc-400 border-white/[0.06] hover:border-white/[0.15] hover:text-zinc-300"
                        }`}
                      >
                        {skill}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-white/[0.06]" />

              {/* Roles */}
              <div>
                <span className="text-[10px] uppercase tracking-widest font-medium text-zinc-500 block mb-2">Roles needed <span className="text-rose-400">*</span></span>
                <div className="flex flex-wrap gap-1.5">
                  {ROLES.map((role) => {
                    const active = editRoles.includes(role);
                    return (
                      <button
                        type="button"
                        key={role}
                        onClick={() => toggleEditRole(role)}
                        className={`px-2 py-1 rounded text-[10px] font-medium transition-all border ${
                          active
                            ? "bg-[var(--primary-500)] text-white border-[var(--primary-500)]"
                            : "bg-white/[0.03] text-zinc-400 border-white/[0.06] hover:border-white/[0.15] hover:text-zinc-300"
                        }`}
                      >
                        {role}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-2 pt-4 border-t border-zinc-900 mt-4">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="btn btn-secondary btn-sm"
                  disabled={savingEdit}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm flex items-center gap-1.5"
                  disabled={savingEdit}
                >
                  {savingEdit ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedTask && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="card card-static p-6 w-full max-w-lg flex flex-col max-h-[85vh] bg-[var(--surface-1)] border border-[var(--card-border)] animate-scale-in text-left">
            <div className="flex justify-between items-start mb-4 pb-3 border-b border-white/[0.06]">
              <div>
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase mb-1.5 inline-block ${
                  selectedTask.priority === "high"
                    ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                    : selectedTask.priority === "medium"
                      ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                      : "bg-zinc-800 border-zinc-700 text-zinc-400"
                }`}>
                  {selectedTask.priority} Priority
                </span>
                <h2 className="text-sm font-semibold text-white leading-snug">{selectedTask.title}</h2>
              </div>
              <button 
                onClick={() => setSelectedTask(null)}
                className="text-zinc-500 hover:text-white transition-colors p-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Task Meta details */}
            <div className="grid grid-cols-2 gap-4 mb-4 text-xs bg-zinc-950/40 border border-zinc-900 rounded-lg p-3">
              <div>
                <span className="text-zinc-500 block mb-1">Assignee</span>
                {(() => {
                  const assignee = members.find((m) => m.profiles.id === selectedTask.assignee_id);
                  return (
                    <div className="flex items-center gap-1.5">
                      {assignee ? (
                        <>
                          {assignee.profiles.avatar_url ? (
                            <img src={assignee.profiles.avatar_url} alt={assignee.profiles.full_name} className="w-4 h-4 rounded-full object-cover border border-zinc-800" />
                          ) : (
                            <div className="w-4 h-4 rounded-full bg-zinc-850 border border-zinc-700 flex items-center justify-center font-bold text-zinc-400 text-[8px]">{assignee.profiles.full_name.charAt(0)}</div>
                          )}
                          <span className="text-zinc-300 font-semibold">{assignee.profiles.full_name}</span>
                        </>
                      ) : (
                        <span className="text-zinc-600 italic">Unassigned</span>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div>
                <span className="text-zinc-500 block mb-1">Due Date</span>
                {selectedTask.due_date ? (
                  <span className="text-zinc-300 font-semibold font-mono">{new Date(selectedTask.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                ) : (
                  <span className="text-zinc-600 italic">No deadline set</span>
                )}
              </div>
            </div>

            {selectedTask.description && (
              <div className="mb-4">
                <span className="text-zinc-500 text-[10px] font-mono uppercase block mb-1">Description</span>
                <p className="text-xs text-zinc-300 bg-zinc-950/20 border border-zinc-900/60 p-3 rounded-lg leading-relaxed break-words">{selectedTask.description}</p>
              </div>
            )}

            {/* Comments thread */}
            <div className="flex-1 flex flex-col min-h-0">
              <span className="text-zinc-500 text-[10px] font-mono uppercase block mb-2">Discussion Thread</span>
              
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-4">
                {loadingComments ? (
                  <div className="text-center py-6">
                    <div className="w-4 h-4 border-2 border-zinc-800 border-t-white rounded-full animate-spin mx-auto" />
                  </div>
                ) : taskComments.length === 0 ? (
                  <p className="text-xs text-zinc-500 italic text-center py-6">No comments posted yet. Start the conversation!</p>
                ) : (
                  taskComments.map((comment) => {
                    const commenter = members.find((m) => m.profiles.id === comment.user_id)?.profiles;
                    const date = new Date(comment.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
                    return (
                      <div key={comment.id} className="flex gap-2.5 items-start">
                        {commenter?.avatar_url ? (
                          <img src={commenter.avatar_url} alt={commenter.full_name} className="w-5.5 h-5.5 rounded object-cover border border-zinc-800 mt-0.5" />
                        ) : (
                          <div className="w-5.5 h-5.5 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center font-bold text-zinc-500 text-[9px] mt-0.5">{commenter?.full_name?.charAt(0) || "U"}</div>
                        )}
                        <div className="flex-1 bg-zinc-900/30 border border-zinc-900/80 rounded-lg p-2.5">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-[10px] font-bold text-white">{commenter?.full_name || "Teammate"}</span>
                            <span className="text-[8px] text-zinc-500 font-mono">{date}</span>
                          </div>
                          <p className="text-xs text-zinc-300 whitespace-pre-line leading-relaxed">{comment.content}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Comment submission form */}
              <form onSubmit={handleAddComment} className="flex gap-2 pt-3 border-t border-zinc-900 mt-auto">
                <input
                  type="text"
                  value={newTaskComment}
                  onChange={(e) => setNewTaskComment(e.target.value)}
                  placeholder="Post comment..."
                  disabled={submittingComment}
                  className="input text-xs flex-1 bg-zinc-950 border-zinc-900 focus:border-zinc-800 py-1.5 px-3"
                />
                <button
                  type="submit"
                  disabled={submittingComment || !newTaskComment.trim()}
                  className="btn btn-primary text-xs py-1.5 px-4 disabled:opacity-50"
                >
                  Post
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Add Task Modal */}
      {showAddTaskModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="card card-static p-5 w-full max-w-md flex flex-col bg-[var(--surface-1)] border border-[var(--card-border)] animate-scale-in">
            <div className="flex justify-between items-start mb-4 pb-3 border-b border-white/[0.06]">
              <div>
                <h2 className="text-sm font-semibold text-white mb-0.5">Create New Task</h2>
                <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">Assign tasks to builders on your team.</p>
              </div>
              <button 
                onClick={() => setShowAddTaskModal(false)}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAddTask} className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-300">Task Title <span className="text-rose-400">*</span></label>
                <input
                  type="text"
                  required
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="e.g. Design Landing Page"
                  className="input text-xs"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-300">Description</label>
                <textarea
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  placeholder="What needs to be done?"
                  rows={2}
                  className="input text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-zinc-300">Priority</label>
                  <select
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value as "low" | "medium" | "high")}
                    className="input text-xs px-4"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-zinc-300">Assign To</label>
                  <select
                    value={taskAssignee}
                    onChange={(e) => setTaskAssignee(e.target.value)}
                    className="input text-xs px-4"
                  >
                    <option value="">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.profiles.id} value={m.profiles.id}>
                        {m.profiles.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 mt-3 text-left">
                <label className="text-xs font-medium text-zinc-300">Due Date (Optional)</label>
                <input
                  type="date"
                  value={taskDueDate}
                  onChange={(e) => setTaskDueDate(e.target.value)}
                  className="input text-xs bg-zinc-955 border-zinc-900 focus:border-zinc-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-zinc-900 mt-4">
                <button
                  type="button"
                  onClick={() => setShowAddTaskModal(false)}
                  className="btn btn-secondary btn-sm"
                  disabled={savingTask}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm flex items-center gap-1.5"
                  disabled={savingTask}
                >
                  {savingTask ? (
                    <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : (
                    <span>Create Task</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Link Modal */}
      {showAddLinkModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="card card-static p-5 w-full max-w-md flex flex-col bg-[var(--surface-1)] border border-[var(--card-border)] animate-scale-in">
            <div className="flex justify-between items-start mb-4 pb-3 border-b border-white/[0.06]">
              <div>
                <h2 className="text-sm font-semibold text-white mb-0.5">Add Resource Link</h2>
                <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">Save important workspace links for your team.</p>
              </div>
              <button 
                onClick={() => setShowAddLinkModal(false)}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAddLink} className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-300">Link Title <span className="text-rose-400">*</span></label>
                <input
                  type="text"
                  required
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                  placeholder="e.g. Figma Design File"
                  className="input text-xs"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-300">URL <span className="text-rose-400">*</span></label>
                <input
                  type="text"
                  required
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="e.g. figma.com/file/..."
                  className="input text-xs"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-300">Category</label>
                <select
                  value={linkCategory}
                  onChange={(e) => setLinkCategory(e.target.value as "design" | "repo" | "document" | "other")}
                  className="input text-xs px-4"
                >
                  <option value="other">General / Other</option>
                  <option value="design">Figma / Design</option>
                  <option value="repo">GitHub / Repository</option>
                  <option value="document">Document / Slides</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-zinc-900 mt-4">
                <button
                  type="button"
                  onClick={() => setShowAddLinkModal(false)}
                  className="btn btn-secondary btn-sm"
                  disabled={savingLink}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm flex items-center gap-1.5"
                  disabled={savingLink}
                >
                  {savingLink ? (
                    <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : (
                    <span>Add Link</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

