/* eslint-disable @typescript-eslint/no-require-imports -- Disposable synthetic PostgreSQL fixture; no connected database. */
const fs=require('node:fs'),path=require('node:path');
const {createFixture}=require('./hustle-phase2-local-db.cjs');
async function deliveryFixture(){const db=await createFixture();try{
  db.sql(`CREATE ROLE postgres NOLOGIN NOSUPERUSER BYPASSRLS; CREATE ROLE supabase_auth_admin NOLOGIN;
   ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz DEFAULT now(),ADD COLUMN is_anonymous boolean DEFAULT false;
   ALTER TABLE auth.users OWNER TO supabase_auth_admin;
   CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);
   ALTER TABLE auth.sessions OWNER TO supabase_auth_admin;
   CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
   ALTER TABLE profiles ADD COLUMN onboarding_completed boolean DEFAULT true;
   CREATE FUNCTION public.is_admin(user_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=user_id AND role='admin')$$;
   REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC,anon,service_role; GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
   GRANT USAGE ON SCHEMA auth TO postgres,supabase_auth_admin; GRANT USAGE,CREATE ON SCHEMA public TO postgres;
   GRANT SELECT(id,email,email_confirmed_at,is_anonymous),REFERENCES(id) ON auth.users TO postgres;
   GRANT SELECT(id,user_id,not_after) ON auth.sessions TO postgres;`);
  for(const table of db.sql("SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r'").split(/\r?\n/))db.sql(`ALTER TABLE public.${table} OWNER TO postgres`);
  for(const fn of db.sql("SELECT oid::regprocedure::text FROM pg_proc WHERE pronamespace='public'::regnamespace AND prokind='f'").split(/\r?\n/))db.sql(`ALTER FUNCTION public.${fn} OWNER TO postgres`);
  db.sql('SET ROLE postgres;'+fs.readFileSync(path.join(db.ROOT,'supabase/migrations/20261018174144_hustle_round2_auth_guards.sql'),'utf8'));
  const source=fs.readFileSync(path.join(db.ROOT,'supabase/migrations/20261020055415_hustle_participant_accounts.sql'),'utf8');
  db.sql('SET ROLE postgres;'+source);

  db.sql('SET ROLE postgres;'+fs.readFileSync(path.join(db.ROOT,'supabase/migrations/20261020201500_hustle_google_sessions.sql'),'utf8'));
 db.sql('SET ROLE postgres;'+fs.readFileSync(path.join(db.ROOT,'supabase/migrations/20261022141142_hustle_round2_delivery.sql'),'utf8'));
 db.sql(`INSERT INTO auth.sessions SELECT ('82000000'||substring(id::text,9))::uuid,id,NULL FROM auth.users`);
 return db;
}catch(error){await db.close();throw error;}}
module.exports={deliveryFixture};
