/* eslint-disable @typescript-eslint/no-require-imports -- Offline route/provider regressions; no environment files or external services. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { NextRequest, NextResponse } = require('next/server');
const { harness } = require('./ppt-vision-harness.cjs');

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const lead = { id: 'fixture-lead', title: 'Synthetic event', organizer_email: 'organizer@example.invalid', status: 'new', pitch_sent_at: null };
const stats = () => ({ date: new Date().toISOString().slice(0, 10), total_sent: 4, outreach_sent: 2, nudges_sent: 1 });
const profile = { id: 'fixture-user', full_name: 'Fixture', email: 'builder@example.invalid', is_banned: false, role: 'admin', last_onboarding_nudge_sent_at: null };

function setup(options = {}) {
  const state = { sends: [], writes: [], reads: [], rpc: [], stats: stats(), logs: [] };
  let providerIndex = 0;
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: 'fixture-admin' } } }) },
    async rpc(name) {
      state.rpc.push(name);
      if (options.rpcFailure === name) return { error: { message: 'Fixture RPC failure' }, data: null };
      return { error: null, data: name === 'can_access_partner_event' ? true : name === 'get_pending_deadline_reminders'
        ? [{ saved_id: 'fixture-saved', user_email: profile.email, hackathon_name: 'Synthetic', hackathon_id: 'fixture-event' }]
        : [{ allowed: true }] };
    },
    from(table) {
      let op = 'read', payload, single = false, range;
      const filters = [];
      const b = {
        select() { return b; }, order() { return b; }, limit() { return b; },
        eq(...args) { filters.push(args); return b; }, is(...args) { filters.push(args); return b; },
        not(...args) { filters.push(args); return b; }, or(value) { filters.push(["or", value]); return b; }, gte() { return b; }, lte() { return b; },
        neq() { return b; }, ilike() { return b; }, in() { return b; }, range(a, z) { range = [a, z]; return b; },
        insert(value) { op = 'insert'; payload = value; return b; },
        update(value) { op = 'update'; payload = value; return b; },
        upsert(value, config) { op = 'upsert'; payload = value; state.upsertOptions = config; return b; },
        single() { single = true; return b; }, maybeSingle() { single = true; return b; },
        then(resolve, reject) {
          const record = { table, op, payload, filters };
          (op === 'read' ? state.reads : state.writes).push(record);
          if (options.throwWrite === table && op !== 'read') return Promise.reject(new Error('Fixture write unavailable')).then(resolve, reject);
          if ((options.readError === table && op === 'read') || (options.writeError === table && op !== 'read')) {
            return Promise.resolve({ data: null, error: { message: 'Fixture unavailable' } }).then(resolve, reject);
          }
          let rows = [];
          if (table === 'daily_email_stats') {
            if (op === 'upsert') {
              // Simulate a winner writing counters between initial read and INSERT DO NOTHING.
              if (options.initializationRace) state.stats = { ...stats(), total_sent: 49 };
              else state.stats ||= payload;
            }
            if (op === 'update') state.stats = { ...state.stats, ...payload };
            rows = state.stats ? [state.stats] : [];
          } else if (table === 'organizer_leads') {
            const history = filters.some(([key, value]) => key === 'or' && value.includes('email_outcome_unknown'));
            rows = history ? options.history || [] : options.leads || [options.lead || lead];
          } else if (table === 'profiles') rows = [profile];
          else if (table === 'hackathons') rows = [{ id: 'fixture-event', name: 'Synthetic', type: 'native', organizer_id: 'fixture-admin' }];
          else if (table === 'hackathon_announcements') rows = [{ id: 'fixture-announcement', sent_at: null }];
          else if (table === 'hackathon_registrations') rows = options.emptyParticipants ? [] : [{ profiles: profile }, { profiles: { ...profile, id: 'fixture-user-2', email: 'second@example.invalid' } }];
          else if (table === 'resend_webhook_events') rows = [{ id: 'fixture-event', resend_email_id: 'fixture-receipt', event_type: 'delivered' }];
          else if (table === 'friend_requests') rows = [{ id: 'fixture-request', message: 'Fixture' }];
          else if (table === 'app_settings') rows = [{ key: 'last_db_report_run' }];
          if (options.zeroRows === table && op === 'update') rows = [];
          if (range) rows = rows.slice(range[0], range[1] + 1);
          return Promise.resolve({ data: single ? rows[0] || null : rows, error: null }).then(resolve, reject);
        },
      };
      return b;
    },
  };
  const h = harness({
    'next/server': { NextRequest, NextResponse },
    '@supabase/supabase-js': { createClient: () => db },
    '@supabase/ssr': { createServerClient: () => db },
    '@/lib/admin/requireAdmin': {
      requireAdmin: async () => ({ user: { id: 'fixture-admin' }, supabaseAdmin: db }),
      requireVerifiedProfile: async () => ({ user: { id: 'fixture-admin' }, supabaseUserClient: db, isAdmin: true }),
    },
    '@/lib/admin/databaseActivityReport': { fetchDatabaseActivity: async () => ({ summary: { totalNewItems: 0, newBuilders: 0, newTeams: 0, newInvites: 0, newRequests: 0 }, timeWindow: { until: '2026-10-15T00:00:00Z' }, team_hackathons: [], messages_count_24h: 0 }), generateDatabaseActivityPdf: () => Buffer.from('synthetic-pdf') },
    '@/lib/admin/requireOutreachAdmin': { requireOutreachAdmin: async () => ({ supabaseAdmin: db }) },
    // Signatures remain verified; crypto correctness belongs to Svix, not this persistence test.
    svix: { Webhook: class { verify() { if (options.badSignature) throw new Error('Fixture signature'); return { type: 'email.delivered', data: { email_id: 'fixture-receipt', to: [profile.email] } }; } } },
    ...options.overrides,
  }, {
    console: { info: (...args) => state.logs.push(args), log: (...args) => state.logs.push(args), warn: (...args) => state.logs.push(args), error: (...args) => state.logs.push(args) },
    fetch: async (url, config) => {
      assert.equal(url, 'https://api.resend.com/emails', 'No live scraping, cron URL or database network calls');
      assert(config.signal instanceof AbortSignal);
      state.sends.push(JSON.parse(config.body));
      const outcome = options.providers?.[providerIndex++] || options.provider;
      if (!outcome) throw new Error('Fixture network loss');
      return outcome();
    },
  });
  Object.assign(h.env, { RESEND_API_KEY: 'offline-key', RESEND_FROM_EMAIL: 'Fixture <sender@example.invalid>',
    NEXT_PUBLIC_SUPABASE_URL: 'https://database.example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'offline-service',
    CRON_SECRET: 'offline-cron', NOTIFICATION_WEBHOOK_SECRET: 'offline-notification', RESEND_WEBHOOK_SECRET: 'offline-signature',
    NODE_ENV: 'production', ...options.env });
  const call = async (file, body = {}, headers = {}) => {
    const result = await h.load(`src/app/api/${file}/route.ts`).POST(new NextRequest(`http://localhost/api/${file}`, {
      method: 'POST', headers: { Authorization: 'Bearer offline-cron', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
    }));
    return { response: result, body: await result.json() };
  };
  return { ...h, state, db, call };
}

const payload = { from: 'Fixture <sender@example.invalid>', to: 'intended@example.invalid', subject: 'Synthetic', html: '<p>Fixture</p>' };
for (const [label, provider, expected] of [
  ['receipt', () => json({ id: 'fixture-receipt' }), 'accepted'],
  ['rejection', () => json({ message: 'rejected' }, 422), 'failed'],
  ['invalid HTTP success', () => json({}), 'unknown'],
  ['empty ID', () => json({ id: ' ' }), 'unknown'],
  ['numeric ID', () => json({ id: 42 }), 'unknown'],
  ['error alongside ID', () => json({ id: 'fixture', error: 'rejected' }), 'unknown'],
  ['mock acknowledgment', () => json({ id: 'fixture', mock: true }), 'unknown'],
  ['broken JSON', () => new Response('not JSON'), 'unknown'],
  ['server uncertainty', () => json({}, 503), 'unknown'],
  ['timeout', () => { throw new DOMException('Fixture timeout', 'TimeoutError'); }, 'unknown'],
  ['connection loss', () => { throw new Error('Fixture connection loss'); }, 'unknown'],
]) test(`provider contract: ${label}`, async () => {
  const h = setup({ provider }); const outcome = await h.load('src/lib/emailDispatch.ts').dispatchEmail(payload);
  assert.equal(outcome.status, expected); assert.equal(outcome.attempted, true);
  assert.equal(outcome.intendedRecipientAccepted, expected === 'accepted'); assert.equal(outcome.retrySafe, false);
  assert.equal(h.state.sends.length, 1, 'Never retry automatically');
});
for (const key of ['RESEND_API_KEY', 'RESEND_FROM_EMAIL']) test(`provider contract: missing ${key} is not dispatched`, async () => {
  const h = setup({ env: { [key]: '' } }); const outcome = await h.load('src/lib/emailDispatch.ts').dispatchEmail(payload);
  assert.equal(outcome.status, 'not_dispatched'); assert.equal(outcome.attempted, false); assert.equal(h.state.sends.length, 0);
  assert(!JSON.stringify(h.state.logs).includes(payload.to), 'Diagnostics do not log recipient or content');
});
test('sandbox receipt never establishes intended-recipient contact', async () => {
  const h = setup({ provider: () => json({ id: 'sandbox-receipt' }), env: { RESEND_SANDBOX_RECIPIENT: 'sandbox@example.invalid' } });
  const result = await h.load('src/lib/emailDispatch.ts').dispatchEmail({ ...payload, from: 'Fixture <onboarding@resend.dev>' });
  assert.equal(result.status, 'accepted'); assert.equal(result.intendedRecipientAccepted, false); assert.equal(result.sandbox, true);
  assert.equal(h.state.sends[0].to, 'sandbox@example.invalid');
});
const pitchBody = { leadId: lead.id, recipientEmail: lead.organizer_email, subject: 'Synthetic', contentHtml: '<p>Fixture</p>' };
for (const [label, options] of [
  ['missing configuration', { env: { RESEND_API_KEY: '' } }],
  ['rejection', { provider: () => json({}, 422) }], ['invalid receipt', { provider: () => json({}) }],
  ['timeout', { provider: () => { throw new Error('Fixture timeout'); } }],
  ['sandbox', { provider: () => json({ id: 'fixture' }), env: { RESEND_FROM_EMAIL: 'Fixture <onboarding@resend.dev>', RESEND_SANDBOX_RECIPIENT: 'sandbox@example.invalid' } }],
]) test(`manual pitch: ${label} never marks intended lead pitched`, async () => {
  const h = setup(options); const { body } = await h.call('admin/send-organizer-pitch', pitchBody);
  assert.equal(body.success, false); assert.equal(body.dispatch.intendedRecipientAccepted, false);
  assert(!h.state.writes.some(w => w.payload?.pitch_sent_at), 'Never fabricate business completion');
  assert.equal(h.state.sends.length, label === 'missing configuration' ? 0 : 1);
  if (label === 'sandbox') assert(!h.state.sends[0].html.includes('/api/webhooks/email-open'), 'Sandbox opens cannot update intended-lead CRM state');
});
for (const failure of [{ writeError: 'organizer_leads' }, { zeroRows: 'organizer_leads' }, { throwWrite: 'organizer_leads' }]) {
  test(`manual pitch: accepted outcome survives CRM failure ${JSON.stringify(failure)}`, async () => {
    const h = setup({ ...failure, provider: () => json({ id: 'fixture' }) }); const { body } = await h.call('admin/send-organizer-pitch', pitchBody);
    assert.equal(body.dispatch.status, 'accepted'); assert.equal(body.bookkeeping, 'failed'); assert.equal(body.dbUpdateFailed, true);
    assert.equal(body.accounting.status, 'recorded'); assert.equal(h.state.stats.outreach_sent, 3); assert.equal(h.state.sends.length, 1);
  });
}

for (const [label, options, expected] of [
  ['missing configuration', { env: { RESEND_API_KEY: '' } }, 'not_dispatched'],
  ['rejection', { provider: () => json({}, 422) }, 'failed'],
  ['invalid receipt', { provider: () => json({}) }, 'unknown'],
  ['accepted', { provider: () => json({ id: 'fixture' }) }, 'accepted'],
]) test(`automatic pitch: ${label}`, async () => {
  const h = setup(options); const result = await h.load('src/lib/admin/autoSendPitches.ts').autoSendPitchEmailsForLeads(h.db, [lead]);
  assert.equal(result.details[0].dispatch.status, expected);
  assert.equal(result.sent, expected === 'accepted' ? 1 : 0);
  assert.equal(result.unknown, expected === 'unknown' ? 1 : 0);
  assert.equal(h.state.writes.some(w => w.payload?.pitch_sent_at), expected === 'accepted');
  if (expected === 'unknown') assert(h.state.writes.some(w => w.payload?.status === 'email_outcome_unknown'));
});
test('automatic accepted pitch is accounted even when CRM persistence fails', async () => {
  const h = setup({ provider: () => json({ id: 'fixture' }), throwWrite: 'organizer_leads' });
  const result = await h.load('src/lib/admin/autoSendPitches.ts').autoSendPitchEmailsForLeads(h.db);
  assert.equal(result.accepted, 1); assert.equal(result.failed, 0); assert.equal(result.bookkeepingFailed, 1); assert.equal(result.accounting.status, 'recorded');
});
test('automatic pitch rechecks supplied records, skips removed leads, and deduplicates against held outcomes', async () => {
  for (const options of [ { lead: { ...lead, status: 'removed' } }, { history: [{ ...lead, status: 'email_outcome_unknown' }] } ]) {
    const h = setup(options); await h.load('src/lib/admin/autoSendPitches.ts').autoSendPitchEmailsForLeads(h.db, [lead]);
    assert.equal(h.state.sends.length, 0);
  }
});
test('automatic history failure fails closed; an explicit empty selection never sends all pending leads', async () => {
  const h = setup({ readError: 'organizer_leads' }); const lib = h.load('src/lib/admin/autoSendPitches.ts');
  assert.equal((await lib.autoSendPitchEmailsForLeads(h.db)).blocked, true);
  assert.equal((await lib.autoSendPitchEmailsForLeads(h.db, [])).attempted, 0); assert.equal(h.state.sends.length, 0);
});
test('a second pitch pass cannot immediately retry leads already selected in this invocation', async () => {
  const h = setup({ provider: () => json({}, 422) }); const lib = h.load('src/lib/admin/autoSendPitches.ts');
  assert.equal((await lib.autoSendPitchEmailsForLeads(h.db, [lead])).failed, 1);
  assert.equal((await lib.autoSendPitchEmailsForLeads(h.db, undefined, [lead.id])).attempted, 0);
  assert.equal(h.state.sends.length, 1);
});
test('automatic deduplication reads past a full history page', async () => {
  const history = Array.from({ length: 100 }, (_, n) => ({ ...lead, id: `old-${n}`, organizer_email: `old-${n}@example.invalid` }));
  history.push(lead);
  const h = setup({ history }); await h.load('src/lib/admin/autoSendPitches.ts').autoSendPitchEmailsForLeads(h.db);
  assert.equal(h.state.sends.length, 0); assert.equal(h.state.reads.filter(r => r.table === 'organizer_leads').length, 3);
});

const contactBody = { name: 'Fixture', email: 'fixture@example.invalid', subject: 'Synthetic inquiry', message: 'Completely synthetic offline inquiry.' };
for (const route of ['contact', 'admin/send-outreach-summary-pdf', 'cron/daily-email-report', 'cron/database-activity-report']) {
  for (const [label, options, expected] of [
    ['missing provider', { env: { RESEND_API_KEY: '' } }, 'not_dispatched'],
    ['ambiguous acknowledgment', { provider: () => json({}) }, 'unknown'],
    ['accepted', { provider: () => json({ id: 'fixture' }) }, 'accepted'],
  ]) test(`${route}: ${label} is reported truthfully`, async () => {
    const h = setup({ ...options, ...(route === 'cron/daily-email-report' ? { lead: { ...lead, pitch_sent_at: new Date().toISOString() } } : {}) }); const { body } = await h.call(route, route === 'contact' ? contactBody : {});
    assert.equal(body.dispatch?.status, expected, JSON.stringify(body)); assert.equal(body.success, expected === 'accepted');
    if (route.includes('daily-email-report')) {
      assert.equal(body.totalSent24h, null); assert.equal(body.totalFailed24h, null);
      if (expected === 'accepted') {
        assert(!h.state.sends[0].html.includes('delivered successfully'));
        const { extractText } = require('unpdf');
        const pdf = await extractText(new Uint8Array(Buffer.from(h.state.sends[0].attachments[0].content, 'base64')), { mergePages: true });
        assert(pdf.text.includes('UNVERIFIED')); assert(!pdf.text.includes('SUCCESS'));
      }
    }
  });
}
test('report acceptance survives checkpoint failure without inviting a resend', async () => {
  const h = setup({ provider: () => json({ id: 'fixture' }), writeError: 'app_settings' });
  const { body } = await h.call('cron/database-activity-report'); assert.equal(body.dispatch.status, 'accepted'); assert.equal(body.bookkeeping, 'failed');
});
test('contact honeypot preserves its deliberate non-email success behavior', async () => {
  const h = setup(); const { body } = await h.call('contact', { ...contactBody, bot_check: 'fixture-bot' });
  assert.equal(body.success, true); assert.equal(h.state.sends.length, 0);
});
test('unavailable daily-report sources are not fabricated as category zero counts', async () => {
  const h = setup({ provider: () => json({ id: 'fixture' }), readError: 'organizer_leads' });
  const { body } = await h.call('cron/daily-email-report'); assert.equal(body.metricsStatus, 'unavailable');
  assert.equal(body.categoryCounts.outreach, null); assert.equal(body.categoryCounts.contact_submissions, null);
});
for (const prior of [{ unknown: 1 }, { bookkeepingFailed: 1 }, { accounting: { status: 'failed' } }]) {
  test(`cron does not immediately repeat an unsafe first dispatch pass: ${JSON.stringify(prior)}`, async () => {
    let secondPass = 0;
    const h = setup({ overrides: {
      '@/app/api/admin/scrape-unstop/route': { runMultiPlatformScraper: async () => ({ success: true, autoPitchResult: prior }) },
      '@/lib/admin/gmailInboxSync': { executeGmailInboxSync: async () => ({ skipped: true }) },
      '@/lib/admin/autoSendPitches': { autoRemoveUnopenedPitchedLeads: async () => ({ removedCount: 0 }),
        autoSendPitchEmailsForLeads: async () => { secondPass++; throw new Error('Unsafe repeated dispatch'); } },
    } });
    const response = await h.load('src/app/api/cron/auto-scrape-leads/route.ts').GET(new NextRequest('http://localhost/api/cron/auto-scrape-leads', { headers: { Authorization: 'Bearer offline-cron' } }));
    const body = await response.json(); assert.equal(body.autoPitchResult.blocked, true); assert.equal(secondPass, 0); assert.equal(h.state.sends.length, 0);
  });
}
for (const table of ['organizer_leads', 'daily_email_stats']) test(`manual pitch: ${table} read failure blocks dispatch`, async () => {
  const h = setup({ readError: table }); await h.call('admin/send-organizer-pitch', pitchBody); assert.equal(h.state.sends.length, 0);
});
test('accepted pitch exposes accounting failure independently', async () => {
  const h = setup({ writeError: 'daily_email_stats', provider: () => json({ id: 'fixture' }) });
  const { body } = await h.call('admin/send-organizer-pitch', pitchBody);
  assert.equal(body.dispatch.status, 'accepted'); assert.equal(body.accounting.status, 'failed'); assert.equal(body.bookkeeping, 'recorded');
});
for (const options of [{ env: { RESEND_API_KEY: '' } }, { provider: () => json({}) }, { readError: 'profiles' }]) {
  test(`nudge: failed/unknown/eligibility never advances timestamp ${JSON.stringify(options.env || options.readError || 'unknown')}`, async () => {
    const h = setup(options); const { body } = await h.call('admin/nudge-incomplete-onboarding', { batchAll: true });
    assert.equal(body.success, false); assert(!h.state.writes.some(w => w.table === 'profiles'));
  });
}
test('nudge acceptance and bookkeeping failure are independent', async () => {
  const h = setup({ provider: () => json({ id: 'fixture' }), writeError: 'profiles' });
  const { body } = await h.call('admin/nudge-incomplete-onboarding', { batchAll: true });
  assert.equal(body.accepted, 1); assert.equal(body.bookkeepingFailed, 1); assert.equal(body.accounting.status, 'recorded');
});
test('initialization race preserves the winning nonzero counters', async () => {
  const h = setup({ initializationRace: true }); h.state.stats = null;
  const result = await h.load('src/lib/admin/emailBudgetGuard.ts').getOrCreateTodayStats(h.db);
  assert.equal(result.total_sent, 49); assert.equal(h.state.upsertOptions.ignoreDuplicates, true);
});
for (const options of [{ readError: 'daily_email_stats' }, { writeError: 'daily_email_stats' }]) test('budget initialization never invents zero capacity after failure', async () => {
  const h = setup(options); h.state.stats = null;
  await assert.rejects(h.load('src/lib/admin/emailBudgetGuard.ts').checkEmailBudget(h.db, 'outreach', 1));
});
test('usage is read-only, partial, and never fetches a provider page as complete quota evidence', async () => {
  const h = setup(); const result = await h.load('src/lib/admin/emailBudgetGuard.ts').getTodayEmailUsageSummary(h.db);
  assert.equal(result.status, 'partial'); assert.equal(result.remaining_global, null); assert.equal(result.usage_percent, null);
  assert.equal(h.state.writes.length, 0); assert.equal(h.state.sends.length, 0);
});
test('unavailable usage is null rather than fabricated zero', async () => {
  const h = setup({ readError: 'daily_email_stats' }); const result = await h.load('src/lib/admin/emailBudgetGuard.ts').getTodayEmailUsageSummary(h.db);
  assert.equal(result.status, 'unavailable'); assert.equal(result.total_sent, null); assert.equal(result.categories.outreach, null);
});
const broadcastBody = { hackathonId: 'fixture-event', title: 'Synthetic announcement', message: 'Fixture content' };
for (const [label, options] of [
  ['missing provider', { env: { RESEND_API_KEY: '' } }], ['partial acceptance', { providers: [() => json({ id: 'fixture' }), () => json({}, 422)] }],
  ['unknown outcome', { provider: () => json({}) }], ['recipient lookup failure', { readError: 'hackathon_registrations' }],
  ['empty audience', { emptyParticipants: true }],
]) test(`broadcast: ${label} preserves announcement and never marks all emails sent`, async () => {
  const h = setup(options); const { body } = await h.call('organizer/broadcast', broadcastBody);
  assert.equal(body.success, true, 'Announcement creation remains successful'); assert.equal(body.emailSuccess, false);
  assert.equal(body.announcement.id, 'fixture-announcement'); assert(!h.state.writes.some(w => w.op === 'update' && w.table === 'hackathon_announcements'));
  if (label === 'partial acceptance') { assert.equal(body.accepted, 1); assert.equal(body.count, 1); assert.equal(body.failedCount, 1); assert.equal(body.accounting.status, 'recorded'); }
});
test('complete broadcast distinguishes provider acceptance from delivery', async () => {
  const h = setup({ provider: () => json({ id: 'fixture' }) }); const { body } = await h.call('organizer/broadcast', broadcastBody);
  assert.equal(body.emailSuccess, true); assert.equal(body.bookkeeping, 'recorded'); assert.equal(body.accepted, 2); assert.match(body.message, /Delivery is not confirmed/);
});
for (const options of [{ env: { RESEND_API_KEY: '' } }, { provider: () => json({}) }, { provider: () => json({}, 422) }]) test('reminders never mark unaccepted messages complete', async () => {
  const h = setup(options); const { body } = await h.call('cron/reminders'); assert.equal(body.success, false);
  assert(!h.state.rpc.includes('mark_deadline_reminder_sent')); assert(!h.state.writes.some(w => w.table === 'daily_email_stats'));
});
test('accepted reminder survives bookkeeping RPC failure', async () => {
  const h = setup({ provider: () => json({ id: 'fixture' }), rpcFailure: 'mark_deadline_reminder_sent' });
  const { body } = await h.call('cron/reminders'); assert.equal(body.accepted, 1); assert.equal(body.bookkeeping, 'failed');
});
for (const options of [{}, { writeError: 'resend_webhook_events' }, { badSignature: true }]) test(`verified webhook persistence outcome ${JSON.stringify(options)}`, async () => {
  const h = setup(options); const { response, body } = await h.call('webhooks/resend', {}, { 'svix-id': 'fixture-event', 'svix-timestamp': 'fixture', 'svix-signature': 'fixture' });
  assert.equal(response.status, options.badSignature ? 401 : options.writeError ? 503 : 200);
  if (options.writeError) assert.equal(body.success, false);
  if (options.badSignature) assert.equal(h.state.writes.length, 0);
});
test('analytics database failure never becomes successful zero or 100% delivery', async () => {
  const h = setup({ readError: 'resend_webhook_events' });
  const response = await h.load('src/app/api/admin/email-analytics/route.ts').GET(new NextRequest('http://localhost/api/admin/email-analytics'));
  const body = await response.json(); assert.equal(response.status, 503); assert.equal(body.stats, null); assert.equal(body.status, 'unavailable');
});
test('analytics sample exposes events without inventing rates', async () => {
  const h = setup(); const response = await h.load('src/app/api/admin/email-analytics/route.ts').GET(new NextRequest('http://localhost/api/admin/email-analytics'));
  const body = await response.json(); assert.equal(body.status, 'partial'); assert.equal(body.stats.delivered, 1); assert.equal(body.stats.deliveryRate, 'Unavailable');
});
for (const [route, body, headers] of [
  ['send-email', { senderId: 'fixture-admin', recipientId: profile.id, type: 'connection_request' }, {}],
  ['webhooks/notification', { recipientEmail: profile.email, message: 'A team invitation', link: '/teams/fixture' }, { Authorization: 'Bearer offline-notification' }],
]) for (const [label, options] of [ ['missing configuration', { env: { RESEND_API_KEY: '' } }], ['invalid acknowledgment', { provider: () => json({}) }], ['accepted', { provider: () => json({ id: 'fixture' }) }] ]) {
  test(`${route}: ${label} contract`, async () => {
    const h = setup(options); const result = await h.call(route, body, headers);
    assert.equal(result.body.dispatch.status, label === 'accepted' ? 'accepted' : label === 'missing configuration' ? 'not_dispatched' : 'unknown');
    assert.equal(result.body.success, label === 'accepted');
  });
}
