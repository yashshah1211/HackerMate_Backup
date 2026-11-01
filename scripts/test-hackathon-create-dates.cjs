/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { harness } = require('./ppt-vision-harness.cjs');

// Exercise the real form handler with in-memory hooks and database responses.
function fixture() {
  const states = [], writes = [], notices = [];
  let cursor = 0, authReads = 0;
  const passthrough = ({ children }) => children;
  const client = {
    auth: { async getUser() { authReads++; return { data: { user: { id: 'synthetic-owner' } } }; } },
    from(table) { return { insert(payload) {
      writes.push({ table, payload });
      return { select() { return { async single() { return { data: { id: 'synthetic-event' }, error: null }; } }; } };
    } }; },
  };
  const page = harness({
    react: { ...React, useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    } },
    '@/lib/supabase': { supabase: client },
    '@/components/AuthGuard': { default: passthrough },
    'next/navigation': { useRouter: () => ({ push() {} }) },
    '@/context/NotificationContext': { useNotification: () => ({ showToast: (...args) => notices.push(args) }) },
    '@/lib/colleges': { COLLEGES: [], collegeMatchesSearch: () => false },
    '@/components/system': new Proxy({}, { get: () => passthrough }),
  }).load('src/app/hackathons/create/page.tsx').default;
  function render() { cursor = 0; return page(); }
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return null;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat(Infinity)) {
      const match = find(child, predicate); if (match) return match;
    }
    return null;
  }
  function input(id, value) {
    const field = find(render(), node => node.props?.id === id);
    assert(field, id); field.props.onChange({ target: { value } });
  }
  input('hk-name', 'Synthetic date validation');
  return { input, writes, notices, get authReads() { return authReads; },
    async submit() { await find(render(), node => node.type === 'form').props.onSubmit({ preventDefault() {} }); } };
}

for (const field of ['start', 'end']) {
  for (const value of ['not-a-date', '2026-02-30', '2026-10-31T12:00:00']) {
    for (const otherPresent of [false, true]) test(`reject invalid registration ${field}: ${value}; opposite present=${otherPresent}`, async () => {
      const f = fixture();
      f.input(`hk-registration-${field}`, value);
      if (otherPresent) f.input(`hk-registration-${field === 'start' ? 'end' : 'start'}`, field === 'start' ? '2026-11-01' : '2026-10-01');
      await f.submit();
      assert.equal(f.authReads, 0, 'reject before authentication or timestamp persistence');
      assert.equal(f.writes.length, 0);
      assert.equal(f.notices.at(-1)?.[1], 'warning');
    });
  }
}
for (const [start, end, expectedStart, expectedEnd] of [
  ['2026-10-31', '', '2026-10-30T18:30:00.000Z', null],
  ['', '2026-10-31', null, '2026-10-31T18:30:00.000Z'],
  ['', '', null, null],
  ['2026-10-31', '2026-10-31', '2026-10-30T18:30:00.000Z', '2026-10-31T18:30:00.000Z'],
]) test(`persist valid inclusive registration window ${start || '(unset)'} / ${end || '(unset)'}`, async () => {
  const f = fixture(); f.input('hk-registration-start', start); f.input('hk-registration-end', end);
  await f.submit(); assert.equal(f.authReads, 1); assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].payload.registration_start, expectedStart);
  assert.equal(f.writes[0].payload.registration_end, expectedEnd);
  assert.equal(f.notices.at(-1)?.[1], 'success');
});
test('reject a reversed registration window before any database access', async () => {
  const f = fixture(); f.input('hk-registration-start', '2026-11-02'); f.input('hk-registration-end', '2026-10-31');
  await f.submit(); assert.equal(f.authReads, 0); assert.equal(f.writes.length, 0); assert.equal(f.notices.at(-1)?.[1], 'warning');
});
