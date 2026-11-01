/* eslint-disable @typescript-eslint/no-require-imports -- Offline review-artifact checks, never SQL execution. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const base = '4818052a944451c74ae0a7d7c4572f3e7c3d0f8e';
const dir = path.join(root, 'docs/qa/mission20-c1');
const read = name => fs.readFileSync(path.join(dir, name), 'utf8');
const expand = read('sql/01-expand.proposed.sql'), contract = read('sql/02-contract.proposed.sql');
const inventory = JSON.parse(read('QUERY-INVENTORY.json'));

test('immutable-base inventory is reproducible, including joins and SQL context', () => {
  const output = cp.execFileSync(process.execPath, ['scripts/mission20-c1-inventory.cjs', '--check'], { cwd: root, encoding: 'utf8' });
  assert.match(output, /Inventory matches/);
  assert.equal(inventory.base, base);
  assert.equal(inventory.queries.filter(q => q.file.startsWith('src/') && q.table === 'hackathon_registrations').length, 11);
  assert.equal(inventory.queries.filter(q => q.file.startsWith('src/') && q.table === 'hackathons').length, 37);
  assert(inventory.queries.some(q => q.joinedTables.includes('hackathons') && q.file.includes('certificates/verify')));
  assert(inventory.sqlFragments.some(s => s.file.endsWith('202610060004_partner_registration_privacy.sql') && s.fragment.includes('GRANT INSERT')));
  assert(inventory.references.some(r => r.file === 'supabase/rollback/phase1_prestate.sql'));
  const expected = cp.execFileSync('git', ['grep', '-I', '-l', '-w', '-e', 'hackathon_registrations', '-e', 'hackathons', base, '--'], { cwd: root, encoding: 'utf8' }).trim().split('\n').map(f => f.slice(base.length + 1));
  assert.deepEqual([...new Set(inventory.references.map(r => r.file))].sort(), expected.sort());
  assert(inventory.otherTextContexts.some(c => c.file.endsWith('test-squad-matching-local.py')));
});

test('design leaves application, active migration, policy and environment files untouched', () => {
  const changed = cp.execFileSync('git', ['diff', base, '--name-only', '--', 'src', 'supabase', '.github', 'package.json', 'package-lock.json', '.env', '.env.local'], { cwd: root, encoding: 'utf8' });
  assert.equal(changed.trim(), '');
  const files = fs.readdirSync(path.join(dir, 'sql'));
  assert.deepEqual(files.sort(), ['00-freeze-admission.proposed.sql','00-preflight.review.sql','01-expand.proposed.sql','02-contract.proposed.sql','03-rollback-freeze.proposed.sql','04-security-tests.review.sql','05-per-team-roster.alternative.sql','06-unfreeze-admission.proposed.sql','07-writer-protocol.proposed.sql','08-existing-writers.proposed.sql','09-writer-fixture.review.sql']);
  for (const file of files) assert.match(read('sql/' + file), /REVIEW ONLY/);
});

test('future preflight contains SELECT statements only', () => {
  const text = read('sql/00-preflight.review.sql').replace(/--[^\n]*/g, '');
  for (const statement of text.split(';').map(s => s.trim()).filter(Boolean)) assert.match(statement, /^SELECT\b/);
});

test('privileged proposed bodies are private, fixed-path and explicitly non-public', () => {
  const functions = [...expand.matchAll(/CREATE FUNCTION ([\w.]+)[\s\S]*?\$\$;/g)].map(m => ({ name: m[1], definition: m[0] }));
  assert.equal(functions.length, 8);
  const elevated = functions.filter(f => f.definition.includes('SECURITY DEFINER'));
  assert.deepEqual(elevated.map(f => f.name).sort(), ['mission20_private.guard_hackathon_approval', 'mission20_private.guard_registration_write', 'mission20_private.register_native']);
  for (const fn of elevated) assert.match(fn.definition, /SET search_path = ''/);
  assert.match(expand, /REVOKE ALL ON ALL FUNCTIONS IN SCHEMA mission20_private FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(expand, /REVOKE ALL ON FUNCTION public\.register_native_hackathon\(uuid, uuid, boolean\) FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(expand, /public\.register_native_hackathon[\s\S]*?SECURITY INVOKER/);
  assert(!/GRANT\s+(?:EXECUTE|ALL)[^;]+TO\s+(?:PUBLIC|anon|service_role)/i.test(expand));
});

test('contract clears table/explicit column insert grants and adds restrictive community authorization', () => {
  assert.match(contract, /REVOKE INSERT ON public\.hackathon_registrations FROM PUBLIC, anon, authenticated/);
  assert.match(contract, /pg_catalog\.pg_attribute/);
  assert.match(contract, /quote_ident\(attname\)/);
  assert.match(contract, /REVOKE INSERT \(%s\)/);
  assert.match(contract, /CREATE POLICY mission20_no_direct_native[\s\S]*?AS RESTRICTIVE/);
  assert.match(contract, /h\.type IN \('external', 'official'\)/);
  assert(!/DROP POLICY registrations_(?:read_scoped|update_self|delete_self)/.test(contract));
});

test('candidate retains the concurrency and legacy-delete design safeguards', () => {
  assert.match(expand, /transaction_isolation'\) <> 'read committed'/);
  assert.match(expand, /WHERE h\.id = p_event_id FOR UPDATE/);
  assert.match(expand, /LOCK TABLE public\.team_members IN SHARE MODE/);
  assert.match(expand, /UNION SELECT v_owner/);
  assert.match(expand, /clock_timestamp\(\)/);
  assert.match(expand, /NEW\.status := CASE/);
  assert.match(expand, /confdeltype='c'/);
  assert.match(read('sql/04-security-tests.review.sql'), /REFERENCES public\.teams\(id\) ON DELETE CASCADE/);
  assert(!/ON DELETE SET NULL/.test(read('sql/04-security-tests.review.sql')));
  assert.match(expand, /v_role text := current_setting\('role', true\)/);
});

test('rollback freezes both RPC entry points and column writes without reopening native policy', () => {
  const rollback = read('sql/03-rollback-freeze.proposed.sql');
  assert.match(rollback, /REVOKE EXECUTE ON FUNCTION public\.register_native_hackathon/);
  assert.match(rollback, /REVOKE EXECUTE ON FUNCTION mission20_private\.register_native/);
  assert.match(rollback, /REVOKE INSERT \(%s\)/);
  assert.match(rollback, /AS RESTRICTIVE\s+FOR INSERT TO authenticated WITH CHECK \(false\)/);
  assert(!/\bGRANT\b/.test(rollback));
});

test('future SQL tests reuse the existing privacy suite and refuse arbitrary databases', () => {
  const tests = read('sql/04-security-tests.review.sql');
  assert.match(tests, /current_database\(\) = 'partner_authz_fixture'/);
  assert.match(tests, /inet_server_addr\(\) = '127\.0\.0\.1'::inet/);
  assert.match(tests, /session_user = 'postgres'/);
  assert.match(tests, /\\ir .*scripts\/test-registration-privacy\.sql/);
  assert.match(tests, /\\quit 3/);
  for (const term of ['SQL', 'not', 'C1']) assert(read('TEST-PLAN.md').includes(term));
});

test('per-team prototype locks affected parents before the event and never takes the global roster lock', () => {
  const sql=read('sql/05-per-team-roster.alternative.sql');
  assert.match(sql,/BEFORE INSERT OR UPDATE OR DELETE ON public\.team_members/);
  assert.match(sql,/SELECT DISTINCT x\.id FROM unnest\(ids\) x\(id\) ORDER BY x\.id/);
  assert(!/LOCK TABLE public\.team_members/.test(sql));
  assert(sql.indexOf('WHERE t.id = p_team_id FOR UPDATE')<sql.indexOf('WHERE h.id = p_event_id FOR UPDATE'));
  assert.match(sql,/REVOKE ALL ON FUNCTION mission20_private\.lock_roster_parents\(\)/);
});

test('release freeze covers new RPC writes and contract never unfreezes on its own', () => {
  assert.match(read('sql/00-freeze-admission.proposed.sql'),/AS RESTRICTIVE\s+FOR INSERT TO authenticated WITH CHECK\(false\)/);
  assert.match(expand,/policyname IN \('mission20_release_freeze','mission20_admission_frozen'\)/);
  assert(!/DROP POLICY mission20_release_freeze/.test(contract));
  assert.match(read('sql/06-unfreeze-admission.proposed.sql'),/per_team_and_contract_release_gate_required/);
});

test('PostgreSQL runner refuses caller-supplied connections before starting a cluster', () => {
  const r=cp.spawnSync(process.execPath,['scripts/qualify-mission20-c1-postgres.cjs','--host=example.invalid'],{cwd:root,encoding:'utf8',timeout:3000});
  assert.equal(r.status,1); assert.match(r.stderr,/Run only with --local-only/);
  assert(!r.stdout.includes('SQL assertions:'));
});

test('organizer harness repair preserves every pre-review assertion expression', () => {
  const file='scripts/test-organizer-broadcast-authorization.cjs';
  const before=cp.execFileSync('git',['show','09641f28c2efe4fdc55fd2de448b1503d070f8e0:'+file],{cwd:root,encoding:'utf8'});
  const current=fs.readFileSync(path.join(root,file),'utf8');
  const assertions=text=>text.split(/\r?\n/).filter(line=>/\bassert(?:\.|\()/.test(line));
  assert.deepEqual(assertions(current),assertions(before));
  assert.match(current,/'@\/lib\/hackathons\/lifecycle': require\('\.\/ppt-vision-harness\.cjs'\)\.harness\(\)\.load/);
});

test('locking query inventory reproduces every baseline API projection and SQL context', () => {
  const output=cp.execFileSync(process.execPath,['scripts/mission20-c1-locking-inventory.cjs','--check'],{cwd:root,encoding:'utf8'});
  assert.match(output,/94 API chains \/ 366 SQL contexts/);
  const lock=JSON.parse(read('LOCK-QUERY-INVENTORY.json'));
  assert.equal(lock.base,'f7845bc5993a8145782b1d614c62a391c1012081');
  assert.equal(lock.queries.filter(q=>q.file.startsWith('src/')&&q.operations.some(o=>['insert','update','delete','upsert'].includes(o.operation))).length,13);
});

test('existing writer prototypes preserve all original checks and DML except explicit lock edits', () => {
  const output=cp.execFileSync(process.execPath,['scripts/mission20-c1-writer-proposals.cjs','--check'],{cwd:root,encoding:'utf8'});
  assert.match(output,/matches immutable sources/);
  const {definition}=require('./mission20-c1-writer-proposals.cjs');
  const proposal=read('sql/08-existing-writers.proposed.sql').replace(/\r/g,'');
  const normalized=s=>s.replace(/\s+/g,' ').trim().replace(/\bAS \$\$/gi,()=> 'as $$');
  for(const [file,name] of [
    ['supabase/migrations/202610060001_restore_safe_user_deletion.sql','public.delete_user_completely'],
    ['supabase/migrations/202607020001_core_security.sql','public.accept_team_invite'],
    ['supabase/migrations/202607020001_core_security.sql','public.accept_team_join_request'],
    ['supabase/migrations/202607070001_ensure_team_conversation.sql','public.ensure_team_conversation'],
  ]) {
    const original=definition(file,name),start=proposal.toLowerCase().indexOf('create or replace function '+name);
    const open=proposal.indexOf('$$',start),end=proposal.indexOf('$$;',open+2);
    let actual=proposal.slice(start,end+3).replace(/\n\s*-- M20 LOCK BEGIN[\s\S]*?-- M20 LOCK END\n/g,'\n')
      .replace(/\nSET lock_timeout='3s' SET statement_timeout='15s'/g,'')
      .replace('LIMIT 1 FOR UPDATE OF m, p NOWAIT;','LIMIT 1 FOR UPDATE OF m, p;');
    assert.equal(normalized(actual),normalized(original),name+' authorization/behavior drift');
  }
});

test('writer protocol adds no base-table authority and bounds legacy child-first conflicts', () => {
  const sql=read('sql/07-writer-protocol.proposed.sql');
  assert(!/(?:CREATE|DROP|ALTER) POLICY|GRANT (?:SELECT|INSERT|UPDATE|DELETE|ALL) ON public\./i.test(sql));
  assert.match(sql,/FOR UPDATE NOWAIT/);
  assert.match(sql,/DELETE FROM public\.team_members[\s\S]*INSERT INTO public\.team_members SELECT \* FROM unnest\(members\)/);
  for(const name of ['mission20_remove_team_member','mission20_set_project_role','mission20_delete_team']) {
    const start=sql.indexOf('CREATE FUNCTION public.'+name),end=sql.indexOf('END; $$;',start);
    const body=sql.slice(start,end);
    assert.match(body,/SECURITY INVOKER/);assert.match(body,/lock_authorized_team/);
  }
  assert.match(read('sql/08-existing-writers.proposed.sql'),/OLD\.hackathon_id FOR UPDATE NOWAIT/);
  assert.match(read('sql/06-unfreeze-admission.proposed.sql'),/lock_team_parents\(uuid\[\]\)/);
});

test('writer fixture records confirmed conversation cascades and fail-closed audit behavior', () => {
  const fixture=read('sql/09-writer-fixture.review.sql');
  for(const name of ['trg_create_team_conversation','trg_add_member_to_team_conversation','trg_remove_member_from_team_conversation'])assert(fixture.includes(name));
  assert.match(fixture,/REFERENCES public\.conversations\(id\) ON DELETE CASCADE/);
  assert.match(fixture,/REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
  assert.match(fixture,/202608030005_add_deleted_user_logs_audit_trigger\.sql/);
  assert.match(fixture,/202610060001_restore_safe_user_deletion\.sql/);
  const runner=fs.readFileSync(path.join(root,'scripts/qualify-mission20-c1-writers.cjs'),'utf8');
  assert.match(runner,/swallowed audit insert still makes RPC fail/);
  assert.match(runner,/55P03/);assert(!/process\.env|\.env\.local|supabase\.co/.test(runner));
});
