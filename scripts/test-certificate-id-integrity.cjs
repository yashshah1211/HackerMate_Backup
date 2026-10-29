// Actual route handlers with an isolated, schema-aware synthetic store. No live services.
(async () => {
  const { test } = await import('node:test');
  const { default: assert } = await import('node:assert/strict');
  const { default: runtime } = await import('./ppt-vision-harness.cjs');
  const { NextResponse } = await import('next/server.js');
  const { createClient } = await import('@supabase/supabase-js');
  const ISSUE = 'src/app/api/admin/issue-badges/route.ts';
  const VERIFY = 'src/app/api/certificates/verify/[id]/route.ts';
  const USER = 'abcdef00-0000-4000-8000-000000000001';
  const OTHER = 'abcdef00-0000-4000-8000-000000000002';
  const EVENT = 'abcdefab-0000-4000-8000-000000000003';
  const EVENT2 = 'abcdefab-0000-4000-8000-000000000004';
  const BADGE = '12345678-0000-4000-8000-000000000005';
  const ADMIN = '00000000-0000-4000-8000-000000000006';
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const textId = value => value == null ? null : typeof value === 'object' ? JSON.stringify(value) : String(value);
  const equal = (column, a, b) => ['id', 'user_id', 'hackathon_id'].includes(column) ? String(a).toLowerCase() === String(b).toLowerCase() : a === b;
  const key = row => JSON.stringify([row.user_id.toLowerCase(), row.hackathon_id.toLowerCase(), row.badge_type]);
  const existing = metadata => ({ id: BADGE, user_id: USER, hackathon_id: EVENT, badge_type: 'verified_winner', badge_name: 'Synthetic winner', issuer_name: 'Synthetic issuer', metadata });

  function fixture(options = {}) {
    const state = { badges: structuredClone(options.badges || []), calls: [], writes: [], errors: [], authCalls: 0 };
    const profiles = [{ id: USER, email: 'builder@example.invalid' }, { id: OTHER, email: 'other@example.invalid' }];
    function from(table, purpose) {
      const filters = []; let selection, payload, conflict, cap, or;
      const call = { table, purpose, filters }; state.calls.push(call);
      function result(single = false) {
        if (table === 'profiles') return { data: options.profileError ? null : profiles.filter(p => filters.every(([op, col, val]) => op === 'in' && val.includes(p[col]))), error: options.profileError || null };
        assert.equal(table, 'user_badges');
        if (payload) {
          assert.equal(purpose, 'admin'); assert.equal(conflict, 'user_id,hackathon_id,badge_type');
          state.writes.push(structuredClone(payload));
          if (options.writeError) return { data: null, error: options.writeError };
          const rows = payload.map(row => {
            let old = state.badges.find(b => key(b) === key(row));
            if (old) Object.assign(old, structuredClone(row));
            else { old = { id: `00000000-0000-4000-8000-${String(state.badges.length + 20).padStart(12, '0')}`, ...structuredClone(row) }; state.badges.push(old); }
            return { id: old.id };
          });
          return { data: rows, error: null };
        }
        const error = purpose === 'verify' ? options.verifyError : options.readError;
        if (error) return { data: null, error };
        let rows = state.badges.filter(b => filters.every(([op, col, val]) => {
          const value = col === 'metadata->>certificate_id' ? textId(b.metadata?.certificate_id) : b[col];
          return op === 'in' ? val.some(v => equal(col, value, v)) : equal(col, value, val);
        }));
        if (or) {
          const match = /^id\.eq\.([^,]+),metadata->>certificate_id\.eq\.(.+)$/.exec(or);
          assert(match, 'only the reviewed UUID OR expression is supported');
          // PostgreSQL UUID inputs are validated before the OR expression can match.
          if (!uuid.test(match[1])) return { data: null, error: { code: '22P02', message: 'invalid input syntax for type uuid' } };
          rows = rows.filter(b => equal('id', b.id, match[1]) || textId(b.metadata?.certificate_id) === match[2]);
        }
        if (cap !== undefined) rows = rows.slice(0, cap);
        assert(selection, 'explicit selection required');
        if (single && rows.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } };
        return { data: single ? rows[0] || null : rows, error: null };
      }
      const q = {
        select(columns) { selection = columns; call.columns = columns; return q; },
        in(column, values) { filters.push(['in', column, values]); return q; },
        eq(column, value) { filters.push(['eq', column, value]); return q; },
        or(value) { or = value; call.or = value; return q; },
        limit(value) { cap = value; call.limit = value; return q; },
        upsert(rows, config) { payload = rows; conflict = config.onConflict; return q; },
        maybeSingle() { return Promise.resolve(result(true)); },
        then(resolve, reject) { return Promise.resolve().then(() => result()).then(resolve, reject); },
      };
      return q;
    }
    const loader = runtime.harness({
      '@/lib/admin/requireAdmin': { async requireAdmin() {
        state.authCalls++;
        return options.denied ? NextResponse.json({ error: 'Synthetic denied' }, { status: options.denied }) : { user: { id: ADMIN }, supabaseAdmin: { from: table => from(table, 'admin') } };
      } },
      '@supabase/supabase-js': { createClient: () => ({ from: table => from(table, 'verify') }) },
    }, { console: { error: (...args) => state.errors.push(args) } });
    loader.env.NEXT_PUBLIC_SUPABASE_URL = 'https://synthetic.example.invalid';
    loader.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic-anon';
    const issue = loader.load(ISSUE).POST, verify = loader.load(VERIFY).GET;
    return { state,
      issue: body => issue(new Request('https://synthetic.example.invalid/api/admin/issue-badges', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hackathonId: EVENT, emails: ['builder@example.invalid'], ...body }) })),
      verify: id => verify(new Request('https://synthetic.example.invalid/api/certificates/verify/' + encodeURIComponent(id)), { params: Promise.resolve({ id }) }),
    };
  }

  test('one builder receives distinct certificates across hackathons and badge types', async () => {
    const f = fixture();
    for (const body of [{}, { hackathonId: EVENT2 }, { badgeType: 'participant' }]) assert.equal((await f.issue(body)).status, 200);
    assert.equal(f.state.badges.length, 3);
    const ids = f.state.badges.map(b => b.metadata.certificate_id);
    assert.equal(new Set(ids).size, 3);
    for (const id of ids) {
      assert.match(id, /^HM-CERT-[A-F0-9]{64}$/);
      const response = await f.verify(id); assert.equal(response.status, 200); assert.equal((await response.json()).valid, true);
    }
  });
  test('builders sharing the old six-character prefix receive distinct IDs', async () => {
    const f = fixture(); assert.equal((await f.issue({ emails: ['builder@example.invalid', 'other@example.invalid'] })).status, 200);
    assert.equal(f.state.badges.length, 2); assert.notEqual(f.state.badges[0].metadata.certificate_id, f.state.badges[1].metadata.certificate_id);
  });
  test('reissuance retains the certificate link, badge identity and unrelated metadata', async () => {
    const f = fixture(); await f.issue({}); const badge = f.state.badges[0], id = badge.metadata.certificate_id, rowId = badge.id;
    badge.metadata.extra = { retained: true };
    const response = await f.issue({ badgeName: 'Synthetic revised award', issued_by_admin: OTHER, metadata: { certificate_id: 'FORGED' } });
    assert.equal(response.status, 200); assert.equal(f.state.badges.length, 1);
    assert.equal(badge.metadata.certificate_id, id); assert.equal(badge.id, rowId); assert.deepEqual(badge.metadata.extra, { retained: true });
    assert.equal(badge.badge_name, 'Synthetic revised award'); assert.equal(badge.metadata.issued_by_admin, ADMIN);
    assert.equal((await f.verify(id)).status, 200);
  });
  test('concurrent initial issuance has the same deterministic ID, including UUID case variants', async () => {
    const f = fixture(); const responses = await Promise.all([f.issue({}), f.issue({ hackathonId: EVENT.toUpperCase() })]);
    assert(responses.every(r => r.status === 200)); assert.equal(f.state.badges.length, 1);
    assert.equal(f.state.writes[0][0].metadata.certificate_id, f.state.writes[1][0].metadata.certificate_id);
  });
  for (const certificate_id of ['HM-CERT-ABCDEF', '00123', 123, -7, 12.5]) test('legacy ID survives reissuance and verifies: ' + certificate_id, async () => {
    const f = fixture({ badges: [existing({ certificate_id, extra: 'keep' })] });
    assert.equal((await f.issue({})).status, 200); assert.equal(f.state.badges[0].metadata.certificate_id, certificate_id);
    assert.equal(f.state.badges[0].metadata.extra, 'keep');
    const response = await f.verify(String(certificate_id)); assert.equal(response.status, 200); assert.equal((await response.json()).certificate_id, certificate_id);
  });
  for (const metadata of [null, {}, { certificate_id: '' }, { certificate_id: 0 }, { certificate_id: { invalid: true } }]) test('reissuance preserves the previously displayed fallback: ' + JSON.stringify(metadata), async () => {
    const f = fixture({ badges: [existing(metadata)] });
    assert.equal((await f.issue({})).status, 200); assert.equal(f.state.badges[0].metadata.certificate_id, 'HM-CERT-12345678');
    assert.equal((await f.verify('HM-CERT-12345678')).status, 200);
  });
  test('failed existing-ID lookup stops issuance without overwriting metadata', async () => {
    const error = { code: '42501', message: 'private synthetic query failure' };
    const f = fixture({ badges: [existing({ certificate_id: 'KEEP' })], readError: error });
    const response = await f.issue({}); assert.equal(response.status, 500); assert.equal(f.state.writes.length, 0);
    assert.equal(f.state.badges[0].metadata.certificate_id, 'KEEP'); assert(f.state.errors.length);
    assert(!(await response.text()).includes(error.message));
  });
  for (const denied of [401, 403]) test('issuance still requires the existing admin gate: ' + denied, async () => {
    const f = fixture({ denied }); assert.equal((await f.issue({})).status, denied); assert.equal(f.state.authCalls, 1); assert.equal(f.state.calls.length, 0); assert.equal(f.state.writes.length, 0);
  });
  test('issuance validation and no-matching-profile behavior remain intact', async () => {
    const f = fixture(); assert.equal((await f.issue({ emails: [] })).status, 400); assert.equal(f.state.calls.length, 0);
    const response = await f.issue({ emails: ['absent@example.invalid'] }); assert.equal(response.status, 200); assert.equal((await response.json()).granted, 0); assert.equal(f.state.writes.length, 0);
  });
  test('profile and persistence failures cannot claim successful issuance', async () => {
    for (const options of [{ profileError: { message: 'synthetic profile failure' } }, { writeError: { message: 'synthetic write failure' } }]) {
      const f = fixture(options); const response = await f.issue({}); assert.equal(response.status, 500); assert.equal(f.state.badges.length, 0);
    }
  });
  test('UUID verification remains supported without losing metadata matches', async () => {
    const f = fixture({ badges: [existing({ certificate_id: 'LEGACY' })] });
    const response = await f.verify(BADGE); assert.equal(response.status, 200); assert.equal((await response.json()).valid, true);
    assert(f.state.calls[0].or.includes('id.eq.' + BADGE));
  });
  test('ambiguous legacy IDs disclose no recipient and do not select an arbitrary badge', async () => {
    const f = fixture({ badges: [existing({ certificate_id: 'DUPLICATE' }), { ...existing({ certificate_id: 'DUPLICATE' }), id: '12345678-0000-4000-8000-000000000007', hackathon_id: EVENT2, badge_name: 'Private synthetic other award' }] });
    const before = JSON.stringify(f.state.badges); const response = await f.verify('DUPLICATE'); const body = await response.json();
    assert.equal(response.status, 409); assert.equal(body.valid, false); assert(!JSON.stringify(body).includes('Private synthetic')); assert(!Object.hasOwn(body, 'badge_name'));
    assert.equal(f.state.calls[0].limit, 2); assert.equal(JSON.stringify(f.state.badges), before); assert.equal(f.state.writes.length, 0);
  });
  test('UUID and metadata collisions also fail closed', async () => {
    const f = fixture({ badges: [existing({ certificate_id: 'ORIGINAL' }), { ...existing({ certificate_id: BADGE }), id: '12345678-0000-4000-8000-000000000007', hackathon_id: EVENT2 }] });
    const response = await f.verify(BADGE); assert.equal(response.status, 409); assert.equal((await response.json()).valid, false);
  });
  test('reissuing a historical duplicate does not silently rename or repair other certificates', async () => {
    const f = fixture({ badges: [existing({ certificate_id: 'DUPLICATE' }), { ...existing({ certificate_id: 'DUPLICATE' }), id: '12345678-0000-4000-8000-000000000007', hackathon_id: EVENT2 }] });
    assert.equal((await f.issue({})).status, 200);
    assert(f.state.badges.every(b => b.metadata.certificate_id === 'DUPLICATE'));
    assert.equal((await f.verify('DUPLICATE')).status, 409);
    assert.equal((await f.verify(BADGE)).status, 200);
  });
  test('installed Supabase client sends exact text filters and a bounded GET without UUID casts', async () => {
    let requested;
    const loader = runtime.harness({ '@supabase/supabase-js': { createClient: (url, token) => createClient(url, token, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (input, init) => {
        const url = new URL(input); assert.equal(url.origin, 'https://synthetic.example.invalid');
        assert.equal(url.pathname, '/rest/v1/user_badges'); assert.equal(init.method, 'GET');
        assert.equal(url.searchParams.get('limit'), '2'); assert.equal(url.searchParams.has('or'), false);
        assert.equal(url.searchParams.get('metadata->>certificate_id'), 'eq.' + requested);
        return Response.json([existing({ certificate_id: requested })]);
      } },
    }) } });
    loader.env.NEXT_PUBLIC_SUPABASE_URL = 'https://synthetic.example.invalid'; loader.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic-anon';
    const verify = loader.load(VERIFY).GET;
    for (requested of ['HM-CERT-' + 'A'.repeat(64), '123', '12.5', 'literal,)id.eq.other']) {
      const response = await verify(new Request('https://synthetic.example.invalid/api/certificates/verify/' + encodeURIComponent(requested)), { params: Promise.resolve({ id: requested }) });
      assert.equal(response.status, 200); assert.equal((await response.json()).certificate_id, requested);
    }
  });
  test('query failures are logged server errors, never misleading missing-certificate responses', async () => {
    const error = { code: '42501', message: 'private synthetic database failure' };
    const f = fixture({ verifyError: error }); const response = await f.verify('LEGACY');
    assert.equal(response.status, 500); assert(f.state.errors.length); assert(!(await response.text()).includes(error.message)); assert.equal(f.state.writes.length, 0);
  });
  test('unknown ID returns 404 and punctuation cannot alias a different numeric certificate', async () => {
    const f = fixture({ badges: [existing({ certificate_id: 123 })] });
    for (const id of ['UNKNOWN', '12.3']) { const response = await f.verify(id); assert.equal(response.status, 404); assert.equal((await response.json()).valid, false); }
    assert.equal(f.state.writes.length, 0);
  });
  test('invalid input still returns 400 without querying badge records', async () => {
    const f = fixture(); for (const id of ['', '!!!']) assert.equal((await f.verify(id)).status, 400);
    assert.equal(f.state.calls.length, 0);
  });
})().catch(error => { console.error(error); process.exitCode = 1; });
