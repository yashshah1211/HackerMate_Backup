/**
 * Explicit column projections for the column-restricted `profiles` table.
 *
 * AGENTS.md §2: never use a wildcard select or a wildcard profiles embed. `email` is revoked
 * from anon/authenticated, so it must never appear in these lists.
 * Keep SAFE_PROFILE_COLUMNS in sync with scripts/smoke-test-core-pages.js.
 */
export const SAFE_PROFILE_COLUMNS =
  "id, full_name, college, bio, avatar_url, skills, github_url, linkedin_url, created_at, updated_at, role, is_available, onboarding_completed, is_banned, gender, has_participated_hackathon, hackathon_participations, has_won_hackathon, hackathon_wins, last_seen_at, github_stats, github_stats_updated_at, onboarding_nudge_sent_at, last_onboarding_nudge_sent_at, referrer_source, profile_nudge_count, last_nudge_sent_at, sih_broadcast_sent_at, username, show_track_record";

/** Columns the global app shell needs for the signed-in viewer. */
export const SHELL_PROFILE_COLUMNS =
  "id, full_name, avatar_url, role, current_streak, last_active_date";
