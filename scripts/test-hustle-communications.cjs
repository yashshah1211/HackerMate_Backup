/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic-only security and provider tests. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Webhook } = require('svix');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { JSDOM } = require('jsdom');
const { ROOT, load } = require('./hustle-communications-harness.cjs');
const contracts = load('src/lib/hustle-communications/contracts.ts');
const templates = load('src/lib/hustle-communications/templates.ts');
const engine = load('src/lib/hustle-communications/dispatch.ts');
const { verifyDeliveryEvidence } = load('src/lib/hustle-communications/delivery.ts');
const now = Date.parse('2026-10-22T12:00:00Z');
const teamId = '11111111-1111-4111-8111-111111111111';
const leader = { eventId: contracts.COMMUNICATION_EVENT_ID, teamId, teamName: 'Fixture Team', leaderName: 'Fixture Leader', email: 'leader@example.invalid', whatsapp: '+1 (202) 555-0100', activeShortlist: true, registration: 'pending', checkedAt: new Date(now).toISOString() };
const invitation = { confirmationUrl: 'https://example.invalid/opaque/from-pr-a?capability=fixture-only', expiresAt: contracts.CONFIRMATION_CLOSES };
const approval = { organizerApproved: true, version: contracts.INVITATION_PURPOSE, allowedOrigins: ['https://example.invalid'] };
const email = templates.prepareInvitationEmail(leader, invitation, approval, 'noreply@example.invalid', now);
const accepted = { status: 'accepted', attempted: true, intendedRecipientAccepted: true, sandbox: false, providerId: 'fixture_email_01', providerStatus: 200, retrySafe: false, reason: 'Fixture acceptance' };
function ledger(options = {}) {
  let state = 'absent', budget = options.budget ?? 1, calls = 0;
  return {
    state: () => state, calls: () => calls,
    async queue() { if (options.queueThrows) throw Error('Synthetic failure'); if (state === 'absent') state = 'queued'; return { id: 'fixture-ledger' }; },
    async claim(id) { if (options.claimThrows) { state = 'unknown'; throw Error('Ambiguous commit'); } if (state !== 'queued' || !budget) return null; state = 'unknown'; budget--; return { id, claimId: 'fixture-claim' }; },
    async finish(claim, outcome) { void claim; calls++; if (options.finishThrows) throw Error('Synthetic failure'); state = outcome.state; return true; },
  };
}

test('all source gates remain off regardless of flags or credentials', async () => {
  for (const env of [{}, { NODE_ENV: 'production', HUSTLE_COMMUNICATIONS_ENABLED: 'true', RESEND_API_KEY: 'fake' }, { NODE_ENV: 'development' }]) {
    const mod = load('src/lib/hustle-communications/dispatch.ts', { env });
    assert.equal(mod.COMMUNICATIONS_RELEASE_APPROVED, false);
    assert.equal((await mod.dispatchRound2Invitation()).state, 'blocked');
  }
  assert.equal(load('src/lib/partners/hustleCarnival.ts').hustlePublicParticipationEnabled(), false);
});
test('only fresh activated pending leaders of the exact event are eligible', () => {
  assert.equal(templates.eligibleLeader(leader, now), true);
  for (const change of [{ eventId: 'another-event' }, { activeShortlist: false }, { registration: 'confirmed' }, { registration: 'declined' }, { teamId: 'invalid' }, { email: 'bad\r\nBcc:other@example.invalid' }, { checkedAt: 'invalid' }, { checkedAt: new Date(now - 60001).toISOString() }, { checkedAt: new Date(now + 1).toISOString() }]) assert.equal(templates.eligibleLeader({ ...leader, ...change }, now), false);
  assert.equal(templates.eligibleLeader({ ...leader, checkedAt: contracts.CONFIRMATION_CLOSES }, Date.parse(contracts.CONFIRMATION_CLOSES)), false);
});
test('email and secure link require approved version and trusted origin without assuming PR A URL shape', () => {
  assert.equal(templates.validatedConfirmationUrl(invitation, approval, now), invitation.confirmationUrl);
  const fragmentHandoff = 'https://example.invalid/opaque-pr-a-handoff#synthetic-fragment';
  assert.equal(templates.validatedConfirmationUrl({ ...invitation, confirmationUrl: fragmentHandoff }, approval, now), fragmentHandoff, 'Preserve PR A fragment secrets without parsing or relocating them');
  for (const policy of [contracts.UNAPPROVED_TEMPLATE, { ...approval, version: 'other' }, { ...approval, allowedOrigins: [] }, { ...approval, allowedOrigins: ['https://example.invalid/'] }]) assert.throws(() => templates.validatedConfirmationUrl(invitation, policy, now));
  for (const url of ['javascript:alert(1)', '//example.invalid/path', 'http://example.invalid/path', 'https://example.invalid.evil.test/path', 'https://user:pass@example.invalid/path', 'https://example.invalid:444/path', 'https://example.invalid/a\nb', ' https://example.invalid/path']) assert.throws(() => templates.validatedConfirmationUrl({ ...invitation, confirmationUrl: url }, approval, now));
  for (const expiresAt of ['invalid', new Date(now).toISOString(), '2026-10-24T00:00:00Z']) assert.throws(() => templates.validatedConfirmationUrl({ ...invitation, expiresAt }, approval, now));
});
test('co-branded email includes official schedule, one team decision, privacy and plaintext; escapes HTML', () => {
  const crafted = templates.prepareInvitationEmail({ ...leader, leaderName: '<script>alert(1)</script>', teamName: '<img src=x onerror=alert(1)>' }, invitation, approval, 'noreply@example.invalid', now);
  const doc = new JSDOM(crafted.html).window.document;
  assert.equal(doc.querySelectorAll('script, img, iframe').length, 0);
  assert.equal(doc.querySelector('a[href*="capability"]').getAttribute('href'), invitation.confirmationUrl);
  assert.match(crafted.html, /HackerMate × Club Ellusion/);
  assert.match(doc.body.textContent, /23 October 2026/); assert.match(doc.body.textContent, /11:00 PM IST/);
  assert.match(crafted.text, /Opening the link alone does not confirm participation/);
  assert.match(crafted.text, /Confirm attendance or Decline invitation/);
  assert.match(crafted.text, /24 October 2026/);
  assert.match(crafted.text, /recorded leader of an officially shortlisted team/);
  assert.throws(() => templates.prepareInvitationEmail(leader, invitation, approval, 'onboarding@resend.dev', now));
  assert.throws(() => templates.prepareInvitationEmail({ ...leader, leaderName: 'bad\nname' }, invitation, approval, 'noreply@example.invalid', now));
});
test('WhatsApp normalization requires explicit country code and rejects injection, short or oversized numbers', () => {
  assert.equal(templates.normalizeWhatsApp('+1 (202) 555-0100'), '+12025550100');
  for (const value of [null, '', '9876543210', '00919876543210', '+0123456789', '+1234567', '+1234567890123456', '+12025550100?text=bad', '+12025550100\n', '+1/2025550100', 'https://wa.me/12025550100']) assert.equal(templates.normalizeWhatsApp(value), null);
});
test('approved manual click-to-chat is scoped to shortlist, correctly encoded, and contains no bearer URL', () => {
  const chat = templates.prepareWhatsApp({ ...leader, teamName: 'A & B #Team' }, true, now);
  const url = new URL(chat.href);
  assert.equal(url.origin, 'https://wa.me'); assert.equal(url.pathname, '/12025550100');
  assert.equal(url.searchParams.get('text'), chat.message);
  assert.match(chat.message, /A & B #Team/); assert.match(chat.message, /personal link in your official email/);
  assert(!chat.message.includes(invitation.confirmationUrl));
  assert.equal(templates.prepareWhatsApp(leader, false, now), null);
  assert.equal(templates.prepareWhatsApp({ ...leader, activeShortlist: false }, true, now), null);
  assert.equal(templates.prepareWhatsApp({ ...leader, whatsapp: null }, true, now), null);
});

for (const [label, response, expected] of [
  ['valid acknowledgement', () => new Response(JSON.stringify({ id: 'fixture_email_01' }), { status: 200 }), 'accepted'],
  ['provider rejection', () => new Response('{}', { status: 422 }), 'rejected'],
  ['quota rejection', () => new Response('{}', { status: 429 }), 'rejected'],
  ['server failure', () => new Response('{}', { status: 503 }), 'unknown'],
  ['request timeout', () => new Response('{}', { status: 408 }), 'unknown'],
  ['provider conflict', () => new Response('{}', { status: 409 }), 'unknown'],
  ['malformed acknowledgement', () => new Response('not json', { status: 200 }), 'unknown'],
  ['missing provider id', () => new Response('{}', { status: 200 }), 'unknown'],
  ['mock acknowledgement', () => new Response('{"id":"fixture_email_01","mock":true}', { status: 200 }), 'unknown'],
  ['ambiguous network exception', () => { throw Error('fixture timeout'); }, 'unknown'],
]) test(`existing Resend transport: ${label}; no retries`, async () => {
  let calls = 0; const logs = [];
  const transport = load('src/lib/emailDispatch.ts', { env: { RESEND_API_KEY: 'fake-fixture-key', RESEND_FROM_EMAIL: 'noreply@example.invalid' }, logs,
    fetch: async (url, request) => { calls++; assert.equal(url, 'https://api.resend.com/emails'); assert.equal(JSON.parse(request.body).to, leader.email); assert.equal(JSON.parse(request.body).text, email.text); assert(request.signal); return response(); } }).dispatchEmail;
  const store = ledger();
  const result = await engine.simulateInvitationDispatch(teamId, email, store, transport);
  assert.equal(result.state, expected); assert.equal(store.state(), expected); assert.equal(result.retrySafe, false); assert.equal(calls, 1);
  assert.equal(logs.length, 0);
  await engine.simulateInvitationDispatch(teamId, email, store, transport);
  assert.equal(calls, 1, 'accepted, rejected and unknown jobs are never automatically retried');
});
test('duplicate simultaneous workers reserve one attempt and call the provider once', async () => {
  const store = ledger(); let calls = 0;
  await Promise.all(Array.from({ length: 12 }, () => engine.simulateInvitationDispatch(teamId, email, store, async () => { calls++; return accepted; })));
  assert.equal(calls, 1); assert.equal(store.state(), 'accepted');
});
test('an actual aborted synthetic provider request becomes unknown without retry', async () => {
  let calls = 0;
  const transport = load('src/lib/emailDispatch.ts', { env: { RESEND_API_KEY: 'fixture', RESEND_FROM_EMAIL: 'noreply@example.invalid' },
    abortSignal: { timeout: () => AbortSignal.timeout(2) },
    fetch: async (url, request) => { void url; calls++; await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 1000);
      request.signal.addEventListener('abort', () => { clearTimeout(timer); reject(request.signal.reason); }, { once: true });
    }); throw Error('Synthetic provider must time out'); },
  }).dispatchEmail;
  const store = ledger();
  assert.equal((await engine.simulateInvitationDispatch(teamId, email, store, transport)).state, 'unknown');
  await engine.simulateInvitationDispatch(teamId, email, store, transport);
  assert.equal(calls, 1);
});
test('unverified/exhausted quota and failed queue block provider calls', async () => {
  for (const options of [{ budget: 0 }, { queueThrows: true }]) {
    let calls = 0; const store = ledger(options);
    assert.equal((await engine.simulateInvitationDispatch(teamId, email, store, async () => { calls++; return accepted; })).state, 'blocked');
    assert.equal(calls, 0);
  }
});
test('crash after claim, ambiguous claim and acceptance persistence failure never permit resend', async () => {
  let calls = 0;
  const ambiguous = ledger({ claimThrows: true });
  const provider = async () => { calls++; return accepted; };
  assert.equal((await engine.simulateInvitationDispatch(teamId, email, ambiguous, provider)).state, 'unknown');
  assert.equal(calls, 0);
  const store = ledger({ finishThrows: true });
  const result = await engine.simulateInvitationDispatch(teamId, email, store, provider);
  assert.equal(result.state, 'accepted'); assert.equal(result.recorded, false); assert.equal(store.state(), 'unknown');
  await engine.simulateInvitationDispatch(teamId, email, store, provider);
  assert.equal(calls, 1);
  const crashed = ledger(); await crashed.queue(teamId); await crashed.claim('fixture-ledger');
  assert.equal((await engine.simulateInvitationDispatch(teamId, email, crashed, provider)).state, 'blocked');
  assert.equal(calls, 1);
});
test('simulation refuses non-fixture recipients and all production execution', async () => {
  let calls = 0; const fake = async () => { calls++; return accepted; };
  for (const payload of [{ ...email, to: 'person@example.org' }, { ...email, from: 'noreply@example.org' }]) assert.equal((await engine.simulateInvitationDispatch(teamId, payload, ledger(), fake)).state, 'blocked');
  const production = load('src/lib/hustle-communications/dispatch.ts', { env: { NODE_ENV: 'production' } });
  assert.equal((await production.simulateInvitationDispatch(teamId, email, ledger(), fake)).state, 'blocked');
  assert.equal(calls, 0);
});
test('sandbox and non-intended acknowledgements cannot become accepted/delivered', () => {
  for (const change of [{ sandbox: true }, { intendedRecipientAccepted: false }, { providerId: '' }, { providerId: 'invalid\nvalue' }, { attempted: false }]) assert.equal(engine.providerOutcome({ ...accepted, ...change }).state, 'unknown');
});
test('delivery requires a fresh valid Svix signature and exact delivered event; PII is projected out', () => {
  const secret = 'whsec_' + Buffer.from('synthetic-fixture-secret-32-bytes!').toString('base64');
  const at = new Date(); const id = 'msg_fixture_01'; const wh = new Webhook(secret);
  const raw = JSON.stringify({ type: 'email.delivered', created_at: at.toISOString(), data: { email_id: 'fixture_email_01', to: ['leader@example.invalid'], subject: 'private' } });
  const headers = { 'svix-id': id, 'svix-timestamp': String(Math.floor(at.getTime() / 1000)), 'svix-signature': wh.sign(id, at, raw) };
  const result = verifyDeliveryEvidence(raw, headers, secret);
  assert.deepEqual(Object.keys(result).sort(), ['eventId', 'occurredAt', 'providerId']);
  assert.equal(result.providerId, 'fixture_email_01');
  assert.equal(verifyDeliveryEvidence(raw.replace('delivered', 'opened'), headers, secret), null);
  const opened = raw.replace('delivered', 'opened');
  assert.equal(verifyDeliveryEvidence(opened, { ...headers, 'svix-signature': wh.sign(id, at, opened) }, secret), null);
  assert.equal(verifyDeliveryEvidence(raw, { ...headers, 'svix-signature': 'invalid' }, secret), null);
  const old = new Date(at.getTime() - 600_000);
  assert.equal(verifyDeliveryEvidence(raw, { ...headers, 'svix-timestamp': String(Math.floor(old.getTime() / 1000)), 'svix-signature': wh.sign(id, old, raw) }, secret), null);
  assert.equal(verifyDeliveryEvidence('x'.repeat(16385), headers, secret), null);
});
test('production UI is 404; development UI has synthetic data and no live links or actions', () => {
  const route = 'src/app/dev/hustle-communications/page.tsx';
  assert.throws(() => load(route, { env: { NODE_ENV: 'production' } }).default(), /NEXT_NOT_FOUND/);
  const html = renderToStaticMarkup(load(route).default()); const doc = new JSDOM(html).window.document;
  assert.match(doc.body.textContent, /All teams and statuses below are synthetic fixtures/);
  assert.match(doc.body.textContent, /Delivery event verified/); assert.match(doc.body.textContent, /Organizer marked sent/);
  assert.equal(doc.querySelectorAll('tbody tr').length, 6);
  assert.equal(doc.querySelectorAll('button:not([disabled]), form, input, iframe, a[href*="wa.me"], a[href*="phase-2"]').length, 0);
  const empty = load('src/components/hustle-communications/CommunicationDashboard.tsx').default;
  assert.match(renderToStaticMarkup(React.createElement(empty, { rows: [] })), /No communication evidence to display/);
});
test('no live route, unpublished import, migration installation, token issuance or queue payload persistence', () => {
  const sources = fs.readdirSync(path.join(ROOT, 'src/lib/hustle-communications')).map(file => fs.readFileSync(path.join(ROOT, 'src/lib/hustle-communications', file), 'utf8')).join('\n');
  assert(!/from ['"][^'"]*hustle-phase2/.test(sources));
  assert(!/randomBytes|createHash|api\.resend\.com|console\./.test(sources));
  const sql = fs.readFileSync(path.join(ROOT, 'docs/sql/hustle-communications-ledger.sql'), 'utf8');
  assert(!/CREATE TABLE public\.hustle_phase2|leader_email|token_hash|confirmation_url|message_body/i.test(sql));
});
