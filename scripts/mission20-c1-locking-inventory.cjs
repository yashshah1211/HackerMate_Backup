/* eslint-disable @typescript-eslint/no-require-imports -- Reuse immutable repository inventory, no database. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let source=fs.readFileSync('scripts/mission20-c1-inventory.cjs','utf8');
const replacements=[
  ["const BASE = '4818052a944451c74ae0a7d7c4572f3e7c3d0f8e';","const BASE = 'f7845bc5993a8145782b1d614c62a391c1012081';"],
  ["const TABLES = ['hackathon_registrations', 'hackathons'];","const TABLES = ['team_members', 'teams', 'conversations', 'conversation_participants'];"],
];
for(const [before,after] of replacements){assert.equal(source.split(before).length,2,'Inventory adapter anchor drift');source=source.replace(before,after);}
let text='';
vm.runInNewContext(source,{require,Buffer,console,process:{argv:[],stdout:{write:value=>{text+=value;}}}});
const full=JSON.parse(text);
const result={base:full.base,tables:full.tables,scope:'All API chains including projections and writes, plus verbatim historical SQL review contexts. Derived text/reference duplicates omitted; not a live catalog or SQL parser.',queries:full.queries,sqlFragments:full.sqlFragments};
if(process.argv.includes('--check')){
  assert.deepEqual(JSON.parse(fs.readFileSync('docs/qa/mission20-c1/LOCK-QUERY-INVENTORY.json','utf8')),result);
  console.log(`Lock inventory matches ${full.base}: ${result.queries.length} API chains / ${result.sqlFragments.length} SQL contexts.`);
}else process.stdout.write(JSON.stringify(result,null,2)+'\n');
