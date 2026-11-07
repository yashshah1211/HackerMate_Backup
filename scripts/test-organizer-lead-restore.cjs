/* eslint-disable @typescript-eslint/no-require-imports -- Offline real authorization/route contracts. */
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {setup,ID,OTHER}=require('./organizer-restore-harness.cjs');
for (const mode of ['signedOut','ordinary','authError']) for (const action of ['browse','restore'])
  test(`${mode} cannot ${action} removed leads`,async()=>{
    const h=setup({[mode]:true}); assert.equal((await h[action]()).status,403);
    assert.deepEqual(h.state.reads,[]); assert.deepEqual(h.state.rpcs,[]); assert.equal(h.state.sends,0);
  });
for (const body of [{},{leadId:null},{leadId:42},{leadId:true},{leadId:[]},{leadId:[ID]},[ID],null,'all',{all:true},{leadId:'all'},{leadIds:[ID,OTHER]},{leadId:' '+ID},{leadId:ID+'x'},{leadId:ID,status:'new'},{leadId:ID,filter:{status:'removed'}}])
  test('rejects nonscalar/bulk/unscoped request '+JSON.stringify(body),async()=>{
    const h=setup(); assert.equal((await h.restore(body)).status,400); assert.deepEqual(h.state.rpcs,[]);
  });
test('malformed JSON and query filters fail without RPC',async()=>{
  const h=setup(); assert.equal((await h.restore(undefined,'{')).status,400);
  assert.equal((await h.restore({leadId:ID},undefined,'?all=true')).status,400); assert.equal(h.state.rpcs.length,0);
});
test('one canonical UUID produces exact single-row RPC and receipt; no send',async()=>{
  const h=setup(); const r=await h.restore({leadId:ID.toUpperCase()}); assert.equal(r.status,200);
  assert.deepEqual(await r.json(),{success:true,leadId:ID,status:'restored_review'});
  assert.equal(h.state.rpcs.length,1); assert.equal(h.state.rpcs[0].name,'restore_organizer_lead');
  assert.equal(JSON.stringify(h.state.rpcs[0].args),JSON.stringify({p_lead_id:ID}));
  assert.equal(h.state.reads.length,0); assert.equal(h.state.sends,0);
});
for(const [name,opts,status] of [
  ['missing',{receipt:{outcome:'missing',lead_id:ID}},404],['conflict',{receipt:{outcome:'conflict',lead_id:ID}},409],
  ['write error',{rpcError:true},500],['transport',{rpcThrows:true},500],
  ...[null,true,[],{}, {outcome:'restored',lead_id:OTHER,status:'restored_review'},{outcome:'restored',lead_id:ID,status:'new'},{outcome:'missing',lead_id:OTHER}].map(receipt=>['unexpected '+JSON.stringify(receipt),{receipt},500]),
]) test(name+' never fabricates success or leaks details',async()=>{
  const h=setup(opts); const r=await h.restore(); assert.equal(r.status,status);
  assert(!JSON.stringify(await r.json()).includes('PRIVATE_DETAIL')); assert(!JSON.stringify(h.state.logs).includes('PRIVATE_DETAIL')); assert.equal(h.state.sends,0);
});
for(const query of ['?cursor=all','?cursor=','?cursor='+ID+'&cursor='+OTHER,'?all=true','?limit=10000','?status=new'])
  test('removed listing rejects broad/invalid query '+query,async()=>{
    const h=setup(); assert.equal((await h.browse(query)).status,400); assert.equal(h.state.reads.length,0);
  });
for(const option of ['readError','readThrows','badRead'])
  test('listing '+option+' is not an empty success',async()=>{
    const h=setup({[option]:true}); const r=await h.browse(); assert.equal(r.status,500);
    assert(!JSON.stringify(await r.json()).includes('PRIVATE_DETAIL')); assert(h.state.logs.length); assert(!JSON.stringify(h.state.logs).includes('PRIVATE_DETAIL'));
  });
test('listing is bounded, explicit-column, authorized, private and history-aware',async()=>{
  const rows=[{id:ID,title:'Synthetic prior recipient',status:'removed',pitch_sent_at:null,last_sent_to:'prior@example.invalid',open_count:2},
    {id:OTHER,title:'Active',status:'new'}];const h=setup({rows});const r=await h.browse();
  assert.equal(r.status,200); assert.equal(r.headers.get('cache-control'),'private, no-store');
  assert.deepEqual(await r.json(),{leads:[{id:ID,title:rows[0].title,pitchSentAt:null,hasLastRecipient:true,imageRequests:2}],nextCursor:null});
  assert.equal(h.state.reads[0].limit,26);assert.equal(h.state.reads[0].columns,'id,title,pitch_sent_at,last_sent_to,open_count');assert.equal(h.state.rpcs.length,0);
});
test('manual dispatch rejects review-held lead before budget or provider access',async()=>{
  const {NextRequest}=require('next/server');
  const h=setup({database:{from(){return{select(){return this;},eq(){return this;},async maybeSingle(){return{data:{id:ID,status:'restored_review',pitch_sent_at:null},error:null};}};}}});
  const r=await h.load('src/app/api/admin/send-organizer-pitch/route.ts').POST(new NextRequest('http://localhost/api/admin/send-organizer-pitch',{method:'POST',body:JSON.stringify({leadId:ID,recipientEmail:'test@example.invalid',subject:'Synthetic',contentHtml:'Synthetic'})}));
  assert.equal(r.status,409); assert.equal(h.state.sends,0);
});
