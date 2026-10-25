/* eslint-disable @typescript-eslint/no-require-imports -- Offline adversarial suite for the link-preview fetcher (Mission K1). */
// Network policy: no test reaches a non-loopback address. DNS is always mocked; real sockets only
// ever connect to 127.0.0.1 servers created here. Test transports live in this file only; the
// production module has no hook to relax its address policy.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const { Readable } = require('node:stream');
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { harness } = require('./ppt-vision-harness.cjs');

const libPath = 'src/lib/net/publicHttpFetch.ts';
const routePath = 'src/app/api/link-preview/route.ts';
const PUBLIC_V4 = '93.184.215.14';
const PUBLIC_V4_B = '8.8.4.4';
const PUBLIC_V6 = '2606:4700:4700::1111';
const PUBLIC_TEST_ADDRESSES = new Set([PUBLIC_V4, PUBLIC_V4_B, PUBLIC_V6]);
const HTML = '<html><head><title>Fixture</title></head><body>ok</body></html>';
const CAP = 120 * 1024;
/** Values created inside the vm harness have foreign prototypes; compare their JSON shape. */
const plain = value => JSON.parse(JSON.stringify(value));

/** AbortSignal whose timeout() records the requested deadline and optionally shortens it for speed. */
function deadlineSignal(seen, ms) {
  return new Proxy(AbortSignal, {
    get(target, prop) {
      if (prop === 'timeout') return requested => { seen.push(requested); return target.timeout(ms ?? requested); };
      const value = Reflect.get(target, prop);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

const nextServerStub = {
  NextResponse: { json: (body, init = {}) => ({ status: init.status ?? 200, body, headers: init.headers ?? {} }) },
};

function load(overrides, { deadlineMs } = {}) {
  const deadlines = [];
  const h = harness({ 'next/server': nextServerStub, ...overrides }, { AbortSignal: deadlineSignal(deadlines, deadlineMs) });
  return { lib: h.load(libPath), route: h.load(routePath), deadlines };
}

function callRoute(route, url) {
  return route.GET({ url: `https://hackermate.in/api/link-preview?url=${encodeURIComponent(url)}` });
}

/** Mocked DNS + http/https transports. Records every DNS query and every request reaching transport. */
function mockNet({ dns = {}, responses = [] } = {}) {
  const calls = { dns: [], requests: [] };
  const lookup = async (host, opts) => {
    calls.dns.push({ host, opts });
    const entry = typeof dns === 'function' ? dns(host, calls.dns.length) : dns[host];
    if (entry === 'hang') return new Promise(() => {});
    if (!entry) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: 'ENOTFOUND' });
    return entry;
  };
  const makeRequest = protocol => options => {
    const req = new EventEmitter();
    const record = { protocol, options, req, res: null, destroyed: false };
    calls.requests.push(record);
    req.destroy = error => {
      if (record.destroyed) return req;
      record.destroyed = true;
      if (record.res && !record.res.destroyed) record.res.destroy();
      queueMicrotask(() => req.emit('error', error || new Error('socket hang up')));
      return req;
    };
    req.end = () => queueMicrotask(() => {
      if (record.destroyed) return;
      const spec = responses.shift();
      if (!spec) { req.emit('error', new Error('Unexpected request')); return; }
      if (spec === 'hang') return;
      const res = spec.stream ? spec.stream() : Readable.from(spec.chunks ?? [Buffer.from(HTML)]);
      res.statusCode = spec.status ?? 200;
      res.headers = spec.headers ?? { 'content-type': 'text/html; charset=utf-8' };
      record.res = res;
      req.emit('response', res);
    });
    return req;
  };
  return {
    calls,
    overrides: { 'node:dns/promises': { lookup }, 'node:http': { request: makeRequest('http:') }, 'node:https': { request: makeRequest('https:') } },
  };
}

const publicDns = (extra = {}) => ({ 'example.com': [{ address: PUBLIC_V4, family: 4 }], 'www.example.com': [{ address: PUBLIC_V4, family: 4 }], ...extra });
const redirect = (location, status = 302) => ({ status, headers: { location }, chunks: [Buffer.from('moved')] });

async function rejectsWith(promise, code) {
  await assert.rejects(promise, error => { assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`); return true; });
}

function infiniteStream(intervalMs, chunk = Buffer.from('<p>') ) {
  let timer = null;
  const stream = new Readable({
    read() {
      if (timer) return;
      timer = setInterval(() => { if (!stream.destroyed) stream.push(chunk); }, intervalMs);
    },
    destroy(error, callback) { clearInterval(timer); callback(error); },
  });
  return stream;
}

if (process.argv[2] === '--socket-child') {
  runSocketChild().catch(error => { process.stdout.write(`${JSON.stringify({ fatal: String(error && error.stack || error) })}\n`); process.exitCode = 1; });
} else {
  defineTests();
}

function defineTests() {
  // ---------------------------------------------------------------- address and URL policy
  test('address policy denies every special-purpose IPv4/IPv6 range and allows global unicast', () => {
    const { lib } = load(mockNet().overrides);
    const denied = [
      '0.0.0.0', '0.1.2.3', '10.0.0.1', '100.64.0.1', '100.127.255.255', '127.0.0.1', '127.255.255.254', '169.254.169.254',
      '172.16.0.1', '172.31.255.255', '192.0.0.1', '192.0.2.1', '192.88.99.1', '192.168.1.1', '198.18.0.1', '198.19.255.255',
      '198.51.100.1', '203.0.113.1', '224.0.0.1', '239.255.255.250', '240.0.0.1', '255.255.255.255',
      '::', '::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '::127.0.0.1', '64:ff9b::7f00:1', '64:ff9b:1::1',
      '100::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'fe80::1%eth0', 'fec0::1', 'ff02::1', '2001::1', '2001:0:4136:e378::1',
      '2001:db8::1', '2002:7f00:1::1', '2002:a9fe:a9fe::1', '3fff::1', '[::1]', 'not-an-ip', '', '127.000.000.001',
    ];
    for (const address of denied) assert.equal(lib.isPublicAddress(address), false, address);
    for (const address of [PUBLIC_V4, PUBLIC_V4_B, '1.1.1.1', '172.15.255.255', '172.32.0.1', '100.63.255.255', '100.128.0.1', PUBLIC_V6, '2a00:1450:4001::200e', `[${PUBLIC_V6}]`]) {
      assert.equal(lib.isPublicAddress(address), true, address);
    }
  });

  test('forbidden schemes, credentials, ports, long URLs and internal names never reach DNS or transport', async () => {
    const forbidden = [
      'file:///etc/passwd', 'ftp://example.com/', 'gopher://example.com/', 'javascript:alert(1)', 'data:text/html,hi', 'ws://example.com/',
      'http://user:pass@example.com/', 'https://user@example.com/', 'http://example.com:8080/', 'https://example.com:80/', 'http://example.com:443/',
      'http://example.com:22/', `https://example.com/${'a'.repeat(2100)}`,
      'http://localhost/', 'http://LOCALHOST./', 'http://api.localhost/', 'http://printer.local/', 'http://metadata.google.internal/',
      'http://router.home.arpa/', 'http://intranet/', 'http://metadata/',
    ];
    for (const value of forbidden) {
      const mock = mockNet({ dns: publicDns() });
      const { lib } = load(mock.overrides);
      await rejectsWith(lib.fetchPublicHtml(new URL(value)), 'BLOCKED');
      assert.equal(mock.calls.dns.length, 0, value);
      assert.equal(mock.calls.requests.length, 0, value);
    }
  });

  test('private IPv4/IPv6 literals, including URL-normalized encodings, are blocked before transport', async () => {
    const literals = [
      'http://127.0.0.1/', 'http://127.1/', 'http://2130706433/', 'http://0x7f000001/', 'http://0177.0.0.1/', 'http://0/', 'http://0.0.0.0/',
      'http://10.1.2.3/', 'http://100.64.0.1/', 'http://169.254.169.254/latest/meta-data/', 'http://0xa9fea9fe/', 'http://172.16.0.1/',
      'http://192.168.0.1/', 'http://192.0.0.170/', 'http://198.18.0.1/', 'http://224.0.0.1/', 'http://255.255.255.255/',
      'http://[::1]/', 'http://[::]/', 'http://[::ffff:127.0.0.1]/', 'http://[::ffff:169.254.169.254]/', 'http://[64:ff9b::a9fe:a9fe]/',
      'http://[fc00::1]/', 'http://[fd00:ec2::254]/', 'http://[fe80::1]/', 'http://[ff02::1]/', 'http://[2001:db8::1]/',
      'http://[2002:7f00:1::]/', 'http://[2001:0:4136:e378:8000:63bf:3fff:fdd2]/', 'https://[::1]/',
    ];
    for (const value of literals) {
      const mock = mockNet();
      const { lib } = load(mock.overrides);
      await rejectsWith(lib.fetchPublicHtml(new URL(value)), 'BLOCKED');
      assert.equal(mock.calls.dns.length, 0, value);
      assert.equal(mock.calls.requests.length, 0, value);
    }
  });

  // ---------------------------------------------------------------- DNS validation and pinning
  test('names resolving to any private IPv4/IPv6 address are blocked before transport', async () => {
    for (const address of ['127.0.0.1', '10.0.0.5', '169.254.169.254', '100.100.100.200', '192.168.1.1', '0.0.0.0', '::1', '::ffff:127.0.0.1', 'fd00::1', 'fe80::1', '64:ff9b::a9fe:a9fe', '2002:a9fe:a9fe::1']) {
      const mock = mockNet({ dns: { 'evil.example': [{ address, family: address.includes(':') ? 6 : 4 }] } });
      const { lib } = load(mock.overrides);
      await rejectsWith(lib.fetchPublicHtml(new URL('http://evil.example/')), 'BLOCKED');
      assert.equal(mock.calls.dns.length, 1, address);
      assert.equal(mock.calls.requests.length, 0, address);
    }
  });

  test('mixed public/private answers are blocked; empty and failed DNS fail closed without transport', async () => {
    for (const answers of [
      [{ address: PUBLIC_V4, family: 4 }, { address: '127.0.0.1', family: 4 }],
      [{ address: '10.0.0.1', family: 4 }, { address: PUBLIC_V4, family: 4 }],
      [{ address: PUBLIC_V6, family: 6 }, { address: 'fd00::1', family: 6 }],
      [{ address: PUBLIC_V4, family: 4 }, { address: '::ffff:10.0.0.1', family: 6 }],
      [{ address: PUBLIC_V4, family: 0 }],
    ]) {
      const mock = mockNet({ dns: { 'mixed.example': answers } });
      const { lib } = load(mock.overrides);
      await rejectsWith(lib.fetchPublicHtml(new URL('https://mixed.example/')), 'BLOCKED');
      assert.equal(mock.calls.requests.length, 0);
    }
    for (const dns of [{ 'empty.example': [] }, {}]) {
      const mock = mockNet({ dns });
      const { lib } = load(mock.overrides);
      await rejectsWith(lib.fetchPublicHtml(new URL('https://empty.example/')), 'NETWORK');
      assert.equal(mock.calls.requests.length, 0);
    }
  });

  test('socket lookup is pinned to the validated address in both Node call styles and never re-resolves', async () => {
    for (const [answers, family] of [[[{ address: PUBLIC_V4, family: 4 }, { address: PUBLIC_V4_B, family: 4 }], 4], [[{ address: PUBLIC_V6, family: 6 }], 6]]) {
      const mock = mockNet({ dns: { 'example.com': answers }, responses: [{}] });
      const { lib } = load(mock.overrides);
      const result = await lib.fetchPublicHtml(new URL('https://example.com/page?q=1#frag'));
      assert.match(result.html, /Fixture/);
      assert.equal(mock.calls.dns.length, 1);
      assert.deepEqual(plain(mock.calls.dns[0]), { host: 'example.com', opts: { all: true, verbatim: true } });
      const { options } = mock.calls.requests[0];
      assert.equal(options.family, family);
      assert.equal(options.hostname, 'example.com');
      assert.equal(options.path, '/page?q=1');
      const expected = answers[0].address;
      options.lookup('example.com', { family }, (error, address, fam) => { assert.equal(error, null); assert.equal(address, expected); assert.equal(fam, family); });
      options.lookup('EXAMPLE.com', { all: true }, (error, list) => { assert.equal(error, null); assert.deepEqual(plain(list), [{ address: expected, family }]); });
      options.lookup('example.com', (error, address) => { assert.equal(error, null); assert.equal(address, expected); });
      options.lookup('169.254.169.254.nip.io', { family }, error => { assert.equal(error.code, 'ENOTFOUND'); });
      assert.equal(mock.calls.dns.length, 1, 'pinned lookup must not query DNS again');
    }
  });

  test('DNS rebinding cannot change a pinned connection, and re-resolution on a redirect hop is revalidated', async () => {
    let answer = PUBLIC_V4;
    const mock = mockNet({ dns: () => [{ address: answer, family: 4 }], responses: [{}] });
    const { lib } = load(mock.overrides);
    await lib.fetchPublicHtml(new URL('http://rebind.example/'));
    answer = '127.0.0.1';
    mock.calls.requests[0].options.lookup('rebind.example', { family: 4 }, (error, address) => { assert.equal(error, null); assert.equal(address, PUBLIC_V4); });

    let count = 0;
    const hop = mockNet({ dns: () => (++count === 1 ? [{ address: PUBLIC_V4, family: 4 }] : [{ address: '169.254.169.254', family: 4 }]), responses: [redirect('/second')] });
    await rejectsWith(load(hop.overrides).lib.fetchPublicHtml(new URL('http://rebind.example/first')), 'BLOCKED');
    assert.equal(hop.calls.dns.length, 2);
    assert.equal(hop.calls.requests.length, 1);
  });

  test('transport options keep TLS verification, SNI hostname, no pooling, no proxy and no forwarded credentials', async () => {
    const mock = mockNet({ dns: publicDns({ 'trailing.example.': [{ address: PUBLIC_V4, family: 4 }] }), responses: [{}, {}, {}] });
    const { lib } = load(mock.overrides);
    await lib.fetchPublicHtml(new URL('https://example.com/'));
    await lib.fetchPublicHtml(new URL('https://trailing.example./'));
    await lib.fetchPublicHtml(new URL(`https://[${PUBLIC_V6}]/`));
    const [named, trailing, literal] = mock.calls.requests;
    assert.equal(named.protocol, 'https:');
    assert.equal(named.options.servername, 'example.com');
    assert.equal(trailing.options.servername, 'trailing.example');
    assert.equal(literal.options.servername, undefined);
    assert.equal(literal.options.hostname, PUBLIC_V6);
    assert.equal(mock.calls.dns.length, 2, 'IP literals skip DNS');
    for (const { options } of mock.calls.requests) {
      assert.equal(options.port, 443);
      assert.equal(options.agent, false);
      assert.equal(options.method, 'GET');
      assert.equal(options.headers['Accept-Encoding'], 'identity');
      for (const key of ['rejectUnauthorized', 'ca', 'checkServerIdentity', 'createConnection', 'socketPath', 'auth', 'localAddress', 'insecureHTTPParser']) {
        assert.equal(Object.hasOwn(options, key), false, key);
      }
      assert.deepEqual(Object.keys(options.headers).map(key => key.toLowerCase()).sort(), ['accept', 'accept-encoding', 'user-agent']);
      assert.equal(typeof options.signal.aborted, 'boolean');
    }
    const plain = mockNet({ dns: publicDns(), responses: [{}] });
    await load(plain.overrides).lib.fetchPublicHtml(new URL('http://example.com/'));
    assert.equal(plain.calls.requests[0].protocol, 'http:');
    assert.equal(plain.calls.requests[0].options.port, 80);
  });

  // ---------------------------------------------------------------- redirects
  test('redirects into forbidden destinations are blocked after the first hop and never requested', async () => {
    const targets = [
      'http://127.0.0.1/', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data/', 'http://[::ffff:a9fe:a9fe]/', 'http://internal.example/',
      'file:///etc/passwd', 'gopher://example.com/', 'http://user:pw@example.com/', 'http://example.com:6379/', 'http://localhost/', 'http://metadata/',
    ];
    for (const location of targets) {
      for (const status of [301, 302, 303, 307, 308]) {
        const mock = mockNet({ dns: publicDns({ 'internal.example': [{ address: '10.0.0.7', family: 4 }] }), responses: [redirect(location, status), {}] });
        const { lib } = load(mock.overrides);
        await rejectsWith(lib.fetchPublicHtml(new URL('https://example.com/start')), 'BLOCKED');
        assert.equal(mock.calls.requests.length, 1, `${status} ${location}`);
        assert.equal(mock.calls.requests[0].res.destroyed, true);
      }
    }
  });

  test('valid redirects are revalidated and followed up to five hops; loops, bad locations and odd statuses fail', async () => {
    const ok = mockNet({ dns: publicDns(), responses: [redirect('/a', 301), redirect('https://www.example.com/b', 308), {}] });
    const result = await load(ok.overrides).lib.fetchPublicHtml(new URL('http://example.com/'));
    assert.equal(result.finalUrl.href, 'https://www.example.com/b');
    assert.deepEqual(ok.calls.requests.map(r => `${r.protocol}//${r.options.hostname}${r.options.path}`), ['http://example.com/', 'http://example.com/a', 'https://www.example.com/b']);
    assert.equal(ok.calls.dns.length, 3, 'every hop resolves and validates again');
    assert.ok(ok.calls.requests.slice(0, 2).every(r => r.res.destroyed), 'redirect bodies are discarded');

    const five = mockNet({ dns: publicDns(), responses: [...Array.from({ length: 5 }, (_, i) => redirect(`/hop${i}`)), {}] });
    assert.match((await load(five.overrides).lib.fetchPublicHtml(new URL('http://example.com/'))).html, /Fixture/);
    assert.equal(five.calls.requests.length, 6);

    const loop = mockNet({ dns: publicDns(), responses: Array.from({ length: 10 }, () => redirect('/loop')) });
    await rejectsWith(load(loop.overrides).lib.fetchPublicHtml(new URL('http://example.com/')), 'TOO_MANY_REDIRECTS');
    assert.equal(loop.calls.requests.length, 6);

    const missing = mockNet({ dns: publicDns(), responses: [{ status: 302, headers: {} }] });
    await rejectsWith(load(missing.overrides).lib.fetchPublicHtml(new URL('http://example.com/')), 'BAD_REDIRECT');
    const invalid = mockNet({ dns: publicDns(), responses: [{ status: 302, headers: { location: 'http://[::1' } }] });
    await rejectsWith(load(invalid.overrides).lib.fetchPublicHtml(new URL('http://example.com/')), 'BAD_REDIRECT');
    for (const status of [300, 304, 305]) {
      const odd = mockNet({ dns: publicDns(), responses: [{ status, headers: { location: 'http://127.0.0.1/', 'content-type': 'text/html' } }] });
      const res = await load(odd.overrides).lib.fetchPublicHtml(new URL('http://example.com/'));
      assert.equal(res.html, null);
      assert.equal(odd.calls.requests.length, 1);
    }
  });

  // ---------------------------------------------------------------- deadline
  test('one 4s deadline covers DNS, headers, body and every redirect hop, and releases resources', async () => {
    const real = mockNet({ dns: publicDns(), responses: [{}] });
    const loaded = load(real.overrides);
    await loaded.lib.fetchPublicHtml(new URL('http://example.com/'));
    assert.deepEqual(loaded.deadlines, [4000]);
    assert.equal(loaded.lib.PUBLIC_FETCH_DEADLINE_MS, 4000);

    const stalledDns = mockNet({ dns: { 'example.com': 'hang' } });
    let started = Date.now();
    await rejectsWith(load(stalledDns.overrides, { deadlineMs: 120 }).lib.fetchPublicHtml(new URL('http://example.com/')), 'TIMEOUT');
    assert.ok(Date.now() - started < 1500);
    assert.equal(stalledDns.calls.requests.length, 0);

    const stalledHeaders = mockNet({ dns: publicDns(), responses: ['hang'] });
    await rejectsWith(load(stalledHeaders.overrides, { deadlineMs: 120 }).lib.fetchPublicHtml(new URL('http://example.com/')), 'TIMEOUT');
    assert.equal(stalledHeaders.calls.requests[0].destroyed, true, 'request destroyed on deadline');

    const trickle = mockNet({ dns: publicDns(), responses: [{ stream: () => infiniteStream(10) }] });
    started = Date.now();
    await rejectsWith(load(trickle.overrides, { deadlineMs: 150 }).lib.fetchPublicHtml(new URL('http://example.com/')), 'TIMEOUT');
    assert.ok(Date.now() - started < 1500);
    assert.equal(trickle.calls.requests[0].res.destroyed, true, 'trickling body destroyed on deadline');

    const slowHops = mockNet({ dns: publicDns(), responses: [redirect('/1'), redirect('/2'), 'hang'] });
    await rejectsWith(load(slowHops.overrides, { deadlineMs: 150 }).lib.fetchPublicHtml(new URL('http://example.com/')), 'TIMEOUT');
    assert.equal(slowHops.calls.requests.length, 3);
  });

  // ---------------------------------------------------------------- size limits, encodings
  test('wire and decoded bytes are capped at 120 KB; oversize, bombs and unsupported encodings are contained', async () => {
    const big = Buffer.from(`<html><body>${'x'.repeat(5 * 1024 * 1024)}`);
    const plain = mockNet({ dns: publicDns(), responses: [{ headers: { 'content-type': 'text/html', 'content-length': String(big.length) }, chunks: [big.subarray(0, 70000), big.subarray(70000, 200000), big.subarray(200000)] }] });
    const r1 = await load(plain.overrides).lib.fetchPublicHtml(new URL('http://example.com/'));
    assert.equal(Buffer.byteLength(r1.html), CAP);
    assert.equal(plain.calls.requests[0].res.destroyed, true);

    const head = mockNet({ dns: publicDns(), responses: [{ stream: () => { const s = infiniteStream(5, Buffer.from('<p>more</p>')); s.push('<html><head><title>Early</title></head>'); return s; } }] });
    const r2 = await load(head.overrides).lib.fetchPublicHtml(new URL('http://example.com/'));
    assert.match(r2.html, /<\/head>/);
    assert.equal(head.calls.requests[0].res.destroyed, true, 'stops reading after </head>');

    const bomb = zlib.gzipSync(Buffer.alloc(20 * 1024 * 1024, 0x61));
    assert.ok(bomb.length < CAP);
    const gz = mockNet({ dns: publicDns(), responses: [{ headers: { 'content-type': 'text/html', 'content-encoding': 'gzip' }, chunks: [bomb] }] });
    const r3 = await load(gz.overrides).lib.fetchPublicHtml(new URL('http://example.com/'));
    assert.equal(Buffer.byteLength(r3.html), CAP, 'decoded cap enforced on a 20 MB gzip bomb');

    const noisy = zlib.gzipSync(crypto.randomBytes(400 * 1024));
    const wire = mockNet({ dns: publicDns(), responses: [{ headers: { 'content-type': 'text/html', 'content-encoding': 'gzip' }, chunks: [noisy] }] });
    const r4 = await load(wire.overrides).lib.fetchPublicHtml(new URL('http://example.com/'));
    // Random bytes decode to U+FFFD replacement characters; at most one UTF-16 unit per input byte.
    assert.ok(r4.html.length <= CAP);
    assert.equal(wire.calls.requests[0].res.destroyed, true);

    for (const [encoding, encode] of [['gzip', zlib.gzipSync], ['x-gzip', zlib.gzipSync], ['deflate', zlib.deflateSync], ['br', zlib.brotliCompressSync]]) {
      const mock = mockNet({ dns: publicDns(), responses: [{ headers: { 'content-type': 'text/html', 'content-encoding': encoding }, chunks: [encode(Buffer.from(HTML))] }] });
      assert.match((await load(mock.overrides).lib.fetchPublicHtml(new URL('http://example.com/'))).html, /Fixture/, encoding);
    }
    for (const encoding of ['compress', 'gzip, br', 'zstd']) {
      const mock = mockNet({ dns: publicDns(), responses: [{ headers: { 'content-type': 'text/html', 'content-encoding': encoding } }] });
      await rejectsWith(load(mock.overrides).lib.fetchPublicHtml(new URL('http://example.com/')), 'UNSUPPORTED_ENCODING');
      assert.equal(mock.calls.requests[0].res.destroyed, true);
    }
    const corrupt = mockNet({ dns: publicDns(), responses: [{ headers: { 'content-type': 'text/html', 'content-encoding': 'gzip' }, chunks: [Buffer.from('not gzip at all')] }] });
    await rejectsWith(load(corrupt.overrides).lib.fetchPublicHtml(new URL('http://example.com/')), 'NETWORK');

    const euro = Buffer.from('<html><head><title>Prix 10 € — café</title></head>');
    const split = euro.indexOf(Buffer.from('€')) + 1;
    const mb = mockNet({ dns: publicDns(), responses: [{ chunks: [euro.subarray(0, split), euro.subarray(split)] }] });
    assert.match((await load(mb.overrides).lib.fetchPublicHtml(new URL('http://example.com/'))).html, /Prix 10 € — café/);
  });

  test('</head> detection is linear in body size and still finds a tag split across chunks', async () => {
    // 120 K one-byte chunks: rescanning the whole buffer per chunk took ~6.6 s of CPU, so the old
    // scan would hit the 4 s deadline here (TIMEOUT) instead of returning the capped body.
    const tiny = Array.from({ length: CAP }, () => Buffer.from('a'));
    const mock = mockNet({ dns: publicDns(), responses: [{ chunks: tiny }] });
    const started = Date.now();
    const result = await load(mock.overrides).lib.fetchPublicHtml(new URL('http://example.com/'));
    const elapsed = Date.now() - started;
    assert.equal(result.html.length, CAP);
    assert.ok(elapsed < 3500, `one-byte chunks took ${elapsed} ms`);

    const split = mockNet({ dns: publicDns(), responses: [{ stream: () => {
      const s = infiniteStream(5, Buffer.from('<p>more</p>'));
      for (const part of ['<html><head><title>Split</title></h', 'ea', 'd >']) s.push(part);
      return s;
    } }] });
    const r2 = await load(split.overrides, { deadlineMs: 2000 }).lib.fetchPublicHtml(new URL('http://example.com/'));
    assert.match(r2.html, /<\/head >/);
    assert.equal(split.calls.requests[0].res.destroyed, true, 'split </head> ends the read');
  });

  test('route: crafted metadata cannot burn seconds of CPU; parsing stays bounded per tag', async () => {
    const pages = {
      'meta content/name run': '<meta ' + 'content="x" name="q" '.repeat(20000),
      'max-size meta tags': (`${'<meta ' + 'content="x" name="q" '.repeat(100)}`.slice(0, 2040) + '>').repeat(60),
      'repeated <title': '<title '.repeat(18000),
      'link rel=icon run': '<link ' + 'rel="icon" '.repeat(20000),
      'repeated <link': '<link '.repeat(20000),
      'unbalanced quotes': '<meta "xxxxxxxxxx'.repeat(7000),
    };
    for (const [label, page] of Object.entries(pages)) {
      const mock = mockNet({ dns: publicDns(), responses: [{ chunks: [Buffer.from(page.slice(0, CAP))] }] });
      const started = Date.now();
      const response = await callRoute(load(mock.overrides).route, 'https://example.com/p');
      const elapsed = Date.now() - started;
      assert.equal(response.status, 200, label);
      assert.equal(response.body.title, 'example.com', label);
      assert.ok(elapsed < 1000, `${label} took ${elapsed} ms`);
    }

    const page = `<html><head><META CONTENT="Desc > with gt" NAME="description"><meta data-x="a>b" property="og:title" content="Quoted gt">
      <TITLE lang="en"> Upper </TITLE><link type="image/x-icon" rel="shortcut icon" href="a.ico"></head></html>`;
    const mock = mockNet({ dns: publicDns(), responses: [{ chunks: [Buffer.from(page)] }] });
    const body = plain((await callRoute(load(mock.overrides).route, 'https://example.com/dir/p')).body);
    assert.equal(body.description, 'Desc > with gt');
    assert.equal(body.title, 'Upper', 'unchanged: the original regex never matched an attribute value containing >');
    assert.equal(body.favicon, 'https://example.com/dir/a.ico');
  });

  test('non-2xx and non-HTML responses are closed without reading the body', async () => {
    for (const spec of [{ status: 404, headers: { 'content-type': 'text/html' } }, { status: 500, headers: { 'content-type': 'text/html' } }, { headers: { 'content-type': 'application/octet-stream' }, stream: () => infiniteStream(5) }, { headers: {} }]) {
      const mock = mockNet({ dns: publicDns(), responses: [spec] });
      const result = await load(mock.overrides).lib.fetchPublicHtml(new URL('http://example.com/'));
      assert.equal(result.html, null);
      assert.equal(mock.calls.requests[0].res.destroyed, true);
    }
  });

  // ---------------------------------------------------------------- route behavior
  test('route: 400 for bad input, generic 403 for every forbidden destination, nothing reaches transport', async () => {
    const mock = mockNet({ dns: publicDns({ 'internal.example': [{ address: '10.0.0.1', family: 4 }] }) });
    const { route } = load(mock.overrides);
    assert.deepEqual(plain(await route.GET({ url: 'https://hackermate.in/api/link-preview' })), { status: 400, body: { error: 'Missing url parameter' }, headers: {} });
    assert.equal((await callRoute(route, 'not a url')).status, 400);
    assert.equal((await callRoute(route, 'file:///etc/passwd')).body.error, 'Unsupported protocol');
    for (const value of ['http://[::1]/', 'http://169.254.169.254/', 'http://internal.example/', 'http://localhost:3000/', 'http://example.com:8080/', 'http://a:b@example.com/']) {
      const response = await callRoute(route, value);
      assert.deepEqual(plain(response), { status: 403, body: { error: 'Destination not allowed' }, headers: {} }, value);
    }
    assert.equal(mock.calls.requests.length, 0);

    const hop = mockNet({ dns: publicDns(), responses: [redirect('http://[fd00::1]/admin')] });
    const response = await callRoute(load(hop.overrides).route, 'https://example.com/');
    assert.equal(response.status, 403);
    assert.equal(hop.calls.requests.length, 1);
  });

  test('route: legitimate previews keep the existing schema; relative links resolve against the final URL; unsafe link schemes dropped', async () => {
    const page = `<!doctype html><html><head>
      <meta property="og:title" content="HackerMate Teams">
      <meta content="Find teammates fast" property="og:description">
      <meta property="og:image" content="/img/card.png">
      <meta property="og:site_name" content="HackerMate">
      <link rel="shortcut icon" href="icons/fav.ico">
      </head><body>${'b'.repeat(1000)}</body></html>`;
    const mock = mockNet({ dns: publicDns({ 'cdn.example.net': [{ address: PUBLIC_V4_B, family: 4 }] }), responses: [redirect('https://cdn.example.net/en/'), { chunks: [Buffer.from(page)] }] });
    const response = await callRoute(load(mock.overrides).route, 'http://www.example.com/teams');
    assert.equal(response.status, 200);
    assert.equal(response.headers['Cache-Control'], 'public, s-maxage=86400, stale-while-revalidate=43200');
    assert.deepEqual(plain(response.body), {
      url: 'http://www.example.com/teams',
      domain: 'example.com',
      title: 'HackerMate Teams',
      description: 'Find teammates fast',
      image: 'https://cdn.example.net/img/card.png',
      siteName: 'HackerMate',
      favicon: 'https://cdn.example.net/en/icons/fav.ico',
    });

    const minimalPage = `<html><head><title> Plain title </title><meta name="twitter:description" content="tw desc">
      <meta name="twitter:image" content="javascript:alert(1)"><link rel="icon" href="data:image/png;base64,AAAA"></head></html>`;
    const second = mockNet({ dns: publicDns(), responses: [{ chunks: [Buffer.from(minimalPage)] }] });
    const body = (await callRoute(load(second.overrides).route, 'https://example.com/x')).body;
    assert.equal(body.title, 'Plain title');
    assert.equal(body.description, 'tw desc');
    assert.equal(body.image, null, 'javascript: image dropped');
    assert.equal(body.favicon, 'https://www.google.com/s2/favicons?domain=example.com&sz=64', 'data: favicon replaced by default');
    assert.equal(body.siteName, 'example.com');
  });

  test('route: ordinary failures keep the existing uncached fallback metadata', async () => {
    const fallback = { url: 'https://example.com/p', domain: 'example.com', title: 'example.com', description: null, image: null, siteName: 'example.com', favicon: 'https://www.google.com/s2/favicons?domain=example.com&sz=64' };
    const cases = [
      [{ dns: publicDns(), responses: [{ status: 404, headers: { 'content-type': 'text/html' } }] }, {}],
      [{ dns: publicDns(), responses: [{ headers: { 'content-type': 'image/png' } }] }, {}],
      [{ dns: {} }, {}],
      [{ dns: publicDns(), responses: ['hang'] }, { deadlineMs: 100 }],
      [{ dns: publicDns(), responses: [{ stream: () => infiniteStream(10) }] }, { deadlineMs: 100 }],
      [{ dns: publicDns(), responses: Array.from({ length: 7 }, () => redirect('/again')) }, {}],
    ];
    for (const [net, options] of cases) {
      const mock = mockNet(net);
      const response = await callRoute(load(mock.overrides, options).route, 'https://example.com/p');
      assert.equal(response.status, 200);
      assert.deepEqual(plain(response.body), fallback);
      assert.equal(response.headers['Cache-Control'], undefined);
    }
  });

  // ---------------------------------------------------------------- real loopback sockets
  test('real sockets: legitimate preview through a redirect, with the real Node lookup path pinned', async () => {
    const server = await startServer((req, res) => {
      if (req.url === '/start') { res.writeHead(302, { location: 'http://www.example.com/page' }); res.end(); return; }
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><head><meta property="og:title" content="Loopback OK"><meta property="og:image" content="/i.png"></head></html>');
    });
    try {
      const transport = loopbackTransport(server.port);
      const dns = mockNet({ dns: publicDns() });
      const { route } = load({ ...transport.overrides, 'node:dns/promises': dns.overrides['node:dns/promises'] });
      const response = await callRoute(route, 'http://example.com/start');
      assert.equal(response.status, 200);
      assert.equal(response.body.title, 'Loopback OK');
      assert.equal(response.body.image, 'http://www.example.com/i.png');
      // The test transport remaps the port, so strip it from the Host header before comparing.
      assert.deepEqual(server.hosts.map(host => host.replace(/:\d+$/, '')), ['example.com', 'www.example.com']);
      assert.equal(transport.seen.length, 2);
      for (const entry of transport.seen) {
        assert.equal(entry.lookups.length, 1, 'Node invoked the pinned lookup exactly once');
        assert.equal(entry.lookups[0].address, PUBLIC_V4);
      }
      assert.equal(dns.calls.dns.length, 2);
    } finally { await server.close(); }
  });

  test('real sockets: slow headers and trickling bodies are cut off at the deadline and the socket closes', async () => {
    const server = await startServer((req, res) => {
      if (req.url === '/silent') return; // never send headers
      res.writeHead(200, { 'content-type': 'text/html' });
      res.write('<html><body>');
      const timer = setInterval(() => res.write('.'), 20);
      res.on('close', () => clearInterval(timer));
    });
    try {
      for (const pathName of ['/silent', '/trickle']) {
        const transport = loopbackTransport(server.port);
        const dns = mockNet({ dns: publicDns() });
        const { lib } = load({ ...transport.overrides, 'node:dns/promises': dns.overrides['node:dns/promises'] }, { deadlineMs: 300 });
        const started = Date.now();
        await rejectsWith(lib.fetchPublicHtml(new URL(`http://example.com${pathName}`)), 'TIMEOUT');
        const elapsed = Date.now() - started;
        assert.ok(elapsed >= 250 && elapsed < 2000, `${pathName} elapsed ${elapsed}`);
        await server.waitForClosedSockets();
      }
    } finally { await server.close(); }
  });

  test('real sockets: oversized and compressed-bomb bodies stop at 120 KB and the socket closes early', async () => {
    const bomb = zlib.gzipSync(Buffer.alloc(30 * 1024 * 1024, 0x62));
    let written = 0;
    let completed = false;
    let closedEarly = false;
    const server = await startServer((req, res) => {
      if (req.url === '/bomb') { res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' }); res.end(bomb); return; }
      res.writeHead(200, { 'content-type': 'text/html' });
      const chunk = Buffer.alloc(16 * 1024, 0x63);
      const pump = () => {
        while (!closedEarly && written < 50 * 1024 * 1024) { written += chunk.length; if (!res.write(chunk)) { res.once('drain', pump); return; } }
        if (!closedEarly) { completed = true; res.end(); }
      };
      res.on('close', () => { if (!completed) closedEarly = true; });
      pump();
    });
    try {
      for (const pathName of ['/big', '/bomb']) {
        const transport = loopbackTransport(server.port);
        const dns = mockNet({ dns: publicDns() });
        const { lib } = load({ ...transport.overrides, 'node:dns/promises': dns.overrides['node:dns/promises'] });
        const result = await lib.fetchPublicHtml(new URL(`http://example.com${pathName}`));
        assert.equal(Buffer.byteLength(result.html), CAP, pathName);
        await server.waitForClosedSockets();
      }
      assert.equal(completed, false, 'server never finished the 50 MB body');
      assert.equal(closedEarly, true, 'server observed the client closing early');
      assert.ok(written < 50 * 1024 * 1024);
    } finally { await server.close(); }
  });

  test('real sockets in a child process: env proxies are ignored and TLS verifies the original hostname', async t => {
    const proxyHits = [];
    const proxy = await startServer(req => { proxyHits.push(req.url); req.socket.destroy(); });
    proxy.server.on('connect', (req, socket) => { proxyHits.push(`CONNECT ${req.url}`); socket.destroy(); });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'k1-tls-'));
    try {
      const tls = makeCertificates(dir);
      if (!tls) t.diagnostic('openssl unavailable: TLS cases skipped, proxy case still runs');
      const env = {
        ...process.env,
        NODE_USE_ENV_PROXY: '1',
        HTTP_PROXY: `http://127.0.0.1:${proxy.port}`,
        HTTPS_PROXY: `http://127.0.0.1:${proxy.port}`,
        http_proxy: `http://127.0.0.1:${proxy.port}`,
        https_proxy: `http://127.0.0.1:${proxy.port}`,
        NO_PROXY: '',
        no_proxy: '',
        K1_TLS_DIR: tls ? dir : '',
      };
      if (tls) env.NODE_EXTRA_CA_CERTS = path.join(dir, 'ca.pem');
      const output = await runChild(env);
      assert.equal(output.fatal, undefined, output.fatal);
      assert.equal(output.httpTitle, 'Plain HTTP via pinned socket');
      if (tls) {
        assert.equal(output.tlsTrusted.title, 'TLS OK');
        assert.equal(output.tlsTrusted.servername, 'preview.test', 'SNI carries the original hostname, not the pinned IP');
        assert.equal(output.tlsMismatch.code, 'NETWORK');
        assert.equal(output.tlsMismatch.cause, 'ERR_TLS_CERT_ALTNAME_INVALID');
        assert.equal(output.tlsUntrusted.code, 'NETWORK');
        assert.match(output.tlsUntrusted.cause, /SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER/);
        assert.equal(output.tlsUntrustedHandshakeOnly, true);
      } else {
        t.skip('TLS certificate cases skipped: openssl unavailable');
      }
      assert.deepEqual(proxyHits, [], 'no request or CONNECT reached the environment proxy');
    } finally {
      await proxy.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

// ---------------------------------------------------------------- loopback helpers
/**
 * Test-only transport: wraps real node:http/https. The production pinned lookup is still the one
 * Node calls; this wrapper only checks it returned a validated public address and then maps that
 * address (and the default port) onto a local 127.0.0.1 test server.
 */
function loopbackTransport(port) {
  const seen = [];
  const wrap = real => ({
    request(options) {
      const entry = { options, lookups: [] };
      seen.push(entry);
      const pinned = options.lookup;
      return real.request({
        ...options,
        port,
        family: 4,
        lookup(host, opts, callback) {
          pinned(host, opts, (error, address, family) => {
            const list = Array.isArray(address) ? address : [{ address, family }];
            entry.lookups.push({ host, error, address: list[0] && list[0].address });
            if (error) return callback(error);
            if (!list.every(item => PUBLIC_TEST_ADDRESSES.has(item.address))) return callback(new Error('pinned lookup returned an unvalidated address'));
            return opts && opts.all ? callback(null, [{ address: '127.0.0.1', family: 4 }]) : callback(null, '127.0.0.1', 4);
          });
        },
      });
    },
  });
  return { seen, overrides: { 'node:http': wrap(http), 'node:https': wrap(https) } };
}

function startServer(handler, tlsOptions) {
  return new Promise(resolve => {
    const hosts = [];
    const sockets = new Set();
    const server = tlsOptions ? https.createServer(tlsOptions, wrapped) : http.createServer(wrapped);
    function wrapped(req, res) { hosts.push(req.headers.host); handler(req, res); }
    server.on(tlsOptions ? 'secureConnection' : 'connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
    server.listen(0, '127.0.0.1', () => resolve({
      server,
      hosts,
      port: server.address().port,
      async waitForClosedSockets(timeoutMs = 2000) {
        const until = Date.now() + timeoutMs;
        while (sockets.size && Date.now() < until) await new Promise(r => setTimeout(r, 10));
        assert.equal(sockets.size, 0, 'client sockets were closed');
      },
      close: () => new Promise(r => { for (const socket of sockets) socket.destroy(); server.close(() => r()); }),
    }));
  });
}

function makeCertificates(dir) {
  const probe = spawnSync('openssl', ['version'], { encoding: 'utf8' });
  if (probe.status !== 0) return false;
  const run = args => {
    const result = spawnSync('openssl', args, { cwd: dir, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`openssl ${args[0]} failed: ${result.stderr || result.error}`);
  };
  const ec = ['-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '1'];
  run(['req', '-x509', ...ec, '-keyout', 'ca.key', '-out', 'ca.pem', '-subj', '/CN=K1 Offline Test CA', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign']);
  run(['req', '-x509', ...ec, '-keyout', 'leaf.key', '-out', 'leaf.pem', '-subj', '/CN=preview.test', '-CA', 'ca.pem', '-CAkey', 'ca.key', '-addext', 'subjectAltName=DNS:preview.test', '-addext', 'basicConstraints=critical,CA:FALSE', '-addext', 'extendedKeyUsage=serverAuth']);
  run(['req', '-x509', ...ec, '-keyout', 'self.key', '-out', 'self.pem', '-subj', '/CN=preview.test', '-addext', 'subjectAltName=DNS:preview.test']);
  return true;
}

function runChild(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [__filename, '--socket-child'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error(`child timed out: ${stderr}`)); }, 20000);
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('exit', () => {
      clearTimeout(timer);
      const line = stdout.trim().split('\n').pop();
      try { resolve(JSON.parse(line)); } catch { reject(new Error(`bad child output: ${stdout} ${stderr}`)); }
    });
  });
}

/** Runs in a fresh process so NODE_USE_ENV_PROXY / NODE_EXTRA_CA_CERTS apply from startup. */
async function runSocketChild() {
  const out = {};
  const dnsFor = () => mockNet({ dns: { 'example.com': [{ address: PUBLIC_V4, family: 4 }], 'preview.test': [{ address: PUBLIC_V4, family: 4 }], 'other.test': [{ address: PUBLIC_V6, family: 6 }] } });

  const plain = await startServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html><head><title>Plain HTTP via pinned socket</title></head></html>'); });
  try {
    const transport = loopbackTransport(plain.port);
    const { route } = load({ ...transport.overrides, 'node:dns/promises': dnsFor().overrides['node:dns/promises'] });
    out.httpTitle = (await callRoute(route, 'http://example.com/')).body.title;
  } finally { await plain.close(); }

  const dir = process.env.K1_TLS_DIR;
  if (dir) {
    const read = name => fs.readFileSync(path.join(dir, name));
    let servername = null;
    const trusted = await startServer((req, res) => { servername = req.socket.servername; res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html><head><title>TLS OK</title></head></html>'); }, { key: read('leaf.key'), cert: read('leaf.pem') });
    let untrustedRequests = 0;
    const untrusted = await startServer((req, res) => { untrustedRequests++; res.end('should not be reached'); }, { key: read('self.key'), cert: read('self.pem') });
    const attempt = async (port, url) => {
      const transport = loopbackTransport(port);
      const { lib } = load({ ...transport.overrides, 'node:dns/promises': dnsFor().overrides['node:dns/promises'] });
      try {
        const result = await lib.fetchPublicHtml(new URL(url));
        return { title: (/<title>([^<]*)/.exec(result.html) || [])[1] };
      } catch (error) {
        return { code: error.code, cause: error.cause && (error.cause.code || error.cause.message) };
      }
    };
    try {
      out.tlsTrusted = { ...(await attempt(trusted.port, 'https://preview.test/')), servername };
      out.tlsMismatch = await attempt(trusted.port, 'https://other.test/');
      out.tlsUntrusted = await attempt(untrusted.port, 'https://preview.test/');
      out.tlsUntrustedHandshakeOnly = untrustedRequests === 0;
    } finally {
      await trusted.close();
      await untrusted.close();
    }
  }
  process.stdout.write(`${JSON.stringify(out)}\n`);
}
