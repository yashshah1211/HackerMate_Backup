/* eslint-disable @typescript-eslint/no-require-imports -- Disposable native PostgreSQL fixture; no external connection accepted. */
const fs = require('node:fs');
const path = require('node:path');
const { createFixture } = require('./hustle-phase2-local-db.cjs');
const OWNER = '00000000-0000-4000-8000-000000000002';
const MEMBER = '00000000-0000-4000-8000-000000000003';
const BANNED = '00000000-0000-4000-8000-000000000004';
const TEAM = '20000000-0000-4000-8000-000000000001';
const ROW = '20000000-0000-4000-8000-000000000002';
async function workspaceFixture() {
  const db = await createFixture();
  try {
    const read = name => fs.readFileSync(path.join(db.ROOT, 'supabase/migrations', name), 'utf8');
    db.sql(`CREATE TABLE teams(id uuid PRIMARY KEY,owner_id uuid REFERENCES profiles(id));
      CREATE TABLE team_members(team_id uuid,user_id uuid); CREATE PUBLICATION supabase_realtime;
      GRANT SELECT ON teams,team_members TO authenticated;
      GRANT SELECT(id,is_banned) ON profiles TO authenticated;
      ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
      CREATE POLICY fixture_own_profile ON profiles FOR SELECT TO authenticated USING(id=auth.uid());
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO authenticated,service_role;`);
    const core = read('202607020001_core_security.sql');
    db.sql(core.slice(core.indexOf('create or replace function public.is_team_owner'), core.indexOf('create or replace function public.can_access_conversation')));
    db.sql('REVOKE ALL ON FUNCTION is_team_member(uuid),is_team_owner(uuid) FROM PUBLIC;GRANT EXECUTE ON FUNCTION is_team_member(uuid),is_team_owner(uuid) TO authenticated;');
    for (const file of ['202607050001_team_workspace.sql','202607100009_restrict_team_deletions.sql','202607120004_task_due_dates.sql']) db.sql(read(file));
    const scope = read('202608080005_hackathon_scoped_github_and_links.sql');
    db.sql(scope.match(/ALTER TABLE public\.team_links\s+ADD COLUMN IF NOT EXISTS hackathon_id[\s\S]*?;/)[0]);
    const comments = read('202607120005_workspace_v2_features.sql'); db.sql(comments.slice(0, comments.indexOf('-- 2. Resource Link')));
    const policy = read('202607180008_restrict_policies_to_authenticated.sql'); db.sql(policy.slice(0, policy.indexOf('-- 2. team_link_upvotes')));
    db.sql(read('202610120002_team_document_revisions.sql'));
    // Prove the fix clears independent immutable-column privileges too.
    db.sql('GRANT UPDATE(created_by,team_id,id,created_at) ON team_tasks,team_links TO PUBLIC,anon,authenticated;');
    const migrations = process.env.MISSION03_WORKSPACE_BASELINE === '1' ? [] : fs.readdirSync(path.join(db.ROOT, 'supabase/migrations')).filter(name => name.endsWith('_workspace_actor_boundaries.sql'));
    for (const file of migrations) db.sql(read(file));
    const as = (user, sql) => db.sql(`SET ROLE authenticated;SET request.jwt.claim.sub='${user}';${sql}`).split('\n').at(-1);
    const reset = () => db.sql(`TRUNCATE team_task_comments,team_documents,team_tasks,team_links,team_members,teams CASCADE;
      INSERT INTO profiles(id,role,is_banned) VALUES('${MEMBER}','user',false) ON CONFLICT(id) DO UPDATE SET is_banned=false;
      INSERT INTO teams VALUES('${TEAM}','${OWNER}'); INSERT INTO team_members VALUES('${TEAM}','${MEMBER}'),('${TEAM}','${BANNED}');
      INSERT INTO team_tasks(id,team_id,title,created_by) VALUES('${ROW}','${TEAM}','Synthetic task','${MEMBER}');
      INSERT INTO team_links(id,team_id,title,url,created_by) VALUES('${ROW}','${TEAM}','Synthetic link','https://example.invalid','${MEMBER}');
      INSERT INTO team_documents(team_id,content,revision) VALUES('${TEAM}','Synthetic document',1);`);
    return { ...db, as, reset, read, migrations };
  } catch (error) { await db.close(); throw error; }
}
module.exports = { workspaceFixture, OWNER, MEMBER, BANNED, TEAM, ROW };
