/* eslint-disable @typescript-eslint/no-require-imports -- Offline tracking authorization regressions; no live services. */
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { test } = require('node:test');
const { NextRequest, NextResponse } = require('next/server');
const { harness } = require('./ppt-vision-harness.cjs');
const fs = require('node:fs');
const path = require('node:path');

const ID = '00000000-0000-4000-8000-0000000000ab';
const OTHER = '00000000-0000-4000-8000-000000000092';
// Public synthetic test material, never read from an environment file.
const SECRET = 'ab'.repeat(32);
const signature = id => createHmac('sha256', Buffer.from(SECRET, 'hex'))
  .update(`hackermate:email-open:v1:${id.toLowerCase()}`).digest('hex');
const signed = id => `id=${id}&sig=${signature(id)}`;
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

function setup(options = {}) {
  const state = { clients: 0, calls: [], logs: [] };
  const h = harness({
    'next/server': { NextRequest, NextResponse },
    '@supabase/supabase-js': { createClient() {
      state.clients++;
      return {
        from() { throw new Error('Tracking must use one atomic RPC, never read-modify-write'); },
        async rpc(name, args) {
          state.calls.push({ name, args });
          if (options.throwRpc) throw new Error('Synthetic database transport error');
          return { data: null, error: options.rpcError || null };
        },
      };
    } },
  }, { console: { error: (...args) => state.logs.push(args), warn: (...args) => state.logs.push(args) } });
  Object.assign(h.env, { EMAIL_OPEN_TRACKING_SECRET: SECRET,
    NEXT_PUBLIC_SUPABASE_URL: 'https://database.example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'offline-only', ...options.env });
  const call = query => h.load('src/app/api/webhooks/email-open/route.ts').GET(
    new NextRequest(`https://tracking.example.invalid/api/webhooks/email-open?${query}`));
  return { ...h, state, call };
}

async function assertGif(response) {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/gif');
  assert.equal(response.headers.get('cache-control'), 'no-store, no-cache, must-revalidate, max-age=0, proxy-revalidate');
  assert.equal(response.headers.get('pragma'), 'no-cache');
  assert.equal(response.headers.get('expires'), '0');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), GIF);
}

test('valid signed request calls only the atomic RPC and returns the original GIF', async () => {
  const h = setup(); await assertGif(await h.call(signed(ID)));
  assert.equal(h.state.clients, 1);
  assert.deepEqual(h.state.calls.map(x => [x.name, x.args.p_lead_id]), [['record_organizer_email_open', ID]]);
});

test('uppercase UUID is authenticated as the same canonical lead', async () => {
  const h = setup(); await assertGif(await h.call(signed(ID.toUpperCase())));
  assert.equal(h.state.calls[0].args.p_lead_id, ID);
});

for (const [name, query] of [
  ['old unsigned URL', `id=${ID}`], ['missing ID', `sig=${signature(ID)}`],
  ['invalid signature', `id=${ID}&sig=${'0'.repeat(64)}`],
  ['modified ID', `id=${OTHER}&sig=${signature(ID)}`],
  ['modified signature', `id=${ID}&sig=${signature(ID).slice(0, -1)}${signature(ID).endsWith('0') ? '1' : '0'}`],
  ['truncated signature', `id=${ID}&sig=${signature(ID).slice(1)}`],
  ['oversized signature', `id=${ID}&sig=${signature(ID)}00`],
  ['malformed signature', `id=${ID}&sig=${'z'.repeat(64)}`],
  ['malformed UUID even when signed', `id=not-a-uuid&sig=${signature('not-a-uuid')}`],
  ['duplicate ID', `${signed(ID)}&id=${OTHER}`],
  ['duplicate signature', `${signed(ID)}&sig=${signature(OTHER)}`],
  ['newline signature', `id=${ID}&sig=${signature(ID)}%0A`],
  ['newline UUID', `id=${ID}%0A&sig=${signature(ID + '\n')}`],
  ['NUL UUID', `id=${ID}%00&sig=${signature(ID + '\0')}`],
  ['percent-encoded duplicate ID', `${signed(ID)}&%69d=${OTHER}`],
]) test(`${name}: no privileged client or database write; identical image`, async () => {
  const h = setup(); await assertGif(await h.call(query));
  assert.equal(h.state.clients, 0); assert.equal(h.state.calls.length, 0);
});

for (const secret of [undefined, '', 'weak', 'z'.repeat(64), SECRET + '\n', ' ' + SECRET]) test(`unconfigured/invalid signing secret (${String(secret).length}): fails closed`, async () => {
  const h = setup({ env: { EMAIL_OPEN_TRACKING_SECRET: secret } });
  await assertGif(await h.call(signed(ID))); assert.equal(h.state.clients, 0);
});

for (const options of [{ rpcError: { code: '42883', message: 'Synthetic missing migration' } }, { throwRpc: true }]) {
  test(`database failure is logged but never exposed: ${JSON.stringify(options)}`, async () => {
    const h = setup(options); await assertGif(await h.call(signed(ID)));
    assert.equal(h.state.logs.length, 1); assert.equal(h.state.calls.length, 1);
    assert(!JSON.stringify(h.state.logs).includes(SECRET));
    assert(!JSON.stringify(h.state.logs).includes(signature(ID)));
  });
}

test('shared server-only pixel builder signs the canonical UUID and emits HTML-safe URL', () => {
  const h = setup(); const lib = h.load('src/lib/emailOpenTracking.ts');
  const pixel = lib.organizerTrackingPixel('https://tracking.example.invalid', ID.toUpperCase());
  assert(pixel.includes(`id=${ID}&amp;sig=${signature(ID)}`));
  assert(pixel.includes('width="1" height="1"')); assert(!pixel.includes(SECRET));
  assert.equal(lib.organizerTrackingPixel('https://tracking.example.invalid', 'bad-id'), '');
  delete h.env.EMAIL_OPEN_TRACKING_SECRET;
  assert.equal(lib.organizerTrackingPixel('https://tracking.example.invalid', ID), '');
  assert(h.state.logs.length > 0, 'Misconfiguration must be observable without blocking email sending');
});

test('five-day cleanup remains disconnected from every application runtime entry', () => {
  const root = path.resolve(__dirname, '../src');
  const references = [];
  for (const file of fs.readdirSync(root, { recursive: true }).filter(file => /\.tsx?$/.test(file))) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of source.matchAll(/\bautoRemoveUnopenedPitchedLeads\b/g)) {
      references.push({ file: file.replaceAll('\\', '/'), declaration: source.slice(Math.max(0, match.index - 22), match.index).includes('async function ') });
    }
  }
  assert.deepEqual(references, [{ file: 'lib/admin/autoSendPitches.ts', declaration: true }],
    'Do not re-enable removal based on opens that legacy pixels can no longer authenticate');
});
