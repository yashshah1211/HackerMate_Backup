/* eslint-disable @typescript-eslint/no-require-imports -- Production-observed trigger body, disposable synthetic schema only. */
const assert=require('node:assert/strict');
const {createFixture}=require('./hustle-phase2-local-db.cjs');
let checks=0;
const check=(v,label)=>{assert(v,label);checks++;};
(async()=>{
 const db=await createFixture();
 try{
  // Minimal substitutes for production columns/policies, not production signup evidence.
  db.sql(`ALTER TABLE auth.users ADD raw_user_meta_data jsonb;
   ALTER TABLE profiles ADD full_name text,ADD email text,ADD avatar_url text,ADD onboarding_completed boolean NOT NULL DEFAULT false,
   ADD college text,ADD year_of_study text,ADD skills text[],ADD bio text,ADD github_url text,ADD linkedin_url text,ADD updated_at timestamptz;
   ALTER TABLE profiles ALTER role SET DEFAULT 'user',ALTER is_banned SET DEFAULT false;
   CREATE ROLE postgres NOLOGIN BYPASSRLS;GRANT USAGE,CREATE ON SCHEMA public TO postgres;
   ALTER TABLE profiles OWNER TO postgres;
   -- Exact body observed read-only on production 2026-10-20, unchanged.
   CREATE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
   AS $function$ begin insert into public.profiles (id, full_name, email, avatar_url) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''), new.email, new.raw_user_meta_data->>'avatar_url') on conflict (id) do nothing; return new; end; $function$;
   ALTER FUNCTION public.handle_new_user() OWNER TO postgres;
   CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
   ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
   CREATE POLICY synthetic_own_select ON profiles FOR SELECT TO authenticated USING(id=auth.uid());
   CREATE POLICY synthetic_own_update ON profiles FOR UPDATE TO authenticated USING(id=auth.uid()) WITH CHECK(id=auth.uid());
   GRANT SELECT(id,full_name,email,avatar_url,role,is_banned,onboarding_completed,college,year_of_study,skills,bio,github_url,linkedin_url,updated_at) ON profiles TO authenticated;
   GRANT UPDATE(college,year_of_study,skills,bio,github_url,linkedin_url,onboarding_completed,updated_at) ON profiles TO authenticated;`);
  for(const [i,meta] of [[1,'{"full_name":"Synthetic One","avatar_url":"https://example.invalid/avatar"}'],[2,'{"name":"Synthetic Two"}'],[3,'{}']]){
   const id='82000000-0000-4000-8000-'+String(i).padStart(12,'0');
   db.sql(`INSERT INTO auth.users(id,email,raw_user_meta_data)VALUES('${id}','synthetic-${i}@example.invalid','${meta}')`);
   check(db.sql(`SELECT count(*) FROM profiles WHERE id='${id}' AND role='user' AND is_banned=false AND onboarding_completed=false`)==='1','Auth insert automatically creates ordinary incomplete profile');
   check(db.sql(`SELECT full_name=${i===1?"'Synthetic One'":i===2?"'Synthetic Two'":"''"} FROM profiles WHERE id='${id}'`)==='t','Google metadata name fallback matches production trigger');
   check(db.sql(`SET ROLE authenticated;SET request.jwt.claim.sub='${id}';UPDATE profiles SET college='Synthetic College',year_of_study='2nd Year',skills=ARRAY['TypeScript'],bio='Synthetic',github_url=NULL,linkedin_url=NULL,onboarding_completed=true,updated_at=now() WHERE id='${id}' RETURNING id`).split(/\r?\n/).includes(id),'Normal own-profile onboarding update returns existing ID');
   check(db.sql(`SELECT onboarding_completed AND role='user' AND NOT is_banned FROM profiles WHERE id='${id}'`)==='t','Onboarding completes without role escalation');
  }
  console.log(`Signup trigger/onboarding: ${checks} passed, 0 failed; exact trigger body with synthetic policies/columns, not a hosted signup.`);
 }finally{await db.close();console.log('Signup fixture cleanup complete.');}
})().catch(e=>{console.error(e);process.exitCode=1;});
