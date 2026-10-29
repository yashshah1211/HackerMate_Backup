// Child-process application guard: loopback fixtures only, never hosted services.
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import dgram from 'node:dgram';
import { syncBuiltinESMExports } from 'node:module';

const allowed = host => ['127.0.0.1', '::1', '[::1]', 'localhost'].includes(String(host));
const deny = () => { throw Error('Rack qualification blocked external network'); };
const first = args => Array.isArray(args[0]) ? args[0][0] : args[0];
function hostOf(args) {
  const a = first(args);
  if (a && typeof a === 'object') { if (a.path && !a.port) deny(); return a.hostname || a.host || 'localhost'; }
  if (typeof a === 'number') return typeof args[1] === 'string' ? args[1] : 'localhost';
  if (typeof a === 'string') return new URL(a).hostname;
  deny();
}
function secure(args) {
  const a = first(args), host = hostOf(args);
  if (allowed(host)) return;
  if (!a || typeof a !== 'object' || typeof a.lookup !== 'function' || net.isIP(host)) deny();
  const lookup = a.lookup;
  a.lookup = function(host, opts, cb) {
    return lookup.call(this, host, opts, (error, address, family) => {
      if (error) return cb(error);
      const records = Array.isArray(address) ? address : [{ address, family }];
      if (!records.length || records.some(r => !allowed(r.address))) return cb(Error('Rack qualification blocked non-loopback resolution'));
      return cb(null, address, family);
    });
  };
}
for (const [transport, method] of [[net, 'connect'], [net, 'createConnection'], [tls, 'connect']]) {
  const original = transport[method]; transport[method] = function(...args) { secure(args); return original.apply(this, args); };
}
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args) { secure(args); return connect.apply(this, args); };
for (const transport of [dns, dns.promises]) for (const method of ['lookup', 'resolve', 'resolve4', 'resolve6']) {
  const original = transport[method]; transport[method] = function(host, ...args) { if (!allowed(host)) deny(); return original.call(this, host, ...args); };
}
dgram.createSocket = deny;
const fetch = globalThis.fetch;
globalThis.fetch = function(input, ...args) {
  if (!allowed(new URL(typeof input === 'string' || input instanceof URL ? input : input.url).hostname)) deny();
  return fetch(input, ...args);
};
syncBuiltinESMExports();
