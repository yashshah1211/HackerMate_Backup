/* eslint-disable @typescript-eslint/no-require-imports -- Actual SDK query serialization and pure ordering checks, no network. */
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createClient}=require('@supabase/supabase-js');
const {harness}=require('./ppt-vision-harness.cjs');
const {olderMessageFilter,mergeMessageHistory,compareMessageTime}=harness().load('src/lib/chatHistory.ts');
test('history query: actual SDK retains exact timestamp/id cursor and conversation scope',async()=>{
  let requested;
  const client=createClient('https://fixture.example.invalid','synthetic-anon',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async url=>{
    requested=new URL(url);return new Response('[]',{status:200,headers:{'content-type':'application/json'}});
  }}});
  const cursor={id:'00000000-0000-4000-8000-000000000071',created_at:'2026-11-05T10:00:00.123456+00:00'};
  const result=await client.from('messages').select('*').eq('conversation_id','00000000-0000-4000-8000-000000000001')
    .order('created_at',{ascending:false}).order('id',{ascending:false}).or(olderMessageFilter(cursor)).limit(30);
  assert.equal(result.error,null);
  assert.equal(requested.searchParams.get('order'),'created_at.desc,id.desc');
  assert.equal(requested.searchParams.get('limit'),'30');assert.equal(requested.searchParams.get('offset'),null);
  assert.equal(requested.searchParams.get('conversation_id'),'eq.00000000-0000-4000-8000-000000000001');
  assert.equal(requested.searchParams.get('or'),'(created_at.lt."2026-11-05T10:00:00.123456+00:00",and(created_at.eq."2026-11-05T10:00:00.123456+00:00",id.lt."00000000-0000-4000-8000-000000000071"))');
});
test('history ordering: microseconds, timestamp ties, offsets and realtime precedence',()=>{
  const at=created_at=>({id:'b',created_at});
  assert(compareMessageTime('2026-11-05T10:00:00.123999Z','2026-11-05T10:00:00.123Z')>0);
  assert.equal(compareMessageTime('2026-11-05T11:00:00.123456+01:00','2026-11-05T10:00:00.123456Z'),0);
  const old=at('2026-11-05T10:00:00.123456Z');
  const rows=mergeMessageHistory([old],[{...old,id:'a'}, {...old,id:'c'},at('2026-11-05T10:00:00.123455Z')],new Map([['c',null],['a',{...old,id:'a',content:'Latest'}]]));
  assert.equal(rows.map(r=>r.id).join(','),'a,b');assert.equal(rows[0].content,'Latest');
});
