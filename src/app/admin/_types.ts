import { EmailUsageSummary } from "@/lib/admin/emailBudgetGuard";

export type AdminTab =
  | "reports"
  | "users"
  | "teams"
  | "outreach"
  | "badges"
  | "partnering"
  | "sih_stats"
  | "deleted_logs"
  | "native_hackathons";

export interface Report {
  id: string;
  reporter_id: string;
  reported_id: string;
  reason: string;
  details: string;
  created_at: string;
  reporterName?: string;
  reporterEmail?: string;
  reportedName?: string;
  reportedEmail?: string;
  reportedBanned?: boolean;
}

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  is_banned: boolean;
  role: string;
  created_at: string;
  onboarding_completed: boolean;
  referrer_source?: string | null;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  max_members: number;
  created_at: string;
  college?: string;
  hackathon_name?: string;
  ownerName?: string;
  ownerEmail?: string;
  team_members?: { id: string }[];
  team_hackathons?: { hackathons: { id: string; name: string } }[];
}

export interface OrganizerLead {
  id: string;
  title: string;
  college_or_host: string;
  unstop_url: string;
  organizer_email: string | null;
  last_sent_to?: string | null;
  event_date: string;
  status: string;
  pitch_sent_at: string | null;
  opened_at?: string | null;
  open_count?: number;
  notes: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface NativeHackathon {
  id: string;
  name: string;
  slug?: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status: "pending" | "approved" | "rejected";
  location?: string | null;
  website_url?: string | null;
  mode?: string | null;
  prize_pool?: string | null;
  creator_id?: string;
  creator_email?: string;
  created_at: string;
  banner_url?: string | null;
  min_team_size?: number | null;
  max_team_size?: number | null;
  college?: string | null;
  type?: string | null;
  organizerName?: string | null;
  organizerEmail?: string | null;
  currency?: string | null;
}

export interface IssuedBadgeRecord {
  id: string;
  user_id: string;
  hackathon_id: string;
  badge_type: string;
  badge_name: string;
  rank_title: string;
  issuer_name: string;
  issued_at: string;
  certificate_url?: string;
  metadata?: {
    certificate_id?: string;
  };
  profiles?: {
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
    college: string | null;
  };
  hackathons?: {
    name: string;
  };
}

export interface PartnerConfigRecord {
  id: string;
  hackathon_id: string;
  slug: string;
  partner_name: string;
  logo_url?: string;
  tagline?: string;
  primary_color?: string;
  features?: any;
  created_at?: string;
  is_active?: boolean;
}

export interface PartnerAnalyticsResponse {
  stats: {
    totalRegistrations: number;
    lookingForTeamCount: number;
    totalTeams: number;
  };
  topSkills: { skill: string; count: number }[];
  topColleges: { college: string; count: number }[];
  registrations: any[];
  teams: any[];
  announcements: any[];
}

export interface SihCollegeStat {
  collegeName: string;
  builderCount: number;
  lookingForTeamCount: number;
  teamCount: number;
  totalTeamMembers: number;
  avgTeamSize: string;
  isHighPotentialZeroTeams: boolean;
  builders: {
    id: string;
    full_name?: string;
    email?: string;
    looking_for_team?: boolean;
    skills?: string[];
  }[];
  teams: {
    id: string;
    name: string;
    description?: string;
    team_members?: { id: string }[];
    max_members?: number;
  }[];
}

export interface SihStatsResponse {
  success?: boolean;
  summary: {
    totalBuilders: number;
    totalLookingForTeam: number;
    totalTeams: number;
    totalColleges: number;
    highPotentialZeroTeamColleges: number;
  };
  collegeStats: SihCollegeStat[];
}

export interface DeletedUserLog {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  college: string | null;
  deleted_at: string;
}

export interface EmailAnalyticsStats {
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  deliveryRate: string;
  openRate: string;
  clickRate: string;
}

export interface WebhookEvent {
  id: string;
  resend_email_id: string;
  event_type: string;
  recipient_email: string;
  subject: string | null;
  created_at: string;
}

export { type EmailUsageSummary };
