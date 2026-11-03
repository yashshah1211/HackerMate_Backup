/* eslint-disable @typescript-eslint/no-require-imports -- Real transport with synthetic GET responses; no provider requests. */
const {test}=require('node:test'),assert=require('node:assert/strict'),{harness}=require('./ppt-vision-harness.cjs');
const loader=harness({}, {URLSearchParams}),{SourceTransport,robotsAllowed}=loader.load('src/lib/hackathons/sourceTransport.ts'),{identifySource}=loader.load('src/lib/hackathons/providers.ts');
for(const [body,path,allowed] of [
 ['User-agent: *\nDisallow: /event/','/event/a',false],['User-agent: *\nDisallow: /event/\nAllow: /event/a$','/event/a',true],
 ['User-agent: *\nDisallow: /\nUser-agent: HackerMate-Catalog\nAllow: /','/event/a',true],['User-agent: OtherBot\nDisallow: /','/event/a',true],
 ['User-agent: *\nDisallow: /*?private=*','/event/a?private=true',false],['User-agent: *\nDisallow:','/event/a',true],
])test('robots longest/specific matching '+JSON.stringify([body,path]),()=>assert.equal(robotsAllowed(body,path),allowed));

const precedenceCases = [
 ['shorter Allow cannot override longer Disallow', '/event/', '/event/private/', '/event/private/entry', false],
 ['longer Allow overrides shorter Disallow', '/event/public/', '/event/', '/event/public/entry', true],
 ['longer wildcard Disallow overrides shorter Allow', '/event/', '/event/*/private/', '/event/series/private/entry', false],
 ['longer wildcard Allow overrides shorter Disallow', '/event/*/public/', '/event/*/', '/event/series/public/entry', true],
 ['wildcard characters do not inflate specificity', '/event/********', '/event/private/', '/event/private/entry', false],
 ['identical Allow and Disallow tie permits access', '/event/entry', '/event/entry', '/event/entry', true],
 ['equal literal-length wildcard tie permits access', '/a/*/c', '/a/b/*', '/a/b/c', true],
 ['anchored Allow does not permit a longer path', '/event/open$', '/event/', '/event/open/entry', false],
];
for (const [name, allow, disallow, path, expected] of precedenceCases) for (const allowFirst of [true, false]) {
 test('robots precedence: '+name+'; Allow first='+allowFirst,()=>{
  const rules=['Allow: '+allow,'Disallow: '+disallow];
  if(!allowFirst)rules.reverse();
  assert.equal(robotsAllowed('User-agent: *\n'+rules.join('\n'),path),expected);
 });
}

test('longer canonical-path Disallow stops detail requests despite a shorter Allow',async()=>{
 const calls=[],transport=new SourceTransport(async url=>{
  calls.push(url);return new Response('User-agent: *\nAllow: /event/\nDisallow: /event/private');
 },10000,0);
 await assert.rejects(transport.detail({...identifySource('https://hack2skill.com/event/private-entry'),provider_id:'a'.repeat(24)}),/disallows/);
 assert.deepEqual(calls,['https://hack2skill.com/robots.txt']);
});
test('source detail checks both canonical event robots and API rules before requesting data',async()=>{
 const calls=[],t=new SourceTransport(async url=>{calls.push(url);return new Response('User-agent: *\nDisallow: /event/blocked');},10000,0);
 await assert.rejects(t.detail({...identifySource('https://hack2skill.com/event/blocked'),provider_id:'a'.repeat(24)}),/disallows/);assert.deepEqual(calls,['https://hack2skill.com/robots.txt']);
});
for(const code of [301,302,307,401,403,429,500])test('HTTP '+code+' never triggers redirect/auth bypass or guessed success',async()=>{
 const calls=[],t=new SourceTransport(async url=>{calls.push(url);return url.endsWith('robots.txt')?new Response(''):new Response('',{status:code,headers:{Location:'https://login.invalid'}});},10000,0);
 await assert.rejects(t.detail(identifySource('https://unstop.com/hackathons/a-123')));assert.equal(calls.length,2);assert(calls.every(u=>u.startsWith('https://unstop.com/')));
});
test('oversized source response, robots failure and complete run timeout are controlled failures',async()=>{
 const t=new SourceTransport(async url=>url.endsWith('robots.txt')?new Response(''):new Response('x'.repeat(2*1024*1024+1)),10000,0);await assert.rejects(t.get('https://unstop.com/api/public/competition/123'),/size limit/);
 const unavailable=new SourceTransport(async()=>new Response('',{status:503}),10000,0);await assert.rejects(unavailable.get('https://devfolio.co/hackathons'),/robots/);
 const expired=new SourceTransport(async()=>{throw Error('Must not fetch after budget');},0,0);await assert.rejects(expired.get('https://devfolio.co/hackathons'),/budget/);
});
for(const url of ['https://evil.invalid/data','http://unstop.com/api/public/competition/123','https://hack2skill.com/api/v1/innovator/team/list','https://127.0.0.1/'])test('not a permitted public provider origin/path '+url,async()=>{let calls=0;const t=new SourceTransport(async()=>{calls++;return new Response('');},10000,0);await assert.rejects(t.get(url));assert(calls<=1);});
test('request includes honest user agent, manual redirects, no cache and bounded AbortSignal; hash covers exact response',async()=>{
 const t=new SourceTransport(async(url,init)=>{assert.equal(init.headers['User-Agent'],'HackerMate-Catalog/1.0');assert.equal(init.redirect,'manual');assert.equal(init.cache,'no-store');assert(init.signal instanceof AbortSignal);return new Response(url.endsWith('robots.txt')?'':'synthetic source');},10000,0);
 const r=await t.get('https://unstop.com/api/public/competition/123');assert.equal(r.hash,require('node:crypto').createHash('sha256').update('synthetic source').digest('hex'));
});
