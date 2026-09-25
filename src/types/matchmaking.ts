export type RecommendationArgs = {
  p_user_id: string;
  p_limit?: number;
  p_prefer_same_college?: boolean;
};

export type BuilderComponents = {
  complementarity: number | null;
  foundation: number | null;
  experience: number | null;
  context: number;
};

export type TeamComponents = {
  role_gap: number | null;
  skill_fit: number;
  novelty: number | null;
  foundation: number | null;
  context: number;
};

export type MatchMetadata<T> = {
  compatibility: number; // 0..100 fit index
  confidence: number;    // 0..1 evidence coverage
  components: T;
  reasons: string[];
  score_version: string;
  same_college: boolean;
};

export type BuilderRecommendation = MatchMetadata<BuilderComponents> & {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  college: string | null;
  bio: string | null;
  skills: string[] | null;
  github_url: string | null;
  linkedin_url: string | null;
  year_of_study: string | null;
  is_available: boolean | null;
  shared_skills: string[];
};

export type TeamRecommendation = MatchMetadata<TeamComponents> & {
  id: string;
  name: string;
  description: string | null;
  college: string | null;
  skills: string[] | null;
  roles_needed: string[] | null;
  hackathon_id: string | null;
  hackathon_name: string | null;
  max_members: number;
  member_count: number;
  matched_role: string | null;
};
