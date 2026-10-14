/* eslint-disable @typescript-eslint/no-require-imports -- Offline discovery regressions. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { harness } = require('./ppt-vision-harness.cjs');
const api = harness({}, { URLSearchParams }).load('src/lib/hackathons/discovery.ts');
const NOW = Date.parse('2026-10-14T12:00:00Z');
const event = (id, fields = {}) => ({ id, name: `Event ${id}`, description: 'Build useful tools', tags: ['Coding', 'Hackathon'],
  start_date: '2026-10-20', end_date: '2026-10-22', registration_end: null, created_at: '2026-10-01T00:00:00Z',
  location: 'Venue in India', mode: 'Online', prize_pool: 'Certificate & Perks', currency: null, website_url: 'https://unstop.com/event',
  type: 'external', organizer_id: null, college: null, ...fields });
const settings = query => api.readDiscoverySettings(new URLSearchParams(query));
const results = (events, query = '', skills = [], saved = new Set()) => api.discoverEvents(events, settings(query), skills, saved, NOW).map(h => h.id);
const plain = value => JSON.parse(JSON.stringify(value));

for (const [fields, expected] of [
  [{ start_date: '2026-10-15', end_date: '2026-10-17' }, 'upcoming'],
  [{ start_date: '2026-10-14', end_date: '2026-10-14' }, 'ongoing'],
  [{ start_date: '2026-10-12', end_date: '2026-10-13' }, 'ended'],
  [{ start_date: null, end_date: null }, 'unknown'],
  [{ start_date: '2026-10-12', end_date: null }, 'unknown'],
  [{ start_date: null, end_date: '2026-10-15' }, 'unknown'],
  [{ start_date: null, end_date: '2026-10-13' }, 'ended'],
  [{ start_date: 'invalid', end_date: '2026-10-13' }, 'unknown'],
  [{ start_date: '2026-10-17', end_date: '2026-10-15' }, 'unknown'],
]) test(`classification ${JSON.stringify(fields)}: ${expected}`, () => assert.equal(api.eventState(event('date', fields), NOW), expected));
test('timestamp start is inclusive and end exclusive; calendar end covers its whole Indian day', () => {
  const h = event('boundary', { start_date: '2026-10-14T12:00:00Z', end_date: '2026-10-14T13:00:00Z' });
  assert.equal(api.eventState(h, NOW - 1), 'upcoming'); assert.equal(api.eventState(h, NOW), 'ongoing');
  assert.equal(api.eventState(h, Date.parse(h.end_date) - 1), 'ongoing'); assert.equal(api.eventState(h, Date.parse(h.end_date)), 'ended');
  const day = event('day', { start_date: '2026-10-14', end_date: '2026-10-14' });
  assert.equal(api.eventState(day, Date.parse('2026-10-14T18:29:59Z')), 'ongoing');
  assert.equal(api.eventState(day, Date.parse('2026-10-14T18:30:00Z')), 'ended');
});
for (const date of ['2026-02-30', '2026-13-01', '2026-10-14T24:00:00Z', 'tomorrow', '2026-10-14T12:00:00']) test(`invalid/ambiguous date is not guessed: ${date}`, () => assert.equal(api.eventDate(date), null));
test('generic tags provide no domain or skill evidence; meaningful tags are unique and trimmed', () => {
  const h = event('tags', { tags: [' Coding ', 'Hackathon', 'Unstop', 'Devfolio', 'Hack2skill', 'AI/ML', ' ai/ml ', 'React'] });
  assert.deepEqual(plain(api.eventTopics(h)), ['AI/ML', 'React']);
  assert.deepEqual(plain(api.skillEvidence(h, ['coding', ' REACT ', 'react'])), ['React']);
});
test('For you includes events with missing tags, no overlapping skills and empty profiles', () => {
  const records = [event('generic'), event('missing', { tags: null }), event('different', { tags: ['Web3'] }),
    event('ended', { end_date: '2026-10-13', start_date: '2026-10-12' }), event('unclear', { start_date: null, end_date: null })];
  assert.deepEqual(results(records), ['different', 'generic', 'missing', 'unclear']);
  assert.deepEqual(results(records, '', ['Python']), results(records));
  assert.match(api.discoveryReason(records[0], [], NOW), /specific topic tags not listed/);
});
test('relevance prioritizes actual listed skill evidence, demotes known passed deadlines and keeps all candidates', () => {
  const records = [event('generic'), event('matched', { tags: ['Python'] }), event('closed', { tags: ['Python'], registration_end: '2026-10-13' })];
  assert.deepEqual(results(records, '', [' PYTHON ']), ['matched', 'generic', 'closed']);
  assert.match(api.discoveryReason(records[1], ['python'], NOW), /Tags match your listed skills: Python/);
});
test('Upcoming and Ongoing are disjoint; Past excludes unclear windows', () => {
  const records = [event('future'), event('active', { start_date: '2026-10-12' }), event('past', { start_date: '2026-10-10', end_date: '2026-10-13' }), event('unknown', { start_date: '2026-10-10', end_date: null })];
  assert.deepEqual(results(records, 'tab=upcoming'), ['future']); assert.deepEqual(results(records, 'tab=ongoing'), ['active']);
  assert.deepEqual(results(records, 'tab=past'), ['past']);
});
test('search matches title, plain descriptions, tags, college and known location using all trimmed tokens', () => {
  const h = event('search', { name: 'Climate Sprint', description: '<p>Build <b>water</b> &amp; energy tools</p>', tags: ['Sustainability'], college: 'Campus West', location: 'Pune' });
  for (const q of [' CLIMATE ', 'WATER ENERGY', 'sustainability', 'campus west', 'pune', 'pune water']) assert.deepEqual(results([h], `q=${encodeURIComponent(q)}`), ['search']);
  assert.deepEqual(results([h], 'q=missing'), []);
  assert.deepEqual(results([event('placeholder')], 'q=venue'), []);
});
test('platform hostnames and normalized hybrid/offline formats drive combined filters', () => {
  const h = event('valid', { mode: ' HYBRID ', tags: ['Web3'], website_url: 'https://apply.devfolio.co/event' });
  assert.deepEqual(results([h], 'mode=hybrid&platform=devfolio&topic=web3'), ['valid']);
  assert.deepEqual(results([h], 'mode=online'), []);
  assert.equal(api.eventFormat(' Offline '), 'in-person'); assert.equal(api.eventFormat('in-person'), 'in-person');
  assert.equal(api.eventPlatform(event('fake', { website_url: 'https://unstop.com.evil.example/event?site=devfolio.co' })), 'other');
  assert.equal(api.eventPlatform(event('native', { type: 'native' })), 'native');
});
test('date window, topic and participation constraints require actual recorded fields', () => {
  const records = [event('solo', { min_team_size: 1, max_team_size: 4, tags: ['React'] }), event('team', { min_team_size: 2, max_team_size: 4, tags: ['React'] }), event('missing')];
  assert.deepEqual(results(records, 'topic=react&from=2026-10-20&to=2026-10-20&participation=solo'), ['solo']);
  assert.deepEqual(results(records, 'participation=team'), ['solo', 'team']);
  assert.deepEqual(results(records, 'from=2026-10-21&to=2026-10-20'), []);
  assert.deepEqual(results([event('invalid-size', { min_team_size: 4, max_team_size: 2 })], 'participation=team'), []);
});
test('event start never substitutes for registration deadline; unknown deadlines remain available', () => {
  const records = [event('unknown', { start_date: '2026-10-12' }), event('open', { registration_end: '2026-10-14' }), event('closed', { registration_end: '2026-10-13' })];
  assert.deepEqual(results(records, 'registration=not-closed'), ['open', 'unknown']);
  assert.deepEqual(results(records, 'registration=recorded'), ['open', 'closed']);
});
for (const [text, currency, amount, unit] of [
  ['₹1,50,000', null, 150000, 'INR'], ['INR 2.5 lakh', null, 250000, 'INR'], ['Rs. 1.2 crore', 'INR', 12000000, 'INR'],
  ['$1,500.50', null, 1500.5, 'USD'], ['10K USD', 'usd', 10000, 'USD'], ['2 million', 'USD', 2000000, 'USD'],
  ['50,000', 'INR', 50000, 'INR'], ['<b>₹10,000</b>', null, 10000, 'INR'], ['₹0', 'INR', 0, 'INR'],
]) test(`supported monetary format: ${text}`, () => assert.deepEqual(plain(api.cashPrize(text, currency)), { amount, currency: unit }));
for (const [text, currency] of [
  ['Certificate & Perks', 'INR'], ['100 certificates', 'INR'], ['₹50,000 in credits', 'INR'], ['₹10,000 + perks', 'INR'],
  ['10,000–20,000', 'INR'], ['1000', null], ['$1000', 'INR'], ['€1000', 'EUR'], ['1,23', 'INR'], [null, 'INR'],
]) test(`unknown/noncash prize is not zero: ${text}`, () => assert.equal(api.cashPrize(text, currency), null));
test('cash sorting ranks currencies independently with unknown/noncash prizes following known values', () => {
  const records = [event('perks'), event('usd', { prize_pool: '$20K' }), event('inr-large', { prize_pool: '₹2 lakh' }), event('inr-small', { prize_pool: '₹50,000' }), event('unknown', { prize_pool: '1000' })];
  assert.deepEqual(results(records, 'sort=prize-inr').slice(0, 2), ['inr-large', 'inr-small']);
  assert.equal(results(records, 'sort=prize-usd')[0], 'usd');
  assert.match(api.prizeLabel(records[0]), /Certificate & Perks/); assert(!api.prizeLabel(records[0]).includes('₹0'));
  assert.match(api.prizeLabel(records[4]), /currency not specified/);
});
test('date/recent/relevance ties are deterministic and missing dates sort last without mutating input', () => {
  const records = [event('b'), event('missing', { start_date: null, end_date: null, created_at: null }), event('a'), event('new', { start_date: '2026-10-21', created_at: '2026-10-13T00:00:00Z' })];
  const snapshot = plain(records);
  for (const sort of ['date', 'recent', 'relevant', 'prize-inr']) assert.deepEqual(results(records, `sort=${sort}`), results([...records].reverse(), `sort=${sort}`));
  assert.deepEqual(results(records, 'sort=date'), ['a', 'b', 'new', 'missing']);
  assert.deepEqual(results(records, 'sort=recent'), ['new', 'a', 'b', 'missing']); assert.deepEqual(records, snapshot);
});
test('Saved retains ended and unknown events and still respects explicit filters', () => {
  const records = [event('past', { start_date: '2026-10-12', end_date: '2026-10-13' }), event('unclear', { start_date: null, end_date: null }), event('unsaved')];
  const saved = new Set(['past', 'unclear', 'not-visible']);
  assert.deepEqual(new Set(results(records, 'tab=saved', [], saved)), new Set(['past', 'unclear']));
  assert.deepEqual(results(records, 'tab=saved&q=past', [], saved), ['past']);
});
test('shareable settings validate enums, duplicate parameters, dates and preserve unrelated query context', () => {
  const invalid = settings('tab=bad&mode=bad&sort=bad&from=2026-02-30&q=one&q=two');
  assert.equal(invalid.tab, 'recommended'); assert.equal(invalid.mode, ''); assert.equal(invalid.from, ''); assert.equal(invalid.q, '');
  const first = new URLSearchParams(api.discoveryQuery(new URLSearchParams('source=partner'), { tab: 'ongoing', mode: 'hybrid', topic: 'Web3', q: ' climate ', sort: 'prize-usd' }));
  assert.equal(first.get('source'), 'partner'); assert.equal(settings(first.toString()).tab, 'ongoing'); assert.equal(settings(first.toString()).topic, 'web3');
  const reset = new URLSearchParams(api.discoveryQuery(first, { q: '', mode: '', topic: '', sort: 'date' }));
  assert.equal(settings(reset.toString()).tab, 'ongoing'); assert.equal(reset.get('source'), 'partner'); assert(!reset.has('sort'));
  assert.equal(settings('sort=prize').sort, 'prize-inr');
  assert.equal(settings(api.discoveryQuery(new URLSearchParams(), { tab: 'upcoming' })).sort, 'date');
});

test('a selectable long listed topic survives its shareable URL without truncation', () => {
  const topic = 'Sustainable public infrastructure and accessible climate technology'.repeat(2);
  const query = api.discoveryQuery(new URLSearchParams(), { topic });
  assert.deepEqual(results([event('topic', { tags: [topic] })], query), ['topic']);
});
