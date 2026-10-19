/* eslint-disable @typescript-eslint/no-require-imports -- Real nested layouts and native portal authorization against isolated clients. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { harness } = require('./ppt-vision-harness.cjs');
const { serverHarness, EVENT, USER } = require('./organizer-workspace-harness.cjs');

function publicLayout(row, error) {
  const reads = [];
  const loader = harness({ '@supabase/supabase-js': { createClient(_url, key) {
    assert.equal(key, 'fixture-anon');
    return { from(table) {
      assert.equal(table, 'hackathons');
      return { select(columns) { reads.push(columns); return this; }, eq() { return this; },
        async maybeSingle() { return { data: row, error }; } };
    } };
  } } });
  Object.assign(loader.env, { NEXT_PUBLIC_SUPABASE_URL: 'https://public.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-anon' });
  return { layout: loader.load('src/app/hackathons/[id]/layout.tsx'), reads };
}

// Run the existing page's loading effect; presentation and AuthGuard are left as React elements.
// This exercises the page's independent getUser/native-owner/RPC checks, without writes or sign-in.
async function nativePortal(child, { user = { id: USER }, access = true, owner = USER } = {}) {
  const effects = [], reads = [], redirects = [], rpcs = [];
  const AuthGuard = () => null;
  const loader = harness({
    react: { ...React, useState: value => [value, () => {}], useEffect: effect => effects.push(effect) },
    'next/navigation': { useParams: () => ({ id: EVENT }), useRouter: () => ({ push: url => redirects.push(url) }) },
    '@/components/AuthGuard': AuthGuard,
    '@/lib/supabase': { supabase: {
      auth: { async getUser() { return { data: { user }, error: null }; } },
      async rpc(name, args) { rpcs.push([name, args]); return { data: access, error: null }; },
      from(table) {
        reads.push(table);
        const data = table === 'hackathons' ? { id: EVENT, type: 'native', organizer_id: owner } : [];
        return { select() { return this; }, eq() { return this; }, order() { return this; },
          async single() { return { data, error: null }; },
          then(resolve, reject) { return Promise.resolve({ data, error: null }).then(resolve, reject); } };
      },
    } },
    '@/context/NotificationContext': { useNotification: () => ({ showToast() {} }) },
    '@/components/system': new Proxy({}, { get: () => () => null }),
  });
  const Page = loader.load('src/app/hackathons/[id]/organizer/page.tsx').default;
  const tree = Page();
  assert(tree); assert.equal(child, 'AUTHORIZED_CHILD');
  // Initial render is still wrapped in the existing AuthGuard, not replaced by metadata.
  assert.equal(tree.type, AuthGuard);
  effects.forEach(effect => effect());
  for (let n = 0; n < 8; n++) await new Promise(resolve => setImmediate(resolve));
  return { reads, redirects, rpcs };
}

for (const [label, extra, error] of [
  ['approved public', { status: 'approved', archived: false }],
  ['unpublished', { status: 'pending', archived: false }],
  ['archived', { status: 'approved', archived: true }],
  ['failed public read', null, { message: 'fixture denied' }],
]) test(`native organizer access remains independent of ${label} metadata`, async () => {
  const publicRead = publicLayout(extra && { id: EVENT, name: 'EVENT_SENTINEL', description: 'DESCRIPTION_SENTINEL', organizer_email: 'PRIVATE_CONTACT', ...extra }, error);
  const meta = await publicRead.layout.generateMetadata({ params: Promise.resolve({ id: EVENT }) });
  assert(!JSON.stringify(meta).includes('PRIVATE_CONTACT'));
  assert(publicRead.reads.every(columns => !/organizer|profiles|email|ai_feedback/.test(columns)));
  if (label !== 'approved public') {
    assert.equal(meta.robots.index, false); assert.equal(meta.openGraph, null); assert.equal(meta.twitter, null);
    assert(!JSON.stringify(meta).includes('EVENT_SENTINEL')); assert(!JSON.stringify(meta).includes('DESCRIPTION_SENTINEL'));
  }
  const server = serverHarness({ event: { type: 'native', organizer_id: USER, ...extra }, partner: { features: {} } });
  const nested = await server.load('src/app/hackathons/[id]/organizer/layout.tsx').default({ params: Promise.resolve({ id: EVENT }), children: 'AUTHORIZED_CHILD' });
  const child = publicRead.layout.default({ children: nested });
  assert.equal(child, 'AUTHORIZED_CHILD');
  const page = await nativePortal(child);
  assert.equal(page.redirects.length, 0); assert(page.reads.includes('hackathon_registrations')); assert(page.reads.includes('hackathon_announcements'));
  assert.equal(page.rpcs[0][0], 'can_access_partner_event'); assert.equal(page.rpcs[0][1].p_hackathon_id, EVENT);
});
for (const [label, options] of [
  ['signed out', { user: null }], ['revoked access', { access: false }], ['wrong native owner', { owner: 'other-owner' }],
]) test(`failed public metadata never grants organizer access to ${label}`, async () => {
  const { layout } = publicLayout(null, { message: 'public read denied' });
  assert.equal((await layout.generateMetadata({ params: Promise.resolve({ id: EVENT }) })).robots.index, false);
  const page = await nativePortal(layout.default({ children: 'AUTHORIZED_CHILD' }), options);
  assert.equal(page.redirects.length, 1); assert(!page.reads.includes('hackathon_registrations')); assert(!page.reads.includes('hackathon_announcements'));
  if (options.user === null) { assert.equal(page.reads.length, 0); assert.equal(page.rpcs.length, 0); }
});
test('failed public metadata does not swallow an existing authorized organizer redirect', async () => {
  const { layout } = publicLayout(null, { message: 'public read denied' });
  await layout.generateMetadata({ params: Promise.resolve({ id: EVENT }) });
  const server = serverHarness();
  await assert.rejects(server.load('src/app/hackathons/[id]/organizer/layout.tsx').default({ params: Promise.resolve({ id: EVENT }), children: 'AUTHORIZED_CHILD' }), /NEXT_REDIRECT:\/partners\/fixture-event\/organizer/);
});
