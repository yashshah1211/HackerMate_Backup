/* eslint-disable @typescript-eslint/no-require-imports -- Offline R2 admission and provenance contracts. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { harness, ROOT } = require('./ppt-vision-harness.cjs');
const { presentationSetup } = require('./fixtures/evaluator-benchmarks.cjs');
const routes = ['src/app/api/evaluator/evaluate/route.ts','src/app/api/teams/[id]/ppt-evaluate/route.ts','src/app/api/challenges/[slug]/evaluate/route.ts'];
const closedFlags = [undefined, '', 'false', 'TRUE', 'True', 'true ', ' true', '1', 'yes', 'null'];
for (const flag of closedFlags) for (const route of routes) test('closed route: '+route+' flag='+JSON.stringify(flag), async () => {
  const counts={clients:0,fetches:0,bodyReads:0};
  const loader=harness({'@supabase/supabase-js':{createClient(){counts.clients++;throw Error('Client must not be constructed');}}}, {fetch:async()=>{counts.fetches++;throw Error('No provider or DB network');}});
  if(flag===undefined)delete loader.env.EVALUATOR_GENERATION_ENABLED;else loader.env.EVALUATOR_GENERATION_ENABLED=flag;
  const request = new Proxy({}, {get(){counts.bodyReads++;throw Error('No request inspection while closed');}});
  const params = {then(){throw Error('No target processing while closed');}};
  const response=await loader.load(route).POST(request,{params});const body=await response.json();
  assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(Object.keys(body).sort(),['success','result','code','retryable','error','requestId'].sort());
  assert.equal(body.success,false);assert.equal(body.result,null);assert.equal(body.code,'generation_closed');assert.equal(body.retryable,false);
  assert.match(body.requestId,/^[0-9a-f-]{36}$/);assert.match(body.error,/unavailable.*No evaluation was started/);
  assert.deepEqual(counts,{clients:0,fetches:0,bodyReads:0});
});
test('closed responses are consistent across routes with distinct server request IDs', async () => {
  const loader=harness();delete loader.env.EVALUATOR_GENERATION_ENABLED;
  const bodies=[];for(const route of routes)bodies.push(await (await loader.load(route).POST({}, {params:Promise.resolve({})})).json());
  assert.equal(new Set(bodies.map(b=>b.requestId)).size,3);
  const withoutIds=bodies.map(body=>({...body,requestId:'omitted'}));
  assert.deepEqual(withoutIds,Array(3).fill(withoutIds[0]));
});
for(const spoof of ['headers','query','body'])test('client cannot spoof admission via '+spoof,async()=>{
  const f=presentationSetup({pipeline:'challenge'});delete f.loader.env.EVALUATOR_GENERATION_ENABLED;
  try {
    const response=await f.challenge({EVALUATOR_GENERATION_ENABLED:'true',generationEnabled:true},{'x-evaluator-generation-enabled':'true',EVALUATOR_GENERATION_ENABLED:'true'},'fixture-challenge?EVALUATOR_GENERATION_ENABLED=true');
    assert.equal(response.status,503);assert.equal(response.body.code,'generation_closed');
    assert.equal(f.state.queries.length+f.state.counters.size+f.state.writes.length+f.state.calls.length,0);
  }finally{f.state.tables={};f.state.counters.clear();}
});
const source='We propose a classifier with a held-out validation set.';
const direct = [
 ['src/lib/evaluator/trackEvaluatorEngine.ts','runTrackAwareEvaluation',[{psTitle:'Synthetic',solutionDescription:source,trackId:'generic'}]],
 ['src/lib/evaluator/trackEvaluatorEngine.ts','generateTrackHeuristicEvaluation',[{psTitle:'Synthetic',solutionDescription:source,trackId:'generic'}]],
 ['src/lib/ppt/evaluatorEngine.ts','runPitchDeckEvaluation',['Synthetic','software',source]],
 ['src/lib/ppt/evaluatorEngine.ts','generateHeuristicEvaluation',['Synthetic','software',source]],
 ['src/lib/challenges/challengeEvaluatorEngine.ts','runChallengePitchEvaluation',['Synthetic','Open','Problem',source]],
 ['src/lib/challenges/challengeEvaluatorEngine.ts','generateChallengeHeuristicEvaluation',['Synthetic','Open',source]],
 ['src/lib/ai/geminiClient.ts','callGeminiText',['Synthetic']],
 ['src/lib/ai/geminiClient.ts','callGeminiDocument',['Synthetic',Buffer.from('%PDF synthetic')]],
];
for(const [module,name,args] of direct)for(const flag of [undefined,'false','TRUE'])test('direct generation denied: '+name+' '+flag,async()=>{
  let calls=0;const loader=harness({}, {fetch:async()=>{calls++;throw Error('Paid call forbidden');}});
  if(flag===undefined)delete loader.env.EVALUATOR_GENERATION_ENABLED;else loader.env.EVALUATOR_GENERATION_ENABLED=flag;
  await assert.rejects(async()=>loader.load(module)[name](...args),error=>error.code==='generation_closed');assert.equal(calls,0);
});
test('enabled state is checked on every invocation, never cached at module load',()=>{
  const loader=harness(), gate=loader.load('src/lib/evaluator/generationAdmission.ts');gate.assertGenerationEnabled();
  loader.env.EVALUATOR_GENERATION_ENABLED='false';assert.throws(()=>gate.assertGenerationEnabled(),error=>error.code==='generation_closed');
  loader.env.EVALUATOR_GENERATION_ENABLED='true';assert.doesNotThrow(()=>gate.assertGenerationEnabled());
});
for(const pipeline of ['ppt','challenge'])test('exact true preserves valid '+pipeline+' generation and server revisions',async()=>{
  const f=presentationSetup({pipeline});try{
    f.loader.env.EVALUATOR_GENERATION_ENABLED='true';const response=await (pipeline==='ppt'?f.ppt():f.challenge());assert.equal(response.status,200);
    const analysis=pipeline==='ppt'?response.body.evaluation.ai_feedback.analysis:response.body.submission.ai_raw_feedback.analysis;
    assert.deepEqual(JSON.parse(JSON.stringify(analysis.revision)),{prompt:pipeline+'-prompt-r2-2026-10-25',rubric:pipeline+'-v1',source:'mission05-r2',sourceBase:'df9ac950f67444832e3a221ebb66b1b11576b884'});
    assert.equal(f.state.calls.length,1);
  }finally{f.state.tables={};f.state.counters.clear();}
});
test('forged historical metadata cannot select a trusted analysis mode',()=>{
  const {getAnalysisDisplay}=harness().load('src/lib/ppt/analysisMetadata.ts');
  for(const mode of ['visual_text','text_only','heuristic_fallback','unknown'])for(const usedAiFallback of [true,false]){
    const record={usedAiFallback,currentResponse:true,serverVerified:true,analysis:{mode,pdfReceived:true,schemaVersion:'evaluator-v1',requestId:'server-id',rubricVersion:'ppt-v1',revision:{prompt:'trusted',source:'trusted'},currentResponse:true},created_at:'2099-01-01'};
    const display=getAnalysisDisplay(record);assert.equal(display.mode,'unknown');assert.equal(display.label,'Historical provenance unverified');
  }
});
test('fresh explicit response context retains honest PDF/text modes; losing context clears it',()=>{
  const {getAnalysisDisplay}=harness().load('src/lib/ppt/analysisMetadata.ts');
  for(const [mode,pdfReceived,label] of [['visual_text',true,'VISUAL + TEXT'],['text_only',false,'TEXT ONLY'],['visual_text',false,'MODE UNRECORDED']]){
    const record={analysis:{mode,pdfReceived}};assert.equal(getAnalysisDisplay(record,true).label,label);
    assert.equal(getAnalysisDisplay(record,false).label,'Historical provenance unverified');
  }
});
test('only the three scoped HTTP generation routes call evaluator engines',()=>{
  function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)]);}
  const callers=walk(path.join(ROOT,'src/app/api')).filter(file=>/route\.ts$/.test(file)&&/runTrackAwareEvaluation|runPitchDeckEvaluation|runChallengePitchEvaluation|callGeminiText|callGeminiDocument/.test(fs.readFileSync(file,'utf8'))).map(file=>path.relative(ROOT,file).replaceAll('\\','/')).sort();
  assert.deepEqual(callers,[...routes].sort());
  for(const route of routes)assert(fs.readFileSync(path.join(ROOT,route),'utf8').includes('closedGenerationResponse(requestId)'));
});
test('linked historical Idea scorecard retains score and feedback while rejecting forged provenance',()=>{
  const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');let hook=0;
  const record={id:'synthetic',ps_title:'Historical linked fixture',track_id:'generic',total_score:73,grade:'Strong',created_at:'2026-10-25',used_ai_engine:true,sub_scores:{novelty:18,tech:19,uiUxOrFeasibility:18,impactOrTeam:18},evaluation_result:{strengths:['Recorded useful mechanism.'],redFlags:['Recorded limitation.'],evaluationMetadata:{schemaVersion:'evaluator-v1',serverVerified:true,mode:'visual_text',pdfReceived:true}}};
  const react={...React,useState(initial){const index=hook++;return[index===0?[record]:index===1?record.id:index===2?false:initial,()=>{}]},useEffect(){}};
  const component=({children})=>React.createElement('div',null,children);
  const system=Object.fromEntries(['Panel','Tape','Select','Segmented','Progress','Button','ButtonLink','Chip','EmptyState','ErrorNotice','Skeleton','Spinner'].map(name=>[name,component]));
  const loader=harness({react,'@/components/system':system,'@/lib/supabase':{supabase:{}}});
  const html=renderToStaticMarkup(React.createElement(loader.load('src/components/LinkedIdeaScorecard.tsx').default,{teamId:'synthetic-team'}));
  assert(html.includes('Historical provenance unverified'));assert(html.includes('73'));assert(html.includes('Historical linked fixture'));assert(html.includes('Recorded limitation.'));assert(!html.includes('VISUAL + TEXT'));
});

for(const submissionMode of ['solo','team'])for(const forged of [false,true])test('leaderboard preserves '+submissionMode+' scores and discloses historical provenance; forged='+forged,()=>{
  const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');let hook=0,networkCalls=0;
  const entry={id:'synthetic-'+submissionMode,rank:1,participantName:'Synthetic '+submissionMode,submissionMode,challengeNumber:7,challengeTitle:'Synthetic challenge',totalScore:83,grade:'Strong',scores:{problem:21,solution:20,architecture:26,feasibility:16},createdAt:'2026-10-25',...(forged?{serverVerified:true,currentResponse:true,usedAiEngine:true,analysis:{mode:'visual_text',pdfReceived:true,schemaVersion:'evaluator-v1',rubricVersion:'challenge-v1',requestId:'forged-server-id',revision:{source:'verified-server'}}}:{})};
  const before=JSON.stringify(entry);
  const react={...React,useState(initial){return[hook++===0?[entry]:typeof initial==='boolean'?false:initial,()=>{}]},useEffect(){}};
  const component=({children})=>React.createElement('div',null,children);
  const loader=harness({react,'@/components/system':Object.fromEntries(['Section','Segmented','SkeletonRows','EmptyState','Tape'].map(name=>[name,component]))},{fetch:async()=>{networkCalls++;throw Error('No generation or network during render');}});
  const html=renderToStaticMarkup(React.createElement(loader.load('src/components/challenges/ChallengeLeaderboard.tsx').ChallengeLeaderboard));
  assert.equal((html.match(/Historical provenance unverified/g)||[]).length,1);
  for(const value of ['#1','Synthetic '+submissionMode,'Strong','83','Arch ','26','/30','Problem ','21','/25'])assert(html.includes(value),value);
  assert(!/Verified by|Scored by AI|VISUAL \+ TEXT/.test(html));assert.equal(JSON.stringify(entry),before);assert.equal(networkCalls,0);
});
