/* eslint-disable @typescript-eslint/no-require-imports -- Offline React submission tests. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://offline.example/onboarding' });
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { harness } = require('./ppt-vision-harness.cjs');
const USER = '00000000-0000-0000-0000-000000000001';
const success = () => ({ data: { id: USER }, error: null });
const missingYear = { code: 'PGRST204', message: "Could not find the 'year_of_study' column of 'profiles' in the schema cache" };
const failure = error => ({ data: null, error });
const plain = value => JSON.parse(JSON.stringify(value));
const wrapper = ({ children }) => React.createElement('div', null, children);

async function ui(t, { results = [success()], auth = { data: { user: { id: USER } }, error: null }, next = '' } = {}) {
  dom.window.history.replaceState(null, '', '/onboarding' + next);
  dom.window.localStorage.clear();
  dom.window.localStorage.setItem('hm_referrer_source', 'offline-invite');
  const writes = [], toasts = [], analytics = [], identities = [], navigation = [];
  let authCalls = 0;
  const supabase = {
    auth: { async getUser() {
      // Mount loads the existing partial profile; submission may fail independently.
      if (++authCalls === 1) return { data: { user: { id: USER } }, error: null };
      if (auth instanceof Error) throw auth;
      return auth;
    } },
    from(table) {
      assert.equal(table, 'profiles');
      return {
        select() { return { eq() { return { async single() { return { data: {
          college: 'Offline Campus', skills: ['React', 'Python'], bio: ' My retained bio ',
          github_url: 'https://github.com/offline-fixture', linkedin_url: 'https://example.test/fixture',
          has_participated_hackathon: true, hackathon_participations: 3, has_won_hackathon: true, hackathon_wins: 1,
        }, error: null }; } }; } }; },
        update(fields) {
          writes.push(plain(fields));
          return { eq(column, id) {
            assert.equal(column, 'id'); assert.equal(id, USER);
            return { select(columns) {
              assert.equal(columns, 'id');
              return { async maybeSingle() {
                assert(results.length, 'Unexpected retry');
                const result = results.shift();
                if (result instanceof Error) throw result;
                return result;
              } };
            } };
          } };
        },
      };
    },
  };
  const Page = harness({
    'next/navigation': { useRouter: () => ({ push: path => navigation.push(path) }) },
    '@/lib/supabase': { supabase },
    '@/context/NotificationContext': { useNotification: () => ({ showToast: (message, type) => toasts.push({ message, type }) }) },
    '@/lib/posthog': { trackEvent: (name, properties) => analytics.push({ name, properties: plain(properties) }), identifyUser: (id, properties) => identities.push({ id, properties: plain(properties) }) },
    '@/components/system': {
      Input: props => React.createElement('input', props),
      Button: props => React.createElement('button', { type: props.type, className: props.className, disabled: props.loading }, props.children),
      FilterChip: ({ active, children, ...props }) => React.createElement('button', { ...props, type: 'button', 'aria-pressed': active }, children),
      Skeleton: () => null,
    },
    '@/components/onboarding/OnboardingFrame': { OnboardingFrame: wrapper, FormStep: wrapper, OnboardingLabel: ({ children, ...props }) => React.createElement('label', props, children) },
    '@/components/onboarding/ProfilePreview': { ProfilePreview: () => null },
  }, { window: dom.window, localStorage: dom.window.localStorage, URLSearchParams }).load('src/app/onboarding/page.tsx').default;
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  t.after(async () => { await act(async () => root.unmount()); container.remove(); });
  await act(async () => root.render(React.createElement(Page)));
  const submit = async () => {
    await act(async () => {
      container.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
      await new Promise(resolve => setImmediate(resolve));
    });
  };
  const retained = () => {
    assert.equal(container.querySelector('[aria-label="Your college name"]').value, 'Offline Campus');
    assert.equal(container.querySelector('#onb-bio').value, ' My retained bio ');
    assert.match(container.querySelector('#onb-year-value').textContent, /2nd Year/);
    assert.equal(container.querySelectorAll('[aria-pressed="true"]').length, 2);
    assert.equal(container.querySelector('button[type="submit"]').disabled, false);
  };
  const failed = () => {
    retained(); assert.equal(toasts.at(-1).type, 'error');
    assert.match(toasts.at(-1).message, /entries are still here/i);
    assert.deepEqual(navigation, []); assert.deepEqual(identities, []);
    assert.equal(analytics.filter(event => event.name === 'onboarding_completed').length, 0);
    assert.equal(toasts.filter(toast => toast.type === 'success').length, 0);
    assert.equal(dom.window.localStorage.getItem(`year_confirmed_${USER}`), null);
  };
  return { submit, writes, toasts, analytics, identities, navigation, retained, failed };
}

test('normal save preserves all fields and existing completion analytics and next navigation', async t => {
  const app = await ui(t, { next: '?next=%2Fteams%2Foffline' }); await app.submit();
  const saved = app.writes[0];
  assert.equal(app.writes.length, 1);
  assert.deepEqual({ ...saved, updated_at: undefined }, {
    college: 'Offline Campus', year_of_study: '2nd Year', skills: ['React', 'Python'], bio: 'My retained bio',
    github_url: 'https://github.com/offline-fixture', linkedin_url: 'https://example.test/fixture',
    onboarding_completed: true, updated_at: undefined,
    has_participated_hackathon: true, hackathon_participations: 3, has_won_hackathon: true, hackathon_wins: 1,
    referrer_source: 'offline-invite',
  });
  assert(Number.isFinite(Date.parse(saved.updated_at)));
  assert.deepEqual(app.navigation, ['/teams/offline']);
  assert.deepEqual(app.identities, [{ id: USER, properties: { onboarding_completed: true } }]);
  assert.deepEqual(app.analytics.map(event => event.name), ['onboarding_started', 'onboarding_completed']);
  assert.deepEqual(app.analytics[1].properties, { college: 'Offline Campus', is_custom_college: true, skills_count: 2 });
  assert.equal(app.toasts.at(-1).type, 'success');
  assert.equal(dom.window.localStorage.getItem(`year_confirmed_${USER}`), 'true');
});

for (const error of [missingYear,
  { code: '42703', message: 'column "year_of_study" of relation "profiles" does not exist' },
  { code: '42703', message: 'column profiles.year_of_study does not exist' },
  { code: '42703', message: 'column "year_of_study" does not exist' },
]) test(`missing year compatibility fallback: ${error.code} ${error.message}`, async t => {
  const app = await ui(t, { results: [failure(error), success()] }); await app.submit();
  assert.equal(app.writes.length, 2);
  const { year_of_study, ...rest } = app.writes[0]; assert.equal(year_of_study, '2nd Year');
  assert.deepEqual(app.writes[1], rest); app.retained();
  assert.deepEqual(app.navigation, ['/dashboard']); assert.equal(app.toasts.at(-1).type, 'success');
});

for (const error of [
  { code: '42501', message: 'Permission denied for year_of_study' },
  { code: '23514', message: 'year_of_study violates check constraint' },
  { code: '23505', message: 'Duplicate value' },
  { code: 'PGRST204', message: "Could not find the 'bio' column of 'profiles' in the schema cache" },
  { code: 'PGRST204', message: "Could not find the 'year_of_study' column of 'teams' in the schema cache" },
  { code: '42703', message: 'column "other_year_of_study" does not exist' },
  { code: '42703', message: 'column "year_of_study" of relation "teams" does not exist' },
  { code: '', message: missingYear.message },
  { code: '503', message: 'Database unavailable' },
]) test(`actual failure never retries without year: ${error.code} ${error.message}`, async t => {
  const app = await ui(t, { results: [failure(error)] }); await app.submit();
  assert.equal(app.writes.length, 1); app.failed();
});

for (const result of [failure({ code: '42501', message: 'Denied fallback' }), { data: null, error: null }, new Error('Offline')]) {
  test(`fallback failure retains entries and never reports completion: ${result instanceof Error ? 'exception' : result.error ? 'database error' : 'no row'}`, async t => {
    const app = await ui(t, { results: [failure(missingYear), result] }); await app.submit();
    assert.equal(app.writes.length, 2); app.failed();
  });
}
for (const result of [{ data: null, error: null }, { data: { id: 'different-user' }, error: null }, new Error('Offline')]) {
  test(`save failure without a database error: ${result instanceof Error ? 'exception' : result.data ? 'wrong row' : 'no row'}`, async t => {
    const app = await ui(t, { results: [result] }); await app.submit();
    assert.equal(app.writes.length, 1); app.failed();
  });
}
for (const auth of [{ data: { user: null }, error: null }, { data: { user: { id: USER } }, error: { message: 'Expired' } }, new Error('Auth unavailable')]) {
  test(`session failure preserves form: ${auth instanceof Error ? 'exception' : auth.error ? 'error' : 'signed out'}`, async t => {
    const app = await ui(t, { auth }); await app.submit(); assert.equal(app.writes.length, 0); app.failed();
  });
}
test('retry after failure resubmits every retained field, including year', async t => {
  const app = await ui(t, { results: [failure({ code: '42501', message: 'Denied' }), success()] });
  await app.submit(); app.failed(); await app.submit();
  assert.equal(app.writes.length, 2);
  assert.deepEqual({ ...app.writes[0], updated_at: undefined }, { ...app.writes[1], updated_at: undefined });
  assert.equal(app.toasts.at(-1).type, 'success'); assert.deepEqual(app.navigation, ['/dashboard']);
});
test('external next destination retains existing dashboard fallback', async t => {
  const app = await ui(t, { next: '?next=%2F%2Fevil.example' }); await app.submit();
  assert.deepEqual(app.navigation, ['/dashboard']);
});

for (const next of ['@evil.invalid', '/\\evil.invalid', '/%252f%252fevil.invalid', '/%256cogin', '/onboarding?next=/invites', '/?next=@evil.invalid', '/api/protected-action']) {
  test(`onboarding completion rejects unsafe return destination ${next}`, async t => {
    const app = await ui(t, { next: '?next=' + encodeURIComponent(next) });
    assert.equal(app.writes.length, 0, 'Navigation input must not submit the form');
    await app.submit();
    assert.equal(app.writes.length, 1);
    assert.deepEqual(app.navigation, ['/dashboard']);
  });
}
for (const next of ['/hackathons?tab=past&q=water+energy#results', '/hackathons/event-1?tab=builders#teams', '/invites?college=Offline%20Campus#pending', '/teams/create?invite=fixture-inviter&college=Offline%20Campus', '/teams/team-1?filter=a%26b%3Dc#join']) {
  test(`onboarding preserves the encoded destination without replaying an action: ${next}`, async t => {
    const app = await ui(t, { next: '?next=' + encodeURIComponent(next) });
    assert.deepEqual(app.navigation, []); assert.equal(app.writes.length, 0);
    await app.submit();
    assert.deepEqual(app.navigation, [next]);
    assert.equal(app.writes.length, 1, 'Only the explicit onboarding submission writes');
  });
}
