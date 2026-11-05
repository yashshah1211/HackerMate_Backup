/* eslint-disable @typescript-eslint/no-require-imports -- Offline execution of real React and server boundaries. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { JSDOM } = require('jsdom');
const { NextRequest, NextResponse } = require('next/server');
const { harness } = require('./ppt-vision-harness.cjs');
const USER = { id: '00000000-0000-4000-8000-000000000001', email: 'fixture@example.invalid' };
const ACTIVE = { id: USER.id, is_banned: false, onboarding_completed: true, role: 'user' };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

async function guard(t, options = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://offline.invalid/dashboard' });
  const keys = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, { value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key], configurable: true });
  const { createRoot } = require('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root'));
  const logs = [], navigation = [], requests = [], listeners = new Set();
  const router = { replace: value => navigation.push(value) };
  const client = {
    auth: {
      async getSession() { return { data: { session: { user: USER } }, error: null }; },
      async getUser() { return { data: { user: USER }, error: null }; },
      onAuthStateChange(fn) { listeners.add(fn); return { data: { subscription: { unsubscribe() { listeners.delete(fn); } } } }; },
    },
    from(table) {
      assert.equal(table, 'profiles');
      const query = { select() { return this; }, eq() { return this; }, async maybeSingle() {
        const request = deferred(); requests.push(request);
        if (!options.manual) request.resolve({ data: options.profile === undefined ? ACTIVE : options.profile, error: options.error || null });
        return request.promise;
      } };
      return query;
    },
  };
  const Guard = harness({
    '@/lib/supabase': { supabase: client },
    '@/lib/posthog': { identifyUser() {} },
    '@/lib/utils': { cn: (...values) => values.join(' ') },
    'next/navigation': { useRouter: () => router },
    '@/components/system': {
      Button: ({ children, onClick }) => React.createElement('button', { onClick }, children),
      PageLoader: ({ label }) => React.createElement('p', null, label),
    },
  }, { window: dom.window, console: { log() {}, warn() {}, error: (...args) => logs.push(args) } }).load('src/components/AuthGuard.tsx').default;
  t.after(async () => {
    await React.act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  await React.act(async () => root.render(React.createElement(Guard, null, options.children || React.createElement('p', null, 'Protected fixture content'))));
  return {
    text: () => dom.window.document.body.textContent,
    requests, logs, navigation,
    async emit(event, user = USER) { await React.act(async () => { for (const listener of listeners) listener(event, user ? { user } : null); }); },
    async complete(index, result) { await React.act(async () => requests[index].resolve(result)); },
  };
}

test('AuthGuard: database permission failure is logged and cannot render protected content', async t => {
  const error = { code: '42501', message: 'Synthetic permission denied' };
  const ui = await guard(t, { profile: null, error });
  assert(!ui.text().includes('Protected fixture content'));
  assert(ui.text().includes('Verification unavailable'));
  assert(ui.logs.some(args => args.includes(error)), 'Log the actual query error');
});
for (const profile of [null, { ...ACTIVE, is_banned: null }, { ...ACTIVE, id: 'different-fixture' }]) {
  test(`AuthGuard: unverifiable profile cannot authorize: ${JSON.stringify(profile)}`, async t => {
    const ui = await guard(t, { profile }); assert(!ui.text().includes('Protected fixture content'));
  });
}
for (const completed of [true, false]) test(`AuthGuard: active dashboard access is preserved with onboarding=${completed}`, async t => {
  const ui = await guard(t, { profile: { ...ACTIVE, onboarding_completed: completed } });
  assert(ui.text().includes('Protected fixture content'));
});
test('AuthGuard: sign-out invalidates an in-flight profile success', async t => {
  const ui = await guard(t, { manual: true }); assert.equal(ui.requests.length, 1);
  await ui.emit('SIGNED_OUT', null);
  await ui.complete(0, { data: ACTIVE, error: null });
  assert(!ui.text().includes('Protected fixture content'));
  assert(ui.navigation.some(path => path.startsWith('/login?next=')));
});
test('AuthGuard: stale failure cannot replace a newer verified session', async t => {
  const ui = await guard(t, { manual: true });
  await ui.emit('TOKEN_REFRESHED');
  await ui.complete(1, { data: ACTIVE, error: null });
  await ui.complete(0, { data: null, error: { code: '42501', message: 'Old query failure' } });
  assert(ui.text().includes('Protected fixture content'));
  assert(!ui.text().includes('Verification unavailable'));
});
test('AuthGuard: an older active response cannot overwrite a newer suspension', async t => {
  const ui = await guard(t, { manual: true });
  await ui.emit('TOKEN_REFRESHED');
  await ui.complete(1, { data: { ...ACTIVE, is_banned: true }, error: null });
  await ui.complete(0, { data: ACTIVE, error: null });
  assert(ui.text().includes('Account suspended'));
  assert(!ui.text().includes('Protected fixture content'));
});
test('AuthGuard: a newly verified account clears a previous suspension notice', async t => {
  const ui = await guard(t, { manual: true });
  await ui.complete(0, { data: { ...ACTIVE, is_banned: true }, error: null });
  await ui.emit('SIGNED_IN');
  await ui.complete(1, { data: ACTIVE, error: null });
  assert(ui.text().includes('Protected fixture content'));
  assert(!ui.text().includes('Account suspended'));
});
test('AuthGuard: same-account token refresh retains mounted child state until verification resolves', async t => {
  let mounts = 0;
  function Draft() {
    React.useEffect(() => { mounts++; }, []);
    return React.createElement('p', null, 'Retained workspace draft');
  }
  const ui = await guard(t, { manual: true, children: React.createElement(Draft) });
  await ui.complete(0, { data: ACTIVE, error: null });
  await ui.emit('TOKEN_REFRESHED');
  assert(ui.text().includes('Retained workspace draft'));
  await ui.complete(1, { data: ACTIVE, error: null });
  assert.equal(mounts, 1, 'Reverification must not remount the workspace and discard drafts');
});

function upload(options = {}) {
  const effects = [], logs = [];
  const db = { auth: { async getUser() { return { data: { user: options.signedOut ? null : USER }, error: null }; } },
    from(table) { assert.equal(table, 'profiles'); return {
      select(columns) { assert(!columns.includes('*')); return this; }, eq(column, id) { assert.equal(column, 'id'); assert.equal(id, USER.id); return this; },
      async maybeSingle() { effects.push('profile'); return { data: options.profile === undefined ? ACTIVE : options.profile, error: options.error || null }; },
    }; },
  };
  const h = harness({
    'next/server': { NextRequest, NextResponse },
    '@supabase/ssr': { createServerClient: () => db },
    '@supabase/supabase-js': { createClient: () => db },
    '@/lib/r2': {
      getR2Client: () => ({ async send() { effects.push('storage'); } }),
      async createPresignedUploadUrl() { effects.push('presign'); return { uploadUrl: 'https://storage.example.invalid/fixture', publicUrl: 'https://media.example.invalid/fixture' }; },
    },
    '@aws-sdk/client-s3': { PutObjectCommand: class {} },
    '@/lib/geminiModeration': { async moderateImageWithGemini() { effects.push('moderation'); return { isSafe: true }; } },
  }, { crypto: require('node:crypto').webcrypto, console: { log() {}, warn() {}, error: (...args) => logs.push(args) } });
  Object.assign(h.env, { NEXT_PUBLIC_SUPABASE_URL: 'https://db.example.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture', R2_PUBLIC_URL: 'https://media.example.invalid' });
  return { effects, logs, async call(presign = false, body = { contentType: 'image/png' }) {
    const file = new File([Buffer.from('89504e470d0a1a0a00000000', 'hex')], 'fixture.png', { type: 'image/png' });
    const req = { headers: new Headers(), cookies: { getAll: () => [] },
      async json() { return body; }, async formData() { return new Map([['file', options.file ?? file], ['folder', 'chat']]); } };
    return h.load(`src/app/api/upload/${presign ? 'presign/' : ''}route.ts`).POST(req);
  } };
}
for (const presign of [false, true]) {
  for (const [label, options, status] of [
    ['signed out', { signedOut: true }, 401],
    ['suspended', { profile: { ...ACTIVE, is_banned: true } }, 403],
    ['missing profile', { profile: null }, 403],
    ['unknown ban', { profile: { ...ACTIVE, is_banned: null } }, 403],
    ['profile query failure', { error: { code: '42501', message: 'Synthetic permission denied' } }, 500],
  ]) test(`Upload ${presign ? 'presign' : 'direct'}: ${label} cannot reach providers`, async () => {
    const h = upload(options), response = await h.call(presign);
    assert.equal(response.status, status);
    assert(!h.effects.some(value => ['storage', 'presign', 'moderation'].includes(value)));
    if (options.error) assert(h.logs.some(args => args.includes(options.error)), 'Log the actual database error');
  });
  test(`Upload ${presign ? 'presign' : 'direct'}: active caller preserves response contract`, async () => {
    const h = upload(), response = await h.call(presign), body = await response.json();
    assert.equal(response.status, 200); assert(body.publicUrl); assert(body.key);
    assert(h.effects.includes(presign ? 'presign' : 'storage'));
    if (!presign) assert(h.effects.includes('moderation'));
  });
}
test('Direct upload: text form field instead of a file returns 400', async () => {
  const h = upload({ file: 'not a file' }); assert.equal((await h.call()).status, 400);
  assert(!h.effects.includes('storage'));
});
test('Direct upload: unrecognized audio bytes never reach moderation or storage', async () => {
  const h = upload({ file: new File(['<html>unrecognized fixture bytes</html>'], 'fixture.wav', { type: 'audio/wav' }) });
  assert.equal((await h.call()).status, 400);
  assert(!h.effects.includes('storage')); assert(!h.effects.includes('moderation'));
});
for (const body of [null, [], { contentType: 42 }, { contentType: {} }]) test(`Presign: malformed input returns 400: ${JSON.stringify(body)}`, async () => {
  const h = upload(); assert.equal((await h.call(true, body)).status, 400); assert(!h.effects.includes('presign'));
});

const { validateMagicBytes } = harness().load('src/lib/mediaValidation.ts');
for (const mime of ['image/png', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm']) test(`Media signatures: arbitrary content is rejected for ${mime}`, () => {
  assert.equal(validateMagicBytes(Buffer.from('<html>synthetic unrecognized content</html>'), mime).isValid, false);
});
for (const [mime, hex] of [
  ['image/png', '89504e470d0a1a0a00000000'], ['image/jpeg', 'ffd8ffe00000000000000000'],
  ['image/gif', '474946383961000000000000'], ['image/webp', '524946460000000057454250'],
  ['audio/webm', '1a45dfa30000000000000000'], ['audio/ogg', '4f6767530000000000000000'],
  ['audio/mp4', '00000018667479704d344120'], ['audio/x-m4a', '00000018667479704d344120'],
  ['audio/wav', '524946460000000057415645'], ['audio/mpeg', '494433040000000000000000'],
]) test(`Media signatures: recognized ${mime} signature remains accepted`, () => {
  assert.equal(validateMagicBytes(Buffer.from(hex, 'hex'), mime).isValid, true);
});
for (const header of ['fffb9064', 'fffa9064', 'fff39064', 'fff29064', 'ffe39064', 'ffe29064']) {
  test(`Media signatures: MPEG audio version/CRC variant ${header} remains accepted`, () => {
    assert.equal(validateMagicBytes(Buffer.from(header + '0000000000000000', 'hex'), 'audio/mpeg').isValid, true);
  });
}
for (const header of ['ffeb9064', 'fff99064', 'fffbf064', 'fffb9c64']) {
  test(`Media signatures: reserved MPEG header ${header} is rejected`, () => {
    assert.equal(validateMagicBytes(Buffer.from(header + '0000000000000000', 'hex'), 'audio/mpeg').isValid, false);
  });
}
