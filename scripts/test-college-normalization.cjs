/* eslint-disable @typescript-eslint/no-require-imports -- Offline college normalization regression tests. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://offline.example/settings' });
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { PostgrestClient } = require('@supabase/postgrest-js');
const { harness } = require('./ppt-vision-harness.cjs');

const { COLLEGES, normalizeCollege, collegeMatchesSearch, collegeMatchValues } = harness().load('src/lib/colleges.ts');
const MATHURA = 'GL Bajaj Group of Institutions, Mathura';
const NOIDA = 'GL Bajaj Institute of Technology & Management, Greater Noida';
const TCET = 'TCET Mumbai (Thakur College of Engineering and Technology)';
const USER = '00000000-0000-0000-0000-000000000001';
const list = values => Array.from(values);
const plain = value => JSON.parse(JSON.stringify(value));
const collapse = value => value.replace(/\s+/g, ' ').trim();

// Spellings approved for Mathura in the Phase A brief (also the reviewed dashboard list).
const APPROVED_MATHURA = [
  'GL Bajaj Group Of Institutions Mathura',
  'GL Bajaj Group Of Institutions, Mathura',
  'G.L. Bajaj Group Of Institutions, Mathura',
  'G.L.bajaj group of institutions mathura',
  'GL Bajaj group of institution mathura',
  'G.l bajaj mathura',
  'Gl bajaj mathura',
];
const MATHURA_FORMAT_VARIANTS = [
  '  gl   BAJAJ   mathura ', 'G. L. Bajaj Mathura', 'GL BAJAJ GROUP OF INSTITUTIONS, MATHURA',
  'g.l. bajaj group of institutions , mathura', 'GL-Bajaj Mathura', 'gl bajaj group of institution, mathura.',
];
const NOIDA_VARIANTS = [
  NOIDA, NOIDA.toLowerCase(), 'GL Bajaj Institute of Technology and Management, Greater Noida',
  'G.L. Bajaj Institute of Technology & Management Greater Noida', '  gl bajaj institute of technology  and management,  greater noida ',
];
const UNCHANGED = [
  'GL Bajaj', 'G.L. Bajaj', 'GL Bajaj Group of Institutions', 'Gl bajaj group of institution',
  'GL Bajaj Institute of Technology and Management', 'GL Bajaj Institute of Technology & Management',
  'GLBITM', 'GLBITM Greater Noida', 'GL Bajaj Greater Noida', 'GLA University Mathura',
  'Bajaj Institute of Technology Wardha', 'Jamnalal Bajaj Institute of Management Studies',
  'GL Bajaj Mathura Greater Noida', 'GL Bajaj Group of Institutions, Mathura & Greater Noida',
  'Institute of Technology and Management, Greater Noida', 'Mathura', 'Unknown Institute of Fixtures',
  '  GL   Bajaj  ',
];

test('both GL Bajaj canonical colleges exist once each as separate dropdown entries and Other stays last', () => {
  assert.equal(COLLEGES.filter(c => c === MATHURA).length, 1);
  assert.equal(COLLEGES.filter(c => c === NOIDA).length, 1);
  assert.notEqual(MATHURA, NOIDA);
  assert.equal(COLLEGES.at(-1), 'Other');
  assert.equal(new Set(COLLEGES).size, COLLEGES.length);
});

for (const alias of APPROVED_MATHURA) test(`approved Mathura alias normalizes: ${alias}`, () => {
  assert.equal(normalizeCollege(alias), MATHURA);
});
for (const alias of MATHURA_FORMAT_VARIANTS) test(`Mathura casing/punctuation/whitespace variant normalizes: ${JSON.stringify(alias)}`, () => {
  assert.equal(normalizeCollege(alias), MATHURA);
});
for (const alias of NOIDA_VARIANTS) test(`Greater Noida explicit name normalizes to its own canonical: ${JSON.stringify(alias)}`, () => {
  assert.equal(normalizeCollege(alias), NOIDA);
});

test('canonical names are idempotent and campuses never cross', () => {
  assert.equal(normalizeCollege(MATHURA), MATHURA);
  assert.equal(normalizeCollege(NOIDA), NOIDA);
  for (const alias of [...APPROVED_MATHURA, ...MATHURA_FORMAT_VARIANTS]) assert.notEqual(normalizeCollege(alias), NOIDA);
  for (const alias of NOIDA_VARIANTS) assert.notEqual(normalizeCollege(alias), MATHURA);
});

for (const value of UNCHANGED) test(`ambiguous or unrelated value is preserved: ${JSON.stringify(value)}`, () => {
  const result = normalizeCollege(value);
  assert.equal(result, collapse(value));
  assert.notEqual(result, MATHURA);
  assert.notEqual(result, NOIDA);
});

test('existing canonical and alias mappings behave exactly as before', () => {
  const expected = {
    tcet: TCET, TCET, 'Thakur College of Engineering & Technology': TCET, 'thakur college of engineering': TCET,
    DJSCE: 'DJSCE Mumbai (Dwarkadas J. Sanghvi College of Engineering)',
    'dwarkadas j. sanghvi college of engineering': 'DJSCE Mumbai (Dwarkadas J. Sanghvi College of Engineering)',
    VJTI: 'VJTI Mumbai (Veermata Jijabai Technological Institute)',
    'vjti mumbai (veermata jijabai technological institute)': 'VJTI Mumbai (Veermata Jijabai Technological Institute)',
    spit: 'SPIT Mumbai (Sardar Patel Institute of Technology)',
    TSEC: 'TSEC Mumbai (Thadomal Shahani Engineering College)',
    vesit: "VESIT Mumbai (Vivekanand Education Society's Institute of Technology)",
    "Vivekanand Education Society's Institute of Technology": "VESIT Mumbai (Vivekanand Education Society's Institute of Technology)",
    KJSIT: 'KJSIT Mumbai (K. J. Somaiya Institute of Technology)',
    'kj somaiya institute of technology': 'KJSIT Mumbai (K. J. Somaiya Institute of Technology)',
    COEP: 'COEP Technological University, Pune', iitb: 'IIT Bombay', 'IIT Bombay': 'IIT Bombay', DTU: 'DTU Delhi',
    Other: 'Other', '  tcet  ': TCET,
  };
  for (const [input, output] of Object.entries(expected)) assert.equal(normalizeCollege(input), output, input);
  // The new punctuation-insensitive key is limited to GL Bajaj; these stayed unmapped before.
  for (const input of ['T.C.E.T.', 'D.J.S.C.E', 'VJTI, Mumbai', 'K.J. Somaiya Institute of Technology', 'Thakur College of Engineering and Technology, Mumbai', 'Offline Campus']) {
    assert.equal(normalizeCollege(input), input, input);
  }
  assert.equal(normalizeCollege(''), '');
  assert.equal(normalizeCollege(null), '');
  assert.equal(normalizeCollege(undefined), '');
});

// COLLEGES comes from the harness VM realm, so .filter() returns a VM-realm array; copy it locally for deepStrictEqual.
const search = query => list(COLLEGES.filter(c => c !== 'Other' && collegeMatchesSearch(c, query)));
test('dropdown search finds Mathura from "g.l bajaj mathura" without Greater Noida', () => {
  assert.deepEqual(search('g.l bajaj mathura'), [MATHURA]);
  assert.deepEqual(search('Gl bajaj mathura'), [MATHURA]);
  assert.deepEqual(search('mathura'), [MATHURA]);
});
test('dropdown search shows both GL Bajaj campuses as separate options for a campus-less query', () => {
  for (const query of ['GL Bajaj', 'g l bajaj', 'G.L. BAJAJ   ', 'glbajaj', 'g.l b']) assert.deepEqual(search(query), [MATHURA, NOIDA], query);
});
test('dropdown search tolerates "&" versus "and" for Greater Noida', () => {
  assert.deepEqual(search('greater noida'), [NOIDA]);
  assert.deepEqual(search('technology and management'), [NOIDA]);
  assert.deepEqual(search('G.L. Bajaj Institute of Technology & Management'), [NOIDA]);
});
test('dropdown search keeps every previous substring match and unknown text still finds nothing', () => {
  for (const query of ['', 'iit', 'Mumbai', 'k. j.', '(', 'SPIT', 'pune', 'NIT', "society's", 'Other', 'zz-unknown']) {
    for (const college of COLLEGES) {
      if (college.toLowerCase().includes(query.toLowerCase())) assert(collegeMatchesSearch(college, query), `${query} -> ${college}`);
    }
  }
  assert.deepEqual(search('zz unknown fixture college'), []);
  assert(search('vjti').includes('VJTI Mumbai (Veermata Jijabai Technological Institute)'));
  assert(COLLEGES.filter(c => collegeMatchesSearch(c, '')).includes('Other'));
});

test('collegeMatchValues keeps a single exact value for every college outside the reviewed campus set', () => {
  assert.deepEqual(list(collegeMatchValues('tcet')), [TCET]);
  assert.deepEqual(list(collegeMatchValues('Offline Campus')), ['Offline Campus']);
  assert.deepEqual(list(collegeMatchValues('  Offline   Campus ')), ['Offline Campus']);
  for (const value of UNCHANGED) assert.deepEqual(list(collegeMatchValues(value)), [collapse(value)], value);
  assert.deepEqual(list(collegeMatchValues('')), []);
  assert.deepEqual(list(collegeMatchValues(null)), []);
});
test('collegeMatchValues for Mathura covers canonical, reviewed spellings and the user spelling only', () => {
  for (const input of [MATHURA, ...APPROVED_MATHURA, 'GL BAJAJ MATHURA', '  Gl  bajaj mathura ']) {
    const values = list(collegeMatchValues(input));
    assert.equal(values[0], MATHURA);
    for (const spelling of APPROVED_MATHURA) assert(values.includes(spelling), spelling);
    assert(values.includes(collapse(input)), input);
    assert(!values.includes(NOIDA));
    for (const ambiguous of UNCHANGED) assert(!values.includes(collapse(ambiguous)), ambiguous);
    for (const value of values) assert.equal(normalizeCollege(value), MATHURA, value);
  }
});
test('collegeMatchValues for Greater Noida never includes Mathura values', () => {
  assert.deepEqual(list(collegeMatchValues(NOIDA)), [NOIDA]);
  const own = 'GL Bajaj Institute of Technology and Management, Greater Noida';
  assert.deepEqual(list(collegeMatchValues(own)), [NOIDA, own]);
  const mathura = new Set(collegeMatchValues(MATHURA));
  for (const value of collegeMatchValues(own)) assert(!mathura.has(value), value);
});
test('collegeMatchValues skips a stored spelling that PostgREST list quoting cannot carry', () => {
  assert(!list(collegeMatchValues('"GL Bajaj Mathura"')).some(value => value.includes('"')));
  assert.equal(list(collegeMatchValues('"GL Bajaj Mathura"'))[0], MATHURA);
});

// Dashboard same-campus query, serialized by the real PostgREST client with an offline fetch.
const dashboard = harness({
  '@/lib/supabase': { supabase: {}, subscribeWithRetry: () => () => {} },
  '@/lib/matchingClient': { loadTeammateRecommendations: async () => ({ data: [], error: null }) },
  'next/navigation': { useRouter: () => ({ push() {} }) },
  '@/context/NotificationContext': { useNotification: () => ({ showToast() {} }) },
  '@/lib/posthog': { trackEvent() {} },
}, { window: dom.window }).load('src/app/dashboard/useDashboardData.ts');
const SELECT = 'id, full_name, avatar_url, college, bio, skills, github_url, linkedin_url, year_of_study, is_available';
async function campusRequest(college) {
  const requests = [];
  const client = new PostgrestClient('https://offline.invalid/rest/v1', {
    fetch: async (url, init) => {
      requests.push({ url: new URL(String(url)), init });
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json', 'content-range': '0-0/0' } });
    },
  });
  const result = await dashboard.fetchCampusBuilders(client, USER, collegeMatchValues(college));
  return { requests, result };
}
function parseInList(filter) {
  assert.match(filter, /^in\.\(.*\)$/);
  const values = [];
  let current = '', quoted = false;
  for (const ch of filter.slice(4, -1)) {
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === ',' && !quoted) { values.push(current); current = ''; continue; }
    current += ch;
  }
  values.push(current);
  return values;
}
const peersFor = (filter, rows) => rows.filter(row => filter.startsWith('eq.') ? row.college === filter.slice(3) : parseInList(filter).includes(row.college)).map(row => row.id);
function assertUnchangedQueryShape(request) {
  const params = request.url.searchParams;
  assert.equal(request.url.pathname, '/rest/v1/profiles');
  assert.equal(request.init.method, 'GET');
  assert.equal(params.get('select'), SELECT.replace(/\s/g, ''));
  assert.equal(params.get('id'), `neq.${USER}`);
  assert.equal(params.get('is_banned'), 'eq.false');
  assert.equal(params.get('onboarding_completed'), 'eq.true');
  assert.equal(params.get('order'), 'last_active_date.desc');
  assert.equal(params.get('limit'), '6');
  assert.match(new Headers(request.init.headers).get('prefer') || '', /count=exact/);
}

test('dashboard keeps the original exact .eq query for existing colleges', async () => {
  for (const [stored, value] of [['tcet', TCET], ['Offline Campus', 'Offline Campus'], ['GL Bajaj', 'GL Bajaj'], ['GL Bajaj Group of Institutions', 'GL Bajaj Group of Institutions']]) {
    const { requests } = await campusRequest(stored);
    assert.equal(requests.length, 1);
    assertUnchangedQueryShape(requests[0]);
    assert.deepEqual(requests[0].url.searchParams.getAll('college'), [`eq.${value}`], stored);
  }
});
test('dashboard skips the campus query when no college is set', async () => {
  const { requests, result } = await campusRequest(null);
  assert.equal(requests.length, 0);
  assert.deepEqual(plain(result), { data: [], count: 0, error: null });
});
test('dashboard .in serialization quotes the comma in the canonical Mathura name and round-trips every value', async () => {
  const { requests } = await campusRequest('Gl bajaj mathura');
  assert.equal(requests.length, 1);
  assertUnchangedQueryShape(requests[0]);
  const [filter] = requests[0].url.searchParams.getAll('college');
  assert(filter.includes(`"${MATHURA}"`), filter);
  assert(filter.includes('"G.L. Bajaj Group Of Institutions, Mathura"'), filter);
  assert.deepEqual(parseInList(filter), list(collegeMatchValues('Gl bajaj mathura')));
});

const PEERS = [
  { id: 'legacy-same', college: 'Gl bajaj mathura' },
  { id: 'legacy-other-spelling', college: 'G.L. Bajaj Group Of Institutions, Mathura' },
  { id: 'canonical-mathura', college: MATHURA },
  { id: 'canonical-noida', college: NOIDA },
  { id: 'ambiguous-gl', college: 'GL Bajaj' },
  { id: 'ambiguous-group', college: 'GL Bajaj Group of Institutions' },
  { id: 'gla', college: 'GLA University Mathura' },
];
test('legacy-spelling Mathura peers stay visible and other campuses stay excluded', async () => {
  for (const stored of APPROVED_MATHURA) {
    const { requests } = await campusRequest(stored);
    const after = peersFor(requests[0].url.searchParams.get('college'), PEERS);
    // The previous query was .eq on the collapsed stored spelling.
    const before = PEERS.filter(row => row.college === collapse(stored)).map(row => row.id);
    for (const id of before) assert(after.includes(id), `${stored} lost ${id}`);
    assert.deepEqual(after, ['legacy-same', 'legacy-other-spelling', 'canonical-mathura'], stored);
  }
  const fresh = await campusRequest(MATHURA);
  assert.deepEqual(peersFor(fresh.requests[0].url.searchParams.get('college'), PEERS), ['legacy-same', 'legacy-other-spelling', 'canonical-mathura']);
});
test('Greater Noida and ambiguous users never see Mathura peers', async () => {
  const noida = await campusRequest(NOIDA);
  assert.deepEqual(peersFor(noida.requests[0].url.searchParams.get('college'), PEERS), ['canonical-noida']);
  const ambiguous = await campusRequest('GL Bajaj');
  assert.deepEqual(peersFor(ambiguous.requests[0].url.searchParams.get('college'), PEERS), ['ambiguous-gl']);
});

// Settings profile save payload, rendered offline with mocked data and components.
const pick = ({ id, type, value, onChange, onFocus, onClick, disabled, readOnly, required, placeholder, role, href, 'aria-label': ariaLabel }) =>
  ({ id, type, value, onChange, onFocus, onClick, disabled, readOnly, required, placeholder, role, href, 'aria-label': ariaLabel });
const element = tag => ({ children, ...props }) => React.createElement(tag, pick(props), children);
const systemCache = new Map();
const system = new Proxy({}, { get: (_, name) => {
  if (!systemCache.has(name)) {
    const tag = { Input: 'input', Textarea: 'textarea', Select: 'select', Button: 'button', ButtonLink: 'a' }[name] || 'div';
    systemCache.set(name, tag === 'input' ? props => React.createElement('input', pick(props)) : element(tag));
  }
  return systemCache.get(name);
} });
const settle = () => new Promise(resolve => setImmediate(resolve));

async function settings(t, storedCollege) {
  const writes = [], toasts = [];
  const profile = {
    id: USER, full_name: 'Fixture Builder', college: storedCollege, year_of_study: '3rd Year', bio: 'Offline bio', avatar_url: null,
    skills: ['React'], github_url: null, linkedin_url: null, gender: null, is_available: true, show_track_record: true,
    has_participated_hackathon: false, hackathon_participations: 0, has_won_hackathon: false, hackathon_wins: 0,
  };
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: USER, email: 'fixture@example.invalid', created_at: '2026-01-01T00:00:00Z' } }, error: null }) },
    from(table) {
      const q = { mode: 'read' };
      const chain = {
        select() { return chain; }, eq() { return chain; }, order() { return chain; }, in() { return chain; },
        single() { q.single = true; return chain; },
        update(payload) { q.mode = 'update'; q.payload = payload; return chain; },
        then(resolve, reject) {
          let result = { data: [], error: null };
          if (q.mode === 'update') { assert.equal(table, 'profiles'); writes.push(plain(q.payload)); result = { error: null }; }
          else if (table === 'profiles' && q.single) result = { data: profile, error: null };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return chain;
    },
  };
  const Page = harness({
    'next/navigation': { useRouter: () => ({ push() {} }), useSearchParams: () => new URLSearchParams() },
    'motion/react': { motion: new Proxy({}, { get: () => () => null }) },
    '@/lib/supabase': { supabase },
    '@/context/NotificationContext': { useNotification: () => ({ showToast: (message, type) => toasts.push({ message, type }), confirm() {} }) },
    '@/components/AuthGuard': ({ children }) => children,
    '@/components/settings/DeleteAccountSection': () => null,
    '@/components/shell/ShellContext': { useShell: () => null },
    '@/components/system': system,
  }, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, navigator: dom.window.navigator }).load('src/app/settings/page.tsx').default;
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  t.after(async () => { await act(async () => root.unmount()); container.remove(); });
  await act(async () => { root.render(React.createElement(Page)); for (let i = 0; i < 4; i++) await settle(); });
  const submit = async () => act(async () => {
    container.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    for (let i = 0; i < 3; i++) await settle();
  });
  return { container, writes, toasts, submit };
}

for (const [stored, expected] of [
  ['G.L. Bajaj Group Of Institutions, Mathura', MATHURA], ['Gl bajaj mathura', MATHURA], [MATHURA, MATHURA],
  [NOIDA, NOIDA], ['GL Bajaj Group of Institutions', 'GL Bajaj Group of Institutions'], ['GL Bajaj', 'GL Bajaj'],
  ['GLA University Mathura', 'GLA University Mathura'], ['tcet', TCET], ['Offline Campus', 'Offline Campus'],
]) test(`settings save writes the normalized college for stored ${JSON.stringify(stored)}`, async t => {
  const view = await settings(t, stored);
  await view.submit();
  assert.equal(view.writes.length, 1);
  assert.equal(view.writes[0].college, expected);
  assert.equal(view.writes[0].year_of_study, '3rd Year');
  assert.deepEqual(view.writes[0].skills, ['React']);
  assert.equal(view.toasts.at(-1).type, 'success');
});

test('settings dropdown search finds Mathura, keeps Other, and saves the selected canonical value', async t => {
  const view = await settings(t, 'Offline Campus');
  const input = view.container.querySelector('#settings-college');
  await act(async () => { input.dispatchEvent(new dom.window.FocusEvent('focusin', { bubbles: true })); });
  const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  await act(async () => { setValue.call(input, 'g.l bajaj mathura'); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
  const options = [...view.container.querySelectorAll('#settings-college-list button')];
  assert.deepEqual(options.map(button => button.textContent), [MATHURA, 'Other (enter your college name)']);
  await act(async () => { options[0].click(); });
  await view.submit();
  assert.equal(view.writes.length, 1);
  assert.equal(view.writes[0].college, MATHURA);
});
