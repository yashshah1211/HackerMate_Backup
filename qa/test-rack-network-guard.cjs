// Stub transports first: even a broken guard cannot send a real packet here.
(async () => {
  const { default: assert } = await import('node:assert/strict');
  const { test } = await import('node:test');
  const { default: net } = await import('node:net');
  const { default: tls } = await import('node:tls');
  const { default: dns } = await import('node:dns');
  const { default: dgram } = await import('node:dgram');
  let underlyingCalls = 0;
  const stub = () => { underlyingCalls++; throw Error('stub transport reached'); };
  net.connect = net.createConnection = net.Socket.prototype.connect = tls.connect = stub;
  for (const transport of [dns, dns.promises]) for (const method of ['lookup', 'resolve', 'resolve4', 'resolve6']) transport[method] = stub;
  dgram.createSocket = globalThis.fetch = stub;
  await import('./fixtures/rack-network-guard.mjs');
  const probes = [
    ['fetch', () => fetch('https://example.invalid')],
    ['TCP', () => net.connect({ host: 'example.invalid', port: 443 })],
    ['TLS', () => tls.connect({ host: 'example.invalid', port: 443 })],
    ['socket', () => new net.Socket().connect({ host: '192.0.2.1', port: 443 })],
    ['DNS callback', () => dns.lookup('example.invalid', () => {})],
    ['DNS promise', () => dns.promises.lookup('example.invalid')],
    ['UDP', () => dgram.createSocket('udp4')],
  ];
  for (const [name, run] of probes) test('external ' + name + ' is blocked before transport', () => {
    assert.throws(run, /Rack qualification blocked external network/); assert.equal(underlyingCalls, 0);
  });
  test('loopback fixture traffic can reach its transport', () => {
    assert.throws(() => net.connect({ host: '127.0.0.1', port: 1 }), /stub transport reached/);
    assert.equal(underlyingCalls, 1);
  });
})().catch(error => { console.error(error); process.exitCode = 1; });
