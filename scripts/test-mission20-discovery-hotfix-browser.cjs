/* eslint-disable @typescript-eslint/no-require-imports -- Actual components, synthetic transport and denied external requests. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const esbuild=require('esbuild'),postcss=require('postcss'),tailwind=require('@tailwindcss/postcss'),{chromium}=require('@playwright/test');
const {record:algorush}=require('../qa/fixtures/mission20-unverified/algorush.json');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'scratch/hotfix-browser'),BASE='http://fixture.invalid';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
async function assets(){
 const fixture=path.join(ROOT,'qa/fixtures/mission20-hotfix-browser.jsx');
 const bundle=await esbuild.build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Directory from './src/app/hackathons/page';import Detail from './src/app/hackathons/[id]/page';import{LandingHero}from'./src/components/landing/LandingHero';createRoot(document.getElementById('root')).render(location.pathname==='/'?<LandingHero builderCount={321} teamCount={17} upcoming={[]}/>:location.pathname==='/hackathons'?<Directory/>:<Detail/>);`,resolveDir:ROOT,loader:'tsx'},
  bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},
  plugins:[{name:'offline-transport',setup(build){build.onResolve({filter:/^(next\/(link|navigation)|@\/lib\/supabase|@\/context\/NotificationContext)$/},()=>({path:fixture}));}}]});
 const css=await postcss([tailwind()]).process(fs.readFileSync(path.join(ROOT,'src/app/globals.css'),'utf8'),{from:path.join(ROOT,'src/app/globals.css')});
 return {js:bundle.outputFiles.find(f=>f.path.endsWith('.js'))?.text||bundle.outputFiles[0].text,css:css.css+'\nhtml{--font-ui:Arial;--font-display-face:Arial;--font-code:monospace}'};
}
let prepared;
for(const width of [390,768,1440])test('guest/member discovery accuracy and preserved history at '+width+'px',async()=>{
 prepared||=assets();const {js,css}=await prepared;fs.mkdirSync(OUT,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true,chromiumSandbox:true,args:['--host-resolver-rules=MAP * ~NOTFOUND']});
 const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce',serviceWorkers:'block'}),unexpected=[],errors=[];
 try{
  await context.route('**/*',route=>{const request=route.request(),url=new URL(request.url());
   if(url.origin!==BASE||!['GET','HEAD'].includes(request.method())){unexpected.push(url.origin+':'+request.method());return route.abort();}
   if(url.pathname==='/fixture.js')return route.fulfill({contentType:'text/javascript',body:js});
   if(url.pathname==='/fixture.css')return route.fulfill({contentType:'text/css',body:css});
   if(request.resourceType()!=='document'){unexpected.push(url.pathname);return route.abort();}
   return route.fulfill({contentType:'text/html',body:'<!doctype html><html class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-11-02T12:00:00+05:30')});
  const fit=async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
  for(const role of ['guest','member']){
   await page.goto(BASE+'/hackathons?role='+role);
   await page.getByRole('link',{name:'Imported registration window',exact:true}).waitFor();
   assert.equal(await page.getByRole('tab',{name:/^All Active/}).getAttribute('aria-selected'),'true');
   assert(await page.getByText(/Active listings require current source evidence/).isVisible());
   assert(await page.getByRole('link',{name:'Ongoing event closed applications',exact:true}).isVisible());
   for(const name of ['Closed applications future event','Ended event',algorush.name,'Unverified availability event','Build with AI: Bootcamps',...Array.from({length:8},(_,i)=>'Official import '+(i+1))])assert.equal(await page.getByRole('link',{name,exact:true}).count(),0);
   await fit();await page.screenshot({path:path.join(OUT,`${role}-discovery-${width}.png`),fullPage:true});
   await page.getByRole('tab',{name:/^Registration Open/}).click();
   assert.equal(new URL(page.url()).searchParams.get('tab'),'open');
   assert.equal(await page.getByRole('link',{name:'Ongoing event closed applications',exact:true}).count(),0);
   await page.getByRole('tab',{name:/^Ongoing/}).click();
   await page.getByRole('link',{name:'Ongoing event closed applications',exact:true}).waitFor();
   const ongoing=page.locator('li').filter({has:page.getByRole('link',{name:'Ongoing event closed applications',exact:true})});
   assert(await ongoing.getByText('Registration closed',{exact:true}).isVisible());
   for(const registration of ['unknown','open','all','closed']){
    await page.goto(BASE+'/hackathons?tab=recommended&registration='+registration+'&role='+role);
    await page.getByRole('tab',{name:/^All Active/}).waitFor();
    await page.getByText(/Active listings require current source evidence/).waitFor();
    for(const name of [algorush.name,'Unverified availability event',...Array.from({length:8},(_,i)=>'Official import '+(i+1))])assert.equal(await page.getByRole('link',{name,exact:true}).count(),0);
    assert.equal(await page.evaluate(()=>window.fixtureWrites.length),0);
   }
   await page.goto(BASE+'/hackathons?tab=recommended&role='+role);
   await page.getByRole('link',{name:'Imported registration window',exact:true}).waitFor();
   if(role==='guest'){
    assert(await page.evaluate(()=>window.fixtureReads.every(r=>r.table==='hackathons')));
   }else{
    await page.getByRole('button',{name:/^Saved/}).click();
    await page.getByRole('link',{name:'Closed applications future event',exact:true}).waitFor();
    assert(await page.getByRole('link',{name:'Ended event',exact:true}).isVisible());
    assert(await page.getByRole('link',{name:algorush.name,exact:true}).isVisible());
    assert(await page.getByRole('link',{name:'Official import 1',exact:true}).isVisible());
    assert(await page.getByRole('link',{name:'Build with AI: Bootcamps',exact:true}).isVisible());
   }
   await page.getByRole('button',{name:'All listings / Unverified',exact:true}).click();
   await page.getByRole('link',{name:algorush.name,exact:true}).waitFor();
   assert.equal(new URL(page.url()).searchParams.get('tab'),'all');
   for(const name of Array.from({length:8},(_,i)=>'Official import '+(i+1))){
    const imported=page.locator('li').filter({has:page.getByRole('link',{name,exact:true})});
    assert(await imported.getByText('Event schedule unverified',{exact:true}).isVisible(),name+': '+await imported.textContent());
    assert.equal(await imported.getByText('Ongoing',{exact:true}).count(),0);
   }
   if(role==='guest'){
    await page.getByRole('button',{name:'Save hackathon',exact:true}).first().click();
    assert(await page.getByRole('link',{name:'Sign in',exact:true}).isVisible());
   }
   await page.goto(BASE+'/hackathons?tab=all&registration=closed&role='+role);
   await page.getByRole('link',{name:algorush.name,exact:true}).waitFor();
   const row=page.locator('li').filter({has:page.getByRole('link',{name:algorush.name,exact:true})});
   assert(await row.getByText('Event schedule unverified',{exact:true}).isVisible());
   assert.equal(await row.getByText('Ended',{exact:true}).count(),0);
   assert.equal(await row.getByText('Ongoing',{exact:true}).count(),0);
   await fit();await page.screenshot({path:path.join(OUT,`${role}-algorush-explicit-${width}.png`),fullPage:true});
   await page.goto(BASE+`/hackathons/${algorush.id}?role=${role}`);
   await page.getByRole('heading',{name:algorush.name,exact:true}).waitFor();
   assert(await page.getByText('Event schedule unverified',{exact:true}).isVisible());
   assert.equal(await page.getByText('Ended',{exact:true}).count(),0);
   assert(await page.getByText('Source ID: 1737089',{exact:true}).isVisible());
   assert(await page.getByText(/Hackathon category unverified/).isVisible());
   assert(await page.getByText(role==='guest'?'1–1':'Solo',{exact:true}).isVisible());
   assert(await page.getByText(/15 Aug 2026/).first().isVisible());
   assert.equal(await page.getByText('Ongoing',{exact:true}).count(),0);
   if(role==='guest')assert.equal(await page.getByRole('link',{name:/View event website/}).getAttribute('href'),algorush.website_url);
   assert.equal(await page.evaluate(()=>window.fixtureWrites.length),0);
   await fit();await page.screenshot({path:path.join(OUT,`${role}-algorush-detail-${width}.png`),fullPage:true});
   for(const [n,name]of [[9,'Official import 1'],[30,'Build with AI: Bootcamps']]){
    await page.goto(BASE+`/hackathons/${id(n)}?role=${role}`);
    await page.getByRole('heading',{name,exact:true}).waitFor();
    assert(await page.getByText(n===9?'Event schedule unverified':'Upcoming',{exact:true}).isVisible());
    if(role==='guest')assert(await page.getByRole('link',{name:/View event website/}).isVisible());
    else {
     assert(await page.getByRole('button',{name:'View official event site',exact:true}).filter({visible:true}).isVisible());
     assert(await page.getByRole('button',{name:'Join community',exact:true}).isVisible());
    }
    await fit();await page.screenshot({path:path.join(OUT,role+'-unverified-'+n+'-'+width+'.png'),fullPage:true});
    assert.equal(await page.evaluate(()=>window.fixtureWrites.length),0);
   }
   await page.goto(BASE+`/hackathons/${id(3)}?role=${role}`);
   await page.getByRole('heading',{name:'Closed applications future event',exact:true}).waitFor();
   assert(await page.getByText('Registration closed',{exact:true}).isVisible());
   const official=page.getByRole('link',{name:/View event website/});
   if(role==='guest')assert.equal(await official.getAttribute('href'),'https://example.invalid/official');
   else assert(await page.getByRole('button',{name:'View official event site',exact:true}).filter({visible:true}).isVisible());
   assert.equal(await page.getByRole('button',{name:'Register on event site',exact:true}).count(),0);
   await fit();await page.screenshot({path:path.join(OUT,`${role}-closed-detail-${width}.png`),fullPage:true});
   assert.equal(await page.evaluate(()=>window.fixtureWrites.length),0);
  }
  await page.goto(BASE+'/');
  await page.getByRole('link',{name:'Browse hackathons',exact:true}).waitFor();
  assert(await page.getByText('registered builders',{exact:true}).isVisible());
  assert(await page.getByText('teams created',{exact:true}).isVisible());
  assert.equal(await page.getByText(/hackathons listed|All \d+ listed/).count(),0);
  await fit();await page.screenshot({path:path.join(OUT,`hero-${width}.png`),fullPage:true});
  await page.getByRole('link',{name:'Browse hackathons',exact:true}).click();
  await page.getByRole('link',{name:'Imported registration window',exact:true}).waitFor();
  assert.equal(new URL(page.url()).pathname,'/hackathons');assert.equal(new URL(page.url()).searchParams.get('tab'),null);
  assert.equal(await page.getByRole('tab',{name:/^All Active/}).getAttribute('aria-selected'),'true');
  await page.getByRole('link',{name:'Imported registration window',exact:true}).click();await page.getByRole('heading',{name:'Imported registration window',exact:true}).waitFor();
  await page.goBack();await page.getByRole('link',{name:'Imported registration window',exact:true}).waitFor();
  await page.goForward();await page.getByRole('heading',{name:'Imported registration window',exact:true}).waitFor();
  await page.goBack();await page.getByRole('link',{name:'Imported registration window',exact:true}).waitFor();
  await page.getByRole('tab',{name:/^Registration Open/}).click();await page.reload();await page.getByRole('link',{name:'Imported registration window',exact:true}).waitFor();
  await page.goto(BASE+'/hackathons?case=native&tab=recommended');await page.getByRole('link',{name:'Native open event',exact:true}).waitFor();
  await page.goto(BASE+'/hackathons?tab=all&registration=closed');
  await page.getByRole('link',{name:'Closed applications future event',exact:true}).waitFor();
  assert(await page.getByRole('link',{name:'Ongoing event closed applications',exact:true}).isVisible());
  await page.goto(BASE+'/hackathons?tab=past');await page.getByRole('link',{name:'Ended event',exact:true}).waitFor();
  await page.goto(BASE+'/hackathons');await page.getByRole('link',{name:'Imported registration window',exact:true}).waitFor();
  const readsBeforeExpiry=await page.evaluate(()=>window.fixtureReads.length);
  await page.clock.setFixedTime(new Date('2026-11-03T08:29:00Z'));await page.clock.runFor(60_000);
  await page.getByText('No events found',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.fixtureReads.length),readsBeforeExpiry);
  await page.clock.setFixedTime(new Date('2026-11-02T12:00:00+05:30'));
  await page.goto(BASE+'/hackathons?case=boundary&tab=recommended');await page.getByRole('link',{name:'India final day deadline',exact:true}).waitFor();
  await page.clock.setFixedTime(new Date('2026-11-02T23:59:59.999+05:30'));await page.reload();
  await page.getByRole('link',{name:'India final day deadline',exact:true}).waitFor();
  await page.clock.setFixedTime(new Date('2026-11-03T00:00:00+05:30'));await page.reload();
  await page.getByText('No events found',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>Date.now()),Date.parse('2026-11-03T00:00:00+05:30'));
  assert.equal(await page.getByRole('link',{name:'India final day deadline',exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>window.fixtureWrites.length),0);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 }finally{await context.close();await browser.close();}
});
