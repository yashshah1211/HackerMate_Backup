/* eslint-disable @typescript-eslint/no-require-imports -- Mounted production UI with synthetic, controllable database outcomes. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mount, message, task, deferred } = require('./mission02-ui-fixture.cjs');
const row = n => ({ ...message('one', `m${n}`), content: `History ${n}!`, created_at: `2026-11-05T10:${String(Math.floor(n / 60)).padStart(2,'0')}:${String(n % 60).padStart(2,'0')}.123456Z` });
const page = (high, low) => Array.from({ length: high-low+1 }, (_, i) => row(high-i));
const event = (f, name, payload) => f.state.channels.find(c => c.name === 'messages:one').callbacks.find(c => c.filter.table === 'messages' && c.filter.event === name).callback(payload);
const scroller = f => f.element(e => typeof e.props.onScroll === 'function');

test('chat history: concurrent insert cannot shift an offset page or duplicate its boundary', async t => {
  const pending = deferred(); let reads = 0, requested;
  const f = await mount(t, 'chat', { onQuery: q => {
    if (q.table !== 'messages') return;
    if (++reads === 1) return { data: page(100,71), error: null };
    requested = q; return pending.promise;
  } });
  await f.flush(() => { void scroller(f).onScroll({ currentTarget: { scrollTop: 0, scrollHeight: 1000 } }); });
  await f.flush(() => event(f, 'INSERT', { new: row(101) }));
  // The database takes its page snapshot after the concurrent insert.
  await f.flush(() => pending.resolve({ data: requested.or ? page(70,41) : page(71,42), error: null }));
  assert.equal((f.text().match(/History 71!/g)||[]).length,1);
  assert(f.text().includes('History 41!'));
  assert.equal(requested.range, undefined); assert.equal(requested.limit,30);
  assert(requested.or.includes(row(71).created_at));
  assert.deepEqual(JSON.parse(JSON.stringify(requested.orders)), [['created_at',{ascending:false}],['id',{ascending:false}]]);
});

for (const change of ['INSERT','UPDATE','DELETE']) test(`chat history: pending initial snapshot preserves newer realtime ${change}`, async t => {
  const pending = deferred();
  const f = await mount(t, 'chat', { onQuery: q => q.table === 'messages' ? pending.promise : undefined });
  const newer = { ...row(change === 'INSERT' ? 101 : 100), content: 'New realtime content!' };
  await f.flush(() => event(f, change, change === 'DELETE' ? { old: { id:'m100' } } : { new:newer }));
  await f.flush(() => pending.resolve({ data:page(100,71),error:null }));
  if (change === 'DELETE') assert(!f.text().includes('History 100!'));
  else { assert(f.text().includes('New realtime content!')); if(change === 'UPDATE') assert(!f.text().includes('History 100!')); }
});

test('task writes: later intent cannot reach the server before an earlier write settles', async t => {
  const writes=[]; let persisted='todo';
  const f = await mount(t,'workspace',{onQuery:q=>{
    if(q.table!=='team_tasks')return;
    if(q.operation==='select')return{data:[{...task(),status:persisted}],error:null};
    if(q.operation!=='update')return;
    const wait=deferred(); writes.push({q,wait}); return wait.promise.then(()=>{persisted=q.value.status;return{data:{id:'task-one',...q.value},error:null};});
  }});
  const select=()=>f.element(e=>e.props['aria-label']==='Status for task-one');
  await f.flush(()=>{void select().onChange({target:{value:'in_progress'}});void select().onChange({target:{value:'completed'}});});
  try {
    assert.equal(writes.length,1,'per-task writes must serialize in user intent order');
    await f.flush(()=>writes[0].wait.resolve()); assert.equal(writes.length,2);
    await f.flush(()=>writes[1].wait.resolve());
    assert.equal(persisted,'completed');assert.equal(select().value,'completed');
    assert.deepEqual(writes[0].q.filters,[['id','task-one'],['team_id','team-one']]);
  } finally { for(const write of writes) write.wait.resolve(); await f.flush(); }
});

for(const outcome of ['zero','error','throw']) test(`task writes: ${outcome} result does not claim persistence and permits a later edit`,async t=>{
  const actual={code:'42501',message:'Synthetic update denied'};let attempts=0,persisted='todo';
  const f=await mount(t,'workspace',{onQuery:q=>{
    if(q.table!=='team_tasks')return;
    if(q.operation==='select')return{data:[{...task(),status:persisted}],error:null};
    if(q.operation!=='update')return;
    if(++attempts>1){persisted=q.value.status;return{data:{id:'task-one',...q.value},error:null};}
    if(outcome==='throw')throw actual;
    return{data:null,error:outcome==='error'?actual:null};
  }});
  const select=()=>f.element(e=>e.props['aria-label']==='Status for task-one');
  await f.flush(()=>{void select().onChange({target:{value:'in_progress'}});});
  assert.equal(select().value,'todo');assert(!f.state.toasts.some(args=>args[1]==='success'));
  assert(f.state.toasts.some(args=>args[1]==='error'));
  if(outcome!=='zero')assert(f.state.errors.some(args=>args.includes(actual)));
  await f.flush(()=>{void select().onChange({target:{value:'completed'}});});assert.equal(select().value,'completed');
});

test('task writes: a read started before the commit cannot undo the acknowledged state',async t=>{
  const pending=deferred();let reads=0,persisted='todo';
  const f=await mount(t,'workspace',{onQuery:q=>{
    if(q.table!=='team_tasks')return;
    if(q.operation==='select'&&++reads===2)return pending.promise;
    if(q.operation==='select')return{data:[{...task(),status:persisted}],error:null};
    if(q.operation==='update'){persisted=q.value.status;return{data:{id:'task-one'},error:null};}
  }});
  const channel=f.state.channels.find(c=>c.name.startsWith('team_tasks'));
  assert(channel,'task realtime subscription exists');
  await f.flush(()=>channel.callbacks[0].callback());
  await f.flush(()=>{void f.element(e=>e.props['aria-label']==='Status for task-one').onChange({target:{value:'completed'}});});
  assert.equal(f.element(e=>e.props['aria-label']==='Status for task-one').value,'completed');
  await f.flush(()=>pending.resolve({data:[task()],error:null}));
  assert.equal(f.element(e=>e.props['aria-label']==='Status for task-one').value,'completed');
});

test('task writes: late acknowledgment cannot undo another user\'s committed edit',async t=>{
  const ack=deferred();let persisted='todo';
  const f=await mount(t,'workspace',{onQuery:q=>{
    if(q.table!=='team_tasks')return;
    if(q.operation==='select')return{data:[{...task(),status:persisted}],error:null};
    if(q.operation==='update'){persisted=q.value.status;return ack.promise;}
  }});
  await f.flush(()=>{void f.element(e=>e.props['aria-label']==='Status for task-one').onChange({target:{value:'in_progress'}});});
  persisted='completed';
  await f.flush(()=>f.state.channels.find(c=>c.name.startsWith('team_tasks')).callbacks[0].callback());
  assert.equal(f.element(e=>e.props['aria-label']==='Status for task-one').value,'completed');
  await f.flush(()=>ack.resolve({data:{id:'task-one'},error:null}));
  assert.equal(f.element(e=>e.props['aria-label']==='Status for task-one').value,persisted);
});

for(const during of ['initial','older'])test(`chat history: clear during ${during} read cannot resurrect old messages`,async t=>{
  const pending=deferred();let reads=0;
  const f=await mount(t,'chat',{onQuery:q=>{
    if(q.table==='messages'&&++reads===(during==='initial'?1:2))return pending.promise;
    if(q.table==='messages')return{data:page(100,71),error:null};
  }});
  if(during==='older')await f.flush(()=>{void scroller(f).onScroll({currentTarget:{scrollTop:0,scrollHeight:1000}});});
  await f.flush(()=>{void f.element(e=>e.props.items?.some(i=>i.label==='Clear chat history')).items.find(i=>i.label==='Clear chat history').onSelect();});
  await f.flush(()=>pending.resolve({data:page(during==='initial'?100:70,during==='initial'?71:41),error:null}));
  assert(!f.text().includes('History '));
});

for(const during of ['initial','older'])test(`chat history: stale ${during} query error is still logged after clear`,async t=>{
  const pending=deferred(),error={code:'42501',message:'Synthetic stale history denied'};let reads=0;
  const f=await mount(t,'chat',{onQuery:q=>{
    if(q.table==='messages'&&++reads===(during==='initial'?1:2))return pending.promise;
    if(q.table==='messages')return{data:page(100,71),error:null};
  }});
  if(during==='older')await f.flush(()=>{void scroller(f).onScroll({currentTarget:{scrollTop:0,scrollHeight:1000}});});
  await f.flush(()=>{void f.element(e=>e.props.items?.some(i=>i.label==='Clear chat history')).items.find(i=>i.label==='Clear chat history').onSelect();});
  await f.flush(()=>pending.resolve({data:null,error}));
  assert(f.state.errors.some(args=>args.includes(error)));assert(!f.text().includes('History '));
});

test('chat history: rejected older read unlocks retry at the same cursor',async t=>{
  const error={code:'42501',message:'Synthetic history unavailable'};let reads=0;const cursors=[];
  const f=await mount(t,'chat',{onQuery:q=>{
    if(q.table!=='messages')return;
    if(++reads===1)return{data:page(100,71),error:null};
    cursors.push(q.or);if(reads===2)throw error;
    return{data:page(70,41),error:null};
  }});
  const scroll=()=>{void scroller(f).onScroll({currentTarget:{scrollTop:0,scrollHeight:1000}});};
  await f.flush(scroll);assert(f.state.errors.some(args=>args.includes(error)));
  await f.flush(scroll);assert.equal(reads,3);assert.equal(cursors[0],cursors[1]);assert(f.text().includes('History 41!'));
});
