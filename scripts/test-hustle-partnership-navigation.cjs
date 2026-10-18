/* eslint-disable @typescript-eslint/no-require-imports -- Offline presentation regressions. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { renderToStaticMarkup } = require('react-dom/server');
const { React, load, renderPortal } = require('./hustle-carnival-harness.cjs');

test('partnership discovery exposes only the two public destinations, with accurate availability copy', () => {
  const Component = load('src/components/partners/HustlePartnershipBanner.tsx', {
    // Content fixture for the hydrated, pre-expiry view. Real hydration/boundary checks are separate.
    react: { ...React, useSyncExternalStore: () => true },
    'next/link': ({ children, prefetch, ...props }) => {
      assert.equal(prefetch, false);
      return React.createElement('a', props, children);
    },
  }).default;
  const doc = new JSDOM(renderToStaticMarkup(React.createElement(Component))).window.document;
  assert.deepEqual(Array.from(doc.querySelectorAll('a'), a => a.getAttribute('href')), [
    '/partners/hustle-carnival', '/partners/hustle-carnival/workshops',
  ]);
  assert.equal(doc.querySelector('section').getAttribute('aria-labelledby'), doc.querySelector('h2').id);
  assert.match(doc.body.textContent, /HackerMate.*Club Ellusion/);
  assert.match(doc.body.textContent, /Both rounds free/);
  assert.match(doc.body.textContent, /invitation-only/);
  assert.match(doc.body.textContent, /invitations follow verification of the official shortlist/);
  assert.match(doc.body.textContent, /No sign-in or registration required/);
  assert.doesNotMatch(doc.body.textContent, /10:00|10 AM|2:20/);
  assert.equal(doc.querySelectorAll('form, input, button, a[href*="phase-2"]').length, 0);
});

test('portal retains free, invitation-only finale guidance and public workshop navigation in every metadata state', async () => {
  for (const options of [{}, { missing: true }, { row: { max_team_size: 4 } }]) {
    const doc = new JSDOM((await renderPortal(options)).html).window.document;
    const nav = doc.querySelector('nav[aria-label="Carnival navigation"]');
    assert.equal(nav.querySelector('a[href="#schedule"]').textContent.trim(), 'The journey');
    assert.equal(nav.querySelector('a[href="/partners/hustle-carnival/workshops"]').textContent.trim(), 'Public workshops');
    assert.match(doc.body.textContent, /Both rounds are free/);
    assert.match(doc.body.textContent, /Private invitations follow verification of the official shortlist/);
    assert.doesNotMatch(doc.body.textContent, /Any payment instructions/);
    assert.equal(doc.querySelectorAll('a[href*="phase-2"], a[href*="?tab="], a[href*="teams/create"]').length, 0);
  }
});

test('confirmed schedule agrees across both workshop cards, FAQ, structured times and social metadata', () => {
  const route = load('src/app/partners/hustle-carnival/workshops/page.tsx');
  const doc = new JSDOM(renderToStaticMarkup(route.default())).window.document;
  assert.equal(doc.querySelector('time[datetime="2026-10-24T14:00:00+05:30"]').textContent, '2:00 PM');
  for (const card of doc.querySelectorAll('article')) {
    assert.match(card.textContent, /24 October 2026/);
    assert.match(card.textContent, /2:00 PM–4:00 PM IST/);
  }
  assert.match(doc.body.textContent, /from 2:00 PM to 4:00 PM IST/);
  assert.doesNotMatch(doc.body.textContent, /2:20/);
  for (const description of [route.metadata.description, route.metadata.openGraph.description, route.metadata.twitter.description]) {
    assert.match(description, /24 October 2026, 2:00 PM–4:00 PM IST/);
  }
});

test('app navigation remains six sections and five mobile tabs; ordinary event participation stays hard off', () => {
  const { NAV_ITEMS } = load('src/components/shell/navConfig.tsx');
  assert.deepEqual(Array.from(NAV_ITEMS, item => item.id), ['home', 'builders', 'teams', 'hackathons', 'practice', 'messages']);
  assert.deepEqual(Array.from(NAV_ITEMS.filter(item => item.mobile), item => item.id), ['home', 'builders', 'teams', 'hackathons', 'messages']);
  assert.equal(load('src/lib/partners/hustleCarnival.ts').hustlePublicParticipationEnabled(), false);
});
