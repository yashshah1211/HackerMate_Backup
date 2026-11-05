/* eslint-disable @typescript-eslint/no-require-imports -- Actual production UI with isolated synthetic providers. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mount, deferred } = require('./mission02-ui-fixture.cjs');

test('workspace task: zero-row deletion cannot show success or remove a task', async t => {
  const f = await mount(t, 'workspace', { onQuery: q => q.table === 'team_tasks' && q.operation === 'delete' ? { data: null, error: null } : undefined });
  const button = f.element(e => e.props.label === 'Delete task task-one');
  assert(button, 'Production task delete control exists');
  await f.flush(() => button.onClick({ stopPropagation() {} }));
  await f.flush(() => { void f.state.confirmations[0].onConfirm(); });
  assert(!f.state.toasts.some(args => args[1] === 'success'));
  assert(f.text().includes('task-one'));
});

test('workspace comments: old task response cannot replace the selected task comments', async t => {
  const old = deferred();
  const f = await mount(t, 'workspace', { onQuery: q => q.table === 'team_task_comments' ? q.filters.some(([, value]) => value === 'task-one') ? old.promise :
    { data: [{ id: 'comment-two', user_id: 'me', content: 'Current task comment', created_at: '2026-11-05T10:00:00Z' }], error: null } : undefined });
  const taskButton = name => f.element(e => e.type === 'button' && e.props.children === name && e.props.onClick);
  assert(taskButton('task-one'));
  await f.flush(() => taskButton('task-one').onClick());
  await f.flush(() => taskButton('task-two').onClick());
  assert(f.text().includes('Current task comment'));
  await f.flush(() => old.resolve({ data: [{ id: 'comment-one', user_id: 'me', content: 'Wrong old task comment', created_at: '2026-11-05T10:00:00Z' }], error: null }));
  assert(!f.text().includes('Wrong old task comment')); assert(f.text().includes('Current task comment'));
});

test('workspace identity: previous team ownership cannot authorize another team route', async t => {
  const f = await mount(t, 'workspace-route'); assert(f.text().includes('Private workspace:team-one'));
  f.state.route = 'team-two'; await f.render();
  assert(!f.text().includes('Private workspace:team-two'));
  assert(f.text().includes('members-only'));
});

for (const outcome of ['error', 'deleted']) test(`workspace task: ${outcome} deletion preserves honest state and exact scope`, async t => {
  const error = { code: '42501', message: 'Synthetic deletion denied' };
  const f = await mount(t, 'workspace', { onQuery: q => q.table === 'team_tasks' && q.operation === 'delete' ?
    { data: outcome === 'deleted' ? { id: 'task-one' } : null, error: outcome === 'error' ? error : null } : undefined });
  await f.flush(() => f.element(e => e.props.label === 'Delete task task-one').onClick());
  await f.flush(() => { void f.state.confirmations[0].onConfirm(); });
  const q = f.state.queries.find(q => q.table === 'team_tasks' && q.operation === 'delete');
  assert.deepEqual(q.filters, [['id', 'task-one'], ['team_id', 'team-one']]); assert.equal(q.columns, 'id');
  if (outcome === 'error') { assert(f.text().includes('task-one')); assert(f.state.errors.some(args => args.includes(error))); }
  else { assert(!f.text().includes('task-one')); assert(f.state.toasts.some(args => args[1] === 'success')); }
});

test('workspace comments: same-task realtime reads keep the latest response and unsubscribe on selection change', async t => {
  const pending = [];
  const f = await mount(t, 'workspace', { onQuery: q => {
    if (q.table !== 'team_task_comments') return;
    const next = deferred(); pending.push(next); return next.promise;
  } });
  await f.flush(() => f.element(e => e.type === 'button' && e.props.children === 'task-one').onClick());
  const channel = f.state.channels.find(c => c.name === 'task_comments:task-one');
  await f.flush(() => channel.callbacks[0].callback());
  await f.flush(() => pending[1].resolve({ data: [{ id: 'new', content: 'Latest comment', user_id: 'me', created_at: '2026-11-05T10:00:00Z' }], error: null }));
  await f.flush(() => pending[0].resolve({ data: [], error: null })); assert(f.text().includes('Latest comment'));
  await f.flush(() => f.element(e => e.type === 'button' && e.props.children === 'task-two').onClick());
  assert.equal(channel.removed, true); const count = pending.length;
  await f.flush(() => channel.callbacks[0].callback()); assert.equal(pending.length, count);
});
