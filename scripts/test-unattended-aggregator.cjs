/* eslint-disable @typescript-eslint/no-require-imports -- Node's offline test harness. */
"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const p=require("./aggregator-worker-policy.cjs");
const worker=require("./run-hackermate-aggregator.cjs");
const make=(i,extra={})=>({id:String(i).padStart(4,"0"),type:"external",
  status:"approved",archived:false,source_metadata:null,website_url:"https://unstop.com/hackathons/a-"+i,...extra});

test("deployment target and main-branch authority are mandatory before writes",()=>{
  const good={NEXT_PUBLIC_SUPABASE_URL:"https://rhryjrbebfrrfhtyyzbs.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY:"synthetic-only",HACKERMATE_AGGREGATOR_ENABLED:"true",GITHUB_ACTIONS:"true",
    GITHUB_REPOSITORY:"yashshah1211/HackerMate_Backup",GITHUB_REF:"refs/heads/main",
    GITHUB_EVENT_NAME:"schedule"};
  assert.doesNotThrow(()=>worker.assertEnvironment("--apply",good));
  assert.doesNotThrow(()=>worker.assertEnvironment("--dry-run",good));
  for (const [key,value] of [["GITHUB_REF","refs/heads/feature"],["GITHUB_REPOSITORY","attacker/fork"],
      ["HACKERMATE_AGGREGATOR_ENABLED","false"],["GITHUB_ACTIONS","false"],["GITHUB_EVENT_NAME","pull_request"],
      ["NEXT_PUBLIC_SUPABASE_URL","https://other-project.supabase.co"],["SUPABASE_SERVICE_ROLE_KEY",""]]) {
    assert.throws(()=>worker.assertEnvironment("--apply",{...good,[key]:value}),{name:"Error"});
  }
  assert.throws(()=>worker.assertEnvironment("--unexpected",good));
});
test("source identity keys distinguish provider-specific identities",()=>{
  assert.equal(p.sourceKey({provider:"unstop",provider_id:"1777639",canonical_url:"https://unstop.com/hackathons/a-1777639"}),"unstop:1777639");
  assert.equal(p.sourceKey({provider:"devfolio",provider_id:"uuid-1",canonical_url:"https://hack.devfolio.co/"}),"devfolio:https://hack.devfolio.co");
  assert.equal(p.sourceKey({provider:"hack2skill",canonical_url:"https://hack2skill.com/event/a",provider_id:"xyz"}),"hack2skill:https://hack2skill.com/event/a");
  assert.equal(p.sourceKey({provider:"other",canonical_url:"https://other.com"}),null);
  const counts=p.countIdentities([make(1),make(2),make(3)],r=>(r.id==="0003"?null:{provider:"unstop",provider_id:"same",canonical_url:"https://unstop.com/hackathons/a-same"}));
  assert.equal(counts.get("unstop:same"),2);
});
test("refresh selection prioritizes oldest verification and excludes metadata-null records",()=>{
  const a=make(1,{source_metadata:{evidence_only:true,checked_at:"2026-11-02T02:00:00Z"}});
  const b=make(2,{source_metadata:{evidence_only:true,checked_at:"2026-11-01T02:00:00Z"}});
  const c=make(3,{source_metadata:{evidence_only:false,checked_at:"2026-10-31T02:00:00Z"}});
  assert.deepEqual(p.refreshPlan([a,b,c,make(4)],1).map(x=>x.id),["0002"]);
});
test("legacy selection covers current candidates and rotates through the backlog",()=>{
  const rows=Array.from({length:54},(_,i)=>make(i+1,{
    end_date:i<36?"2026-12-31":"2026-08-01"}));
  const first=p.legacyPlan(rows,Date.parse("2026-11-04T08:00:00Z"),0,24);
  const next=p.legacyPlan(rows,Date.parse("2026-11-04T08:00:00Z"),1,24);
  assert.equal(first.length,24);assert.equal(next.length,24);
  assert.equal(new Set(first.map(x=>x.id)).size,24);
  assert.ok(first.some(x=>x.end_date==="2026-08-01"));
  assert.notDeepEqual(first.map(x=>x.id),next.map(x=>x.id));
});
test("provider-discovery round robin prevents one provider dominating and rotates windows",()=>{
  const all=[
    ...Array.from({length:32},(_,i)=>({provider:"unstop",provider_id:String(i),canonical_url:"https://unstop.com/hackathons/a-"+i})),
    ...Array.from({length:8},(_,i)=>({provider:"devfolio",provider_id:String(i),canonical_url:"https://"+i+".devfolio.co"})),
    ...Array.from({length:8},(_,i)=>({provider:"hack2skill",provider_id:String(i),canonical_url:"https://hack2skill.com/event/"+i}))
  ];
  const one=p.discoveryPlan(all,new Set(),1,12),two=p.discoveryPlan(all,new Set(),2,12);
  assert.equal(one.length,12);assert.equal(new Set(one.map(p.sourceKey)).size,12);
  assert.deepEqual(one.reduce((o,x)=>(o[x.provider]=(o[x.provider]||0)+1,o),{}),{unstop:4,devfolio:4,hack2skill:4});
  assert.notDeepEqual(one.filter(x=>x.provider==="unstop").map(x=>x.provider_id),
    two.filter(x=>x.provider==="unstop").map(x=>x.provider_id));
  const skip=new Set([p.sourceKey(all[0]),p.sourceKey(all[33])]);
  assert.ok(p.discoveryPlan(all,skip,0,48).every(x=>!skip.has(p.sourceKey(x))));
});
test("evidence requires precise, current and contradiction-free registration proof",()=>{
  const at=Date.parse("2026-11-04T10:00:00Z");
  const good={metadata:{checked_at:new Date(at-60_000).toISOString(),
    expires_at:new Date(at+60*60_000).toISOString(),
    check_status:"ok",category:"hackathon",issues:[]},errors:[]};
  assert.equal(p.eligibleObservation(good,{},at),true);
  assert.equal(p.eligibleObservation({...good,errors:["contradiction"]},{},at),false);
  assert.equal(p.eligibleObservation({...good,metadata:{...good.metadata,issues:["mode_contradiction"]}},{},at),false);
  assert.equal(p.eligibleObservation({...good,metadata:{...good.metadata,checked_at:new Date(at-600_000).toISOString()}},{},at),false);
  assert.equal(p.eligibleObservation({...good,metadata:{...good.metadata,expires_at:new Date(at-1).toISOString()}},{},at),false);
});
test("existing provider identity conflicts cannot silently replace the legacy record",()=>{
  const row=make(1,{website_url:"https://unstop.com/hackathons/a-1234"});
  const id={provider:"unstop",provider_id:"1234",canonical_url:row.website_url};
  const valid={identifySource:()=>id,validateSourceObservation:()=>({identity:null,metadata:null})};
  assert.equal(worker.identityForRow(row,valid).provider_id,"1234");
  assert.equal(worker.identityForRow({...row,source_metadata:{evidence_only:true}},valid),null);
  const mismatch={identifySource:()=>id,validateSourceObservation:()=>({
    identity:{...id,canonical_url:"https://unstop.com/hackathons/another-1234"}})};
  assert.equal(worker.identityForRow({...row,source_metadata:{evidence_only:true}},mismatch),null);
});
test("new discovery rejects an ended event even with a historic open-registration claim",()=>{
  const at=Date.parse("2026-11-04T10:00:00Z");
  const metadata={checked_at:new Date(at-60_000).toISOString(),expires_at:new Date(at+3600_000).toISOString(),
    check_status:"ok",category:"hackathon",issues:[]};
  const v={metadata,errors:[],schedule:{start:"2026-01-01",end:"2026-02-01"}};
  const source={windowState:()=>"ended"};
  assert.equal(worker.admission(v,{facts:{registration_status:"open"}},at,source,true),false);
  assert.equal(worker.admission(v,{facts:{registration_status:"open"}},at,source,false),true);
  assert.equal(worker.admission({...v,schedule:null},{facts:{registration_status:"unknown"}},at,source,true),false);
});
