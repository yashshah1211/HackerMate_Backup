/* eslint-disable @typescript-eslint/no-require-imports -- CSV security and export regression tests. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { harness, participant, id } = require('./partner-organizer-harness.cjs');
const csv = harness().load('src/lib/partners/csv.ts');
// Independent RFC-style reader for verifying quoting and multiline fields.
function readCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  assert.equal(quoted, false, 'CSV quote must close');
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
for (const value of ['Simple', 'Last, First', 'A "quoted" name', 'Line\nTwo', 'Line\rTwo', 'Line\r\nTwo', 'यश शाह', '张伟 🧑🏽‍💻', '', 'normal = sign']) test(`CSV roundtrips ${JSON.stringify(value)}`, () => {
  assert.equal(readCsv(csv.csvCell(value) + '\r\n')[0][0], value);
});
for (const value of ['=SUM(A1:A2)', '+cmd', '-1+1', '@something', ' =SUM(1)', '\t=SUM(1)', '\r+cmd', '\n-1+1', '\uFEFF@something', '\u0000=SUM(1)', '\u001b+cmd', '\tplain', '\nplain']) test(`CSV neutralizes formula/control prefix ${JSON.stringify(value)}`, () => {
  assert.equal(readCsv(csv.csvCell(value) + '\r\n')[0][0], `'${value}`);
});
test('CSV fixed header has UTF-8 BOM and seven approved columns', () => { assert(csv.PARTICIPANT_CSV_HEADER.startsWith('\uFEFF')); assert.equal(readCsv(csv.PARTICIPANT_CSV_HEADER)[0].length, 7); assert(!csv.PARTICIPANT_CSV_HEADER.toLowerCase().includes('email')); });
test('CSV serializes declared skill and event-team arrays only, ignoring all protected properties', () => {
  const row = participant(1, { full_name: 'यश, "Shah"', college: null, skills: ['react', 'sql'], event_teams: [{ team_id: id(3001), team_name: 'Alpha', email: 'PRIVATE_TEAM_EMAIL' }, { team_id: id(3002), team_name: 'Beta' }] });
  const text = csv.participantCsvRow(row); const values = readCsv(text)[0];
  assert.deepEqual(values, ['यश, "Shah"', '', 'react; sql', 'confirmed', 'Yes', 'Alpha; Beta', row.created_at]);
  assert(!text.includes('PRIVATE_')); assert(!text.includes(row.user_id)); assert(!text.includes(id(3001)));
});
test('CSV neutralizes dangerous content in each participant-controlled output column', () => {
  const row = participant(1, { full_name: '=SUM(1)', college: '+cmd', skills: ['-1+1'], event_teams: [{ team_id: id(3001), team_name: '@something' }] });
  const cells = readCsv(csv.participantCsvRow(row))[0];
  assert.equal(cells[0], "'=SUM(1)"); assert.equal(cells[1], "'+cmd"); assert.equal(cells[2], "'-1+1"); assert.equal(cells[5], "'@something");
});
for (const size of [0, 1, 101, 500, 1005]) test(`export returns every matching participant for ${size} rows`, async () => {
  const rows = Array.from({ length: size }, (_, n) => participant(n + 1)); const h = harness({ rows });
  const response = await h.call('export'); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('content-type'), 'text/csv; charset=utf-8'); assert.equal(response.headers.get('x-export-scope'), 'all-matching-filters'); assert.equal(response.headers.get('x-export-row-count'), String(size)); assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('content-disposition'), /^attachment; filename="partner-participants-filtered-\d{4}-\d{2}-\d{2}\.csv"$/);
  const text = await response.text(), records = readCsv(text); assert.equal(records.length, size + 1); assert(records.every(row => row.length === 7)); assert(!text.includes('PRIVATE_'));
  const calls = h.state.rpcs.filter(rpc => rpc.name === 'list_partner_organizer_participants');
  const chunks = Math.max(1, Math.ceil(size / 100)); assert.equal(calls.length, chunks + 1);
  assert.deepEqual(calls.slice(0, -1).map(rpc => rpc.args.p_offset), Array.from({ length: chunks }, (_, n) => n * 100));
  assert(calls.slice(0, -1).every(rpc => rpc.args.p_limit === 100)); assert.equal(calls.at(-1).args.p_limit, 1);
});
test('filtered export includes all matching pages with no filter/slug text in filename', async () => {
  const rows = Array.from({ length: 505 }, (_, n) => participant(n + 1)); const h = harness({ rows });
  const response = await h.call('export', 'skill=react&college=College%20A&lookingForTeam=true&sort=name_asc');
  assert.equal(response.status, 200); assert.equal(response.headers.get('x-export-row-count'), '253'); assert.equal(readCsv(await response.text()).length, 254); assert(!response.headers.get('content-disposition').includes('fixture-event')); assert(!response.headers.get('content-disposition').includes('College'));
  assert(h.state.rpcs.filter(rpc => rpc.name === 'list_partner_organizer_participants').every(rpc => rpc.args.p_skill === 'react' && rpc.args.p_college === 'College A' && rpc.args.p_looking_for_team === true && rpc.args.p_sort === 'name_asc'));
});
for (const query of ['page=1', 'pageSize=50', 'section=participants', 'search=a&search=b', 'sort=email', 'status=attended', 'lookingForTeam=yes', 'recruiting=true']) test(`export rejects unsupported/ambiguous query ${query}`, async () => {
  const h = harness(); const response = await h.call('export', query); assert.equal(response.status, 400); assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.equal(h.state.projectionCalls, 0);
});
for (const errorOnCall of [1, 2, 3]) test(`RPC failure on export call ${errorOnCall} never yields partial/empty CSV`, async () => {
  const h = harness({ rows: Array.from({ length: 101 }, (_, n) => participant(n + 1)), projectionError: { code: 'XX000', message: 'PRIVATE_SQL_DETAIL' }, errorOnCall });
  const response = await h.call('export'); assert.equal(response.status, 500); assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert(response.headers.get('content-type').includes('application/json')); assert.equal(response.headers.get('content-disposition'), null); assert(!(await response.text()).includes('PRIVATE_'));
});
test('revocation between chunks denies export through independent RPC checks', async () => {
  const h = harness({ rows: Array.from({ length: 101 }, (_, n) => participant(n + 1)), projectionError: { code: '42501' }, errorOnCall: 2 });
  const response = await h.call('export'); assert.equal(response.status, 403); assert.equal(response.headers.get('content-disposition'), null);
});
test('export above 10,000 rows returns resource error before generating any file', async () => {
  const h = harness({ rows: Array.from({ length: 10001 }, (_, n) => participant(n + 1)) }); const response = await h.call('export'); assert.equal(response.status, 413); assert.equal(h.state.projectionCalls, 1); assert.equal(response.headers.get('content-disposition'), null);
});
test('export above 8 MiB returns resource error, not truncated CSV', async () => {
  const h = harness({ rows: [participant(1, { full_name: 'a'.repeat(8 * 1024 * 1024) })] }); const response = await h.call('export'); assert.equal(response.status, 413); assert.equal(response.headers.get('content-disposition'), null);
});
test('changing filtered total between chunks requires retry', async () => {
  const rows = Array.from({ length: 101 }, (_, n) => participant(n + 1));
  const h = harness({ project(name, args, call) { const total = call === 1 ? 101 : 100; return { data: { total, offset: args.p_offset, limit: args.p_limit, items: rows.slice(args.p_offset, Math.min(total, args.p_offset + args.p_limit)) }, error: null }; } });
  const response = await h.call('export'); assert.equal(response.status, 409); assert.equal(response.headers.get('content-disposition'), null);
});
test('duplicate row between export chunks requires retry instead of silent omission', async () => {
  const rows = Array.from({ length: 101 }, (_, n) => participant(n + 1));
  const h = harness({ project(name, args) { return { data: { total: 101, offset: args.p_offset, limit: args.p_limit, items: args.p_offset === 100 ? [rows[0]] : rows.slice(0, args.p_limit) }, error: null }; } });
  const response = await h.call('export'); assert.equal(response.status, 409); assert.equal(response.headers.get('content-disposition'), null);
});
test('changing total on final authority/completeness recheck requires retry', async () => {
  const h = harness({ project(name, args, call) { return { data: { total: call === 1 ? 1 : 0, offset: args.p_offset, limit: args.p_limit, items: call === 1 ? [participant(1)] : [] }, error: null }; } });
  const response = await h.call('export'); assert.equal(response.status, 409); assert.equal(response.headers.get('content-disposition'), null);
});
test('malformed capped RPC envelope fails instead of incomplete CSV success', async () => {
  const h = harness({ project: () => ({ data: { total: 1005, offset: 0, limit: 100, items: [participant(1)] }, error: null }) }); const response = await h.call('export'); assert.equal(response.status, 500); assert.equal(response.headers.get('content-disposition'), null);
});
