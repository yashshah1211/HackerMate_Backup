/* eslint-disable @typescript-eslint/no-require-imports -- Local-only CSV inspection, reusing the exact application parser. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..');
const parserFile = path.join(ROOT, 'src/lib/hustle-phase2/core.ts');
const parserSource = fs.readFileSync(parserFile, 'utf8');
const core = {};
vm.runInNewContext(ts.transpileModule(parserSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  { exports: core, Buffer, require: name => { if (name !== 'node:crypto') throw Error('Preflight permits only the parser crypto import'); return require(name); } }, { filename: parserFile });
const hash = value => createHash('sha256').update(value).digest('hex');

/** No network, no SDK, no environment files, no participant rows in the report. */
function preflight(bytes, { mapping = Object.fromEntries(core.FIELDS.map(field => [field, field])), expectedTeams } = {}) {
  const report = { schema: 1, sourceSha256: hash(bytes), parserSha256: hash(parserSource),
    structuralValid: false, expectedTeams: expectedTeams ?? null, totalTeams: 0, acceptedTeams: 0,
    participants: 0, previewDigest: null, issues: [], reviewFlags: [],
    humanApprovalRequired: true, authorization: 'NONE: not an import receipt or permission to import, activate or send' };
  try {
    if (bytes.length > core.MAX_CSV_BYTES) throw Error('CSV exceeds 512 KiB.');
    // Blob/File.text() removes an initial UTF-8 BOM as well. Preserve original bytes in sourceSha256.
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const preview = core.previewCsv(source, mapping);
    report.totalTeams = preview.total;
    report.acceptedTeams = preview.rows.length;
    report.participants = preview.rows.reduce((sum, row) => sum + 1 + Number(!!row.second_member_name), 0);
    report.previewDigest = preview.digest;
    report.issues = Array.from(preview.issues, issue => ({ ...issue }));
    report.structuralValid = !report.issues.length;
    if (expectedTeams !== undefined && preview.total !== expectedTeams) report.reviewFlags.push({ code: 'COUNT_MISMATCH', message: 'Team count differs from the organizer-approved expected total.' });
    const names = new Map();
    for (let index = 0; index < preview.rows.length; index++) {
      const row = preview.rows[index];
      if (row.second_member_name && /[,;|/]|\s&\s/.test(row.second_member_name)) report.reviewFlags.push({ code: 'MEMBERSHIP_CELL_REVIEW', acceptedRow: index + 1,
        field: 'second_member_name', message: 'Second-member cell contains list-style separators. Organizer must confirm exactly one person; do not split or infer membership.' });
      for (const field of ['leader_name', 'second_member_name']) {
        if (!row[field]) continue;
        const key = row[field].toLowerCase().replace(/\s+/g, ' ');
        const prior = names.get(key);
        if (prior && prior.index !== index) report.reviewFlags.push({ code: 'GROUPING_REVIEW',
          acceptedRow: index + 1, otherAcceptedRow: prior.index + 1, field,
          message: 'A person name occurs in multiple teams. Organizer must verify grouping/identity; names alone do not prove a duplicate person.' });
        else names.set(key, { index });
      }
    }
  } catch (error) {
    // Parser errors contain validation instructions, never cell contents.
    report.issues.push({ row: 0, field: 'file', message: error instanceof TypeError ? 'Export a valid UTF-8 comma-separated CSV.' : error.message });
  }
  report.result = !report.structuralValid ? 'FAIL' : report.reviewFlags.length ? 'HOLD_FOR_REVIEW' : 'SYNTAX_AND_COUNT_PASS_ONLY';
  return report;
}

function main(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    if (!['--csv', '--mapping', '--expected-teams', '--out'].includes(flag) || !args[i + 1] || Object.hasOwn(options, flag)) throw Error('Usage: node scripts/hustle-csv-preflight.cjs --csv <private.csv> --expected-teams <1..500> [--mapping <private.json>] [--out <new-report.json>]');
    options[flag] = args[i + 1];
  }
  const expectedTeams = Number(options['--expected-teams']);
  if (!options['--csv'] || !Number.isInteger(expectedTeams) || expectedTeams < 1 || expectedTeams > core.MAX_TEAMS) throw Error('Supply --csv and the organizer-approved --expected-teams count (1..500).');
  const mapping = options['--mapping'] ? JSON.parse(fs.readFileSync(options['--mapping'], 'utf8')) : undefined;
  const csvPath = path.resolve(options['--csv']);
  if (!fs.statSync(csvPath).isFile() || fs.statSync(csvPath).size > core.MAX_CSV_BYTES) throw Error('CSV must be a regular file no larger than 512 KiB.');
  const report = preflight(fs.readFileSync(csvPath), { mapping, expectedTeams });
  const output = JSON.stringify(report, null, 2) + '\n';
  if (options['--out']) fs.writeFileSync(options['--out'], output, { flag: 'wx', mode: 0o600 });
  process.stdout.write(output);
  process.exitCode = report.result === 'FAIL' ? 2 : report.result === 'HOLD_FOR_REVIEW' ? 3 : 0;
}
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch { console.error('Preflight could not complete. Check arguments, UTF-8 CSV, mapping JSON and a new writable report path. No import was attempted.'); process.exitCode = 2; }
}
module.exports = { preflight, core };
