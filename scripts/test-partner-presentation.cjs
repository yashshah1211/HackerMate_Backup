/* eslint-disable @typescript-eslint/no-require-imports -- Offline real-module runtime tests. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { ROOT, EVENT, load, fixture } = require('./partner-presentation-harness.cjs');
const configApi = load('src/lib/partners/config.ts');
const publicApi = load('src/lib/partners/public.ts');
const presentation = load('src/components/partners/PublicEventPage.tsx');
const render = result => renderToStaticMarkup(React.createElement(presentation.default, { config: result.config, event: result.event }));
async function resolve(options = {}) {
  const data = fixture(options);
  return { ...data, result: await publicApi.resolvePublicPartner(data.client, data.partner.slug) };
}
function route(result) {
  const Legacy = () => React.createElement('div', null, 'Legacy experience');
  return load('src/app/partners/[slug]/page.tsx', {
    '@/lib/partners/public': { loadPublicPartner: async () => result },
    '@/components/partners/LegacyPartnerPage': Legacy,
    '@/components/partners/PublicEventPage': presentation,
    'next/navigation': { notFound() { throw new Error('NEXT_NOT_FOUND'); } },
  });
}
const props = { params: Promise.resolve({ slug: 'sample-event' }) };

for (const version of [undefined, null, 'legacy', 'unknown', 'Organizer-v1', true]) {
  test(`only exact opt-in changes legacy: ${String(version)}`, async () => {
    const { result, queries } = await resolve({ partner: { features: { portal_version: version } } });
    assert.equal(result.kind, 'legacy');
    assert.equal(queries.length, 1);
    assert.match(renderToStaticMarkup(await route(result).default(props)), /Legacy experience/);
  });
}
test('explicit V1 routes to the real public component without auth', async () => {
  const { result, queries } = await resolve();
  assert.equal(result.kind, 'organizer-v1');
  assert.match(renderToStaticMarkup(await route(result).default(props)), /Sample Build Weekend/);
  assert.deepEqual(queries.map(q => q.table), ['partner_configs', 'hackathons']);
  assert.deepEqual(queries[1].filter, ['id', EVENT]);
  for (const query of queries) assert(!query.columns.includes('*'));
  assert(!queries[1].columns.includes('organizer_id'));
  assert(queries[1].columns.includes('approval_status:ai_feedback->>status'));
});
test('unknown partner returns not-found and no-index metadata without an event lookup', async () => {
  const { result, queries } = await resolve({ missingPartner: true });
  assert.equal(result.kind, 'missing'); assert.equal(queries.length, 1);
  await assert.rejects(route(result).default(props), /NEXT_NOT_FOUND/);
  assert.equal((await route(result).generateMetadata(props)).robots.index, false);
  const notFound = load('src/app/partners/[slug]/not-found.tsx');
  assert.match(renderToStaticMarkup(React.createElement(notFound.default)), /Partner event not found/);
});
for (const slug of ['', '../event', 'CAPS', 'a'.repeat(101)]) {
  test(`invalid slug is rejected before lookup: ${slug.slice(0, 12)}`, async () => {
    const f = fixture();
    assert.equal((await publicApi.resolvePublicPartner(f.client, slug)).kind, 'missing');
    assert.equal(f.queries.length, 0);
  });
}
for (const options of [{ missingEvent: true }, { partner: { hackathon_id: null } }, { partner: { hackathon_id: '../private' } }]) {
  test(`missing association preserves its own identity and omits community: ${JSON.stringify(options)}`, async () => {
    const { result } = await resolve(options);
    const html = render(result);
    assert.equal(result.event, null);
    assert.match(html, /Sample Collective/); assert.match(html, /Event information is being finalized/);
    assert(!html.includes('/hackathons/')); assert(!html.includes('Official registration'));
  });
}
for (const options of [{ partnerError: { code: '42501' } }, { eventError: { code: 'XX000' } }, { throwError: new Error('offline') }]) {
  test(`lookup failure is logged and shows unavailable, not not-found: ${JSON.stringify(options)}`, async () => {
    const errors = [];
    const api = load('src/lib/partners/public.ts', {}, { errors });
    const f = fixture(options);
    const result = await api.resolvePublicPartner(f.client, f.partner.slug);
    assert.equal(result.kind, 'unavailable'); assert.equal(errors.length, 1);
    const html = renderToStaticMarkup(await route(result).default(props));
    assert.match(html, /temporarily unavailable/); assert(!html.includes('42501'));
  });
}
for (const unsafe of ['javascript:alert(1)', 'data:text/html,bad', 'file:///private', 'mailto:private@example.invalid', '//example.invalid',
  'https://user:password@example.invalid', 'https://example.invalid/\nnext', 'https:\\example.invalid', 'https:example.invalid', 'bad', ' https://example.invalid', null, 13]) {
  test(`reject unsafe external URL: ${String(unsafe)}`, async () => {
    assert.equal(configApi.safeExternalUrl(unsafe), null);
    const { result } = await resolve({ partner: { logo_url: unsafe, banner_url: unsafe,
      features: { portal_version: 'organizer-v1', official_website: unsafe, public_contact: { label: 'Unsafe contact', url: unsafe },
        approved_links: [{ label: 'Unsafe rules', url: unsafe }] } }, event: { website_url: unsafe } });
    const html = render(result);
    assert(!html.includes('<img')); assert(!html.includes('Unsafe contact')); assert(!html.includes('Unsafe rules'));
    assert(!html.includes('Official registration')); assert.match(html, /registration link will be shared/);
    assert.match(html, new RegExp(`/hackathons/${EVENT}`));
  });
}
for (const safe of ['https://example.invalid/register?a=1', 'http://example.invalid/register']) {
  test(`approved http(s) URL remains external: ${safe}`, async () => {
    const { result } = await resolve({ event: { website_url: safe } });
    const html = render(result);
    assert.match(html, /Official registration/); assert(html.includes(`href="${safe}" target="_blank" rel="noopener noreferrer"`));
    assert(html.includes(`href="/hackathons/${EVENT}"`));
    assert.match(html, /separate step/); assert.match(html, /opens in a new tab/);
  });
}
test('native event cannot be presented as externally registered through config', async () => {
  const { result } = await resolve({ partner: { features: { portal_version: 'organizer-v1', registration_mode: 'external' } },
    event: { type: 'native', status: 'approved' } });
  const html = render(result);
  assert(!html.includes('Official registration')); assert.match(html, /participation details/);
});
for (const event of [{ archived: true }, { archived: null }, { type: 'native', status: 'pending' }, { type: 'native', status: null, approval_status: 'rejected' }]) {
  test(`unpublished event facts and destination omitted: ${JSON.stringify(event)}`, async () => {
    const { result } = await resolve({ event });
    assert.equal(result.event, null); const html = render(result);
    assert(!html.includes('Sample Build Weekend')); assert(!html.includes('/hackathons/'));
  });
}
test('approved native event via effective AI status is public', async () => {
  const { result } = await resolve({ event: { type: 'native', status: null, approval_status: 'approved' } });
  assert.equal(result.event.id, EVENT);
});
test('zero-registration minimal config is complete and has no guessed facts or links', async () => {
  const { result, queries } = await resolve({ partner: { tagline: null }, event: {
    start_date: null, end_date: null, mode: null, location: null, min_team_size: null, max_team_size: null, website_url: null } });
  const html = render(result);
  assert.match(html, /Event information is being finalized/); assert.match(html, /Find teammates/);
  for (const text of ['<img', '<time', '<dl', 'From the organizer', 'builders joined', '0 builders', 'team counts']) assert(!html.includes(text));
  assert.equal(queries.length, 2);
});
test('explicit field mapping strips private organizer and registration extras', async () => {
  const secret = 'PRIVATE_SECRET';
  const { result } = await resolve({ partner: { email: secret, features: { portal_version: 'organizer-v1', organizer_id: secret, private_contact: secret } },
    event: { organizer_id: secret, email: secret, ai_feedback: { private: secret }, registrations: [{ email: secret }] } });
  assert(!JSON.stringify(result).includes(secret)); assert(!render(result).includes(secret));
});
test('strict hex color can affect identity only; CSS payloads discarded', async () => {
  for (const color of ['red', '#abc', 'url(https://example.invalid)', '#123456;display:none', 'var(--private)']) {
    assert.equal(configApi.normalizePartnerConfig({ accent_color: color }).identityColor, null);
  }
  const { result } = await resolve({ partner: { accent_color: '#ff9900' } });
  assert(render(result).includes('--partner-identity:#ff9900'));
  const css = fs.readFileSync(path.join(ROOT, 'src/components/partners/PublicEventPage.module.css'), 'utf8');
  assert.equal((css.match(/var\(--partner-identity\)/g) || []).length, 1);
  assert(css.includes('background: #b4f461'));
});
test('calendar dates and inconsistent ranges do not fabricate event facts', async () => {
  for (const day of ['2028-02-30', '2028-13-01', 'tomorrow', '2028-1-1', '2028-11-24Tgarbage']) assert.equal(configApi.calendarDate(day), null);
  const { result } = await resolve({ event: { start_date: '2028-11-25T00:00:00Z', end_date: '2028-11-24', min_team_size: 4, max_team_size: 2 } });
  assert.equal(result.event.endDate, null); assert.equal(result.event.minTeamSize, null);
  assert.match(render(result), /25 Nov 2028/); assert(!render(result).includes('24 Nov'));
});
test('date ranges stay compact on mobile while preserving full machine-readable dates', async () => {
  const { result } = await resolve();
  const html = render(result);
  assert.match(html, /dateTime="2028-11-24"/i);
  assert.match(html, /aria-label="24 Nov 2028">24<\/time>/);
  assert.match(html, /dateTime="2028-11-25">25 Nov 2028/i);
});
for (const sizes of [[null, 4, 'Up to 4 people'], [2, null, 'At least 2 people'], [1, 1, '1 person']]) {
  test(`only recorded team bounds appear: ${sizes[2]}`, async () => {
    const { result } = await resolve({ event: { min_team_size: sizes[0], max_team_size: sizes[1] } });
    assert(render(result).includes(sizes[2]));
  });
}
test('optional approved links and local artwork use safe accessible markup', async () => {
  const { result } = await resolve({ partner: { logo_url: '/partners/sample.png', banner_url: 'https://example.invalid/art.png',
    features: { portal_version: 'organizer-v1', official_website: 'https://example.invalid',
      public_contact: { label: 'Public help desk', url: 'https://example.invalid/contact' },
      approved_links: [{ label: 'Event rules', url: 'https://example.invalid/rules' }, { label: 'Invalid', url: 'javascript:bad' }] } } });
  const html = render(result);
  for (const text of ['Sample Collective logo', 'Event rules', 'Public help desk', 'Organizer website']) assert(html.includes(text));
  assert(!html.includes('Invalid')); assert.match(html, /aria-labelledby="event-title"/);
  assert.equal((html.match(/<h1 /g) || []).length, 1);
  assert.equal(configApi.safeImageUrl('//example.invalid/art.png'), null);
});
test('broken logo restores its letter and broken banner removes artwork', () => {
  for (const fallback of ['S', undefined]) {
    let failed = false;
    const Image = load('src/components/partners/PartnerImage.tsx', {
      react: { ...React, useState: () => [failed, value => { failed = value; }] },
    }).default;
    const props = { src: 'https://example.invalid/broken.png', alt: 'Sample logo', fallback };
    const first = Image(props);
    first.props.onError();
    const next = Image(props);
    assert.equal(next?.props.children, fallback);
    assert(!next || next.type === 'span');
  }
});
test('plain-text config cannot render organizer HTML', async () => {
  const { result } = await resolve({ partner: { tagline: '<script>bad()</script>' } });
  assert(render(result).includes('&lt;script&gt;')); assert(!render(result).includes('<script>'));
});
test('metadata uses event facts, canonical slug and only validated real artwork', async () => {
  const { result } = await resolve({ partner: { banner_url: 'javascript:bad' } });
  const metadata = await route(result).generateMetadata(props);
  assert.equal(metadata.title, 'Sample Build Weekend'); assert.equal(metadata.description, 'A weekend for curious builders.');
  assert.equal(metadata.alternates.canonical, '/partners/sample-event'); assert.equal(metadata.openGraph.images.length, 0);
});
test('legacy extraction is byte-identical to the pre-Commit-6 page', () => {
  const current = fs.readFileSync(path.join(ROOT, 'src/components/partners/LegacyPartnerPage.tsx'), 'utf8');
  // SHA-256 of the LF-normalized page at 622648f; works in shallow CI checkouts.
  assert.equal(createHash('sha256').update(current.replace(/\r\n/g, '\n')).digest('hex'),
    '70bd1ea9bab65e086ce83ee0edc5e6ac3b936d07608f619e045d2c46c4ce763d');
});
test('all checked-in partner seeds retain legacy unless explicitly opted in', () => {
  const migrations = fs.readdirSync(path.join(ROOT, 'supabase/migrations')).filter(name => /partner|axcentra/.test(name));
  assert(migrations.length > 5);
  for (const name of migrations) assert(!fs.readFileSync(path.join(ROOT, 'supabase/migrations', name), 'utf8').includes('organizer-v1'));
});
test('V1 public source has no registration reads, auth, metrics or event-specific hardcodes', () => {
  for (const file of ['src/lib/partners/public.ts', 'src/lib/partners/config.ts', 'src/components/partners/PublicEventPage.tsx', 'src/app/partners/[slug]/page.tsx']) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const forbidden of ['hackathon_registrations', 'get_hackathon_registration_counts', 'list_event_discovery_builders', 'getUser(', 'nexhack-2', 'ac633274-2726-494e-af3b-8f2277355a36', 'dangerouslySetInnerHTML']) assert(!source.includes(forbidden), `${file}: ${forbidden}`);
  }
});

test('server wrapper uses only the anonymous public key and disables sessions', async () => {
  const priorUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const priorKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fake-public-key';
    const f = fixture(); let called = 0;
    const api = load('src/lib/partners/public.ts', {
      react: { cache: fn => fn },
      '@supabase/supabase-js': { createClient(url, key, options) {
        called++; assert.equal(url, 'https://example.invalid'); assert.equal(key, 'fake-public-key');
        assert.equal(options.auth.persistSession, false); assert.equal(options.auth.autoRefreshToken, false);
        assert.equal(options.auth.detectSessionInUrl, false); return f.client;
      } },
    });
    assert.equal((await api.loadPublicPartner('sample-event')).kind, 'organizer-v1'); assert.equal(called, 1);
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    assert.equal((await api.loadPublicPartner('sample-event')).kind, 'unavailable'); assert.equal(called, 1);
  } finally {
    for (const [key, value] of [['NEXT_PUBLIC_SUPABASE_URL', priorUrl], ['NEXT_PUBLIC_SUPABASE_ANON_KEY', priorKey]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('malformed optional features fall back safely without changing presentation by accident', () => {
  for (const features of [null, [], 'organizer-v1', 1]) {
    const normalized = configApi.normalizePartnerConfig({ features });
    assert.equal(normalized.portalVersion, 'legacy'); assert.equal(normalized.approvedLinks.length, 0);
  }
  const normalized = configApi.normalizePartnerConfig({ features: { portal_version: 'organizer-v1',
    approved_links: [null, 1, { url: 'https://example.invalid' }], public_contact: 'private@example.invalid' } });
  assert.equal(normalized.approvedLinks.length, 0); assert.equal(normalized.publicContact, null);
});
