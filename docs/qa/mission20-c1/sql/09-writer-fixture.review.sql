-- REVIEW ONLY. LOCAL FIXTURE, NOT A PROPOSED MIGRATION. The runner owns a new
-- loopback cluster. Models founder-confirmed FKs/trigger behavior; loads actual
-- repository matchmaking, deletion and audit functions. No existing DB allowed.
DO $$ BEGIN
 IF current_database()<>'partner_authz_fixture' OR inet_server_addr()<>'127.0.0.1'::inet OR session_user<>'postgres' THEN
  RAISE EXCEPTION 'fresh_local_fixture_required'; END IF;
END; $$;
ALTER TABLE public.team_members ADD COLUMN id uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE;
ALTER TABLE public.team_members DROP CONSTRAINT team_members_user_id_fkey;
ALTER TABLE public.team_members ADD CONSTRAINT team_members_user_id_fkey FOREIGN KEY(user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.profiles DROP CONSTRAINT profiles_id_fkey;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY(id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.hackathon_registrations DROP CONSTRAINT hackathon_registrations_user_id_fkey;
ALTER TABLE public.hackathon_registrations ADD CONSTRAINT hackathon_registrations_user_id_fkey FOREIGN KEY(user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.teams ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.team_join_requests ADD COLUMN id uuid DEFAULT gen_random_uuid(),ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';
ALTER TABLE public.team_invites ADD COLUMN id uuid DEFAULT gen_random_uuid(),ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';
CREATE TABLE public.conversations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),type text,team_id uuid UNIQUE REFERENCES public.teams(id) ON DELETE CASCADE);
CREATE TABLE public.conversation_participants(conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
 user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,cleared_at timestamptz,PRIMARY KEY(conversation_id,user_id));
CREATE TABLE public.notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,message text,link text);
CREATE SCHEMA storage;
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner uuid,owner_id text);
-- Exact repository functions: the audit trigger swallows errors; canonical RPC
-- independently demands its audit record, so failure must still roll back.
\ir ../../../../supabase/migrations/202608030005_add_deleted_user_logs_audit_trigger.sql
\ir ../../../../supabase/migrations/202610060001_restore_safe_user_deletion.sql

CREATE FUNCTION public.is_team_member(p_team_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 select public.is_team_owner(p_team_id) or exists(select 1 from public.team_members where team_id=p_team_id and user_id=auth.uid());
$$;
-- Fixture authorization model, not a claim of an additional deployed policy.
-- C2 founder-confirmed live owner UPDATE and owner/admin DELETE policies.
CREATE FUNCTION public.is_admin(user_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=user_id AND p.role='admin' AND p.is_banned IS FALSE);
$$;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY teams_read ON public.teams FOR SELECT TO authenticated USING(true);
CREATE POLICY teams_delete_owner ON public.teams FOR DELETE TO authenticated USING(owner_id=auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY teams_update_owner ON public.teams FOR UPDATE TO authenticated USING(owner_id=auth.uid()) WITH CHECK(owner_id=auth.uid());
CREATE POLICY team_members_read ON public.team_members FOR SELECT TO authenticated USING(true);
CREATE POLICY team_members_remove ON public.team_members FOR DELETE TO authenticated USING(user_id=auth.uid() OR public.is_team_owner(team_id));
CREATE POLICY team_members_update ON public.team_members FOR UPDATE TO authenticated USING(public.is_team_owner(team_id)) WITH CHECK(public.is_team_owner(team_id));
GRANT SELECT,DELETE,UPDATE ON public.teams TO authenticated;
GRANT SELECT,DELETE ON public.team_members TO authenticated;
GRANT UPDATE(project_role) ON public.team_members TO authenticated;
REVOKE ALL ON FUNCTION public.is_team_member(uuid),public.is_admin(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid),public.is_admin(uuid) TO authenticated;

-- Founder-supplied reviewed definitions/behaviors, 2026-11-01. INSERT/DELETE
-- functions intentionally have no UPDATE hook: raw transfers don't sync chat.
CREATE FUNCTION public.create_team_conversation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO conversations(type,team_id) VALUES('team',NEW.id) ON CONFLICT(team_id) DO NOTHING;
 RETURN NEW;
END; $$;
CREATE FUNCTION public.add_member_to_team_conversation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE conv_id uuid;
BEGIN
 SELECT id INTO conv_id FROM conversations WHERE team_id=NEW.team_id AND type='team' LIMIT 1;
 IF conv_id IS NOT NULL THEN
  INSERT INTO conversation_participants(conversation_id,user_id) VALUES(conv_id,NEW.user_id) ON CONFLICT(conversation_id,user_id) DO NOTHING;
 END IF;
 RETURN NEW;
END; $$;
CREATE FUNCTION public.remove_member_from_team_conversation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE conv_id uuid;
BEGIN
 SELECT id INTO conv_id FROM conversations WHERE team_id=OLD.team_id AND type='team' LIMIT 1;
 IF conv_id IS NOT NULL THEN DELETE FROM conversation_participants WHERE conversation_id=conv_id AND user_id=OLD.user_id; END IF;
 RETURN OLD;
END; $$;
REVOKE ALL ON FUNCTION public.create_team_conversation(),public.add_member_to_team_conversation(),public.remove_member_from_team_conversation() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER trg_create_team_conversation AFTER INSERT ON public.teams FOR EACH ROW EXECUTE FUNCTION public.create_team_conversation();
CREATE TRIGGER trg_add_member_to_team_conversation AFTER INSERT ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.add_member_to_team_conversation();
CREATE TRIGGER trg_remove_member_from_team_conversation AFTER DELETE ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.remove_member_from_team_conversation();
-- Existing fixture teams predate installation; this local-only backfill creates
-- their equivalent conversations without simulating a production data rewrite.
INSERT INTO public.conversations(type,team_id) SELECT 'team',id FROM public.teams ON CONFLICT(team_id) DO NOTHING;
INSERT INTO public.conversation_participants(conversation_id,user_id)
 SELECT c.id,m.user_id FROM public.conversations c JOIN public.team_members m ON m.team_id=c.team_id ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email) SELECT public.fixture_id(n),'locking-'||n||'@example.invalid' FROM generate_series(9500,9520) n;
INSERT INTO public.profiles(id,email,role,is_banned,full_name,onboarding_completed)
 SELECT id,email,CASE WHEN id=public.fixture_id(9500) THEN 'admin' ELSE 'user' END,false,'Synthetic locking account',true
 FROM auth.users WHERE id BETWEEN public.fixture_id(9500) AND public.fixture_id(9520);
