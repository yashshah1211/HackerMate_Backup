# Profiles query audit before authorization migration

Base: 6aaa4caaf33241c71b55f15987ec881e1f58ecfe. Scanned 431 tracked JavaScript/TypeScript files across src and scripts. 90 direct calls, 20 embedded references, plus one dynamic table dispatcher. Literal/template profile projections resolved per file. Existing projections/grants will not be changed.

## Direct calls and requested/written columns

- scripts/send_daily_report_now.ts:79 — select: id, full_name, email, created_at, onboarding_completed, onboarding_nudge_sent_at, last_seen_at
- scripts/smoke-test-core-pages.js:119 — select: id, full_name, college, bio, avatar_url, skills, github_url, linkedin_url, created_at, updated_at, role, is_available, onboarding_completed, is_banned, gender, has_participated_hackathon, hackathon_participations, has_won_hackathon, hackathon_wins, last_seen_at, github_stats, github_stats_updated_at, onboarding_nudge_sent_at, last_onboarding_nudge_sent_at, referrer_source, profile_nudge_count, last_nudge_sent_at, username, show_track_record
- scripts/smoke-test-core-pages.js:125 — select: id
- scripts/smoke-test-core-pages.js:143 — select: id, full_name, college, bio, avatar_url, skills, github_url, linkedin_url, created_at, updated_at, role, is_available, onboarding_completed, is_banned, gender, has_participated_hackathon, hackathon_participations, has_won_hackathon, hackathon_wins, last_seen_at, github_stats, github_stats_updated_at, onboarding_nudge_sent_at, last_onboarding_nudge_sent_at, referrer_source, profile_nudge_count, last_nudge_sent_at, username, show_track_record
- scripts/smoke-test-core-pages.js:166 — select: id, full_name, college, bio, avatar_url, skills, github_url, linkedin_url, created_at, updated_at, role, is_available, onboarding_completed, is_banned, gender, has_participated_hackathon, hackathon_participations, has_won_hackathon, hackathon_wins, last_seen_at, github_stats, github_stats_updated_at, onboarding_nudge_sent_at, last_onboarding_nudge_sent_at, referrer_source, profile_nudge_count, last_nudge_sent_at, username, show_track_record
- scripts/smoke-test-core-pages.js:183 — select: id, full_name, avatar_url, college
- scripts/verify-db-authz.js:515 — update: last_seen_at
- scripts/verify-db-authz.js:584 — delete: (implicit/default)
- scripts/verify-db-authz.js:649 — update: role
- scripts/verify-db-authz.js:650 — select: role
- scripts/verify-db-authz.js:753 — update: show_track_record
- scripts/verify-db-authz.js:763 — update: show_track_record
- scripts/verify-db-authz.js:861 — update (enumerated test attempts): email, role, is_banned, current_streak, longest_streak, last_active_date, onboarding_nudge_sent_at, last_onboarding_nudge_sent_at, profile_nudge_count, last_nudge_sent_at, sih_broadcast_sent_at, created_at, username, full_name
- scripts/verify-db-authz.js:865 — update: bio
- scripts/verify-db-authz.js:866 — select: bio
- src/app/LandingPageClient.tsx:45 — select: onboarding_completed
- src/app/admin/page.tsx:576 — select: role
- src/app/api/admin/ban-user/route.ts:20 — update: is_banned
- src/app/api/admin/dashboard-data/route.ts:18 — select: id, full_name, email, is_banned, role, created_at, onboarding_completed, referrer_source
- src/app/api/admin/dashboard-data/route.ts:26 — select: id, full_name, email, is_banned, role, created_at, onboarding_completed
- src/app/api/admin/delete-user/route.ts:40 — select: id, role
- src/app/api/admin/issue-badges/route.ts:29 — select: id, email
- src/app/api/admin/nudge-incomplete-onboarding/route.ts:40 — select: id, full_name, email, onboarding_completed, college, skills, created_at, last_onboarding_nudge_sent_at
- src/app/api/admin/nudge-incomplete-onboarding/route.ts:179 — update: last_onboarding_nudge_sent_at
- src/app/api/admin/partner-organizers/route.ts:24 — select: id, full_name
- src/app/api/admin/partner-organizers/route.ts:46 — select: id, role, is_banned
- src/app/api/challenges/[slug]/submissions/[id]/route.ts:72 — select: role
- src/app/api/challenges/[slug]/submissions/[id]/route.ts:150 — select: role
- src/app/api/cron/daily-email-report/route.ts:76 — select: id, full_name, email, last_onboarding_nudge_sent_at
- src/app/api/send-email/route.ts:121 — select: role
- src/app/api/send-email/route.ts:133 — select: full_name
- src/app/api/send-email/route.ts:146 — select: full_name, email
- src/app/api/teams/[id]/ppt-evaluate/route.ts:52 — select: id, role
- src/app/api/teams/[id]/ppt-evaluations/route.ts:38 — select: id, role
- src/app/api/teams/[id]/ppt-evaluations/route.ts:109 — select: id, role
- src/app/auth/callback/route.ts:38 — select: onboarding_completed
- src/app/connections/page.tsx:183 — select: id, full_name, avatar_url, college
- src/app/contact/page.tsx:32 — select: full_name
- src/app/dashboard/useDashboardData.ts:182 — select: id, full_name, avatar_url, college
- src/app/dashboard/useDashboardData.ts:254 — select: id, full_name, college, bio, avatar_url, skills, github_url, linkedin_url, created_at, updated_at, role, is_available, onboarding_completed, is_banned, gender, has_participated_hackathon, hackathon_participations, has_won_hackathon, hackathon_wins, last_seen_at, github_stats, github_stats_updated_at, onboarding_nudge_sent_at, last_onboarding_nudge_sent_at, referrer_source, profile_nudge_count, last_nudge_sent_at, username, show_track_record, current_streak, longest_streak, last_active_date, year_of_study
- src/app/dashboard/useDashboardData.ts:275 — select: id, full_name, avatar_url, college, bio, skills, github_url, linkedin_url, year_of_study, is_available
- src/app/dashboard/useDashboardData.ts:294 — select: id
- src/app/dashboard/useDashboardData.ts:511 — update: year_of_study
- src/app/developers/useDevelopersData.ts:73 — select: id, full_name, college, bio, avatar_url, skills, github_url, linkedin_url, created_at, updated_at, role, is_available, onboarding_completed, is_banned, gender, has_participated_hackathon, hackathon_participations, has_won_hackathon, hackathon_wins, last_seen_at, github_stats, github_stats_updated_at, onboarding_nudge_sent_at, last_onboarding_nudge_sent_at, referrer_source, profile_nudge_count, last_nudge_sent_at, username, show_track_record, year_of_study
- src/app/developers/useDevelopersData.ts:119 — select: id, full_name, college, bio, avatar_url, skills, github_url, linkedin_url, created_at, updated_at, role, is_available, onboarding_completed, is_banned, gender, has_participated_hackathon, hackathon_participations, has_won_hackathon, hackathon_wins, last_seen_at, github_stats, github_stats_updated_at, onboarding_nudge_sent_at, last_onboarding_nudge_sent_at, referrer_source, profile_nudge_count, last_nudge_sent_at, username, show_track_record, year_of_study
- src/app/hackathons/[id]/page.tsx:454 — select: skills
- src/app/hackathons/page.tsx:254 — select: skills
- src/app/leaderboard/page.tsx:149 — select: id, full_name, college, avatar_url, skills, show_track_record, is_banned, onboarding_completed
- src/app/leaderboard/page.tsx:158 — select: id, full_name, college, avatar_url, skills, show_track_record, is_banned, onboarding_completed
- src/app/login/page.tsx:42 — select: onboarding_completed
- src/app/messages/page.tsx:209 — select: id, full_name, avatar_url, college
- src/app/messages/page.tsx:298 — select: id, full_name, avatar_url, college
- src/app/messages/page.tsx:435 — select: id, full_name, avatar_url, college
- src/app/onboarding/page.tsx:86 — select: id, full_name, college, bio, avatar_url, skills, github_url, linkedin_url, created_at, updated_at, role, is_available, onboarding_completed, is_banned, gender, has_participated_hackathon, hackathon_participations, has_won_hackathon, hackathon_wins, last_seen_at, github_stats, github_stats_updated_at, onboarding_nudge_sent_at, last_onboarding_nudge_sent_at, referrer_source, profile_nudge_count, last_nudge_sent_at, username, show_track_record
- src/app/onboarding/page.tsx:244 — select: id | update: [dynamic] fields
- src/app/profile/[id]/useProfileData.ts:107 — select: id, full_name, college, bio, avatar_url, skills, github_url, linkedin_url, created_at, updated_at, role, is_available, onboarding_completed, is_banned, gender, has_participated_hackathon, hackathon_participations, has_won_hackathon, hackathon_wins, last_seen_at, github_stats, github_stats_updated_at, onboarding_nudge_sent_at, last_onboarding_nudge_sent_at, referrer_source, profile_nudge_count, last_nudge_sent_at, username, show_track_record, year_of_study, current_streak, longest_streak, last_active_date
- src/app/profile/[id]/useProfileData.ts:111 — select: id, full_name, college, bio, avatar_url, skills, github_url, linkedin_url, created_at, updated_at, role, is_available, onboarding_completed, is_banned, gender, has_participated_hackathon, hackathon_participations, has_won_hackathon, hackathon_wins, last_seen_at, github_stats, github_stats_updated_at, onboarding_nudge_sent_at, last_onboarding_nudge_sent_at, referrer_source, profile_nudge_count, last_nudge_sent_at, username, show_track_record
- src/app/profile/[id]/useProfileData.ts:413 — update: github_stats, github_stats_updated_at
- src/app/settings/page.tsx:232 — select: id, full_name, college, year_of_study, bio, avatar_url, skills, github_url, linkedin_url, gender, is_available, show_track_record, has_participated_hackathon, hackathon_participations, has_won_hackathon, hackathon_wins
- src/app/settings/page.tsx:305 — select: id, full_name, avatar_url, college
- src/app/settings/page.tsx:390 — update: college, year_of_study, gender, bio, github_url, linkedin_url, skills, has_participated_hackathon, hackathon_participations, has_won_hackathon, hackathon_wins, updated_at
- src/app/settings/page.tsx:413 — update: is_available OR show_track_record, updated_at (field union is closed to these two privacy controls)
- src/app/teams/[id]/page.tsx:135 — select: skills
- src/app/teams/create/page.tsx:282 — select: id, full_name, college, bio, avatar_url, skills, github_url, linkedin_url, created_at, updated_at, role, is_available, onboarding_completed, is_banned, gender, has_participated_hackathon, hackathon_participations, has_won_hackathon, hackathon_wins, last_seen_at, github_stats, github_stats_updated_at, onboarding_nudge_sent_at, last_onboarding_nudge_sent_at, referrer_source, profile_nudge_count, last_nudge_sent_at, username, show_track_record
- src/app/teams/create/page.tsx:291 — select: full_name
- src/app/teams/useTeamsData.ts:39 — select: skills
- src/components/AuthGuard.tsx:38 — select: id, onboarding_completed, is_banned, role
- src/components/ContextualProfileNudgeModal.tsx:79 — select: id, full_name, college, bio, avatar_url, skills, github_url, linkedin_url, is_available, onboarding_completed | update:
- src/components/QuickOnboardingModal.tsx:91 — update: college, year_of_study, bio, github_url, skills, avatar_url, referrer_source, onboarding_completed, updated_at
- src/components/QuickOnboardingModal.tsx:98 — update: college, year_of_study, bio, github_url, skills, avatar_url, referrer_source, onboarding_completed, updated_at
- src/components/StreakWidget.tsx:25 — select: current_streak, longest_streak, last_active_date
- src/components/TeamOverviewView.tsx:303 — select: id, full_name, college, avatar_url, skills
- src/components/TeamWorkspaceView.tsx:443 — select: id, full_name, college, avatar_url, skills
- src/components/chatThread.tsx:557 — select: id, full_name, avatar_url
- src/components/chatThread.tsx:578 — select: id, full_name, avatar_url
- src/components/chatThread.tsx:598 — select: id, full_name, avatar_url
- src/components/chatThread.tsx:856 — select: id, full_name, avatar_url
- src/components/partners/LegacyPartnerPage.tsx:391 — select: full_name
- src/components/shell/useShellSession.ts:250 — select: id, full_name, avatar_url, role, current_streak, last_active_date
- src/components/shell/useShellSession.ts:271 — update: last_seen_at
- src/components/shell/useShellSession.ts:278 — update: last_seen_at
- src/components/shell/useShellSession.ts:285 — update: last_seen_at
- src/lib/admin/attentionQueue.ts:122 — select: id
- src/lib/admin/attentionQueue.ts:175 — select: id, full_name, is_banned
- src/lib/admin/databaseActivityReport.ts:147 — select: id, full_name, email, college, role, skills, created_at
- src/lib/admin/moderationTarget.ts:27 — select: id, role, is_banned, email, full_name, updated_at
- src/lib/admin/requireAdmin.ts:89 — select: role, is_banned
- src/lib/getLandingData.ts:50 — select: id
- src/lib/hackathons/publicBrowsing.ts:75 — select: id,is_banned,onboarding_completed
- src/middleware.ts:102 — select: role

## Embedded references (outer table wildcard does not imply profiles wildcard)

- scripts/smoke-test-core-pages.js:200 — id, role, project_role, profiles(id, full_name, avatar_url, skills, gender)
- src/app/api/admin/partner-composition/route.ts:34 —  id, user_id, team_id, looking_for_team, status, created_at, profiles ( id, full_name, email, college, avatar_url, skills ), teams ( id, name )
- src/app/api/admin/partner-composition/route.ts:60 —  team_id, created_at, teams ( id, name, description, owner_id, max_members, college, skills, roles_needed, team_members ( id, user_id, profiles ( id, full_name, email, college, skills ) ) )
- src/app/api/challenges/leaderboard/route.ts:31 —  id, challenge_id, user_id, team_id, submission_mode, total_score, grade, score_problem, score_solution, score_architecture, score_feasibility_impact, version, created_at, weekly_challenges(title, challenge_number, slug), profiles(id, full_name, avatar_url, username), teams(id, name)
- src/app/api/cron/daily-email-report/route.ts:100 — id, created_at, status, team_id, teams(name), profiles!team_invites_invited_user_id_fkey(full_name, email)
- src/app/api/cron/daily-email-report/route.ts:127 — id, created_at, status, sender:profiles!friend_requests_sender_id_fkey(full_name), receiver:profiles!friend_requests_receiver_id_fkey(full_name, email)
- src/app/api/teams/[id]/ppt-evaluate/route.ts:46 — id, name, owner_id, hackathon_name, team_hackathons(hackathons(id, name, description)), team_members(id, role, project_role, profiles(id, full_name, gender, skills))
- src/app/dashboard/useDashboardData.ts:209 — id, status, team_id, teams ( id, name, description, max_members ), profiles!team_invites_invited_by_fkey ( full_name )
- src/app/dashboard/useDashboardData.ts:360 — id, name, hackathon_id, max_members, owner_id, team_members(role, user_id, profiles(id, full_name, avatar_url)), team_hackathons(hackathon_id, hackathons(id, name, type, tags))
- src/app/dashboard/useDashboardData.ts:391 — id, team_id, user_id, created_at, profiles(id, full_name, avatar_url, college, year_of_study, skills, bio)
- src/app/hackathons/[id]/organizer/page.tsx:185 —  id, user_id, team_id, looking_for_team, status, created_at, profiles ( id, full_name, college, avatar_url, skills, is_available ), teams ( id, name )
- src/app/invites/page.tsx:45 — *, teams ( id, name, description, max_members ), profiles!team_invites_invited_by_fkey ( full_name )
- src/app/teams/[id]/page.tsx:160 —  id, role, project_role, profiles ( id, full_name, avatar_url, skills, gender )
- src/app/teams/[id]/requests/page.tsx:86 —  id, user_id, status, profiles ( id, full_name, avatar_url )
- src/app/teams/[id]/workspace/page.tsx:104 —  id, role, project_role, profiles ( id, full_name, avatar_url, skills )
- src/lib/admin/databaseActivityReport.ts:154 — id, name, description, college, is_recruiting, owner_id, created_at, profiles!teams_owner_id_fkey(full_name)
- src/lib/admin/databaseActivityReport.ts:161 — id, team_id, user_id, role, project_role, created_at, teams(name), profiles(full_name, email)
- src/lib/admin/databaseActivityReport.ts:175 — id, team_id, invited_user_id, invited_by, status, created_at, teams(name), profiles!team_invites_invited_user_id_fkey(full_name, email)
- src/lib/admin/databaseActivityReport.ts:182 — id, sender_id, receiver_id, status, created_at, sender:profiles!friend_requests_sender_id_fkey(full_name), receiver:profiles!friend_requests_receiver_id_fkey(full_name, email)
- src/lib/hackathonRunMode.ts:42 — user_id, project_role, profiles(full_name)

## Dynamic dispatcher and write notes

- src/lib/admin/attentionQueue.ts:96 — id (count requests); id, full_name, onboarding_completed, is_banned, created_at (onboarding page)
- src/app/onboarding/page.tsx — college, year_of_study, skills, bio, github_url, linkedin_url, onboarding_completed, updated_at, has_participated_hackathon, hackathon_participations, has_won_hackathon, hackathon_wins, referrer_source (year fallback omits year_of_study)
- src/components/ContextualProfileNudgeModal.tsx — update payload: bio, skills (conditional keys only); RETURNING projection: id, full_name, college, bio, avatar_url, skills, github_url, linkedin_url, is_available, onboarding_completed
- src/components/QuickOnboardingModal.tsx — college, year_of_study, bio, github_url, skills, avatar_url, referrer_source, onboarding_completed, updated_at (fallback omits year_of_study)

## Live is_admin dependency audit

Read-only production catalog: eleven policies across expo_leaderboard_entries (four), partner_configs (one), profiles (two), teams (one), user_badges (one), user_reports (two). Live direct function callers: handle_profile_roles_update() and grant_hackathon_winner_badges(uuid,uuid[],text,text,text,text,jsonb). delete_user_completely(uuid) independently locks/validates caller role/ban and founder identity and will not be rewritten. Existing ban-user route rejects self/admin/founder targets, uses a server-only client and compare-and-swap; partner-organizer assignment verifies the target profile. These application workflows remain unchanged and require regression tests.

October 19 final review of the previously captured October 18 catalog (no new production SQL):

| Table | Existing affected policies | Effect of the new predicate |
| --- | --- | --- |
| expo_leaderboard_entries | Admins can delete expo_leaderboard_entries; Admins can insert expo_leaderboard_entries; Admins can select expo_leaderboard_entries; Admins can update expo_leaderboard_entries | Banned/NULL-ban actors lose the admin branch for DELETE/INSERT/SELECT/UPDATE; INSERT still requires created_by = auth.uid(). |
| partner_configs | partner_configs_admin_write | Banned/NULL-ban actors lose the admin ALL-policy branch. |
| profiles | profiles_admin_update; profiles_read | Banned/NULL-ban actors lose admin UPDATE and privileged read branches. Existing self-update/self-read and non-banned public-profile read branches remain. |
| teams | teams_delete_owner | Banned/NULL-ban actors lose the admin DELETE branch; the separate owner branch remains as before. |
| user_badges | user_badges_admin_all | Banned/NULL-ban actors lose the admin ALL-policy branch. |
| user_reports | user_reports_admin_delete; user_reports_admin_select | Banned/NULL-ban actors lose admin DELETE/SELECT access. |

Every listed admin branch remains true for role=admin AND is_banned=false. This migration is a ban-aware admin-authority fix, not a new platform-wide ban on ordinary owner/self-service actions. The existing profile UPDATE trigger also loses its admin exception for banned actors, preserving their OLD role/ban; the winner-badge RPC rejects them. Founder/event-organizer semantics use the unchanged partner predicates, plus the new Hustle session requirement. Hosted core-page/admin-workflow verification after separate approval remains required; the policy inventory is reviewed metadata, not proof of post-install hosted behavior.

Profiles INSERT-self policy, Auth creation trigger, profile-to-Auth FK, PK and absence of a browser DELETE policy were inspected. Auth creation supplies role defaults, not user metadata. Existing UPDATE trigger preserves protected fields for callers rejected by is_admin; making that predicate ban-aware closes the observed self-unban path without changing column privileges or ordinary profile projections. No new wildcard selects or permission revocations are proposed.
