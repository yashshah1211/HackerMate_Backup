/* eslint-disable @typescript-eslint/no-require-imports -- Production HTML against a read-only loopback fixture. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const ROOT = path.resolve(__dirname, '..');
const out = path.join(ROOT, 'work/public-metadata');
fs.mkdirSync(out, { recursive: true });
const { validateGoogleFontFunctionCall } = require('next/dist/compiled/@next/font/dist/google/validate-google-font-function-call');
const { getFontAxes } = require('next/dist/compiled/@next/font/dist/google/get-font-axes');
const { getGoogleFontsUrl } = require('next/dist/compiled/@next/font/dist/google/get-google-fonts-url');
const fonts = {};
for (const [name, axes] of [['Instrument_Sans', ['wdth']], ['Bricolage_Grotesque', ['opsz', 'wdth']], ['JetBrains_Mono', undefined]]) {
  const f = validateGoogleFontFunctionCall(name, { subsets: ['latin'], ...(axes ? { axes } : {}) });
  fonts[getGoogleFontsUrl(f.fontFamily, getFontAxes(f.fontFamily, f.weights, f.styles, f.selectedVariableAxes), f.display)] = `@font-face{font-family:'${f.fontFamily}';src:local(Arial);font-weight:100 900}`;
}
const fontFile = path.join(out, 'fonts.cjs');
fs.writeFileSync(fontFile, 'module.exports=' + JSON.stringify(fonts));
const env = { ...process.env };
for (const key of Object.keys(env)) if (/SUPABASE|DATABASE_URL|RESEND|SENTRY|VERCEL|HUSTLE|TOKEN|SECRET|API_KEY|NEXT_PUBLIC_GA|POSTHOG/.test(key)) delete env[key];
function run(args, name) {
  const log = fs.createWriteStream(path.join(out, name + '.log'));
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', ...args], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(log); child.stderr.pipe(log);
  const done = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => { log.end(); if (code === 0) resolve(); else reject(Error(`${name} exit ${code}`)); }); });
  return { child, done };
}
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const publicName = 'Climate &amp; &quot;Code&quot; &lt;Launch&gt;';
const publicDescription = '<p>**Build**&nbsp;[climate tools](https://example.com) &amp; &quot;learn&quot; &lt;together&gt;</p>';
const hostileName = 'Escaping &amp; &quot;quotes&quot; &lt;/title&gt;&lt;script id=&quot;title-injection&quot;&gt;x&lt;/script&gt;';
const hostileDescription = '&quot; /&gt;&lt;script id=&quot;metadata-injection&quot;&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp;';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
(async () => {
  assert(!fs.existsSync(path.join(ROOT, '.env')) && !fs.existsSync(path.join(ROOT, '.env.local')), 'Never load real credentials');
  const reads = [], unexpected = [];
  let building = true;
  const db = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const url = new URL(req.url, 'http://fixture.invalid');
    if (building && req.method === 'HEAD' && ['/rest/v1/profiles', '/rest/v1/hackathons', '/rest/v1/teams'].includes(url.pathname)) { res.setHeader('Content-Range', '0-0/0'); return res.end(); }
    if (building && req.method === 'GET' && url.pathname === '/rest/v1/hackathons' && !url.searchParams.has('id')) return res.end('[]');
    if (req.method !== 'GET' || url.pathname !== '/rest/v1/hackathons') { unexpected.push(req.method + ' ' + url.pathname); res.statusCode = 403; return res.end('{}'); }
    const eventId = url.searchParams.get('id')?.slice(3);
    reads.push({ id: eventId, filters: Object.fromEntries(url.searchParams), key: req.headers.apikey, authorization: req.headers.authorization });
    const n = Number(eventId?.slice(-12));
    // Deliberately return invisible rows despite filters to exercise defensive checks too.
    if (n === 7) { res.statusCode = 403; return res.end(JSON.stringify({ message: 'Public fixture unavailable' })); }
    const row = { id: eventId, name: n === 1 ? publicName : n === 6 ? hostileName : 'PRIVATE EVENT SENTINEL',
      description: n === 1 ? publicDescription : n === 6 ? hostileDescription : 'PRIVATE DESCRIPTION SENTINEL',
      organizer_email: 'PRIVATE ORGANIZER SENTINEL', status: n === 3 ? 'rejected' : n === 5 ? 'pending' : 'approved', archived: n === 2 };
    res.end(JSON.stringify(n === 4 ? null : row));
  });
  let runtime;
  try {
    const dbPort = await listen(db);
    const reserve = http.createServer(); const port = await listen(reserve); await new Promise(resolve => reserve.close(resolve));
    const origin = `http://127.0.0.1:${port}`;
    Object.assign(env, { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${dbPort}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anonymous', NEXT_PUBLIC_SITE_URL: 'https://hackermate.in', NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fontFile });
    console.log('Building actual Next application using synthetic public configuration and offline fonts.');
    await run(['build', '--webpack'], 'build').done;
    console.log('Production build passed.');
    building = false;
    runtime = run(['start', '-H', '127.0.0.1', '-p', String(port)], 'runtime'); runtime.done.catch(() => {});
    for (let attempt = 0; ; attempt++) {
      try { await fetch(origin + '/hackathons/invalid'); break; } catch { if (attempt === 119) throw Error('Server readiness timeout'); await new Promise(resolve => setTimeout(resolve, 500)); }
    }
    const evidence = [];
    for (const ua of ['WhatsApp/2.0', 'LinkedInBot/1.0', 'Twitterbot/1.0', 'facebookexternalhit/1.1', 'Mozilla/5.0']) {
      const cases = [1, 2, 3, 4, 5, 6, 7, 'malformed'].map(key => ({ key, nested: false }));
      if (ua === 'LinkedInBot/1.0') cases.push(...[1, 2, 5, 7].map(key => ({ key, nested: true })));
      for (const { key, nested } of cases) {
        const eventRoute = '/hackathons/' + (typeof key === 'number' ? id(key) : key);
        const route = eventRoute + (nested ? '/organizer' : '');
        const before = reads.length;
        const response = await fetch(origin + route + '?tab=saved', { headers: { 'user-agent': ua } });
        const html = await response.text();
        const doc = new JSDOM(html).window.document;
        const scope = ua === 'Mozilla/5.0' ? doc : doc.head;
        const meta = name => scope.querySelector(`meta[property="${name}"],meta[name="${name}"]`)?.content;
        const canonical = scope.querySelector('link[rel="canonical"]')?.href;
        assert.equal(response.status, 200);
        assert(!html.includes('PRIVATE ORGANIZER SENTINEL'));
        assert.equal(doc.querySelectorAll('#metadata-injection,#title-injection,meta[onload],img[onerror]').length, 0, 'Metadata text cannot create elements or attributes');
        if (key === 1 || key === 6) {
          const title = key === 1 ? 'Climate & "Code" <Launch> | HackerMate' : 'Escaping & "quotes" </title><script id="title-injection">x</script> | HackerMate';
          const description = key === 1 ? 'Build climate tools & "learn" <together>' : '" /><script id="metadata-injection">alert("x")</script> &';
          assert.equal(scope.querySelector('title')?.textContent, title);
          assert.equal(meta('description'), description);
          assert.equal(meta('og:title'), title);
          assert(html.includes('&lt;'), 'Angle brackets remain escaped in raw HTML');
          assert(html.includes('&quot;'), 'Quotes remain escaped in raw HTML');
          assert(!html.includes('&amp;quot;'), 'Named entities are not double escaped');
          assert.equal(meta('twitter:title'), meta('og:title'));
          assert.equal(meta('og:description'), meta('description')); assert.equal(meta('twitter:description'), meta('description'));
          assert.equal(meta('og:url'), 'https://hackermate.in' + eventRoute);
          assert.equal(canonical, meta('og:url'));
          assert.equal(meta('og:image'), 'https://hackermate.in/og-image.png');
          assert.equal(meta('twitter:image'), meta('og:image')); assert.equal(meta('twitter:card'), 'summary_large_image');
        } else {
          assert.equal(scope.querySelector('title')?.textContent, 'Hackathon unavailable | HackerMate');
          assert.match(meta('robots'), /noindex/); assert(!canonical);
          assert(!meta('og:title')); assert(!meta('twitter:title'));
          assert(!html.includes('PRIVATE EVENT SENTINEL')); assert(!html.includes('PRIVATE DESCRIPTION SENTINEL'));
        }
        if (key === 'malformed') assert.equal(reads.length, before);
        else assert.equal(reads.length, before + 1, 'Each request checks current visibility without cached metadata');
        fs.writeFileSync(path.join(out, `${ua.split('/')[0]}-${key}${nested ? '-organizer' : ''}.html`), html);
        evidence.push({ ua, key, nested, status: response.status, metadataInHead: ua !== 'Mozilla/5.0', pass: true });
      }
    }
    for (const read of reads) {
      assert.equal(read.key, 'synthetic-anonymous'); assert.equal(read.authorization, 'Bearer synthetic-anonymous');
      assert.equal(read.filters.status, 'eq.approved'); assert.equal(read.filters.archived, 'eq.false');
      assert(!/organizer_id|ai_feedback/.test(read.filters.select));
    }
    assert.deepEqual(unexpected, []);
    fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify({ checks: evidence, publicReads: reads.length, unexpected }, null, 2));
    console.log(`${evidence.length} production HTML checks passed; ${reads.length} anonymous fixture reads; no writes or external data.`);
  } finally { runtime?.child.kill(); await new Promise(resolve => db.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
