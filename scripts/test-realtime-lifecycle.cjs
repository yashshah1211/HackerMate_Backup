/* eslint-disable @typescript-eslint/no-require-imports -- Offline installed-SDK regression. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { RealtimeClient } = require('@supabase/realtime-js');
const { harness } = require('./ppt-vision-harness.cjs');

test('installed SDK reconnects the original subscription without a second join or duplicate handlers', async t => {
  const sockets = [], manualTimers = [], statuses = [];
  let deliveries = 0, subscriptions = 0, removals = 0;
  class OfflineSocket {
    constructor() {
      this.readyState = 0; sockets.push(this);
      queueMicrotask(() => { this.readyState = 1; this.onopen?.({}); });
    }
    send(frame) {
      const [join, ref, topic, event, payload] = JSON.parse(frame);
      if (event === 'phx_join' || event === 'phx_leave') queueMicrotask(() => {
        if (this.readyState !== 1) return;
        const response = event === 'phx_join' ? { postgres_changes: (payload.config.postgres_changes || []).map((filter, i) => ({ ...filter, id: i + 1 })) } : {};
        this.onmessage?.({ data: JSON.stringify([join, ref, topic, 'phx_reply', { status: 'ok', response }]) });
      });
    }
    close() { this.readyState = 3; this.onclose?.({ code: 1000, wasClean: true }); }
    drop() { this.readyState = 3; this.onclose?.({ code: 1006, wasClean: false }); }
    broadcast(topic) { this.onmessage?.({ data: JSON.stringify([null, null, topic, 'broadcast', { event: 'probe', payload: {} }]) }); }
  }
  const client = new RealtimeClient('ws://synthetic.invalid/socket', { transport: OfflineSocket,
    params: { apikey: 'synthetic-offline-key' }, reconnectAfterMs: () => 10, heartbeatIntervalMs: 60000, timeout: 100 });
  const raw = { removeChannel(channel) { removals++; return client.removeChannel(channel); } };
  const { subscribeWithRetry } = harness({ '@supabase/ssr': { createBrowserClient: () => raw } }, {
    setTimeout: fn => { manualTimers.push(fn); return manualTimers.length; }, clearTimeout() {},
  }).load('src/lib/supabase.ts');
  const channel = client.channel('synthetic-reconnect').on('broadcast', { event: 'probe' }, () => deliveries++);
  const subscribe = channel.subscribe.bind(channel);
  channel.subscribe = (...args) => { subscriptions++; return subscribe(...args); };
  const stop = subscribeWithRetry(channel, status => statuses.push(status));
  t.after(() => { stop(); channel.teardown(); client.disconnect(); });
  async function joined(count) {
    const deadline = Date.now() + 2000;
    while (statuses.filter(s => s === 'SUBSCRIBED').length < count && Date.now() < deadline) await new Promise(r => setTimeout(r, 10));
    assert.equal(statuses.filter(s => s === 'SUBSCRIBED').length, count);
  }
  await joined(1);
  for (let i = 0; i < 2; i++) {
    sockets.at(-1).drop();
    assert.equal(manualTimers.length, 0, 'SDK owns reconnect: no unsubscribe/re-subscribe timer');
    await joined(i + 2);
    sockets.at(-1).broadcast(channel.topic);
    assert.equal(deliveries, i + 1, 'one event produces one callback after each reconnect');
  }
  assert.equal(subscriptions, 1);
  const beforeStop = statuses.length;
  stop(); stop();
  await new Promise(r => setTimeout(r, 30));
  assert.equal(removals, 1, 'cleanup is idempotent');
  assert.equal(statuses.length, beforeStop, 'closed/stale callbacks are suppressed');
  assert.equal(client.getChannels().length, 0);
});
