/** Called only from a guest's action, never while rendering public discovery. */
export function promptDiscoverySignIn(next?: string) {
  const destination = next ?? `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const safeNext = destination.startsWith("/") && !destination.startsWith("//") && !/[\\\u0000-\u001f]/.test(destination)
    ? destination : "/developers";
  window.location.assign(`/login?next=${encodeURIComponent(safeNext)}`);
}

// Public directory fields only. Never add contact or internal outreach metadata here.
export const PUBLIC_BUILDER_COLUMNS = "id, full_name, college, year_of_study, bio, avatar_url, skills, is_available, has_participated_hackathon, hackathon_participations, has_won_hackathon, hackathon_wins";

export const PUBLIC_HACKATHON_COLUMNS = "id, name, description, start_date, end_date, location, mode, prize_pool, currency, website_url, tags, type, organizer_id, college, max_participants, min_team_size, max_team_size, rounds_count, rounds_info, status";
