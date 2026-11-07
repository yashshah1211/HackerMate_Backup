/* eslint-disable @typescript-eslint/no-require-imports -- Offline admin action security regressions. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { setup, EVENT, ADMIN } = require('./admin-hackathon-harness.cjs');

test('authorized deletion uses one narrowly scoped RPC and no independent REST deletes', async () => {
  const h = setup(); const response = await h.call();
  assert.equal(response.status, 200); assert.equal((await response.json()).success, true);
  assert.equal(h.state.rpcs.length, 1); assert.equal(h.state.rpcs[0].name, 'admin_delete_hackathon');
  assert.equal(h.state.rpcs[0].args.p_hackathon_id, EVENT); assert.equal(h.state.mutations.length, 0);
});
test('absent target is 404, never fabricated deletion success', async () => {
  const h = setup({ rpcData: false }); const response = await h.call();
  assert.equal(response.status, 404); assert.equal((await response.json()).success, undefined);
});
for (const value of [null, 1, 'true', {}, [], undefined]) test(`unexpected RPC receipt (${JSON.stringify(value)}) is not success`, async () => {
  const h = setup({ rpcData: value }); const response = await h.call();
  assert.equal(response.status, 500); assert.equal((await response.json()).success, undefined); assert(h.state.logs.length);
});
const invalid = [null, [], 'approve', {}, { action: 'delete' }, { hackathonId: EVENT }];
for (const action of [null, '', 'oops', 'Approve', 'delete ', '__proto__', true, 1, {}, [], ['delete']]) invalid.push({ hackathonId: EVENT, action });
for (const hackathonId of [null, '', 'not-a-uuid', 3, {}, [], [EVENT], EVENT + '\n', EVENT + '\0']) invalid.push({ hackathonId, action: 'delete' });
for (const body of invalid) test(`invalid body cannot read/mutate event data: ${JSON.stringify(body)}`, async () => {
  const h = setup(); const response = await h.call(body);
  assert.equal(response.status, 400); assert.equal(h.state.rpcs.length, 0);
  assert.equal(h.state.mutations.length, 0); assert.equal(h.state.queries.length, 0);
});
test('malformed JSON is a 400 without event access', async () => {
  const h = setup(); assert.equal((await h.call({}, '{')).status, 400);
  assert.equal(h.state.rpcs.length, 0); assert.equal(h.state.mutations.length, 0);
});
for (const action of ['delete', 'approve', 'reject']) {
  for (const options of [{ signedOut: true }, { ordinary: true }, { banned: true }]) test(`${action} denies ${JSON.stringify(options)} before privilege`, async () => {
    const h = setup(options); assert.equal((await h.call({ hackathonId: EVENT, action })).status, 403);
    assert.equal(h.state.clients, 0); assert.equal(h.state.rpcs.length, 0); assert.equal(h.state.mutations.length, 0); assert.equal(h.state.queries.length, 0);
  });
}
for (const [code, status] of [['23503', 409], ['42501', 500], ['XX000', 500], ['42883', 500], ['PGRST202', 500]]) test(`database ${code} fails safely`, async () => {
  const h = setup({ rpcError: { code, message: 'PRIVATE_RECORD_DETAIL', details: 'PRIVATE_RECORD_DETAIL' } });
  const response = await h.call(); assert.equal(response.status, status);
  const text = await response.text(); assert(!text.includes('PRIVATE_RECORD_DETAIL')); assert(!text.includes('success'));
  assert(h.state.logs.length); assert.equal(h.state.logs[0][1].code, code);
  assert(!JSON.stringify(h.state.logs).includes('PRIVATE_RECORD_DETAIL'), 'Logs must not serialize sensitive database records');
});
test('unexpected database exception cannot become success or disclose records', async () => {
  const h = setup({ rpcThrows: true }); const response = await h.call();
  assert.equal(response.status, 500); assert(!(await response.text()).includes('PRIVATE_RECORD_DETAIL'));
  assert(h.state.logs.length); assert(!JSON.stringify(h.state.logs).includes('PRIVATE_RECORD_DETAIL'));
});
for (const action of ['approve', 'reject']) test(`${action} preserves review context and verifies affected target`, async () => {
  const h = setup(); const response = await h.call({ hackathonId: EVENT, action }); const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.hackathon.status, action === 'approve' ? 'approved' : 'rejected');
  assert.equal(body.hackathon.ai_feedback.preserved.context, 'retained'); assert.equal(body.hackathon.ai_feedback.submitted_at, 'fixture');
  assert.equal(body.hackathon.ai_feedback.reviewed_by, ADMIN); assert(Number.isFinite(Date.parse(body.hackathon.ai_feedback.reviewed_at)));
  assert.deepEqual(Object.keys(h.state.mutations[0].payload).sort(), ['ai_feedback', 'status']); assert.equal(h.state.rpcs.length, 0);
});
test('status read failure is logged as error, not disguised as missing', async () => {
  const h = setup({ queryError: true }); assert.equal((await h.call({ hackathonId: EVENT, action: 'approve' })).status, 500); assert(h.state.logs.length);
});
test('a target disappearing before status update is 404 rather than success', async () => {
  const h = setup({ zeroUpdate: true }); assert.equal((await h.call({ hackathonId: EVENT, action: 'approve' })).status, 404);
});
