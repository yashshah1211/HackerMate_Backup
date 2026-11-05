/* eslint-disable @typescript-eslint/no-require-imports -- Actual production UI with isolated synthetic providers. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mount } = require('./mission02-ui-fixture.cjs');

test('DM unread state: rejected read receipt retains unread count and logs the actual failure', async t => {
  const error = { code: '42501', message: 'Synthetic read receipt denied' };
  const f = await mount(t, 'messages', { onRpc: name => Promise.resolve(name === 'get_my_dm_conversations' ?
    { data: [{ conversation_id: 'one', other_user_id: 'other', last_message: 'Preview', unread_count: 3 }], error: null } : { data: null, error }) });
  assert(f.state.errors.some(args => args.includes(error)), 'Actual receipt failure is logged');
  assert(f.dom.window.document.querySelector('[data-unread-count="3"]'), 'Current DOM retains the unread badge');
});
