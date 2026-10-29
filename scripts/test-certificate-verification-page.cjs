/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic public UI regressions. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { renderToStaticMarkup } = require('react-dom/server');
const { JSDOM } = require('jsdom');
const { harness } = require('./ppt-vision-harness.cjs');

const fixture = { valid: true, recipient_name: 'Synthetic Recipient', badge_name: 'Synthetic Participation',
  rank_title: 'Synthetic Achievement', event_name: 'Synthetic Event', issuer_name: 'Synthetic Issuer',
  issued_at: '2026-10-29T00:00:00Z', certificate_id: 'SYNTHETIC-ONLY-123', recipient_college: 'PRIVATE-EXTRA' };
const api = harness({}, { AbortController }).load('src/lib/certificateVerification.ts');
const path = 'src/app/verify/[id]/CertificateVerification.tsx';
const overrides = { './Verification.module.css': { __esModule: true, default: {} },
  'next/link': ({ children, ...props }) => React.createElement('a', props, children) };

for (const id of ['HM-CERT-Legacy', '123', '42.5', '00000000-0000-4000-8000-000000000001', ' original ID ', 'a/b?c#d%25', 'a,or.id.eq.x']) {
  test(`lookup preserves and encodes the original ID: ${id}`, () => {
    assert.equal(api.certificateLookupPath(id), `/api/certificates/verify/${encodeURIComponent(id)}`);
  });
}
for (const id of ['', ' ', '..', '\u0000ID', '\ud800ID']) test('invalid input does not produce a lookup path', () => {
  assert.equal(api.certificateLookupPath(id), null);
});
for (const [status, kind] of [[400, 'invalid'], [404, 'missing'], [409, 'ambiguous'], [500, 'unavailable'], [503, 'unavailable'], [302, 'unavailable']]) {
  test(`HTTP ${status} cannot become verified even with valid=true`, () => {
    assert.equal(api.certificateResponse(status, fixture).kind, kind);
  });
}
for (const body of [null, [], {}, { ...fixture, valid: false }, { ...fixture, valid: 'true' }, { ...fixture, error: 'uncertain' },
  { ...fixture, issued_at: '2026-02-30' }, { ...fixture, issued_at: 'not-a-date' }, { ...fixture, recipient_name: '' }]) {
  test('uncertain/malformed 200 fails closed', () => assert.equal(api.certificateResponse(200, body).kind, 'unavailable'));
}
for (const id of [' Original-String ', 123, 42.5, 0]) test(`approved projection retains certificate ID ${id}`, () => {
  const result = api.certificateResponse(200, { ...fixture, certificate_id: id });
  assert.equal(result.kind, 'verified'); assert.equal(result.certificate.id, String(id));
  assert.equal(Object.keys(result.certificate).length, 6);
  assert.equal(JSON.stringify(result).includes('PRIVATE-EXTRA'), false);
});
test('no rank uses the recorded badge achievement', () => {
  assert.equal(api.certificateResponse(200, { ...fixture, rank_title: null }).certificate.achievement, fixture.badge_name);
});
test('fetch uses only the encoded public API without cookies or cache', async () => {
  const calls = [];
  const client = harness({}, { AbortController, fetch: async (...args) => { calls.push(args); return { status: 200, json: async () => fixture }; } }).load('src/lib/certificateVerification.ts');
  assert.equal((await client.lookupCertificate('a/b', new AbortController().signal)).kind, 'verified');
  assert.equal(calls[0][0], '/api/certificates/verify/a%2Fb');
  assert.equal(calls[0][1].credentials, 'omit'); assert.equal(calls[0][1].cache, 'no-store');
  assert.equal(calls[0][1].redirect, 'error');
  assert.equal((await client.lookupCertificate('', new AbortController().signal)).kind, 'invalid');
  assert.equal(calls.length, 1);
});
for (const response of [() => { throw new Error('offline'); }, () => ({ status: 200, json: async () => { throw new Error('bad JSON'); } })]) {
  test('network and JSON failures remain unavailable', async () => {
    const client = harness({}, { fetch: response }).load('src/lib/certificateVerification.ts');
    assert.equal((await client.lookupCertificate('ID', new AbortController().signal)).kind, 'unavailable');
  });
}

async function view(fetch, id = 'SYNTHETIC-ONLY-123', globals = {}) {
  const dom = new JSDOM('<div id="root"></div>');
  const previous = { window: global.window, document: global.document, IS_REACT_ACT_ENVIRONMENT: global.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(global, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const Component = harness(overrides, { fetch, AbortController, ...globals }).load(path).default;
  const root = createRoot(dom.window.document.getElementById('root'));
  const render = async value => { await React.act(async () => { root.render(React.createElement(Component, { id: value })); }); };
  await render(id);
  return { dom, render, async close() { await React.act(async () => root.unmount()); dom.window.close(); Object.assign(global, previous); } };
}
const response = (status, body = fixture) => ({ status, json: async () => body });
for (const [status, title] of [[200, 'Certificate verified'], [400, 'Invalid certificate link'], [404, 'Certificate not found'],
  [409, 'Certificate ID is not unique'], [500, 'Verification unavailable']]) {
  test(`UI announces the distinct ${status} state and exposes only approved details`, async () => {
    const v = await view(async () => response(status));
    try {
      const doc = v.dom.window.document;
      assert(doc.querySelector('[role="status"]').textContent.includes(title));
      assert.equal(doc.querySelector('[aria-busy]').getAttribute('aria-busy'), 'false');
      assert.equal(doc.body.textContent.includes('PRIVATE-EXTRA'), false);
      assert.equal(doc.body.textContent.includes(fixture.recipient_name), status === 200);
      assert.equal(Boolean(doc.querySelector('button')), status === 500);
      if (status === 200) {
        for (const value of [fixture.recipient_name, fixture.rank_title, fixture.event_name, fixture.issuer_name, fixture.certificate_id]) assert(doc.body.textContent.includes(value));
        assert.equal(doc.querySelector('time').dateTime, '2026-10-29');
      }
    } finally { await v.close(); }
  });
}
test('loading is announced; stale verified results cannot replace a newer failure', async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const signals = [];
  const v = await view((_path, options) => { signals.push(options.signal); return signals.length === 1 ? pending : Promise.resolve(response(409)); });
  try {
    assert(v.dom.window.document.querySelector('[role="status"]').textContent.includes('Checking certificate'));
    assert.equal(v.dom.window.document.querySelector('[aria-busy]').getAttribute('aria-busy'), 'true');
    await v.render('SECOND-ID');
    assert.equal(signals[0].aborted, true);
    await React.act(async () => release(response(200)));
    assert(v.dom.window.document.body.textContent.includes('Certificate ID is not unique'));
    assert(!v.dom.window.document.body.textContent.includes(fixture.recipient_name));
  } finally { await v.close(); }
});
test('unavailable state offers an accessible explicit retry', async () => {
  let calls = 0;
  const v = await view(async () => response(++calls === 1 ? 500 : 200));
  try {
    const button = v.dom.window.document.querySelector('button');
    assert.equal(button.type, 'button'); assert.equal(button.textContent, 'Try again');
    await React.act(async () => button.click());
    assert.equal(calls, 2); assert(v.dom.window.document.body.textContent.includes('Certificate verified'));
  } finally { await v.close(); }
});
test('a stalled request times out to unavailable, never verified', async () => {
  let expire;
  const v = await view((_path, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('Synthetic timeout')));
  }), 'ID', { setTimeout(callback) { expire = callback; return 1; }, clearTimeout() {} });
  try {
    await React.act(async () => expire());
    assert(v.dom.window.document.body.textContent.includes('Verification unavailable'));
    assert(!v.dom.window.document.body.textContent.includes('Certificate verified'));
  } finally { await v.close(); }
});
test('HTML in approved fields is text, not executable markup', async () => {
  const v = await view(async () => response(200, { ...fixture, recipient_name: '<script>synthetic()</script>' }));
  try {
    assert(v.dom.window.document.body.textContent.includes('<script>synthetic()</script>'));
    assert.equal(v.dom.window.document.querySelector('script'), null);
  } finally { await v.close(); }
});
test('personal certificate pages have static no-index metadata and unchanged params', async () => {
  const page = harness(overrides, { AbortController }).load('src/app/verify/[id]/page.tsx');
  assert.equal(page.metadata.robots.index, false); assert.equal(page.metadata.robots.follow, false);
  assert.equal(page.metadata.robots.nosnippet, true); assert.equal(page.metadata.referrer, 'no-referrer');
  const result = await page.default({ params: Promise.resolve({ id: '42.5' }) });
  assert.equal(result.props.id, '42.5'); assert.equal(result.key, '42.5');
});
for (const id of [' Legacy /ID?%# ', 'HM%20literal', 'HM%2520literal', '42.5', 'HM-CERT-Legacy']) {
  test(`page boundary decodes exactly once before lookup: ${id}`, async () => {
    const page = harness(overrides, { AbortController }).load('src/app/verify/[id]/page.tsx');
    const result = await page.default({ params: Promise.resolve({ id: encodeURIComponent(id) }) });
    assert.equal(result.props.id, id);
    assert.equal(api.certificateLookupPath(result.props.id), `/api/certificates/verify/${encodeURIComponent(id)}`);
  });
}
test('malformed page encoding renders invalid without guessing an identifier', async () => {
  const page = harness(overrides, { AbortController }).load('src/app/verify/[id]/page.tsx');
  const result = await page.default({ params: Promise.resolve({ id: 'HM%broken' }) });
  assert.equal(api.certificateLookupPath(result.props.id), null);
});
test('guest verification uses public navigation without mounting session or discovery boundaries', () => {
  const forbidden = () => { throw new Error('Protected/session boundary must not mount'); };
  const stub = () => null;
  const loader = harness({
    'next/navigation': { usePathname: () => '/verify/42.5' },
    '@/components/FeedbackWidget': stub, '@/components/DailyStreakTracker': stub,
    '@/components/NotificationDrawer': stub, '@/components/Footer': stub,
    '@/components/system': { Button: stub, Dialog: stub },
    '@/lib/layoutConfig': { shouldRenderFooter: () => false },
    './useShellSession': { useShellSession: forbidden }, './ShellContext': { ShellProvider: forbidden },
    './ShellFrame': { ShellFrame: forbidden }, './AccountMenu': { AccountSheet: forbidden },
    './PublicHeader': { PublicHeader: ({ signedIn }) => { assert.equal(signedIn, false); return React.createElement('nav', null, 'Public header'); } },
    '@/components/hackathons/BrowsingBoundary': forbidden,
  });
  const Shell = loader.load('src/components/shell/AppShell.tsx').default;
  assert.match(renderToStaticMarkup(React.createElement(Shell, null, 'Public certificate')), /Public header/);
  const nav = loader.load('src/components/shell/navConfig.tsx');
  assert.equal(nav.isMarketingRoute('/verify/42.5'), true); assert.equal(nav.isForcedDarkRoute('/verify/42.5'), true);
  assert.equal(nav.isCertificateVerificationRoute('/dashboard'), false);
});
test('verification requests pass middleware without authentication', async () => {
  const loader = harness({ '@supabase/ssr': { createServerClient() { throw new Error('No auth allowed'); } } });
  const middleware = loader.load('src/middleware.ts');
  const result = await middleware.middleware({ nextUrl: { pathname: '/verify/42.5' } });
  assert.equal(result.headers.get('x-middleware-next'), '1');
  assert(!middleware.config.matcher.some(pattern => pattern.startsWith('/verify')));
});

// Qualify the frontend against the actual merged handler, not a handwritten
// approximation of its JSON. Only the Supabase transport is synthetic.
for (const [id, outcome] of [['', 'invalid'], ['!!!', 'invalid'], ['missing', 'missing'], ['duplicate', 'ambiguous'],
  ['database-error', 'unavailable'], ['HM-CERT-Legacy', 'verified'], ['42.5', 'verified'],
  ['00000000-0000-4000-8000-000000000001', 'verified']]) {
  test(`merged API contract projects ${JSON.stringify(id)} as ${outcome}`, async () => {
    const queries = [];
    const row = { id: '00000000-0000-4000-8000-000000000001', badge_name: fixture.badge_name,
      rank_title: fixture.rank_title, issuer_name: fixture.issuer_name, issued_at: fixture.issued_at,
      metadata: { certificate_id: id === '42.5' ? 42.5 : id },
      profiles: { full_name: fixture.recipient_name, college: 'PRIVATE-EXTRA' }, hackathons: { name: fixture.event_name } };
    const loader = harness({ '@supabase/supabase-js': { createClient() { return { from(table) {
      assert.equal(table, 'user_badges');
      return { select() { return this; }, eq(column, value) { queries.push([column, value]); return this; },
        or(value) { queries.push(['or', value]); return this; }, async limit(count) {
          assert.equal(count, 2);
          return { data: id === 'missing' ? [] : id === 'duplicate' ? [row, row] : [row],
            error: id === 'database-error' ? { message: 'Synthetic database failure' } : null };
        } };
    } }; } } });
    const handler = loader.load('src/app/api/certificates/verify/[id]/route.ts').GET;
    const response = await handler(new Request('http://offline.invalid'), { params: Promise.resolve({ id }) });
    const result = api.certificateResponse(response.status, await response.json());
    assert.equal(result.kind, outcome);
    if (outcome === 'verified') {
      assert.equal(result.certificate.id, id);
      if (!id.startsWith('00000000')) assert.equal(queries[0][1], id);
      assert(!JSON.stringify(result).includes('PRIVATE-EXTRA'));
    }
  });
}
