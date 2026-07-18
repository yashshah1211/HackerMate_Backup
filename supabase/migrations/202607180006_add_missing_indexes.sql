-- Migration: 202607180006_add_missing_indexes
-- Adds performance and optimization indexes to foreign key and frequently filtered columns.

CREATE INDEX IF NOT EXISTS idx_team_tasks_team_id ON public.team_tasks(team_id);
CREATE INDEX IF NOT EXISTS idx_team_tasks_assignee_id ON public.team_tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_team_links_team_id ON public.team_links(team_id);
CREATE INDEX IF NOT EXISTS idx_team_task_comments_task_id ON public.team_task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_team_link_comments_link_id ON public.team_link_comments(link_id);
CREATE INDEX IF NOT EXISTS idx_team_deployments_team_id ON public.team_deployments(team_id);
CREATE INDEX IF NOT EXISTS idx_team_brainstorm_ideas_team_id ON public.team_brainstorm_ideas(team_id);
CREATE INDEX IF NOT EXISTS idx_hackathons_organizer_id ON public.hackathons(organizer_id);
CREATE INDEX IF NOT EXISTS idx_hackathons_college ON public.hackathons(college);
CREATE INDEX IF NOT EXISTS idx_hackathon_posts_hackathon_id ON public.hackathon_posts(hackathon_id);
CREATE INDEX IF NOT EXISTS idx_hackathon_resources_hackathon_id ON public.hackathon_resources(hackathon_id);
