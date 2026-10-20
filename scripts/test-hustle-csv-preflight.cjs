/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic CSV contract and grouping-review tests. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { preflight, core } = require('./hustle-csv-preflight.cjs');
const header = core.FIELDS.join(',');
const row = 'SYNTH-1,Synthetic One,Synthetic Leader,one@example.invalid,,Synthetic Member,member@example.invalid';
const make = rows => Buffer.from([header, ...rows].join('\r\n'));

test('canonical CSV passes without claiming identity, grouping or release approval', () => {
  const report = preflight(make([row]), { expectedTeams: 1 });
  assert.equal(report.result, 'SYNTAX_AND_COUNT_PASS_ONLY');
  assert.equal(report.participants, 2);
  assert.equal(report.humanApprovalRequired, true);
  assert.equal(JSON.stringify(report).includes('one@example.invalid'), false);
  assert.equal(JSON.stringify(report).includes('Synthetic Leader'), false);
});

test('UTF-8 BOM digest matches browser File.text, quoted commas and explicit aliases are supported', async () => {
  const mapping = Object.fromEntries(core.FIELDS.map((field, i) => [i ? field : 'Official team code', field]));
  const bytes = Buffer.from('\uFEFF' + header.replace('team_id', 'Official team code') + '\r\nsynth-1,"Synthetic, One",Leader,ONE@example.invalid,,,\r\n');
  const report = preflight(bytes, { mapping, expectedTeams: 1 });
  assert.equal(report.result, 'SYNTAX_AND_COUNT_PASS_ONLY');
  assert.equal(report.previewDigest, core.previewCsv(await new Blob([bytes]).text(), mapping).digest);
});

for (const [label, bytes] of [
  ['duplicate headers', Buffer.from(header.replace('team_name', 'team_id') + '\n' + row)],
  ['unknown headers', Buffer.from(header.replace('team_id', 'Sno') + '\n' + row)],
  ['eight-column master', Buffer.from(header + ',College\n' + row + ',Synthetic College')],
  ['participant list without official grouping', Buffer.from('Sno,Name,Phone number,Gmail,College name\n1,Synthetic Leader,,one@example.invalid,Synthetic College')],
  ['missing team ID', make([row.replace('SYNTH-1', '')])],
  ['missing leader', make([row.replace('Synthetic Leader', '')])],
  ['missing required email', make([row.replace('one@example.invalid', '')])],
  ['normalized duplicate ID', make([row, 'synth-1,Synthetic Two,Leader Two,two@example.invalid,,,'])],
  ['normalized duplicate email', make([row, 'SYNTH-2,Synthetic Two,Leader Two,ONE@example.invalid,,,'])],
  ['duplicate normalized phone', make([row.replace('invalid,,', 'invalid,+12025550100,'), 'SYNTH-2,Synthetic Two,Leader Two,two@example.invalid,+1 (202) 555-0100,,'])],
  ['same leader and second member email', make([row.replace('member@example.invalid', 'one@example.invalid')])],
  ['third member column', Buffer.from(header + ',third_member\n' + row + ',Third')],
  ['formula injection', make([row.replace('Synthetic One', '=SUM(1)')])],
  ['malformed quotes', make([row.replace('Synthetic One', '"Unclosed')])],
  ['unequal width', make([row + ',extra'])],
  ['invalid UTF-8', Buffer.from([0xff, 0xfe, 0])],
  ['oversized file', Buffer.alloc(512 * 1024 + 1, 65)],
]) test(label + ' fails without exposing row values', () => {
  const report = preflight(bytes, { expectedTeams: 1 });
  assert.equal(report.result, 'FAIL');
  assert.ok(report.issues.length);
  assert.equal(JSON.stringify(report).includes('one@example.invalid'), false);
});

test('repeated person name across teams is a human-review hold, not an invented identity match', () => {
  const report = preflight(make([row, 'SYNTH-2,Synthetic Two,Synthetic Member,two@example.invalid,,,']), { expectedTeams: 2 });
  assert.equal(report.structuralValid, true);
  assert.equal(report.result, 'HOLD_FOR_REVIEW');
  assert.equal(report.reviewFlags[0].code, 'GROUPING_REVIEW');
});

test('expected-count mismatch holds, while four explicitly mapped required fields remain supported', () => {
  const bytes = Buffer.from('team_id,team_name,leader_name,leader_email\nSYNTH-1,Synthetic One,Leader,one@example.invalid');
  const mapping = Object.fromEntries(core.FIELDS.slice(0, 4).map(field => [field, field]));
  assert.equal(preflight(bytes, { mapping, expectedTeams: 2 }).result, 'HOLD_FOR_REVIEW');
  assert.equal(preflight(bytes, { mapping, expectedTeams: 1 }).result, 'SYNTAX_AND_COUNT_PASS_ONLY');
});

test('a member list in a single cell is held for review and never split into invented members', () => {
  const report = preflight(make([row.replace('Synthetic Member', 'Synthetic Member A; Synthetic Member B')]), { expectedTeams: 1 });
  assert.equal(report.structuralValid, true);
  assert.equal(report.result, 'HOLD_FOR_REVIEW');
  assert.equal(report.reviewFlags[0].code, 'MEMBERSHIP_CELL_REVIEW');
  assert.equal(report.participants, 2, 'This is a field-based count, not a claim that the ambiguous group has two people');
});

test('an intentionally false semantic mapping can pass syntax but never establishes official grouping', () => {
  const bytes = Buffer.from('Sno,Name,Phone number,Gmail,College name\n1,Synthetic Person,,person@example.invalid,Synthetic College');
  const mapping = { Sno: 'team_id', Name: 'leader_name', 'Phone number': 'leader_whatsapp', Gmail: 'leader_email', 'College name': 'team_name' };
  const report = preflight(bytes, { mapping, expectedTeams: 1 });
  assert.equal(report.structuralValid, true, 'Parser cannot authenticate the meaning of an administrator-supplied map');
  assert.equal(report.humanApprovalRequired, true);
  assert.equal(report.result, 'SYNTAX_AND_COUNT_PASS_ONLY');
  assert.match(report.authorization, /^NONE:/);
});

test('CLI exits nonzero on invalid input and never overwrites a report or input CSV', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hustle-preflight-test-'));
  try {
    const csv = path.join(dir, 'synthetic.csv'), out = path.join(dir, 'report.json');
    fs.writeFileSync(csv, make([row]));
    const run = args => spawnSync(process.execPath, [path.join(__dirname, 'hustle-csv-preflight.cjs'), '--csv', csv, '--expected-teams', '1', ...args], { encoding: 'utf8' });
    assert.equal(run(['--out', out]).status, 0);
    assert.equal(run(['--out', out]).status, 2);
    assert.equal(run(['--out', csv]).status, 2);
    assert.equal(fs.readFileSync(csv, 'utf8'), make([row]).toString());
    fs.writeFileSync(csv, make([row.replace('SYNTH-1', '')]));
    assert.equal(run([]).status, 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
