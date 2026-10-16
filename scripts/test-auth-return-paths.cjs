/* eslint-disable @typescript-eslint/no-require-imports -- Offline actual-module redirect and OAuth regressions. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { NextRequest, NextResponse } = require('next/server');
const { harness } = require('./ppt-vision-harness.cjs');
const { safeAuthReturnPath, AUTH_RETURN_FALLBACK } = harness().load('src/lib/auth/returnPath.ts');
const ORIGIN = 'https://offline.example';
const BAD = [
  null, undefined, '', 42, {}, [], 'https://evil.invalid/path', 'https://offline.example/hackathons',
  'javascript:alert(1)', 'data:text/html,evil', 'vbscript:evil', 'file:///etc/passwd',
  '//evil.invalid', '///evil.invalid', '\\evil.invalid', '/\\evil.invalid', '/\\/evil.invalid',
  '@evil.invalid', '.evil.invalid/path', 'https://offline.example@evil.invalid',
  '/%2fevil.invalid', '/%2F%2fevil.invalid', '/%5cevil.invalid', '/%255cevil.invalid',
  '/%252f%252fevil.invalid', '/%25252f%25252fevil.invalid', '%2fhackathons',
  '/x/..//evil.invalid', '/x/%2e%2e//evil.invalid', '/x/%252e%252e//evil.invalid',
  '/login', '/login?next=/hackathons', '/onboarding?next=/invites', '/auth/callback?code=evil',
  '/x/../login', '/%6cogin', '/%256cogin', '/LOGIN/', '/auth/logout',
  '/api/cron/analytics-summary', '/%61pi/cron/reminders', '/_next/data/example.json',
  '/?next=@evil.invalid', '/x/..?next=/hackathons', '/?redirect=/login', '/?returnTo=/auth/callback',
  '/%00evil', '/%0aevil', '/%250Devil', '/hackathons?q=%250aevil',
  '/hackathons\u0000', '/hackathons\r\nLocation:https://evil.invalid', '/hackathons\u007f', '/hackathons\u0085',
  '/hackathons?q=%C2%85', '/hackathons?q=%25C2%2585', '/hackathons#%c2%9f',
  ' /hackathons', '/hackathons ', '\t/hackathons', '/%ZZ', '/%', '/%E0%A4%A',
  '/hackathons?q=%', '/' + 'a'.repeat(8192),
];
for (const input of BAD) test(`invalid return path falls back: ${JSON.stringify(input)}`, () => {
  assert.equal(safeAuthReturnPath(input), AUTH_RETURN_FALLBACK);
});
const GOOD = [
  '/', '/dashboard', '/hackathons', '/hackathons/event-1?tab=builders#teams',
  '/hackathons?tab=past&q=water+energy&mode=online&source=partner#results',
  '/profile/builder-1', '/developers?skills=React%2CNode.js', '/invites?college=Offline%20Campus#pending',
  '/teams/team-1', '/teams/team-1/workspace?tab=documents#draft', '/teams/create?invite=builder-1',
  '/partners/synthetic/organizer?tab=participants&pSearch=Builder', '/evaluator', '/challenges/fixture#submit',
  '/hackathons?filter=a%26b%3Dc&url=https%3A%2F%2Fexample.invalid%2Fx%3Fa%3D1%26b%3D2#panel',
  '/hackathons?literalPercent=100%25&nested=%252Fhackathons%253Ftab%253Dpast',
  '/hackathons?email=user%40example.invalid&next=%2F%2Fexample.invalid',
  '/profile/%E0%A4%AC%E0%A4%BF%E0%A4%B2%E0%A5%8D%E0%A4%A1%E0%A4%B0',
  '/hackathons?q=%E0%A4%AC%E0%A4%BF%E0%A4%B2%E0%A5%8D%E0%A4%A1%E0%A4%B0',
  '/@example.invalid', '/hackathons#https://example.invalid', '/authentication-guide',
];
for (const input of GOOD) test(`legitimate return path retained: ${input}`, () => {
  assert.equal(safeAuthReturnPath(input), input);
});
test('normalization and repeated validation preserve a single local path', () => {
  assert.equal(safeAuthReturnPath('/hackathons/../teams/team-1?tab=members#roster'), '/teams/team-1?tab=members#roster');
  for (const input of [...BAD, ...GOOD]) {
    const result = safeAuthReturnPath(input);
    assert.equal(safeAuthReturnPath(result), result);
    assert(result.startsWith('/') && !result.startsWith('//'));
    assert.equal(new URL(result, ORIGIN).origin, ORIGIN);
  }
});
test('bounded nested encoding cannot introduce authority, auth loops, or endpoint navigation', () => {
  for (const seed of ['//evil.invalid', '/\\evil.invalid', '/login', '/api/cron/reminders', '/\r\nevil']) {
    let value = seed;
    for (let layer = 0; layer < 12; layer++) {
      const result = safeAuthReturnPath(value);
      assert.equal(new URL(result, ORIGIN).origin, ORIGIN);
      assert(!/^\/(?:login|auth|onboarding|api)(?:\/|$)/i.test(result));
      value = '/' + encodeURIComponent(value);
    }
  }
});

function callback(options = {}) {
  const events = [];
  const loader = harness({
    'next/server': { NextRequest, NextResponse },
    '@supabase/ssr': { createServerClient(url, key, config) {
      assert.equal(url, 'https://fixture.invalid'); assert.equal(key, 'fixture-anon');
      return {
        auth: { async exchangeCodeForSession(code) {
          events.push(['exchange', code]);
          config.cookies.setAll([{ name: 'sb-fixture-auth-token', value: 'fake-cookie', options: {
            path: '/', secure: true, httpOnly: true, sameSite: 'lax', maxAge: 3600,
          } }]);
          return { data: { user: options.noUser ? null : { id: 'fixture-user' } }, error: options.exchangeError || null };
        } },
        from(table) {
          assert.equal(table, 'profiles');
          return { select(columns) { assert.equal(columns, 'onboarding_completed'); events.push(['profile-read']); return this; },
            eq(column, id) { assert.deepEqual([column, id], ['id', 'fixture-user']); return this; },
            async maybeSingle() { return { data: options.noProfile ? null : { onboarding_completed: Object.hasOwn(options, 'completed') ? options.completed : true }, error: options.profileError || null }; } };
        },
      };
    } },
  });
  Object.assign(loader.env, { NODE_ENV: 'production', NEXT_PUBLIC_SITE_URL: ORIGIN, NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-anon', ...options.env });
  return { events, async get(next, { code = 'fake-code', origin = ORIGIN, headers = {} } = {}) {
    const url = new URL('/auth/callback', origin);
    if (code !== null) url.searchParams.set('code', code);
    if (next !== undefined && next !== null) url.searchParams.set('next', String(next));
    return loader.load('src/app/auth/callback/route.ts').GET(new NextRequest(url, { headers }));
  } };
}
for (const input of BAD.filter(value => typeof value === 'string')) test(`callback cannot redirect externally: ${JSON.stringify(input).slice(0, 90)}`, async () => {
  const f = callback(), response = await f.get(input), target = new URL(response.headers.get('location'));
  assert.equal(target.origin, ORIGIN); assert.equal(target.pathname, '/dashboard');
  assert.deepEqual(f.events, [['exchange', 'fake-code'], ['profile-read']]);
});
for (const completed of [true, false, null]) test(`callback retains nested event/invitation URL and cookie options, completion=${completed}`, async () => {
  const target = '/hackathons/event-1?tab=teams&filters=a%26b%3Dc&url=https%3A%2F%2Fexample.invalid#join';
  const f = callback({ completed }), response = await f.get(target), url = new URL(response.headers.get('location'));
  assert.equal(url.origin, ORIGIN);
  if (completed) assert.equal(url.pathname + url.search + url.hash, target);
  else { assert.equal(url.pathname, '/onboarding'); assert.equal(url.searchParams.get('next'), target); }
  const cookie = response.cookies.get('sb-fixture-auth-token');
  assert.equal(cookie.value, 'fake-cookie'); assert.equal(cookie.path, '/');
  assert.equal(cookie.secure, true); assert.equal(cookie.httpOnly, true); assert.equal(cookie.sameSite, 'lax');
});
test('callback missing-profile onboarding transport validates before nesting next', async () => {
  const response = await callback({ noProfile: true }).get('@evil.invalid');
  const url = new URL(response.headers.get('location'));
  assert.equal(url.pathname, '/onboarding'); assert.equal(url.searchParams.get('next'), '/dashboard');
});
test('callback profile errors retain existing session behavior with a validated destination', async () => {
  const response = await callback({ profileError: { message: 'offline fixture' } }).get('/\\evil.invalid');
  assert.equal(response.headers.get('location'), ORIGIN + '/dashboard');
});
for (const options of [{ exchangeError: { message: 'offline' } }, { noUser: true }]) test('failed exchange remains the existing local error destination', async () => {
  const response = await callback(options).get('@evil.invalid');
  assert.equal(response.headers.get('location'), ORIGIN + '/?error=AuthCallbackError');
});
test('missing code does not invoke Supabase or any protected action', async () => {
  const f = callback(), response = await f.get('/invites', { code: null });
  assert.equal(response.headers.get('location'), ORIGIN + '/?error=AuthCallbackError'); assert.deepEqual(f.events, []);
});

for (const origin of ['https://hackermate.in', 'https://www.hackermate.in', ORIGIN]) {
  test(`callback accepts an explicit production/site origin: ${origin}`, async () => {
    const response = await callback().get('/invites?college=Offline%20Campus#pending', { origin });
    assert.equal(response.headers.get('location'), origin + '/invites?college=Offline%20Campus#pending');
    assert(response.cookies.get('sb-fixture-auth-token').httpOnly);
  });
}
for (const key of ['VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_PROJECT_PRODUCTION_URL']) {
  for (const completed of [true, false]) test(`exact ${key} keeps OAuth cookies and nested destination, completed=${completed}`, async () => {
    const origin = 'https://hackermate-fixture-branch.vercel.app';
    const f = callback({ completed, env: { VERCEL: '1', [key]: 'hackermate-fixture-branch.vercel.app', NEXT_PUBLIC_SITE_URL: 'https://hackermate.in' } });
    const response = await f.get('/hackathons/event-1?tab=builders#teams', { origin });
    const target = new URL(response.headers.get('location')); assert.equal(target.origin, origin);
    if (completed) assert.equal(target.pathname + target.search + target.hash, '/hackathons/event-1?tab=builders#teams');
    else { assert.equal(target.pathname, '/onboarding'); assert.equal(target.searchParams.get('next'), '/hackathons/event-1?tab=builders#teams'); }
    const cookie = response.cookies.get('sb-fixture-auth-token');
    assert.equal(cookie.value, 'fake-cookie'); assert.equal(cookie.secure, true); assert.equal(cookie.httpOnly, true);
    assert.deepEqual(f.events, [['exchange', 'fake-code'], ['profile-read']]);
  });
}
for (const origin of ['https://evil.invalid', 'https://hackermate.in.evil.invalid', 'https://unrelated-project.vercel.app', 'http://hackermate.in', 'http://localhost:3000', 'https://hackermate.in:444']) {
  for (const code of ['fake-code', null]) test(`untrusted callback URL fails before exchange, origin=${origin}, code=${Boolean(code)}`, async () => {
    const f = callback({ env: { VERCEL: '1', VERCEL_URL: 'hackermate-approved.vercel.app' } });
    const response = await f.get('/invites', { origin, code, headers: { host: 'hackermate.in', 'x-forwarded-host': 'hackermate.in', 'x-forwarded-proto': 'https' } });
    assert.equal(response.status, 400); assert.equal(response.headers.get('location'), null);
    assert.equal((await response.json()).code, 'AUTH_CALLBACK_ORIGIN_INVALID');
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal(response.cookies.getAll().length, 0); assert.deepEqual(f.events, []);
  });
}
test('untrusted forwarding headers cannot change a valid callback origin or destination', async () => {
  const response = await callback().get('/teams/team-1', { headers: {
    host: 'evil.invalid', forwarded: 'host=evil.invalid;proto=http', 'x-forwarded-host': 'evil.invalid', 'x-forwarded-proto': 'http',
  } });
  assert.equal(response.headers.get('location'), ORIGIN + '/teams/team-1');
});
test('an exact preview origin is preserved on failed exchange too', async () => {
  const response = await callback({ exchangeError: { message: 'offline' }, env: { VERCEL_URL: 'approved-preview.vercel.app' } })
    .get('/invites', { origin: 'https://approved-preview.vercel.app' });
  assert.equal(response.headers.get('location'), 'https://approved-preview.vercel.app/?error=AuthCallbackError');
});
for (const origin of ['http://localhost:3000', 'http://127.0.0.1:4000', 'http://[::1]:3000']) test(`explicit local development supports loopback: ${origin}`, async () => {
  const response = await callback({ env: { NODE_ENV: 'development', VERCEL: undefined } }).get('/invites', { origin });
  // NextRequest canonicalizes loopback IPs to localhost before the route sees url.
  const frameworkOrigin = new URL(new NextRequest(origin + '/auth/callback').url).origin;
  assert.equal(response.headers.get('location'), frameworkOrigin + '/invites');
});
test('production/site defaults work without configured platform variables', async () => {
  const response = await callback({ env: { NEXT_PUBLIC_SITE_URL: undefined } }).get('/invites', { origin: 'https://hackermate.in' });
  assert.equal(response.headers.get('location'), 'https://hackermate.in/invites');
});
for (const value of ['https://evil.invalid/path', 'https://hackermate.in@evil.invalid/path', '//evil.invalid', 'https://evil.invalid?next=x', 'https://evil.invalid#fragment', 'https://evil.invalid\\x', 'https://evil.invalid\n', 'http://evil.invalid']) {
  test(`malformed site configuration cannot authorize a foreign origin: ${JSON.stringify(value)}`, async () => {
    const response = await callback({ env: { NEXT_PUBLIC_SITE_URL: value } }).get('/invites', { origin: 'https://evil.invalid' });
    assert.equal(response.status, 400);
  });
}
for (const value of ['approved.vercel.app@evil.invalid', 'approved.vercel.app/evil', '*.vercel.app', 'https://evil.invalid', 'evil.invalid:444', 'evil.invalid\n']) {
  test(`invalid platform hostname is ignored: ${JSON.stringify(value)}`, async () => {
    const response = await callback({ env: { VERCEL_URL: value } }).get('/invites', { origin: 'https://evil.invalid' });
    assert.equal(response.status, 400);
  });
}
test('helper refuses malformed URLs and userinfo even when a parsed origin would be allowed', () => {
  const loader = harness(); loader.env.NODE_ENV = 'production';
  const { trustedCallbackOrigin } = loader.load('src/lib/auth/callbackOrigin.ts');
  for (const url of ['not a URL', 'https://user:pass@hackermate.in/auth/callback']) assert.equal(trustedCallbackOrigin(url), null);
});
for (const hostname of ['hackermate--feature-123.vercel.app', 'xn--fixture-9za.vercel.app']) test(`valid deployment DNS labels remain supported: ${hostname}`, async () => {
  const response = await callback({ env: { VERCEL_URL: hostname } }).get('/invites', { origin: 'https://' + hostname });
  assert.equal(response.headers.get('location'), 'https://' + hostname + '/invites');
});
test('an approved preview hostname cannot authorize a suffix on another host', async () => {
  const f = callback({ env: { VERCEL_URL: 'approved-preview.vercel.app' } });
  const response = await f.get('/invites', { origin: 'https://approved-preview.vercel.app.evil.invalid' });
  assert.equal(response.status, 400); assert.deepEqual(f.events, []);
});
