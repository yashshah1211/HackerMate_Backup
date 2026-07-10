"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, subscribeWithRetry } from "@/lib/supabase";
import ChatThread from "@/components/chatThread";
import { useNotification } from "@/context/NotificationContext";

const COLLEGES = [
  "DJSCE", "SPIT", "VJTI", "TSEC", "COEP", "PICT", "DAIICT",
  "Nirma University", "PDEU", "BITS Pilani", "IIT Bombay", "IIT Delhi",
  "IIT Madras", "NIT Trichy", "NIT Surathkal", "Other",
];

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
  toggleRecruiting?: () => void;

  matchScore?: number;

  matchedSkills?: string[];
  missingSkills?: string[];
  refreshTeam?: () => void;
  pendingInvite?: { id: string; status: string } | null;
  listedHackathons?: { id: string; name: string; start_date?: string; end_date?: string }[];
  unlinkHackathon?: (hackathonId: string) => void;
  initialTab?: "chat" | "tasks" | "brainstorm" | "resources" | "submission";
};

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
  const [workspaceTab, setWorkspaceTab] = useState<"chat" | "tasks" | "brainstorm" | "resources" | "submission">(initialTab ?? "chat");
  const [draggedOverColumn, setDraggedOverColumn] = useState<"todo" | "in_progress" | "completed" | null>(null);

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
    checklist: ChecklistItem[];
  };

  const DEFAULT_CHECKLIST: ChecklistItem[] = [
    { id: "1", label: "Code committed to main branch", checked: false },
    { id: "2", label: "Project README created", checked: false },
    { id: "3", label: "Pitch deck slides finalized", checked: false },
    { id: "4", label: "Live demo link deployed", checked: false },
    { id: "5", label: "Pitch video recorded & uploaded", checked: false },
    { id: "6", label: "Submission created on Devpost/Portal", checked: false },
  ];

  const [submission, setSubmission] = useState<SubmissionData>({
    projectTitle: "",
    demoUrl: "",
    githubUrl: "",
    pitchVideoUrl: "",
    checklist: DEFAULT_CHECKLIST,
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
    created_at: string;
  };
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskPriority, setTaskPriority] = useState<"low" | "medium" | "high">("medium");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [savingTask, setSavingTask] = useState(false);

  // Brainstorm Tab State
  const [documentContent, setDocumentContent] = useState("");
  const [loadingDocument, setLoadingDocument] = useState(false);
  const [savingDocument, setSavingDocument] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);

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
          }
        } else {
          console.error(insertError);
        }
      } else if (newDoc) {
        setDocumentId(newDoc.id);
        setDocumentContent(newDoc.content || "");
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

  // Load and save submission checklist
  useEffect(() => {
    if (!team.id) return;
    Promise.resolve().then(() => {
      const saved = localStorage.getItem(`hackermate:submission:${team.id}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (!parsed.checklist) parsed.checklist = DEFAULT_CHECKLIST;
          setSubmission(parsed);
        } catch (err) {
          console.error(err);
        }
      } else {
        setSubmission({
          projectTitle: "",
          demoUrl: "",
          githubUrl: "",
          pitchVideoUrl: "",
          checklist: DEFAULT_CHECKLIST,
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team.id]);

  const handleSaveSubmission = () => {
    localStorage.setItem(`hackermate:submission:${team.id}`, JSON.stringify(submission));
    showToast("Submission checklist saved successfully!", "success");
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
    const { error } = await supabase
      .from("team_documents")
      .update({ content: documentContent, updated_by: currentUserId })
      .eq("id", documentId);
    if (error) {
      console.error(error);
      showToast(error.message, "error");
    } else {
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
          const updatedDoc = payload.new as { content: string; updated_by: string };
          supabase.auth.getUser().then(({ data: { user } }) => {
            if (user && updatedDoc.updated_by !== user.id) {
              setDocumentContent(updatedDoc.content);
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

    const unsubTasks = subscribeWithRetry(tasksChannel);
    const unsubDoc = subscribeWithRetry(docChannel);
    const unsubLinks = subscribeWithRetry(linksChannel);

    return () => {
      unsubTasks();
      unsubDoc();
      unsubLinks();
    };
  }, [team.id, canSeeChat]);

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
        className="p-3 bg-zinc-900/80 border border-zinc-800 rounded-lg space-y-3 relative group/card hover:border-zinc-700 transition-colors cursor-grab active:cursor-grabbing"
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
              className="text-[9px] font-semibold bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-zinc-300 focus:outline-none hover:border-zinc-700"
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

          <div className="flex items-center gap-1.5 min-w-0 max-w-[120px]">
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
              className="text-[9px] font-semibold bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-zinc-300 focus:outline-none hover:border-zinc-700 truncate max-w-[85px] cursor-pointer"
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
                  className="opacity-0 group-hover/link:opacity-100 text-zinc-600 hover:text-rose-400 transition-opacity shrink-0"
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
          removeMember(memberId);
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

                <button
                  type="button"
                  onClick={async () => {
                    let link = `${window.location.origin}/teams/${team.id}`;
                    if (isOwner) {
                      const { data: token, error } = await supabase.rpc("generate_team_invite_token", { p_team_id: team.id });
                      if (!error && token) {
                        link = `${link}?join=true&token=${encodeURIComponent(token)}`;
                      } else {
                        showToast(error?.message || "Failed to generate invite token", "error");
                        return;
                      }
                    }
                    navigator.clipboard.writeText(link);
                    showToast(
                      isOwner
                        ? "Auto-join link copied! Share this with builders to let them join instantly."
                        : "Team link copied. Builders can view it and request to join.",
                      "success"
                    );
                  }}
                  className="btn btn-secondary w-full flex items-center justify-center gap-1.5"
                >
                  <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l.097-.03A1.875 1.875 0 0111 6v1.5H9.75v-1.5a.375.375 0 00-.375-.375H7.5A.375.375 0 007.125 6v12a.375.375 0 00.375.375h1.875a.375.375 0 00.375-.375V16.5H11V18a1.875 1.875 0 01-2.653 1.71l-.097-.03A1.875 1.875 0 016 18V6a1.875 1.875 0 012.25-1.5z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 10.5h-8.25m8.25 0l-3.375-3.375m3.375 3.375l-3.375 3.375" />
                  </svg>
                  <span>Share Team Link</span>
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
          {/* Tab Selector */}
          <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3 flex-wrap gap-3">
            <div>
              <p className="section-label mb-0.5 font-mono uppercase tracking-wider">Workspace</p>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Team Workspace Hub</h2>
            </div>

            <div className="flex bg-zinc-950/60 p-0.5 rounded-lg border border-zinc-800">
              <button
                onClick={() => setWorkspaceTab("chat")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  workspaceTab === "chat"
                    ? "bg-zinc-850 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Chat
              </button>
              <button
                onClick={() => setWorkspaceTab("tasks")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  workspaceTab === "tasks"
                    ? "bg-zinc-850 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Tasks
              </button>
              <button
                onClick={() => setWorkspaceTab("brainstorm")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  workspaceTab === "brainstorm"
                    ? "bg-zinc-850 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Brainstorm
              </button>
              <button
                onClick={() => setWorkspaceTab("resources")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  workspaceTab === "resources"
                    ? "bg-zinc-850 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Resources
              </button>
              <button
                onClick={() => setWorkspaceTab("submission")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  workspaceTab === "submission"
                    ? "bg-zinc-850 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Submission
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
                )}
              </div>
            )}

            {/* 3. BRAINSTORM TAB */}
            {workspaceTab === "brainstorm" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-mono font-semibold text-zinc-400 uppercase tracking-widest">Shared Brainstorm Pad</h3>
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
                </div>

                {loadingDocument ? (
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
                        className="input font-mono text-xs w-full h-[350px] resize-none leading-relaxed p-4 bg-zinc-950/60 border border-zinc-900 focus:border-zinc-850"
                        placeholder="# Brainstorming Ideas&#10;- Idea 1: Custom mobile app for matching builders&#10;- Idea 2: SaaS platform for collaborative hackathon workspaces"
                      />
                    </div>

                    <div className="flex flex-col space-y-2">
                      <label className="text-[10px] uppercase tracking-widest font-mono text-zinc-500">Live Preview</label>
                      <div className="w-full h-[350px] overflow-y-auto p-4 bg-zinc-950/20 border border-zinc-900 rounded-xl space-y-3 prose prose-invert max-w-none">
                        {renderMarkdown(documentContent) || (
                          <p className="text-zinc-600 text-[10px] italic font-mono">Empty document</p>
                        )}
                      </div>
                    </div>
                  </div>
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
                    className="btn btn-primary btn-sm text-xs py-1 px-3 flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Save Submission</span>
                  </button>
                </div>

                {/* Progress bar */}
                {(() => {
                  const completedCount = submission.checklist.filter((item) => item.checked).length;
                  const totalCount = submission.checklist.length;
                  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
                  return (
                    <div className="card card-static p-6 bg-gradient-to-r from-zinc-900 to-zinc-950 border border-zinc-800 rounded-xl">
                      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                        <div>
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
                    <h4 className="text-xs font-mono font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800 pb-2">Project Metadata</h4>
                    
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-zinc-300">Project Title</label>
                      <input
                        type="text"
                        value={submission.projectTitle}
                        onChange={(e) => setSubmission(prev => ({ ...prev, projectTitle: e.target.value }))}
                        placeholder="e.g. HackerMate OS"
                        className="input text-xs"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-zinc-300">GitHub Repository Link</label>
                      <input
                        type="text"
                        value={submission.githubUrl}
                        onChange={(e) => setSubmission(prev => ({ ...prev, githubUrl: e.target.value }))}
                        placeholder="https://github.com/..."
                        className="input text-xs"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-zinc-300">Live Demo URL</label>
                      <input
                        type="text"
                        value={submission.demoUrl}
                        onChange={(e) => setSubmission(prev => ({ ...prev, demoUrl: e.target.value }))}
                        placeholder="https://..."
                        className="input text-xs"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-zinc-300">Video Pitch Link</label>
                      <input
                        type="text"
                        value={submission.pitchVideoUrl}
                        onChange={(e) => setSubmission(prev => ({ ...prev, pitchVideoUrl: e.target.value }))}
                        placeholder="https://youtube.com/watch?v=... or Loom"
                        className="input text-xs"
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
                  <select
                    value={editCollege}
                    onChange={(e) => setEditCollege(e.target.value)}
                    className="input text-xs px-4"
                  >
                    <option value="">Select college</option>
                    {COLLEGES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
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

