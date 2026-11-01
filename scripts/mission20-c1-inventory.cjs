/* eslint-disable @typescript-eslint/no-require-imports -- Offline repository inventory. */
const fs = require('node:fs');
const cp = require('node:child_process');
const ts = require('typescript');
const BASE = '4818052a944451c74ae0a7d7c4572f3e7c3d0f8e';
const TABLES = ['hackathon_registrations', 'hackathons'];
const files = cp.execFileSync('git', ['ls-tree', '-r', '--name-only', BASE], { encoding: 'utf8' }).trim().split('\n');
// Reconcile all tracked text types, including Python fixture SQL, HTML and YAML.
const referencedFiles = new Set(cp.execFileSync('git', ['grep', '-I', '-l', '-w', '-e', 'hackathon_registrations', '-e', 'hackathons', BASE, '--'], { encoding: 'utf8' }).trim().split('\n').map(f => f.slice(BASE.length + 1)));
const selected = files.filter(f => /\.(?:[cm]?[jt]sx?|sql|md)$/.test(f) || referencedFiles.has(f));
const blobs = cp.execFileSync('git', ['cat-file', '--batch'], { input: selected.map(f => `${BASE}:${f}\n`).join(''), maxBuffer: 64e6 });
const texts = new Map(); let offset = 0;
for (const file of selected) {
  const end = blobs.indexOf(10, offset), header = blobs.subarray(offset, end).toString();
  const length = Number(header.split(' ').at(-1));
  if (!Number.isSafeInteger(length)) throw Error('Missing baseline blob: ' + file);
  offset = end + 1; texts.set(file, blobs.subarray(offset, offset + length).toString()); offset += length + 1;
}
const parsed = new Map(), constants = new Map();
for (const [file, text] of texts) if (/\.[cm]?[jt]sx?$/.test(file)) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('tsx') || file.endsWith('jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  parsed.set(file, source);
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const name = node.name.text; if (!constants.has(name)) constants.set(name, []);
      constants.get(name).push({ file, node: node.initializer, source });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
function resolve(node, file, source, depth = 0) {
  if (!node || depth > 5) return null;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    let value = node.head.text;
    for (const span of node.templateSpans) { const part = resolve(span.expression, file, source, depth + 1); if (typeof part !== 'string') return null; value += part + span.literal.text; }
    return value;
  }
  if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node)) return resolve(node.expression, file, source, depth + 1);
  if (ts.isIdentifier(node)) {
    const candidates = constants.get(node.text) || [];
    const own = candidates.filter(c => c.file === file), choices = own.length ? own : candidates;
    return choices.length === 1 ? resolve(choices[0].node, choices[0].file, choices[0].source, depth + 1) : null;
  }
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(n => resolve(n, file, source, depth + 1));
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'join') {
    const values = resolve(node.expression.expression, file, source, depth + 1);
    const separator = resolve(node.arguments[0], file, source, depth + 1);
    return Array.isArray(values) && values.every(v => typeof v === 'string') && typeof separator === 'string' ? values.join(separator) : null;
  }
  return null;
}
const queries = [], references = [], sqlFragments = [], otherTextContexts = [];
for (const [file, text] of texts) {
  if (!/\.(?:[cm]?[jt]sx?|sql|md)$/.test(file) && referencedFiles.has(file)) otherTextContexts.push({ file, text });
  if (file.endsWith('.sql')) {
    let position = 0;
    for (const fragment of text.split(';')) {
      if (TABLES.some(t => new RegExp(`\\b${t}\\b`).test(fragment))) sqlFragments.push({ file, line: text.slice(0, position).split('\n').length, fragment: fragment.trim() });
      position += fragment.length + 1;
    }
  }
  text.split(/\r?\n/).forEach((line, i) => {
    const tables = TABLES.filter(t => new RegExp(`\\b${t}\\b`).test(line));
    if (tables.length) references.push({ file, line: i + 1, tables, text: line.trim() });
  });
  const source = parsed.get(file); if (!source) continue;
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'from') {
      const table = resolve(node.arguments[0], file, source);
      {
        let outer = node;
        const operations = [];
        while (outer.parent && ts.isPropertyAccessExpression(outer.parent) && outer.parent.expression === outer && ts.isCallExpression(outer.parent.parent)) {
          const call = outer.parent.parent;
          operations.push({ operation: outer.parent.name.text, args: call.arguments.map(arg => arg.getText(source)),
            ...(outer.parent.name.text === 'select' ? { columns: resolve(call.arguments[0], file, source) ?? '(implicit return/default or unresolved expression; inspect exact args)' } : {}) });
          outer = call;
        }
        const joinedTables = TABLES.filter(t => operations.some(op => op.operation === 'select' && new RegExp(`\\b${t}\\b`).test(String(op.columns) + op.args.join(' '))));
        if (TABLES.includes(table) || joinedTables.length || (table === null && operations.some(op => ['select', 'insert', 'upsert', 'update', 'delete'].includes(op.operation)))) queries.push({ file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, table: table ?? `(dynamic: ${node.arguments[0]?.getText(source)})`, joinedTables, operations, expression: outer.getText(source) });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
const result = { base: BASE, tables: TABLES, scope: 'Every tracked text type containing the target names, independently reconciled with git grep; includes code, Python fixture SQL, HTML, YAML, tests, migrations, rollback, docs and ad-hoc scripts. Raw references supplement AST chains for embedded SQL/joins/dynamic calls. SQL fragments are verbatim semicolon-separated review context, not parsed/executable SQL. Other text contexts retain full embedded-query source.', queries, references, sqlFragments, otherTextContexts };
if (process.argv.includes('--check')) {
  const actual = JSON.parse(fs.readFileSync('docs/qa/mission20-c1/QUERY-INVENTORY.json', 'utf8'));
  require('node:assert/strict').deepEqual(actual, result);
  console.log(`Inventory matches ${BASE}: ${queries.length} static query chains, ${references.length} reference lines.`);
} else process.stdout.write(JSON.stringify(result, null, 2) + '\n');
