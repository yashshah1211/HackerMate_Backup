/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic metadata/asset checks only. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { harness } = require('./ppt-vision-harness.cjs');

const stub = () => null;
const loader = () => harness({
  'next/font/google': { Instrument_Sans: () => ({}), Bricolage_Grotesque: () => ({}), JetBrains_Mono: () => ({}) },
  './globals.css': {}, 'next/script': stub, '@vercel/analytics/next': { Analytics: stub },
  '@/components/shell/AppShell': stub, '@/context/NotificationContext': { NotificationProvider: stub }, './providers': { AppProviders: stub },
  '@/lib/getLandingData': { getLandingData() { throw new Error('Metadata must not fetch landing data'); } }, './LandingPageClient': { LandingPageClient: stub },
});

test('homepage has its own canonical without giving every child the homepage canonical', () => {
  const l = loader(), root = l.load('src/app/layout.tsx').metadata, home = l.load('src/app/page.tsx').metadata;
  assert.equal(home.alternates.canonical, '/');
  assert.equal(root.alternates?.canonical, undefined);
  assert.equal(root.metadataBase.href, 'https://hackermate.in/');
  assert.equal(root.openGraph.url, 'https://hackermate.in');
  assert.equal(root.twitter.card, 'summary_large_image');
  assert.equal(fs.readFileSync(path.resolve(__dirname, '../src/app/opengraph-image.alt.txt'), 'utf8').trim(), root.openGraph.images[0].alt);
});
test('configured metadata base consistently resolves canonical and image URLs', () => {
  const l = loader(); l.env.NEXT_PUBLIC_SITE_URL = 'https://sharing.example.invalid';
  const root = l.load('src/app/layout.tsx').metadata;
  assert.equal(new URL('/', root.metadataBase).href, 'https://sharing.example.invalid/');
  assert.equal(new URL(root.openGraph.images[0].url, root.metadataBase).href, 'https://sharing.example.invalid/og-image.png');
});

function partner(kind = 'organizer-v1', fields = {}) {
  const l = harness({ '@/lib/partners/public': { loadPublicPartner: async () => kind === 'missing' || kind === 'unavailable' ? { kind } : {
    kind, config: { slug: 'rack-it-up-2026', name: 'Rack It Up 2026', tagline: 'PRIVATE UNAPPROVED CLAIM', bannerUrl: null, logoUrl: null, ...fields },
    event: { name: 'PRIVATE STALE TITLE', description: 'PRIVATE EVENT DETAILS' },
  } }, '@/components/partners/LegacyPartnerPage': stub, '@/components/partners/PublicEventPage': { default: stub, PartnerPageState: stub } });
  return l.load('src/app/partners/[slug]/page.tsx').generateMetadata({ params: Promise.resolve({ slug: 'rack-it-up-2026' }) });
}
test('Rack metadata retains confirmed facts and uses the existing landscape brand fallback', async () => {
  const m = await partner();
  assert.equal(m.title, 'Rack It Up 2026');
  assert.equal(m.alternates.canonical, '/partners/rack-it-up-2026'); assert.equal(m.openGraph.url, m.alternates.canonical);
  assert.equal(m.openGraph.description, m.description); assert.equal(m.twitter.description, m.description);
  assert(!JSON.stringify(m).includes('PRIVATE'));
  assert.equal(m.openGraph.images[0].url, '/og-image.png');
  assert.equal(m.openGraph.images[0].width, 1200); assert.equal(m.openGraph.images[0].height, 630);
  assert.equal(m.openGraph.images[0].alt, 'HackerMate — Team Operating System');
  assert.equal(m.twitter.images[0], '/og-image.png'); assert.equal(m.twitter.card, 'summary_large_image');
});
test('logo-only metadata preserves official artwork with a compact Twitter card', async () => {
  const logoUrl = '/partners/rack-it-up-2026/RackItUp-mark.png';
  const m = await partner('organizer-v1', { logoUrl });
  assert.equal(m.openGraph.images[0].url, logoUrl); assert.equal(m.twitter.images[0], logoUrl);
  assert.equal(m.twitter.card, 'summary');
});
test('configured banner retains priority over logo without changing the asset', async () => {
  const m = await partner('organizer-v1', { bannerUrl: 'https://artwork.example.invalid/approved-banner.png', logoUrl: '/logo.png' });
  assert.equal(m.openGraph.images[0].url, 'https://artwork.example.invalid/approved-banner.png');
  assert.equal(m.twitter.card, 'summary_large_image');
});
test('other logo aspect ratios retain their existing card policy', async () => {
  const m = await partner('organizer-v1', { slug: 'synthetic-partner', logoUrl: '/brand/hackermate-logo-transparent.png' });
  assert.equal(m.openGraph.images[0].url, '/brand/hackermate-logo-transparent.png');
  assert.equal(m.twitter.card, 'summary_large_image');
});
for (const kind of ['missing', 'unavailable']) test(`${kind} partner suppresses inherited social claims and indexing`, async () => {
  const m = await partner(kind);
  assert.equal(m.robots.index, false); assert.equal(m.robots.follow, false);
  assert.equal(m.openGraph, null); assert.equal(m.twitter, null); assert.equal(m.alternates.canonical, null);
  assert(!JSON.stringify(m).includes('PRIVATE'));
});
test('generic partner with no artwork gets a real fallback rather than invented event imagery', async () => {
  const m = await partner('organizer-v1', { slug: 'synthetic-partner', name: 'Synthetic Partner', tagline: 'Public fixture description' });
  assert.equal(m.alternates.canonical, '/partners/synthetic-partner');
  assert.equal(m.openGraph.images[0].url, '/og-image.png');
  assert.equal(m.openGraph.images[0].alt, 'HackerMate — Team Operating System');
});
test('existing preview assets are valid PNGs with measured landscape/square dimensions', async () => {
  const root = path.resolve(__dirname, '..');
  for (const [file, width, height] of [['public/og-image.png', 1200, 630], ['src/app/opengraph-image.png', 1200, 630], ['public/partners/rack-it-up-2026/RackItUp-mark.png', 1024, 1024]]) {
    const m = await sharp(path.join(root, file)).metadata();
    assert.equal(m.format, 'png'); assert.equal(m.width, width); assert.equal(m.height, height);
    assert(fs.statSync(path.join(root, file)).size < 5 * 1024 * 1024);
  }
  assert(fs.readFileSync(path.join(root, 'public/og-image.png')).equals(fs.readFileSync(path.join(root, 'src/app/opengraph-image.png'))));
});
