/* eslint-disable @typescript-eslint/no-require-imports -- Cached TypeScript source, offline transport only. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..');
const REVISION = '5afad870388552d0198087d27037da7ac745ba2b';
const cached = process.env.HM_M05_CLI_SOURCE_DIR;
assert(cached, 'Required existing cached CLI source directory unavailable');
// Local integrity pins measured before reuse. Upstream attribution is the frozen
// QA record, not an independently authenticated content-hash manifest. See handoff.
const pins = {
  'sql-split.ts.txt': '0faf67881937a00e6a5b72d4fd065343aa7b9b3995fbc8e6d90d43efc32594b2',
  'migration-file.ts.txt': '4fee1670b2129737b42ec033a7cc61cf7598eb01bd9852a4a9988c13161c8266',
  'migration-apply.ts.txt': 'cc73a81cdf3354e6dcd10f83789adce3562fb3be9c2c6141c24a8075f8e8148e',
  'db-connection.sql-pg.layer.ts.txt': 'c3f7957301f8166be39369afc5974dd24f121de3bcc65ad01d77bd93c690d02b',
  'db-push-core.ts.txt': 'c3da04c843b4ce0d7635319bff91df68874469dc8a93bf499484344a8d6551c8',
};
const sources = Object.fromEntries(Object.entries(pins).map(([name, sha]) => {
  const bytes = fs.readFileSync(path.join(cached, name));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sha, 'Cached source changed: ' + name);
  return [name, bytes.toString('utf8')];
}));
function compile(source, imports = {}) {
  const exports = {};
  const output = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(output, {exports, TextEncoder, Error, require(name) {
    assert(Object.hasOwn(imports, name), 'Unapproved cached-module import: ' + name);
    return imports[name];
  }});
  return exports;
}
const splitter = compile(sources['sql-split.ts.txt']);
// DateTime is unused by parseMigrationContent; fail if it is accidentally invoked.
const parser = compile(sources['migration-file.ts.txt'], {'./sql-split.ts': splitter, effect: new Proxy({}, {get(){throw Error('Effect runtime unavailable');}})});
const executor = sources['migration-apply.ts.txt'];
const tree = ts.createSourceFile('migration-apply.ts', executor, ts.ScriptTarget.Latest, true);
// Execute the actual pure lexical helpers; never load the Effect executor or DB driver.
const helperEnd = executor.indexOf('const utf8ByteLength');
const helperStart = executor.indexOf('const BOM_CODE_POINT');
const helpers = compile(executor.slice(helperStart, helperEnd));
function findVariable(name) {
  let found;
  function visit(node) {
    if(ts.isVariableDeclaration(node) && node.name.getText(tree) === name) found = node;
    ts.forEachChild(node, visit);
  }
  visit(tree); assert(found, 'Missing actual CLI node ' + name); return found;
}
// This is the unmodified operations-assembly prefix from the actual flushBatch
// generator. Effect scheduling/session execution remains untested (package absent).
const flush = findVariable('flushBatch').getText(tree);
const start = flush.indexOf('const recordVersion');
const end = flush.indexOf('const base = executed;');
assert(start > 0 && end > start);
const assembly = flush.slice(start, end);
function operations(statements, restoreRole) {
  const output = compile(`export function assemble(pending, restoreRole, revertsToLoginRole, INSERT_MIGRATION_VERSION) {
    const final=true, version='20261024030634', name='mission05_evaluator_result_authority', statements=pending;
    ${assembly}
    return operations;
  }`);
  // The history SQL is a deliberately inert placeholder: migration-history.ts was
  // not cached. Actual ledger SQL/runtime correctness remains BLOCKED.
  return output.assemble(statements, restoreRole, helpers.revertsToLoginRole, 'OFFLINE_HISTORY_PLACEHOLDER');
}
const transport = sources['db-connection.sql-pg.layer.ts.txt'];
const transportTree = ts.createSourceFile('transport.ts', transport, ts.ScriptTarget.Latest, true);
const transportClass = transportTree.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'PgBatchQuery');
assert(transportClass);
const encoding = transport.slice(transport.indexOf('const encodeTextArray'), transport.indexOf('export class PgBatchQuery'));
const {PgBatchQuery} = compile(encoding + transportClass.getText(transportTree));
const migration = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261024030634_mission05_evaluator_result_authority.sql'), 'utf8');
const parsed = parser.parseMigrationContent(migration);
function wire(options={}) {
  const events = [], stream = {writable: true, cork(){events.push(['cork']);}, uncork(){events.push(['uncork']); if(options.deadOnFlush)stream.writable=false;}};
  const connection = {stream};
  for(const op of ['parse','bind','describe','execute','sync','sendCopyFail'])connection[op] = value => {
    events.push([op, value]); if(options.throwAt === op)throw Error('Synthetic transport failure');
  };
  return {connection, events};
}
for(const [name, sha] of Object.entries(pins))test('cached-source integrity pin: '+name,()=>assert.equal(createHash('sha256').update(fs.readFileSync(path.join(cached,name))).digest('hex'),sha));
test('frozen QA attributes cached CLI source to version 2.122.0 and pinned revision',()=>{
  const record = fs.readFileSync(path.join(ROOT,'docs/qa/evaluator-reliability/results.json'),'utf8');
  assert(record.includes(REVISION)); assert(record.includes('2.122.0'));
});
test('actual splitter/parser keeps corrected M1 in two transactional statements',()=>{
  assert.equal(parsed.transactionMode,'transactional'); assert.equal(parsed.statements.length,2);
  assert.match(parsed.statements[0],/SET LOCAL statement_timeout/);assert.match(parsed.statements[1],/^DO \$migration\$/);
  assert(parsed.statements.every(s=>!helpers.hasTransactionControl(s)&&!helpers.isPipelineIncompatible(s)));
});
for(const prefix of ['-- pg-delta: transaction=false\n','\ufeff-- pg-delta: transaction=false\r\n'])test('actual parser recognizes first-line nontransactional directive '+JSON.stringify(prefix),()=>assert.equal(parser.parseMigrationContent(prefix+'SELECT 1;').transactionMode,'none'));
for(const prefix of ['\n-- pg-delta: transaction=false\n','-- ordinary\n-- pg-delta: transaction=false\n','-- pg-delta: transaction=false '])test('marker-like comment preserves transactional default '+JSON.stringify(prefix),()=>assert.equal(parser.parseMigrationContent(prefix+'\nSELECT 1;').transactionMode,'transactional'));
test('actual splitter preserves dollar bodies, nested comments and quoted semicolons',()=>{
  const tokens=splitter.splitAndTrim("SELECT ';'; /* a; /* b; */ c; */ DO $x$ BEGIN RAISE NOTICE 'x;y'; END; $x$; -- tail");
  assert.equal(tokens.length,3);assert.equal(tokens[0],"SELECT ';'");
  assert(tokens[1].includes("RAISE NOTICE 'x;y'; END; $x$"));assert.equal(tokens[2],'-- tail');
});
test('actual boundary predicates distinguish authored BEGIN and rollback-to-savepoint',()=>{
  for(const sql of ['BEGIN','START TRANSACTION','COMMIT','ROLLBACK','/* x */ END'])assert(helpers.hasTransactionControl(sql));
  assert(!helpers.hasTransactionControl('ROLLBACK TO SAVEPOINT fixture')); assert(!helpers.hasTransactionControl(parsed.statements[1]));
  assert(helpers.isPipelineIncompatible('CREATE INDEX CONCURRENTLY x ON t(id)'));assert(!helpers.isPipelineIncompatible(parsed.statements[1]));
  assert.match(executor,/if \(transactionMode === "none"\) \{\s*return yield\* executeSequentially\("RESET ALL"\)/);
  assert.match(executor,/if \(statements.some\(hasTransactionControl\)\) \{\s*return yield\* executeSequentially\("ROLLBACK"\)/);
});
for(const restore of [undefined,'SET ROLE postgres'])test('actual assembly and transport put history last with one final Sync, restore='+restore,()=>{
  const ops = operations(parsed.statements,restore);assert.equal(ops.length,restore?4:3);
  assert.equal(ops.at(-1).sql,'OFFLINE_HISTORY_PLACEHOLDER');assert.equal(ops.at(-1).params[0],'20261024030634');
  assert.deepEqual(Array.from(ops.at(-1).params[2]),Array.from(parsed.statements));
  if(restore)assert.equal(ops.at(-2).sql,restore);
  const f=wire(),batch=new PgBatchQuery(ops,()=>assert.fail('Callback must await a transport response'));
  assert.equal(batch.submit(f.connection),null);assert.equal(batch.outcome,'submitted');
  assert.equal(f.events.filter(e=>e[0]==='execute').length,ops.length);
  assert.equal(f.events.filter(e=>e[0]==='sync').length,1);assert.equal(f.events.at(-2)[0],'sync');
  assert.equal(f.events.at(-1)[0],'uncork');
  assert.deepEqual(f.events.filter(e=>e[0]==='parse').map(e=>e[1].text),Array.from(ops,op=>op.sql));
});
test('actual transport encodes history statement arrays without interpolation',()=>{
  const batch=new PgBatchQuery([{sql:'placeholder',params:['v',null,["a'b",'x"y','z\\q']]}],()=>{});
  assert.deepEqual(Array.from(batch.statements[0].params),['v',null,'{"a\'b","x\\"y","z\\\\q"}']);
});
test('actual assembly does not duplicate the trailing role restore',()=>{
  const ops=operations(['RESET ROLE'],'SET ROLE postgres');assert.equal(ops.filter(op=>op.sql==='SET ROLE postgres').length,1);assert.equal(ops.at(-1).sql,'OFFLINE_HISTORY_PLACEHOLDER');
});
for(const op of ['parse','bind','describe','execute','sync'])test('actual transport surfaces '+op+' exception and poisons partial batch',()=>{
  const f=wire({throwAt:op}),batch=new PgBatchQuery(operations(parsed.statements),()=>{});
  assert.match(batch.submit(f.connection).message,/Synthetic transport failure/);assert.equal(batch.outcome,'poisoned');assert.equal(f.events.at(-1)[0],'uncork');
});
test('actual transport refuses an unwritable stream and detects flush loss',()=>{
  const f=wire();f.connection.stream.writable=false;const batch=new PgBatchQuery([],()=>{});
  assert.match(batch.submit(f.connection).message,/no longer writable/);assert.equal(batch.outcome,'unsent');assert.equal(f.events.length,0);
  assert.match(batch.submit(wire({deadOnFlush:true}).connection).message,/became unwritable/);
});
test('actual transport forwards simulated server error and completion callbacks',()=>{
  const errors=[],batch=new PgBatchQuery([],error=>errors.push(error)),failure=Error('Synthetic server refusal');
  batch.handleError(failure);assert.equal(errors[0],failure);
  batch.handleCommandComplete();batch.handleEmptyQuery();assert.equal(batch.completed,2);
  batch.handleReadyForQuery();assert.equal(errors[1],undefined);
  // These are direct handler calls, not a simulated PostgreSQL state machine or rollback test.
});
