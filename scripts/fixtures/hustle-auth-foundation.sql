-- SYNTHETIC ONLY: minimal dependencies for a newly created, unlinked local
-- Supabase stack. Profile policies/guard reproduce inspected production rules.
-- This is not a production schema dump or a production migration.
CREATE TABLE public.profiles (
 id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 role text DEFAULT 'user', is_banned boolean DEFAULT false,
 email text,full_name text,updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.hackathons(id uuid PRIMARY KEY,type varchar(50),organizer_id uuid);
CREATE TABLE public.event_organizers(hackathon_id uuid REFERENCES public.hackathons(id),user_id uuid REFERENCES public.profiles(id),PRIMARY KEY(hackathon_id,user_id));
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hackathons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_organizers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profiles,public.hackathons,public.event_organizers FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT(id,role,is_banned,full_name,updated_at) ON profiles TO anon,authenticated;
GRANT INSERT,UPDATE,DELETE ON profiles TO anon,authenticated;
GRANT ALL ON profiles,hackathons,event_organizers TO service_role;
GRANT SELECT(id) ON hackathons TO authenticated;
CREATE POLICY fixture_event_read ON hackathons FOR SELECT TO authenticated USING(true);
REVOKE ALL ON auth.users,auth.sessions FROM service_role;
GRANT USAGE ON SCHEMA auth TO postgres;
GRANT SELECT(id,email),REFERENCES(id) ON auth.users TO postgres;
GRANT SELECT(id,user_id,not_after) ON auth.sessions TO postgres;
CREATE FUNCTION public.is_admin(user_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=user_id AND role='admin');
$$;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
CREATE FUNCTION public.handle_profile_roles_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND (OLD.role IS DISTINCT FROM NEW.role OR OLD.is_banned IS DISTINCT FROM NEW.is_banned) THEN
  IF NOT public.is_admin(auth.uid()) THEN NEW.role:=OLD.role;NEW.is_banned:=OLD.is_banned;END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_profile_roles_update BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION public.handle_profile_roles_update();
CREATE POLICY profiles_admin_update ON profiles FOR UPDATE TO authenticated USING(is_admin(auth.uid())) WITH CHECK(is_admin(auth.uid()));
CREATE POLICY profiles_update_self ON profiles FOR UPDATE TO authenticated USING(id=auth.uid()) WITH CHECK(id=auth.uid());
CREATE POLICY profiles_create_self ON profiles FOR INSERT TO authenticated WITH CHECK(id=auth.uid());
CREATE POLICY profiles_read ON profiles FOR SELECT TO authenticated USING(id=auth.uid() OR is_banned=false OR is_admin(auth.uid()));
CREATE POLICY profiles_read_anon ON profiles FOR SELECT TO anon USING(true);
CREATE TABLE public.user_reports(id uuid PRIMARY KEY);
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;
GRANT SELECT,DELETE ON user_reports TO authenticated;
CREATE POLICY user_reports_admin_select ON user_reports FOR SELECT TO authenticated USING(is_admin(auth.uid()));
CREATE POLICY user_reports_admin_delete ON user_reports FOR DELETE TO authenticated USING(is_admin(auth.uid()));
