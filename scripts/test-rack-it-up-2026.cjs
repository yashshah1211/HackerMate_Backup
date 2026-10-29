// Synthetic public partner fixtures only; never contacts Supabase or the organizer.
(async () => {
  const { test } = await import('node:test');
  const { default: assert } = await import('node:assert/strict');
  const { default: fs } = await import('node:fs');
  const { default: path } = await import('node:path');
  const { default: React } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { JSDOM } = await import('jsdom');
  const { default: sharp } = await import('sharp');
  const { createHash } = await import('node:crypto');
  const { default: helpers } = await import('./partner-presentation-harness.cjs');
  const { load, fixture, EVENT, ROOT } = helpers;
  const { RACK_IT_UP_2026: rack, RACK_IT_UP_FACTS, isRackItUpEvent } = load('src/lib/partners/rackItUp2026.ts');
  const publicApi = load('src/lib/partners/public.ts');
  const presentation = load('src/components/partners/PublicEventPage.tsx');
  function data(options = {}) {
    return fixture({ ...options, partner: { slug: rack.slug, partner_name: rack.name,
      features: { portal_version: 'organizer-v1', registration_mode: 'external' }, ...options.partner },
      event: { name: rack.name, start_date: '2026-12-11', end_date: '2026-12-13', mode: 'online', location: null,
        min_team_size: 1, max_team_size: 4, website_url: rack.registrationUrl, ...options.event } });
  }
  async function resolve(options) { const f = data(options); return { ...f, result: await publicApi.resolvePublicPartner(f.client, rack.slug) }; }
  const render = result => renderToStaticMarkup(React.createElement(presentation.default, { config: result.config, event: result.event }));
  const documentOf = result => new JSDOM(render(result)).window.document;
  function assertNoMatching(result) {
    const doc = documentOf(result);
    assert.equal(doc.querySelectorAll('a[href^="/hackathons/"]').length, 0);
    assert(![...doc.querySelectorAll('a')].some(a => a.textContent === 'Find teammates'));
  }

  if (process.argv.includes('--preview')) {
    const directory = path.join(ROOT, 'scratch/rack-it-up-preview'); fs.mkdirSync(directory, { recursive: true });
    for (const [name, options] of [['active', {}], ['pending', { missingEvent: true }]]) {
      const { result } = await resolve({ ...options, partner: { logo_url: '/partners/rack-it-up-2026/RackItUp-mark.png' } });
      const css = fs.readFileSync(path.join(ROOT, 'src/components/partners/PublicEventPage.module.css'), 'utf8');
      const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rack It Up · synthetic preview</title><style>body{margin:0;background:#0f0f0e}aside{padding:12px 20px;color:#fff;background:#343432;font:14px Arial,sans-serif}' + css + '</style></head><body><aside>Synthetic offline preview. Matching uses a throwaway fixture ID; no live records, participant data or registration totals.</aside>' + render(result) + '</body></html>';
      fs.writeFileSync(path.join(directory, name + '.html'), html);
    }
    console.log(directory); return;
  }

  test('Rack portal separates official registration from event-scoped teammate discovery', async () => {
    const { result, queries } = await resolve(); const doc = documentOf(result);
    assert.equal(doc.querySelector('h1').textContent, rack.name);
    const matching = [...doc.querySelectorAll('a')].find(a => a.textContent === 'Find teammates');
    assert.equal(matching.getAttribute('href'), `/hackathons/${EVENT}?tab=looking_for_teams`);
    assert.equal(matching.dataset.rackFunnel, 'find_teammates');
    const registration = [...doc.querySelectorAll('a')].find(a => a.textContent.startsWith('Register on Unstop'));
    assert.equal(registration.getAttribute('href'), rack.registrationUrl);
    assert.equal(registration.target, '_blank'); assert.equal(registration.rel, 'noopener noreferrer');
    assert.equal(registration.dataset.rackFunnel, 'unstop');
    assert(doc.body.textContent.includes('Browse public builder profiles first. Sign up free'));
    assert(doc.body.textContent.includes('does not register you')); assert(doc.body.textContent.includes('Community Partner'));
    assert.deepEqual(queries.map(q => q.table), ['partner_configs', 'hackathons']);
    assert.deepEqual(queries[1].filter, ['id', EVENT]);
    assert(queries.every(q => !q.columns.includes('*')));
  });
  test('only confirmed organizer facts appear, with an explicit IST closing deadline', async () => {
    const { result } = await resolve({ event: { name: 'Stale event title', start_date: '2028-01-01', min_team_size: 9, description: 'Unapproved prize details' } });
    const doc = documentOf(result); for (const fact of RACK_IT_UP_FACTS) assert(doc.body.textContent.includes(fact.value));
    assert(doc.body.textContent.includes(rack.organizer)); assert(!doc.body.textContent.includes('Stale event title'));
    assert(!doc.body.textContent.includes('Unapproved prize')); assert(!doc.body.textContent.includes('2028'));
    assert.equal(new Date(doc.querySelector('time[datetime*="23:59"]').dateTime).toISOString(), '2026-12-09T18:29:00.000Z');
  });
  test('configured official mark and organizer credit retain the existing partner branding contract', async () => {
    const logo = '/partners/rack-it-up-2026/RackItUp-mark.png';
    const { result } = await resolve({ partner: { logo_url: logo } }); const doc = documentOf(result);
    assert.equal(result.config.logoUrl, logo);
    assert.equal(doc.querySelector('img[alt="Rack It Up 2026 logo"]').getAttribute('src'), logo);
    assert.equal(doc.querySelector('img[src$="/karma-logo.png"]').getAttribute('alt'), '');
    assert.equal(doc.querySelector('.organizerCredit').textContent, 'Organised by Karma Enterprises');
    assert(doc.body.textContent.includes('HackerMate is a Community Partner'));
    assert.equal(doc.querySelector('a[aria-label="HackerMate home"]').getAttribute('href'), '/');
  });
  test('absent configured mark preserves the text fallback and missing event retains organizer credit', async () => {
    const { result } = await resolve({ missingEvent: true }); const doc = documentOf(result);
    assert.equal(doc.querySelector('.identity .logo').textContent, 'R');
    assert.equal(doc.querySelector('.organizerCredit').textContent, 'Organised by Karma Enterprises');
    assertNoMatching(result);
  });
  test('organizer assets are byte-identical originals with transparent event corners and opaque cream Karma background', async () => {
    const hashes = { 'RackItUp-mark.png': '6e04d30b2da020cb0e2736be5c27b18867b796b9bf94b0fef1a9725b493e358e',
      'RackItUp-mark.svg': '40e0d0a8e521782ce8b88be8b89a418aeca7de29240a948e17079a7f1704f10d',
      'karma-logo.png': '99fe2e40317375eb2e9803850ba3c63cf5867fb13a81d10af4323d4db5939d17' };
    for (const [name, hash] of Object.entries(hashes)) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'public/partners/rack-it-up-2026', name))).digest('hex'), hash);
    for (const [name, size, corner] of [['RackItUp-mark.png', 1024, [0, 0, 0, 0]], ['karma-logo.png', 400, [244, 242, 236, 255]]]) {
      const image = sharp(path.join(ROOT, 'public/partners/rack-it-up-2026', name)); const meta = await image.metadata();
      assert.equal(meta.width, size); assert.equal(meta.height, size);
      const pixels = await image.ensureAlpha().raw().toBuffer(); assert.deepEqual([...pixels.subarray(0, 4)], corner);
    }
  });
  for (const website_url of [rack.registrationUrl, rack.registrationUrl + '?utm_source=existing-listing', rack.registrationUrl + '/', rack.registrationUrl.replace('unstop.com', 'www.unstop.com')]) {
    test('official identity remains matchable: ' + website_url, async () => {
      const { result } = await resolve({ event: { website_url } }); assert.equal(result.event.id, EVENT);
      assert(render(result).includes(`href="${rack.registrationUrl}"`));
    });
  }
  for (const website_url of ['https://example.invalid/other-event', rack.registrationUrl.replace('1777639', '1777640'),
    rack.registrationUrl.replace('unstop.com', 'unstop.com.evil.invalid'), rack.registrationUrl.replace('https:', 'http:'),
    rack.registrationUrl.replace('unstop.com', 'user:password@unstop.com'), null]) {
    test('wrong or absent official identity never links to unrelated discovery: ' + website_url, async () => {
      const { result } = await resolve({ event: { website_url } }); assert.equal(result.event, null);
      const html = render(result); assertNoMatching(result);
      assert(html.includes(rack.registrationUrl)); assert(html.includes('Teammate matching is not available yet'));
    });
  }
  for (const options of [{ missingEvent: true }, { partner: { hackathon_id: null } }, { event: { archived: true } }, { event: { type: 'native', status: 'pending' } }]) {
    test('null/unpublished binding is truthful and has no generic discovery fallback: ' + JSON.stringify(options), async () => {
      const { result } = await resolve(options); assert.equal(result.event, null);
      const html = render(result); assert(html.includes(rack.name)); assertNoMatching(result);
      assert(html.includes('Register on Unstop'));
    });
  }
  test('missing partner is not invented and Rack cannot enter the legacy creation path', async () => {
    assert.equal((await resolve({ missingPartner: true })).result.kind, 'missing');
    assert.equal((await resolve({ partner: { features: {} } })).result.kind, 'unavailable');
  });
  test('lookup errors retain logged unavailable behavior', async () => {
    for (const options of [{ partnerError: { code: '42501' } }, { eventError: { code: '42501' } }]) assert.equal((await resolve(options)).result.kind, 'unavailable');
  });
  test('direct presentation also rejects mismatched event props', async () => {
    const { result } = await resolve(); result.event.registrationUrl = 'https://example.invalid/unrelated';
    assert(!isRackItUpEvent(result.event)); assertNoMatching(result);
  });
  test('accessible public markup and no invented marketing or personal-data collection', async () => {
    const { result } = await resolve(); const doc = documentOf(result);
    assert.equal(doc.querySelectorAll('main').length, 1); assert.equal(doc.querySelectorAll('h1').length, 1);
    assert.equal(doc.querySelectorAll('dl dt').length, RACK_IT_UP_FACTS.length);
    assert.equal(doc.querySelectorAll('form,input,iframe,script').length, 0);
    for (const a of doc.querySelectorAll('a')) assert(a.textContent.trim() || a.getAttribute('aria-label'));
    for (const section of doc.querySelectorAll('section')) assert(doc.getElementById(section.getAttribute('aria-labelledby')));
    for (const claim of ['exclusive', 'guaranteed', 'registered participants', 'prize pool', 'official matching partner']) assert(!doc.body.textContent.toLowerCase().includes(claim));
    assert([...doc.querySelectorAll('a')].some(a => a.href === rack.website + '/'));
  });
  test('other organizer and legacy portals keep their existing identities and destinations', async () => {
    const otherId = '00000000-0000-4000-8000-000000000007';
    const f = fixture({ partner: { hackathon_id: otherId }, event: { id: otherId } });
    const result = await publicApi.resolvePublicPartner(f.client, f.partner.slug); const html = render(result);
    assert(html.includes('Sample Build Weekend')); assert(html.includes('Official registration'));
    assert(html.includes(`/hackathons/${otherId}?tab=looking_for_teams`)); assert(!html.includes(`/hackathons/${EVENT}`)); assert(!html.includes(rack.name));
    assert(!html.includes('Organised by Karma Enterprises')); assert(!html.includes('/partners/rack-it-up-2026/'));
    assert(!html.includes('data-rack-funnel')); assert(!html.includes('Browse public builder profiles first'));
    const legacy = fixture({ partner: { features: {} } }); assert.equal((await publicApi.resolvePublicPartner(legacy.client, legacy.partner.slug)).kind, 'legacy');
  });
  test('committed offline preview contains the actual current component and stylesheet', async () => {
    const { result } = await resolve({ partner: { logo_url: '/partners/rack-it-up-2026/RackItUp-mark.png' } });
    const preview = fs.readFileSync(path.join(ROOT, 'docs/qa/rack-it-up-2026-preview.html'), 'utf8');
    assert(preview.includes('Synthetic offline preview')); assert(preview.includes(render(result)));
    assert(preview.includes(fs.readFileSync(path.join(ROOT, 'src/components/partners/PublicEventPage.module.css'), 'utf8')));
  });
  test('metadata describes this event and uses its canonical partner URL without invented artwork', async () => {
    const { result } = await resolve();
    const page = load('src/app/partners/[slug]/page.tsx', { '@/lib/partners/public': { loadPublicPartner: async () => result }, '@/components/partners/LegacyPartnerPage': () => null });
    const meta = await page.generateMetadata({ params: Promise.resolve({ slug: rack.slug }) });
    assert.equal(meta.title, rack.name); assert.equal(meta.alternates.canonical, '/partners/' + rack.slug);
    assert.equal(meta.openGraph.images.length, 0);
  });
  test('handoff PNG preserves the official SVG dimensions, colors and transparent background', async () => {
    const image = sharp(path.join(ROOT, 'public/brand/hackermate-logo-transparent.png')); const meta = await image.metadata();
    assert.equal(meta.width, 1112); assert.equal(meta.height, 432); assert.equal(meta.hasAlpha, true);
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (const pixel of [0, info.width - 1, info.width * (info.height - 1), info.width * info.height - 1]) assert.equal(data[pixel * 4 + 3], 0);
    const svg = fs.readFileSync(path.join(ROOT, 'public/logo.svg'), 'utf8');
    for (const color of [...svg.matchAll(/fill="#([0-9a-f]{6})"/gi)].map(m => m[1])) {
      const rgb = [0, 2, 4].map(i => parseInt(color.slice(i, i + 2), 16)); let found = false;
      for (let i = 0; i < data.length; i += 4) if (data[i] === rgb[0] && data[i+1] === rgb[1] && data[i+2] === rgb[2] && data[i+3] === 255) { found = true; break; }
      assert(found, 'official color #' + color);
    }
  });
})().catch(error => { console.error(error); process.exitCode = 1; });
