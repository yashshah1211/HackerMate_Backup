/* eslint-disable @typescript-eslint/no-require-imports -- Actual production UI with isolated synthetic providers. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mount, message, deferred } = require('./mission02-ui-fixture.cjs');

test('chat identity: old conversation response cannot replace the current thread', async t => {
  const old = deferred();
  const f = await mount(t, 'chat', { onQuery: q => q.table === 'messages' && q.filters.some(([key, value]) => key === 'conversation_id' && value === 'one') ? old.promise : undefined });
  await f.render({ conversationId: 'two' });
  assert(f.text().includes('two private message'));
  await f.flush(() => old.resolve({ data: [message('one')], error: null }));
  assert(!f.text().includes('one private message')); assert(f.text().includes('two private message'));
});

test('chat identity: switching threads immediately clears the old private draft', async t => {
  const f = await mount(t, 'chat');
  await f.flush(() => f.input().onChange({ target: { value: 'Private draft for one' } }));
  await f.render({ conversationId: 'two' });
  assert.equal(f.input().value, '');
});

test('chat send: repeated Enter while pending authorizes only one write', async t => {
  const send = deferred(); const f = await mount(t, 'chat', { onRpc: name => name === 'send_message_with_mentions' ? send.promise : Promise.resolve({ data: null, error: null }) });
  await f.flush(() => f.input().onChange({ target: { value: 'One message' } }));
  await f.flush(() => { const handler = f.input().onKeyDown; handler({ key: 'Enter', preventDefault() {} }); handler({ key: 'Enter', preventDefault() {} }); });
  try { assert.equal(f.state.rpc.filter(r => r.name === 'send_message_with_mentions').length, 1); }
  finally { await f.flush(() => send.resolve({ data: 'message', error: null })); }
});

test('chat send: successful pending send cannot erase a newer draft', async t => {
  const send = deferred(); const f = await mount(t, 'chat', { onRpc: name => name === 'send_message_with_mentions' ? send.promise : Promise.resolve({ data: null, error: null }) });
  await f.flush(() => f.input().onChange({ target: { value: 'First message' } }));
  await f.flush(() => f.input().onKeyDown({ key: 'Enter', preventDefault() {} }));
  await f.flush(() => f.input().onChange({ target: { value: 'Next unsent draft' } }));
  await f.flush(() => send.resolve({ data: 'message', error: null }));
  assert.equal(f.input().value, 'Next unsent draft');
});

test('chat identity: same-account refresh keeps the existing draft', async t => {
  const f = await mount(t, 'chat'); await f.flush(() => f.input().onChange({ target: { value: 'Retained draft' } }));
  await f.render({ knownProfiles: {} }); assert.equal(f.input().value, 'Retained draft');
});

test('chat identity: account change clears a draft even when conversation ID is unchanged', async t => {
  const f = await mount(t, 'chat'); await f.flush(() => f.input().onChange({ target: { value: 'Account private draft' } }));
  await f.render({ currentUserId: 'different-user' }); assert.equal(f.input().value, '');
});

test('chat identity: late subscription callbacks do not mark an old thread read', async t => {
  const f = await mount(t, 'chat'); const channel = f.state.channels.find(c => c.name === 'messages:one');
  await f.render({ conversationId: 'two' }); assert.equal(channel.removed, true);
  const before = f.state.rpc.length;
  await f.flush(() => channel.callbacks.find(c => c.filter.table === 'messages' && c.filter.event === 'INSERT').callback({ new: message('one', 'late-event') }));
  assert.equal(f.state.rpc.length, before); assert(!f.text().includes('one private message'));
});

test('chat send: rejected persistence retains the draft, logs actual error and unlocks a deliberate retry', async t => {
  const error = { code: '42501', message: 'Synthetic write denied' };
  const f = await mount(t, 'chat', { onRpc: () => Promise.resolve({ data: null, error }) });
  await f.flush(() => f.input().onChange({ target: { value: 'Unsent draft' } }));
  await f.flush(() => f.input().onKeyDown({ key: 'Enter', preventDefault() {} }));
  assert.equal(f.input().value, 'Unsent draft'); assert(f.state.errors.some(args => args.includes(error)));
  await f.flush(() => f.input().onKeyDown({ key: 'Enter', preventDefault() {} }));
  assert.equal(f.state.rpc.filter(r => r.name === 'send_message_with_mentions').length, 2);
});

for (const delayed of [false, true]) test(`chat identity cleanup: ${delayed ? 'late microphone permission' : 'active recorder'} cannot survive a switch`, async t => {
  const permission = deferred(), recorders = [], intervals = new Set(); let stopped = 0;
  const stream = { getTracks: () => [{ stop() { stopped++; } }] };
  class Recorder {
    constructor(value) { this.stream = value; this.state = 'inactive'; recorders.push(this); }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.onstop?.(); }
  }
  const f = await mount(t, 'chat', { globals: { MediaRecorder: Recorder,
    navigator: { mediaDevices: { getUserMedia: () => delayed ? permission.promise : Promise.resolve(stream) } },
    setInterval: fn => { intervals.add(fn); return fn; }, clearInterval: fn => intervals.delete(fn),
  } });
  t.after(() => { intervals.clear(); recorders.forEach(recorder => { recorder.onstop = null; recorder.stop(); }); });
  await f.flush(() => { void f.element(e => e.props.label === 'Record voice note').onClick(); });
  await f.render({ conversationId: 'two' });
  if (delayed) await f.flush(() => permission.resolve(stream));
  assert.equal(stopped, 1); assert.equal(intervals.size, 0); assert(recorders.every(recorder => recorder.state === 'inactive'));
  assert(!f.text().includes('Recording')); assert.equal(f.state.rpc.filter(r => r.name === 'send_message_with_mentions').length, 0);
});

test('chat identity cleanup: staged preview object URL is released on unmount', async t => {
  const revoked = [];
  class FixtureURL extends URL { static createObjectURL() { return 'blob:synthetic-preview'; } static revokeObjectURL(value) { revoked.push(value); } }
  const f = await mount(t, 'chat', { globals: { URL: FixtureURL } });
  await f.flush(() => f.element(e => e.type === 'input' && e.props.type === 'file').onChange({ target: { files: [{ name: 'fixture.png', type: 'image/png', size: 40 }], value: 'fixture' } }));
  await f.render({ conversationId: 'two' }); assert.deepEqual(revoked, ['blob:synthetic-preview']);
});

test('chat send: pending completion preserves a newly selected reply', async t => {
  const send = deferred(); const f = await mount(t, 'chat', { onRpc: name => name === 'send_message_with_mentions' ? send.promise : Promise.resolve({ data: null, error: null }) });
  await f.flush(() => f.input().onChange({ target: { value: 'Pending text' } }));
  await f.flush(() => f.input().onKeyDown({ key: 'Enter', preventDefault() {} }));
  await f.flush(() => f.element(e => e.props['aria-label'] === 'Reply to message').onClick());
  assert(f.text().includes('Replying to'));
  await f.flush(() => send.resolve({ data: 'saved', error: null })); assert(f.text().includes('Replying to'));
});
