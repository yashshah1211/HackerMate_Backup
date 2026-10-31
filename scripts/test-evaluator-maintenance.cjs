import('node:test').then(({ test: outerTest }) => outerTest('evaluator maintenance runtime regressions', async t => {
const { default: assert } = await import('node:assert/strict');
const { default: React } = await import('react');
const { default: runtime } = await import('react/jsx-runtime');
const { renderToStaticMarkup } = await import('react-dom/server');
const { jsPDF } = await import('jspdf');
const { harness } = await import('./ppt-vision-harness.cjs');
const cases = [];
const test = (name, run) => cases.push([name, run]);
const tick = () => new Promise(resolve => setImmediate(resolve));

// Real component handlers and effects; only framework controls, identity,
// transport and navigation are synthetic. No browser engine or live services.
function componentFixture(file, overrides = {}, globals = {}, props = {}) {
  let cursor = 0, controls = [], Component;
  const slots = [], effects = [];
  const hooks = { ...React,
    useState(initial) { const id = cursor++; if (!slots[id]) slots[id] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[id].value, value => { slots[id].value = typeof value === 'function' ? value(slots[id].value) : value; }]; },
    useRef(initial) { const id = cursor++; return (slots[id] ??= { current: initial }); },
    useEffect(fn, deps) { const id = cursor++, old = slots[id];
      if (!old || !deps || deps.some((value, i) => !Object.is(value, old.deps?.[i]))) { slots[id] = { deps, cleanup: old?.cleanup }; effects.push(() => { slots[id].cleanup?.(); slots[id].cleanup = fn(); }); } },
  };
  const control = name => p => { controls.push({ name, ...p }); return React.createElement('div', null, p.children, p.footer, p.actions, p.description); };
  const system = new Proxy({}, { get: (_, name) => name === '__esModule' ? false : control(name) });
  const jsx = name => (type, p, key) => { if (type === 'form') controls.push({ name: 'form', ...p }); return runtime[name](type, p, key); };
  const loader = harness({ react: hooks, 'react/jsx-runtime': { ...runtime, jsx: jsx('jsx'), jsxs: jsx('jsxs') },
    '@/components/system': system, 'next/link': control('Link'), ...overrides },
    { document: { getElementById: () => null }, ...globals });
  Component = loader.load(file).default;
  return { render() { cursor = 0; controls = []; return renderToStaticMarkup(React.createElement(Component, props)); },
    get controls() { return controls; }, async effects() { for (const fn of effects.splice(0)) fn(); await tick(); await tick(); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); }, loader };
}

function activityFixture(change = {}) {
  const id = '00000000-0000-4000-8000-000000000001', at = '2026-10-01T12:00:00Z';
  const tables = {
    app_settings: { key: 'last_db_report_run', value: at },
    profiles: [{ id, full_name: null, email: 'fake@example.invalid', college: null, role: null, skills: null, created_at: at }],
    teams: [{ id, name: 'Synthetic team', description: null, college: null, is_recruiting: null, owner_id: id, created_at: at, profiles: { full_name: 'Synthetic owner' } }],
    team_members: [{ id, team_id: id, user_id: id, role: null, project_role: null, created_at: at, teams: { name: 'Synthetic team' }, profiles: { full_name: null, email: 'fake@example.invalid' } }],
    team_hackathons: [{ team_id: id, hackathon_id: id, created_at: at, teams: { name: 'Synthetic team' }, hackathons: { name: 'Synthetic event' } }],
    team_invites: [{ id, team_id: id, invited_user_id: id, invited_by: id, status: 'pending', created_at: at, teams: { name: 'Synthetic team' }, profiles: { full_name: 'Synthetic invitee', email: 'fake@example.invalid' } }],
    friend_requests: [{ id, sender_id: id, receiver_id: id, status: 'pending', created_at: at, sender: { full_name: 'Synthetic sender' }, receiver: { full_name: null, email: 'fake@example.invalid' } }],
    hackathons: [{ id, name: 'Synthetic event', start_date: null, end_date: null, location: null, mode: null, prize_pool: null, created_at: at }],
    feedback: [{ id, user_id: null, user_email: null, type: 'bug', message: 'Synthetic feedback', created_at: at }],
    team_documents: [{ id, team_id: id, updated_by: null, updated_at: at, teams: { name: 'Synthetic team' } }], messages: null,
  };
  change.mutate?.(tables);
  const reads = [], logs = [];
  const client = { from(table) { const q = { table }; reads.push(q); const b = {
    select(columns) { q.columns = columns; return b; }, eq() { return b; }, gte(key, value) { q.since = value; q.key = key; return b; }, order() { return b; }, maybeSingle() { return b; },
    then(resolve, reject) { return Promise.resolve({ data: change.errorTable === table ? null : tables[table], error: change.errorTable === table ? change.error : null, count: table === 'messages' ? 7 : null }).then(resolve, reject); },
  }; return b; } };
  const loader = harness({}, { console: { error: (...args) => logs.push(args), warn: (...args) => logs.push(args) } });
  return { api: loader.load('src/lib/admin/databaseActivityReport.ts'), client, tables, reads, logs };
}

test('all nine report mappings preserve values, nullable fields, counts and a real PDF', async () => {
  const f = activityFixture(), before = JSON.stringify(f.tables);
  const data = await f.api.fetchDatabaseActivity(f.client);
  assert.equal(data.summary.totalNewItems, 9); assert.equal(data.messages_count_24h, 7);
  for (const key of ['profiles', 'teams', 'team_members', 'team_hackathons', 'team_invites', 'friend_requests', 'hackathons', 'feedback', 'team_documents']) assert.equal(data[key].length, 1, key);
  assert.equal(data.teams[0].owner_name, 'Synthetic owner'); assert.equal(data.team_members[0].user_name, 'fake@example.invalid');
  assert.equal(data.team_hackathons[0].hackathon_name, 'Synthetic event'); assert.equal(data.team_invites[0].invited_name, 'Synthetic invitee');
  assert.equal(data.friend_requests[0].sender_name, 'Synthetic sender'); assert.equal(data.friend_requests[0].receiver_name, 'fake@example.invalid');
  assert.equal(data.team_documents[0].updated_by, null); assert.equal(data.profiles[0].skills, null); assert.equal(data.teams[0].is_recruiting, null);
  // Compare report values across the VM boundary, not realm-specific prototypes.
  assert.deepEqual(JSON.parse(JSON.stringify(data.profiles)), f.tables.profiles); assert.deepEqual(JSON.parse(JSON.stringify(data.feedback)), f.tables.feedback);
  assert.equal(data.timeWindow.isFallback24h, false); assert(f.reads.filter(q => q.table !== 'app_settings').every(q => q.since === f.tables.app_settings.value));
  assert(f.reads.every(q => !q.columns.includes('*'))); assert.equal(JSON.stringify(f.tables), before); assert.equal(f.logs.length, 0);
  const pdf = f.api.generateDatabaseActivityPdf(data); assert.equal(pdf.subarray(0, 5).toString(), '%PDF-'); assert(pdf.length > 1000);
});
test('report retains nullable timestamps and valid typed skills/recruiting fields', async () => {
  const f = activityFixture({ mutate(t) { for (const key of ['profiles', 'teams', 'team_members', 'team_hackathons', 'team_invites', 'friend_requests', 'hackathons']) t[key][0].created_at = null; t.profiles[0].skills = ['TypeScript']; t.teams[0].is_recruiting = false; } });
  const data = await f.api.fetchDatabaseActivity(f.client); assert.equal(data.profiles[0].created_at, null); assert.equal(data.hackathons[0].created_at, null);
  assert.deepEqual(data.profiles[0].skills, ['TypeScript']); assert.equal(data.teams[0].is_recruiting, false); assert.equal(f.api.generateDatabaseActivityPdf(data).subarray(0, 5).toString(), '%PDF-');
});
for (const relation of [null, [], [{ full_name: 'Array owner' }]]) test('report handles nullable and singleton joins: ' + JSON.stringify(relation), async () => {
  const f = activityFixture({ mutate(t) { t.teams[0].profiles = relation; t.team_members[0].teams = null; t.team_members[0].profiles = null; } });
  const data = await f.api.fetchDatabaseActivity(f.client, '2026-10-01T00:00:00Z');
  assert.equal(data.teams[0].owner_name, Array.isArray(relation) && relation.length ? 'Array owner' : 'Unknown');
  assert.equal(data.team_members[0].team_name, 'Unknown Team'); assert.equal(data.team_members[0].user_name, 'Unknown User');
});
for (const [table, field, value] of [['profiles', 'skills', [123]], ['profiles', 'id', null], ['teams', 'is_recruiting', 'false'], ['teams', 'profiles', [{}, {}]], ['team_documents', 'updated_by', 123]]) test('report rejects malformed ' + table + '.' + field, async () => {
  const f = activityFixture({ mutate(t) { t[table][0][field] = value; } });
  await assert.rejects(f.api.fetchDatabaseActivity(f.client), /Invalid database activity field/); assert(f.logs.length);
});
test('report query errors retain safe codes without private details and preserve empty fallback', async () => {
  const secret = 'sensitive-row-or-credential'; const f = activityFixture({ errorTable: 'profiles', error: { code: '42501', message: secret, details: secret } });
  const data = await f.api.fetchDatabaseActivity(f.client); assert.equal(data.profiles.length, 0); assert(JSON.stringify(f.logs).includes('42501')); assert(!JSON.stringify(f.logs).includes(secret));
});
test('empty report and missing last-run setting preserve 24h fallback and PDF output', async () => {
  const f = activityFixture({ mutate(t) { for (const k of Object.keys(t)) t[k] = k === 'app_settings' || k === 'messages' ? null : []; } });
  const data = await f.api.fetchDatabaseActivity(f.client); assert.equal(data.summary.totalNewItems, 0); assert.equal(data.timeWindow.isFallback24h, true);
  assert.equal(f.api.generateDatabaseActivityPdf(data).subarray(0, 5).toString(), '%PDF-');
});

for (const [metadata, expected] of [
  [null, 'HM-CERT-12345678'],
  [{ certificate_id: 'SYNTHETIC-CERT', team_name: 'Synthetic team', extra: { compatible: true } }, 'SYNTHETIC-CERT'],
  [{ certificate_id: { unsafe: true }, team_name: 123 }, 'HM-CERT-12345678'],
  [{ certificate_id: 123 }, '123'],
  [{ certificate_id: -7 }, '-7'],
  [{ certificate_id: '00123' }, '00123'],
  [{}, 'HM-CERT-12345678'],
  [{ certificate_id: '' }, 'HM-CERT-12345678'],
  [{ certificate_id: 0 }, 'HM-CERT-12345678'],
  [{ certificate_id: false }, 'HM-CERT-12345678'],
  [{ certificate_id: true }, 'HM-CERT-12345678'],
  [{ certificate_id: [] }, 'HM-CERT-12345678'],
  [{ certificate_id: NaN }, 'HM-CERT-12345678'],
  [{ certificate_id: Infinity }, 'HM-CERT-12345678'],
  [{ certificate_id: -Infinity }, 'HM-CERT-12345678'],
]) test('certificate renders and downloads with safe historical metadata: ' + String(metadata?.certificate_id), async () => {
  let saved; const badge = { id: '12345678-synthetic', issued_at: '2026-10-01', badge_name: 'Winner - Synthetic event', issuer_name: 'Synthetic organizer', metadata };
  const f = componentFixture('src/components/CertificateModal.tsx', { jspdf: { jsPDF: function(options) { const doc = new jsPDF(options); doc.save = name => { saved = { name, bytes: Buffer.from(doc.output('arraybuffer')) }; }; return doc; } } }, {}, { isOpen: true, badge, recipientName: 'Synthetic Builder', onClose() {} });
  const html = f.render(); assert(html.includes('>' + expected + '</span>'));
  await f.controls.find(c => c.name === 'Button' && c.onClick?.name === 'generatePDF').onClick();
  assert.equal(saved.name, 'synthetic_builder_achievement_certificate.pdf'); assert.equal(saved.bytes.subarray(0, 5).toString(), '%PDF-');
  assert(saved.bytes.toString().includes(expected)); assert(saved.bytes.toString().includes('Synthetic Builder'));
  assert(saved.bytes.toString().includes('https://hackermate.in/verify/' + expected));
  if (typeof metadata?.team_name === 'string') assert(saved.bytes.toString().includes('Team: Synthetic team'));
  assert(!saved.bytes.toString().includes('[object Object]'));
  f.render(); assert.equal(f.controls.find(c => c.name === 'Button' && c.onClick?.name === 'generatePDF').loading, false); f.unmount();
});

test('numeric certificate URL preserves the existing verification route text-lookup contract', async () => {
  const badge = { id: '12345678-0000-4000-8000-000000000001', metadata: { certificate_id: 123 } };
  const filters = [];
  const client = { from(table) {
    assert.equal(table, 'user_badges');
    return { select(columns) {
      assert(columns.includes('metadata'));
      return { eq(column, id) {
        assert.equal(column, 'metadata->>certificate_id');
        filters.push([column, id]);
        // Synthetic JSON text lookup; no database or PostgreSQL acceptance is implied.
        const matches = id === '123';
        return { limit: async count => { assert.equal(count, 2); return { data: matches ? [badge] : [], error: null }; } };
      } };
    } };
  } };
  const loader = harness({ '@supabase/supabase-js': { createClient: () => client } });
  loader.env.NEXT_PUBLIC_SUPABASE_URL = 'https://synthetic.example.invalid';
  loader.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic-anon-key';
  const { GET } = loader.load('src/app/api/certificates/verify/[id]/route.ts');
  const response = await GET(new Request('https://synthetic.example.invalid/api/certificates/verify/123'), { params: Promise.resolve({ id: '123' }) });
  assert.equal(response.status, 200); const body = await response.json();
  assert.equal(body.valid, true); assert.equal(String(body.certificate_id), '123');
  const fallback = await GET(new Request('https://synthetic.example.invalid/api/certificates/verify/HM-CERT-12345678'), { params: Promise.resolve({ id: 'HM-CERT-12345678' }) });
  assert.equal(fallback.status, 404); assert.equal((await fallback.json()).valid, false);
  assert.deepEqual(filters, [['metadata->>certificate_id', '123'], ['metadata->>certificate_id', 'HM-CERT-12345678']]);
});
test('certificate PDF failure resets loading and reports the existing error', async () => {
  let alerts = 0; const f = componentFixture('src/components/CertificateModal.tsx', { jspdf: { jsPDF: function() { throw Error('synthetic PDF failure'); } } }, { console: { error() {} }, alert() { alerts++; } }, { isOpen: true, badge: { id: '12345678', issued_at: '2026-10-01' }, recipientName: 'Synthetic', onClose() {} });
  f.render(); await f.controls.find(c => c.name === 'Button' && c.onClick?.name === 'generatePDF').onClick(); f.render(); assert.equal(alerts, 1); assert.equal(f.controls.find(c => c.name === 'Button' && c.onClick?.name === 'generatePDF').loading, false);
});

for (const [name, run] of cases) await t.test(name, run);
}));
