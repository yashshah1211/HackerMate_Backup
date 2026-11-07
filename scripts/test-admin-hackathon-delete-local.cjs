/* eslint-disable @typescript-eslint/no-require-imports -- Real transaction/rollback tests in disposable PostgreSQL. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { setup, EVENT } = require('./admin-hackathon-harness.cjs');
const { createFixture } = require('./admin-hackathon-local-db.cjs');
const graph = require('./fixtures/hm-audit-04-hackathon-graph.json');
const OTHER = '00000000-0000-4000-8000-000000000102';
const missing = '00000000-0000-4000-8000-000000000199';

test('actual admin route and migration preserve all-or-nothing deletion with the observed FK graph', async t => {
  const db = await createFixture();
  try {
    const tables = new Map([['hackathons', new Set()], ['profiles', new Set()], ['projects', new Set()], ['team_members', new Set(['team_id'])]]);
    for (const fk of graph.foreignKeys) {
      // Snapshot is schema metadata, never executable arbitrary SQL.
      const match = fk.definition.match(/^FOREIGN KEY \(([a-z_][a-z0-9_]*)\) REFERENCES ([a-z_][a-z0-9_]*)\(id\)(?: ON DELETE (CASCADE|SET NULL))?$/);
      assert(match); assert.equal(match[2], fk.target); assert.match(fk.table, /^[a-z_][a-z0-9_]*$/); assert.match(fk.name, /^[a-z_][a-z0-9_]*$/);
      if (!tables.has(fk.table)) tables.set(fk.table, new Set());
      tables.get(fk.table).add(match[1]);
    }
    db.sql(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
      ${[...tables].map(([name, columns]) => `CREATE TABLE public.${name}(id uuid PRIMARY KEY${[...columns].map(column => `,${column} uuid`).join('')}${name === 'hackathons' ? ",name text,status text,ai_feedback jsonb" : ''});`).join('\n')}
      ${graph.foreignKeys.map(fk => `ALTER TABLE public.${fk.table} ADD CONSTRAINT ${fk.name} ${fk.definition};`).join('\n')}
      ALTER TABLE public.team_members ADD CONSTRAINT synthetic_member_team_fk FOREIGN KEY(team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
      ALTER TABLE public.hackathons ENABLE ROW LEVEL SECURITY;
      GRANT SELECT,DELETE ON public.hackathons TO service_role;
      GRANT SELECT,DELETE ON public.hackathons TO anon,authenticated;`);
    const migration = fs.readdirSync(path.join(db.root, 'supabase/migrations')).find(file => file.endsWith('_atomic_admin_hackathon_delete.sql'));
    assert(migration); db.sql(fs.readFileSync(path.join(db.root, 'supabase/migrations', migration), 'utf8'));
    const restricted = ['hustle_phase2_batches', 'hustle_phase2_teams'];
    const seedOrder = [];
    const pending = new Set([...tables.keys()].filter(name => name !== 'hackathons' && !restricted.includes(name)));
    while (pending.size) {
      const next = [...pending].find(name =>
        graph.foreignKeys.filter(fk => fk.table === name).every(fk => !pending.has(fk.target))
        && (name !== 'team_members' || !pending.has('teams')));
      assert(next, 'Fixture graph must have a valid insertion order'); seedOrder.push(next); pending.delete(next);
    }
    const seed = () => {
      db.sql(`TRUNCATE ${[...tables.keys()].map(name => 'public.' + name).join(',')} CASCADE;
        INSERT INTO public.hackathons(id,name,status,ai_feedback) VALUES('${EVENT}','Synthetic target','pending','{"preserved":true}'),('${OTHER}','Synthetic unrelated','approved','{}');
        ${seedOrder.map(name => {
          const columns = tables.get(name);
          return `INSERT INTO public.${name}(id${[...columns].map(c => ',' + c).join('')}) VALUES${[EVENT, OTHER].map(id => `('${id}'${[...columns].map(() => `,'${id}'`).join('')})`).join(',')};`;
        }).join('\n')}`);
    };
    const snapshot = () => JSON.parse(db.sql(`SELECT jsonb_build_object(${[...tables.keys()].map(name => `'${name}',(SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY id),'[]') FROM public.${name} r)`).join(',')});`));
    const rpc = async (name, args) => {
      assert.equal(name, 'admin_delete_hackathon'); assert.match(args.p_hackathon_id, /^[0-9a-f-]{36}$/);
      try {
        const output = await db.asyncSql(`SET ROLE service_role; SELECT public.admin_delete_hackathon('${args.p_hackathon_id}'::uuid);`);
        assert(['t', 'f'].includes(output)); return { data: output === 't', error: null };
      } catch (error) { return { data: null, error: { code: error.message.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1] || 'XX000', message: 'Synthetic SQL failure' } }; }
    };
    const call = id => setup({ database: { rpc, from() { throw Error('No independent REST table deletes allowed'); } } }).call({ hackathonId: id, action: 'delete' });

    await t.test('only service role can execute; invoker/boolean/search_path hardening', () => {
      for (const role of ['anon', 'authenticated']) assert.throws(() => db.sql(`SET ROLE ${role}; SELECT public.admin_delete_hackathon('${EVENT}');`), /permission denied for function/);
      assert.equal(db.sql("SELECT has_function_privilege('service_role','public.admin_delete_hackathon(uuid)','EXECUTE');"), 't');
      assert.equal(db.sql("SELECT NOT prosecdef AND prorettype='boolean'::regtype AND proconfig=ARRAY['search_path=\"\"'] FROM pg_proc WHERE oid='public.admin_delete_hackathon(uuid)'::regprocedure;"), 't');
      assert.equal(db.sql("SELECT count(*) FROM pg_proc p,LATERAL aclexplode(p.proacl) a WHERE p.oid='public.admin_delete_hackathon(uuid)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE';"), '0');
    });
    await t.test('success deletes only target-owned event data; teams, users, projects and badges survive', async () => {
      seed(); const before = snapshot();
      const response = await call(EVENT); assert.equal(response.status, 200); assert.equal((await response.json()).success, true);
      const after = snapshot(); assert.deepEqual(after.hackathons, before.hackathons.filter(row => row.id === OTHER));
      for (const [name] of tables) {
        if (['hackathons', ...restricted].includes(name)) continue;
        if (['profiles', 'projects', 'team_members'].includes(name)) assert.deepEqual(after[name], before[name]);
        else if (['teams', 'user_badges'].includes(name)) assert.deepEqual(after[name], before[name].map(row => row.id === EVENT ? { ...row, hackathon_id: null } : row));
        else assert.deepEqual(after[name], before[name].filter(row => row.id === OTHER), name);
      }
      // event_organizers has no direct service DELETE privilege, like production;
      // the existing FK action still succeeds without adding any table grant.
      assert.equal(db.sql("SELECT has_table_privilege('service_role','public.event_organizers','DELETE');"), 'f');
    });
    await t.test('missing and repeated requests never invent parent deletion', async () => {
      seed(); const before = snapshot(); assert.equal((await call(missing)).status, 404); assert.deepEqual(snapshot(), before);
      assert.equal((await call(EVENT)).status, 200); const after = snapshot();
      assert.equal((await call(EVENT)).status, 404); assert.deepEqual(snapshot(), after);
    });
    await t.test('dependent failure after registration deletion restores all earlier changes', async () => {
      seed(); const before = snapshot();
      db.sql(`CREATE FUNCTION public.hm04_child_fail() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
        IF OLD.hackathon_id='${EVENT}' THEN
          IF EXISTS(SELECT 1 FROM public.hackathon_registrations WHERE hackathon_id=OLD.hackathon_id) THEN RAISE EXCEPTION 'Earlier child deletion was not exercised'; END IF;
          RAISE EXCEPTION 'HM04_CHILD_FAILURE_AFTER_REGISTRATIONS';
        END IF; RETURN OLD; END $$;
        CREATE TRIGGER zz_hm04_child_fail AFTER DELETE ON public.team_hackathons FOR EACH ROW EXECUTE FUNCTION public.hm04_child_fail();`);
      try {
        assert.throws(() => db.sql(`SET ROLE service_role; SELECT public.admin_delete_hackathon('${EVENT}');`), /HM04_CHILD_FAILURE_AFTER_REGISTRATIONS/);
        assert.deepEqual(snapshot(), before);
        assert.equal((await call(EVENT)).status, 500); assert.deepEqual(snapshot(), before);
      } finally { db.sql('DROP TRIGGER zz_hm04_child_fail ON public.team_hackathons; DROP FUNCTION public.hm04_child_fail();'); }
    });
    await t.test('parent AFTER DELETE failure observes deleted children, then restores the full graph', async () => {
      seed(); const before = snapshot();
      db.sql(`CREATE FUNCTION public.hm04_parent_fail() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
        IF EXISTS(SELECT 1 FROM public.team_hackathons WHERE hackathon_id=OLD.id)
          OR EXISTS(SELECT 1 FROM public.hackathon_registrations WHERE hackathon_id=OLD.id) THEN RAISE EXCEPTION 'Earlier child deletion was not exercised'; END IF;
        RAISE EXCEPTION 'HM04_PARENT_FAILURE_AFTER_CHILDREN'; END $$;
        CREATE TRIGGER zz_hm04_parent_fail AFTER DELETE ON public.hackathons FOR EACH ROW EXECUTE FUNCTION public.hm04_parent_fail();`);
      try {
        assert.throws(() => db.sql(`SET ROLE service_role; SELECT public.admin_delete_hackathon('${EVENT}');`), /HM04_PARENT_FAILURE_AFTER_CHILDREN/);
        assert.deepEqual(snapshot(), before); assert.equal((await call(EVENT)).status, 500); assert.deepEqual(snapshot(), before);
      } finally { db.sql('DROP TRIGGER zz_hm04_parent_fail ON public.hackathons; DROP FUNCTION public.hm04_parent_fail();'); }
    });
    await t.test('both real restrictive dependencies fail as 409 without any partial deletion', async () => {
      for (const name of restricted) {
        seed(); db.sql(`INSERT INTO public.${name}(id,event_id) VALUES('${EVENT}','${EVENT}');`);
        const before = snapshot(); const response = await call(EVENT);
        assert.equal(response.status, 409); assert(!(await response.text()).includes(name)); assert.deepEqual(snapshot(), before);
      }
    });
    await t.test('missing delete privilege fails safely with no graph changes', async () => {
      seed(); const before = snapshot(); db.sql('REVOKE DELETE ON public.hackathons FROM service_role;');
      try { assert.equal((await call(EVENT)).status, 500); assert.deepEqual(snapshot(), before); }
      finally { db.sql('GRANT DELETE ON public.hackathons TO service_role;'); }
    });
    await t.test('zero-row deletion caused by a suppressing trigger is never success', async () => {
      seed(); const before = snapshot();
      db.sql('CREATE FUNCTION public.hm04_skip() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$; CREATE TRIGGER hm04_skip BEFORE DELETE ON public.hackathons FOR EACH ROW EXECUTE FUNCTION public.hm04_skip();');
      try { assert.equal((await call(EVENT)).status, 404); assert.deepEqual(snapshot(), before); }
      finally { db.sql('DROP TRIGGER hm04_skip ON public.hackathons; DROP FUNCTION public.hm04_skip();'); }
    });
    await t.test('eight concurrent API calls report exactly one successful parent deletion', async () => {
      seed(); const responses = await Promise.all(Array.from({ length: 8 }, () => call(EVENT)));
      assert.equal(responses.filter(response => response.status === 200).length, 1);
      assert.equal(responses.filter(response => response.status === 404).length, 7);
      assert.deepEqual(snapshot().hackathons.map(row => row.id), [OTHER]);
      assert.deepEqual(snapshot().hackathon_registrations.map(row => row.hackathon_id), [OTHER]);
    });
  } finally { await db.close(); }
});
