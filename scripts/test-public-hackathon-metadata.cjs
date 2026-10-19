/* eslint-disable @typescript-eslint/no-require-imports -- Offline metadata contract tests. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { harness } = require('./ppt-vision-harness.cjs');
const id = '00000000-0000-4000-8000-000000000001';
function fixture(data, error = null) {
  const calls = [];
  let options;
  const client = { from(table) { assert.equal(table, 'hackathons'); return {
    select(columns) { calls.push(['select', columns]); return this; },
    eq(key, value) { calls.push([key, value]); return this; },
    async maybeSingle() { return { data, error }; },
  }; } };
  const loader = harness({ '@supabase/supabase-js': { createClient(url, key, opts) {
    assert.equal(url, 'https://public.invalid'); assert.equal(key, 'anonymous'); options = opts; return client;
  } } });
  Object.assign(loader.env, { NEXT_PUBLIC_SUPABASE_URL: 'https://public.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anonymous', SUPABASE_SERVICE_ROLE_KEY: 'must-never-be-used' });
  return { calls, loader, options: () => options, metadata: loader.load('src/lib/hackathons/publicMetadata.ts').publicHackathonMetadata };
}
const approved = { id, status: 'approved', archived: false, name: 'Climate & Code', description: '**Build** [climate tools](https://example.com) <b>together</b>.' };
test('approved metadata uses safe projection, visibility filters, anonymous client and canonical event URL', async () => {
  const f = fixture(approved), m = await f.metadata(id);
  assert.equal(m.title.absolute, 'Climate & Code | HackerMate');
  assert.equal(m.description, 'Build climate tools together .');
  assert.equal(m.alternates.canonical, `https://hackermate.in/hackathons/${id}`);
  assert.equal(m.openGraph.url, m.alternates.canonical);
  assert.equal(m.openGraph.title, m.title.absolute); assert.equal(m.twitter.description, m.description);
  assert.equal(m.twitter.card, 'summary_large_image'); assert.equal(m.twitter.images[0], '/og-image.png');
  assert.deepEqual(f.calls.slice(1), [['id', id], ['status', 'approved'], ['archived', false]]);
  assert.equal(f.calls[0][1], f.loader.load('src/lib/hackathons/publicBrowsing.ts').PUBLIC_EVENT_COLUMNS);
  assert(!/organizer_id|ai_feedback/.test(f.calls[0][1]));
  assert.equal(f.options().auth.persistSession, false); assert.equal(f.options().auth.autoRefreshToken, false);
});
for (const [name, row, error] of [
  ['archived', { ...approved, archived: true }], ['rejected', { ...approved, status: 'rejected' }],
  ['pending', { ...approved, status: 'pending' }], ['unpublished', { ...approved, status: null }],
  ['ambiguous archive', { ...approved, archived: null }], ['missing', null],
  ['malformed event', { ...approved, name: {} }], ['wrong event', { ...approved, id: id.replace(/1$/, '2') }],
  ['query failure', null, { message: 'denied' }],
]) test(`${name} returns generic noindex metadata without event fields`, async () => {
  const m = await fixture(row, error).metadata(id);
  assert.equal(m.title, 'Hackathon unavailable'); assert.equal(m.robots.index, false);
  assert.equal(m.openGraph, null); assert.equal(m.twitter, null); assert.equal(m.alternates.canonical, null);
  assert(!JSON.stringify(m).includes('Climate'));
});
for (const malformed of ['nope', '../private', '%00', '', `${id}?private=1`]) test(`malformed ID ${JSON.stringify(malformed)} makes no request`, async () => {
  const f = fixture(approved); assert.equal((await f.metadata(malformed)).robots.index, false);
  assert.equal(f.calls.length, 0); assert.equal(f.options(), undefined);
});
test('description fallback, length limit, and configured site origin', async () => {
  const f = fixture({ ...approved, description: null }); f.loader.env.NEXT_PUBLIC_SITE_URL = 'https://hackermate.example';
  assert.match((await f.metadata(id)).description, /Explore Climate & Code/);
  assert.equal((await f.metadata(id)).openGraph.url, `https://hackermate.example/hackathons/${id}`);
  assert.equal((await fixture({ ...approved, description: 'a'.repeat(300) }).metadata(id)).description.length, 160);
});
test('route layout awaits params and passes children through unchanged', async () => {
  const f = fixture(approved), layout = f.loader.load('src/app/hackathons/[id]/layout.tsx');
  assert.equal((await layout.generateMetadata({ params: Promise.resolve({ id }) })).openGraph.title, 'Climate & Code | HackerMate');
  const children = {}; assert.equal(layout.default({ children }), children);
});
test('transport errors fail closed', async () => {
  const loader = harness({ '@supabase/supabase-js': { createClient() { throw Error('transport failure'); } } });
  assert.equal((await loader.load('src/lib/hackathons/publicMetadata.ts').publicHackathonMetadata(id)).robots.index, false);
});
test('public fetch explicitly disables caching and bounds request duration', async () => {
  let opts, request;
  const loader = harness({ '@supabase/supabase-js': { createClient(_url, _key, options) {
    opts = options; throw Error('Stop after client configuration');
  } } }, { fetch: async (input, init) => { request = { input, init }; return new Response('{}'); } });
  await loader.load('src/lib/hackathons/publicMetadata.ts').publicHackathonMetadata(id);
  await opts.global.fetch('https://fixture.invalid', { headers: { apikey: 'fixture' }, cache: 'force-cache' });
  assert.equal(request.init.cache, 'no-store'); assert.equal(request.init.headers.apikey, 'fixture');
  assert(request.init.signal instanceof AbortSignal);
});
for (const [label, description, expected] of [
  ['common named entities', 'Build&nbsp;&amp;&nbsp;learn &quot;together&quot; with &lt;code&gt;', 'Build & learn "together" with <code>'],
  ['mixed HTML and Markdown', '<p>**Build** [tools](https://example.com) &amp; ![learn](https://example.com/image)</p>\n> `C++` &lt;3&gt;', 'Build tools & learn C++ <3>'],
  ['malformed formatting', '**Unclosed [link &amp; <b>bold</b> &unknown; &amp', 'Unclosed [link & bold &unknown; &amp'],
  ['literal special characters', 'C++ > 1; "quotes" & ₹500; 2 < 3', 'C++ > 1; "quotes" & ₹500; 2 < 3'],
  ['non-string description', { toString() { throw Error('Do not coerce input'); } }, 'Explore Climate & Code on HackerMate. Discover event details and find teammates.'],
  ['headings preserve hashes and numeric entities', '# Build C# &amp; tools &#35; &#x3c;literal&#x3e;', 'Build C# & tools &#35; &#x3c;literal&#x3e;'],
  ['control characters', 'Build\u0000&nbsp;&amp;\u007f learn', 'Build & learn'],
  ['decode once', '&amp;lt;literal&amp;gt;', '&lt;literal&gt;'],
  ['hostile encoded text', '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;', '<script>alert("x")</script>'],
]) test(`preview text: ${label}`, async () => {
  const m = await fixture({ ...approved, description }).metadata(id);
  assert.equal(m.description, expected);
  assert.equal(m.openGraph.description, expected); assert.equal(m.twitter.description, expected);
});
test('event titles reuse entity handling and remain plain metadata strings', async () => {
  const m = await fixture({ ...approved, name: 'Build &amp; &quot;Learn&quot; &lt;2026&gt;' }).metadata(id);
  assert.equal(m.title.absolute, 'Build & "Learn" <2026> | HackerMate');
  assert.equal(m.openGraph.title, m.title.absolute); assert.equal(m.twitter.title, m.title.absolute);
});
