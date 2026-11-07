/* eslint-disable @typescript-eslint/no-require-imports -- Offline reminder route and claim regressions. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { uuid, deadline, now, reminderRow, setupReminder } = require('./deadline-reminder-harness.cjs');

const run = async (fixture, headers) => (await fixture.call(headers)).json();
const evidence = fixture => [...fixture.db.state.claims.values()].map(JSON.parse);

test('a reminder uses a canonical link, one durable intent and a verified completion', async () => {
  const fixture = setupReminder();
  const result = await run(fixture, { host: 'evil.invalid', 'x-forwarded-host': 'evil.invalid', 'x-forwarded-proto': 'http' });
  assert.equal(result.status, 'complete');
  assert.equal(result.claimed, 1);
  assert.equal(result.attempted, 1);
  assert.equal(result.accepted, 1);
  assert.equal(result.completed, 1);
  assert.equal(result.accounting.status, 'recorded');
  assert.equal(fixture.db.state.accounted, 1);
  assert.equal(fixture.state.requests.length, 1);
  const request = fixture.state.requests[0];
  assert.match(request.key, /^hm-deadline-reminder\/v1\/[a-f0-9]{64}$/);
  assert.equal(request.payload.to, 'builder@example.invalid');
  assert(request.payload.html.includes('https://www.hackermate.in/hackathons/' + uuid(93)));
  assert(request.payload.html.includes('Register Now'));
  assert(!request.payload.html.includes('evil.invalid'));
  assert(!JSON.stringify(result).includes(uuid(91)));
  assert(!JSON.stringify(result).includes('synthetic-receipt'));
  assert(!JSON.stringify(evidence(fixture)).includes('builder@example.invalid'));
  assert.equal(evidence(fixture)[0].status, 'accepted');
  assert.equal(evidence(fixture)[0].providerId, 'synthetic-receipt');
  assert.match(evidence(fixture)[0].payloadHash, /^[a-f0-9]{64}$/);
  assert.equal((await run(fixture)).attempted, 0);
  assert.equal(fixture.state.requests.length, 1);
});

test('identity normalizes offsets and UUID case, retains microseconds and ignores saved-row ID', () => {
  const { reminderIdentity } = setupReminder().h.load('src/lib/admin/deadlineReminderClaims.ts');
  const row = reminderRow({ user: '00000000-0000-4000-8000-0000000000ab' });
  const first = reminderIdentity(row);
  const same = reminderIdentity({ ...row, saved_id: uuid(100), user_id: row.user_id.toUpperCase(), registration_end: '2026-11-08T01:30:00.123456+05:30' });
  assert.equal(first.digest, same.digest);
  assert.equal(first.deadline, deadline);
  assert.notEqual(first.digest, reminderIdentity({ ...row, registration_end: '2026-11-07T20:00:00.123457Z' }).digest);
  assert.equal(reminderIdentity({ ...row, registration_end: '2026-02-30T20:00:00Z' }), null);
  assert.equal(reminderIdentity({ ...row, registration_end: '2026-11-07T20:00:00' }), null);
});

test('recreating a completed bookmark cannot resend the same deadline, but a later eligible deadline can send', async () => {
  const fixture = setupReminder();
  assert.equal((await run(fixture)).sentCount, 1);
  const first = evidence(fixture)[0];
  fixture.db.state.rows[0].saved_id = uuid(100);
  const duplicate = await run(fixture);
  assert.equal(duplicate.duplicates, 1);
  assert.equal(duplicate.attempted, 0);
  assert.deepEqual(evidence(fixture), [first]);
  fixture.db.state.rows[0].registration_end = '2026-11-08T06:00:00Z';
  assert.equal((await run(fixture)).sentCount, 1);
  assert.equal(fixture.state.requests.length, 2);
  assert.notEqual(fixture.state.requests[0].key, fixture.state.requests[1].key);
  fixture.db.state.rows[0].registration_end = '2026-11-08T07:00:00Z';
  assert.equal((await run(fixture)).discovered, 0, 'Existing completion timestamp continues to suppress the saved row');
});

test('the same event can notify different builders, and the same builder can receive different event reminders', async () => {
  const fixture = setupReminder({ rows: [
    reminderRow(), reminderRow({ saved: uuid(101), user: uuid(102) }),
    reminderRow({ saved: uuid(103), event: uuid(104) }),
  ] });
  const result = await run(fixture);
  assert.equal(result.sentCount, 3);
  assert.equal(result.completed, 3);
  assert.equal(fixture.db.state.accounted, 3);
  assert.equal(new Set(fixture.state.requests.map(r => r.key)).size, 3);
});

for (const [name, change] of Object.entries({
  'registered builder': (row, state) => state.registrations.add(row.user_id + row.hackathon_id),
  'deleted bookmark': (_, state) => state.rows.pop(),
  'completed bookmark': (row, state) => state.completed.set(row.saved_id, deadline),
  'moved deadline': row => { row.registration_end = '2026-11-08T02:00:00Z'; },
  'changed recipient': row => { row.user_email = 'changed@example.invalid'; },
})) test(`${name} between discovery and final query is durably suppressed`, async () => {
  const fixture = setupReminder({ beforeRead: (id, state) => { if (id) change(state.rows[0], state); } });
  const result = await run(fixture);
  assert.equal(result.claimed, 1);
  assert.equal(result.suppressed, 1);
  assert.equal(evidence(fixture)[0].status, 'suppressed');
  assert.equal(evidence(fixture)[0].category, 'eligibility_changed');
  assert.equal(fixture.state.requests.length, 0);
});

test('a deadline that expires at the final check is held', async () => {
  let time = now;
  const fixture = setupReminder({ now: () => time, beforeRead: id => { if (id) time = Date.parse(deadline) + 1; } });
  assert.equal((await run(fixture)).suppressed, 1);
  assert.equal(evidence(fixture)[0].status, 'suppressed');
  assert.equal(fixture.state.requests.length, 0);
});

for (const options of [
  { event: { archived: true } }, { event: { status: 'pending' } },
  { event: { registration_status: 'closed' } }, { event: { registration_start: '2026-11-07T14:00:00Z' } },
  { profile: { is_banned: true } }, { profile: { email: 'bad@example.invalid,second@example.invalid' } },
]) test(`ineligible event or recipient is deferred without claiming (${JSON.stringify(options)})`, async () => {
  const fixture = setupReminder(options);
  assert.equal((await run(fixture)).deferred, 1);
  assert.equal(evidence(fixture).length, 0);
  assert.equal(fixture.state.requests.length, 0);
});

test('an event can become eligible at its registration start without a new deadline', async () => {
  let time = now;
  const fixture = setupReminder({ now: () => time, event: {
    registration_start: '2026-11-07T14:00:00Z', registration_status: 'not-yet-open',
  } });
  const first = await run(fixture);
  assert.equal(first.deferred, 1);
  assert.equal(first.claimed, 0);
  assert.equal(fixture.state.requests.length, 0);
  time = Date.parse('2026-11-07T14:00:01Z');
  assert.equal((await run(fixture)).completed, 1);
  assert.equal(fixture.state.requests.length, 1);
});

for (const [field, value] of [['archived', true], ['status', 'pending'], ['registration_status', 'closed'], ['is_banned', true]]) {
  test(`policy change during the ownership write blocks provider contact (${field})`, async () => {
    const event = {}, profile = {};
    const fixture = setupReminder({ event, profile, claimFault: (operation, state) => {
      if (operation === 'update' && state === 'dispatching') (field === 'is_banned' ? profile : event)[field] = value;
    } });
    assert.equal((await run(fixture)).suppressed, 1);
    assert.equal(evidence(fixture)[0].status, 'suppressed');
    assert.equal(fixture.state.requests.length, 0);
  });
}

test('held rows filling a short database page cannot starve unrelated reminders', async () => {
  const rows = [reminderRow(), reminderRow({ saved: uuid(101), user: uuid(102) })];
  const fixture = setupReminder({ rows, rowCap: 1, provider: () => { throw new Error('synthetic connection loss'); } });
  const first = await run(fixture);
  assert.equal(first.unknownCount, 2);
  rows.push(reminderRow({ saved: uuid(103), user: uuid(104) }));
  const second = await run(fixture);
  assert.equal(second.discovered, 3);
  assert.equal(second.duplicates, 2);
  assert.equal(second.attempted, 1);
  assert.equal(second.unknownCount, 1);
  assert.equal(fixture.state.requests.length, 3);
});

for (const options of [{ rpcError: 'discovery' }, { rpcError: 'final' }, { dbError: 'profiles' }, { dbError: 'hackathons' }]) {
  test(`unavailable eligibility never dispatches or exposes database error text (${JSON.stringify(options)})`, async () => {
    const fixture = setupReminder(options);
    const result = await run(fixture);
    assert.equal(result.infrastructureFailures, 1);
    assert.equal(result.attempted, 0);
    if (result.claimed) assert.equal(evidence(fixture)[0].category, 'eligibility_unavailable');
    assert(!JSON.stringify([result, fixture.state.logs]).includes('PRIVATE_SQL_DETAIL'));
  });
}

for (const env of [{ CRON_SECRET: '' }, { SUPABASE_SERVICE_ROLE_KEY: '' }, { NEXT_PUBLIC_SUPABASE_URL: '' }]) {
  test(`missing ${Object.keys(env)[0]} blocks client and provider access`, async () => {
    const fixture = setupReminder({ env });
    assert.equal((await fixture.call()).status, 503);
    assert.equal(fixture.state.clients, 0);
    assert.equal(fixture.state.requests.length, 0);
  });
}
test('unauthorized request cannot create the service client or query reminders', async () => {
  const fixture = setupReminder();
  assert.equal((await fixture.call({ Authorization: 'Bearer not-authorized' })).status, 401);
  assert.equal(fixture.state.clients, 0);
  assert.equal(fixture.db.state.operations.length, 0);
});

for (const fault of ['error', 'empty', 'throw', 'lost']) test(`claim ${fault} never authorizes a provider call`, async () => {
  const fixture = setupReminder({ claimFault: (operation, state) => operation === 'insert' && state === 'claimed' && fault });
  assert.equal((await run(fixture)).infrastructureFailures, 1);
  assert.equal(fixture.state.requests.length, 0);
  if (fault === 'lost') {
    assert.equal(evidence(fixture)[0].status, 'claimed');
    assert.equal((await run(fixture)).duplicates, 1);
  }
});

for (const fault of ['error', 'empty', 'lost']) test(`dispatching ${fault} prevents sending and holds the next invocation`, async () => {
  const fixture = setupReminder({ claimFault: (_, state) => state === 'dispatching' && fault });
  assert.equal((await run(fixture)).journalFailures, 1);
  assert.equal((await run(fixture)).duplicates, 1);
  assert.equal(fixture.state.requests.length, 0);
});

for (const status of [408, 409, 429, 500, 503, 401, 422]) test(`provider HTTP ${status} retains the claim`, async () => {
  const fixture = setupReminder({ provider: () => Response.json({ error: 'synthetic' }, { status }) });
  const result = await run(fixture);
  const ambiguous = [408, 409, 429, 500, 503].includes(status);
  assert.equal(result.unknownCount, ambiguous ? 1 : 0);
  assert.equal(result.rejected, ambiguous ? 0 : 1);
  assert.equal(evidence(fixture)[0].status, ambiguous ? 'unknown' : 'rejected');
  assert.equal(evidence(fixture)[0].providerStatus, status);
  assert.equal((await run(fixture)).duplicates, 1);
  assert.equal(fixture.state.requests.length, 1);
  assert.equal(fixture.db.state.completed.size, 0);
});

for (const provider of [
  () => { throw new DOMException('Synthetic provider timeout', 'TimeoutError'); },
  () => Response.json({ id: ' ' }),
  () => new Response('unparseable acknowledgement'),
]) test('timeout or malformed provider acceptance leaves a permanent unknown outcome', async () => {
  const fixture = setupReminder({ provider });
  assert.equal((await run(fixture)).unknownCount, 1);
  assert.equal(evidence(fixture)[0].status, 'unknown');
  assert.equal((await run(fixture)).duplicates, 1);
  assert.equal(fixture.state.requests.length, 1);
});

test('accepted evidence survives a final claim write error and an unverified completion', async () => {
  const fixture = setupReminder({ claimFault: (_, state) => state === 'accepted' && 'error', zeroCompletion: true });
  const result = await run(fixture);
  assert.equal(result.accepted, 1);
  assert.equal(result.sentCount, 1);
  assert.equal(result.completed, 0);
  assert.equal(result.journalFailures, 1);
  assert.equal(result.completionFailures, 1);
  assert.equal(evidence(fixture)[0].status, 'dispatching');
  assert.equal((await run(fixture)).duplicates, 1);
  assert.equal(fixture.state.requests.length, 1);
});

test('missing provider configuration defers without claiming or calling Resend', async () => {
  const fixture = setupReminder({ env: { RESEND_API_KEY: '' } });
  const result = await run(fixture);
  assert.equal(result.configurationUnavailable, 1);
  assert.equal(result.claimed, 0);
  assert.equal(result.status, 'blocked');
  assert.equal(fixture.state.requests.length, 0);
});

test('sandbox acceptance counts toward provider usage but never completes the intended reminder', async () => {
  const fixture = setupReminder({ env: { RESEND_FROM_EMAIL: 'onboarding@resend.dev', RESEND_SANDBOX_RECIPIENT: 'sandbox@example.invalid' } });
  const result = await run(fixture);
  assert.equal(result.accepted, 1);
  assert.equal(result.sandboxAccepted, 1);
  assert.equal(result.sentCount, 0);
  assert.equal(result.completed, 0);
  assert.equal(fixture.db.state.accounted, 1);
  assert.equal(evidence(fixture)[0].category, 'sandbox');
  assert.equal(fixture.state.requests[0].payload.to, 'sandbox@example.invalid');
  assert.equal((await run(fixture)).duplicates, 1);
});

test('a partially successful batch reports distinct outcomes and private accounting errors', async () => {
  const rows = [reminderRow(), reminderRow({ saved: uuid(101), user: uuid(102) }), reminderRow({ saved: uuid(103), user: uuid(104) })];
  let calls = 0;
  const fixture = setupReminder({ rows, dbError: 'daily_email_stats',
    beforeRead: (id, state) => { if (id === uuid(103)) state.registrations.add(rows[2].user_id + rows[2].hackathon_id); },
    provider: () => ++calls === 1 ? Response.json({ id: 'synthetic' }) : new Response('', { status: 503 }),
  });
  const result = await run(fixture);
  assert.equal(result.status, 'partial');
  assert.equal(result.discovered, 3);
  assert.equal(result.claimed, 3);
  assert.equal(result.attempted, 2);
  assert.equal(result.accepted, 1);
  assert.equal(result.unknownCount, 1);
  assert.equal(result.suppressed, 1);
  assert.equal(result.heldCount, 2);
  assert.equal(result.completed, 1);
  assert.equal(result.accounting.status, 'failed');
  assert(!JSON.stringify([result, fixture.state.logs]).includes('PRIVATE_SQL_DETAIL'));
  assert.equal((await run(fixture)).duplicates, 1);
  assert.equal(fixture.state.requests.length, 2);
});
