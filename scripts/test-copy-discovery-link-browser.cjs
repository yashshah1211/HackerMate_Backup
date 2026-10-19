/* eslint-disable @typescript-eslint/no-require-imports -- Actual production Next guest UI and read-only loopback fixtures. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const http = require('node:http');
const { chromium, expect } = require('@playwright/test');
const ROOT = path.resolve(__dirname, '..');
const baseline = process.argv.includes('--baseline');
const out = path.join(ROOT, 'docs/qa/copy-discovery-link');
fs.mkdirSync(out, { recursive: true });
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const event = (n, name, extra = {}) => ({ id: id(n), name, description: 'Synthetic public discovery audit. Build accessible tools.',
  tags: ['AI/ML'], status: 'approved', archived: false, type: 'external', start_date: '2028-01-01', end_date: '2028-01-03',
  registration_end: '2027-12-30', created_at: '2026-10-19T00:00:00Z', location: 'Mumbai', mode: 'online',
  college: null, min_team_size: 1, max_team_size: 4, prize_pool: 'INR 10000', currency: 'INR', website_url: 'https://unstop.com/fixture', ...extra });
const records = [event(1, 'AI/ML Campus Challenge'), event(2, 'Climate Studio', { tags: ['Climate'], mode: 'hybrid' }),
  event(3, 'Private Sentinel', { status: 'pending' }), event(4, 'Archived Sentinel', { archived: true })];
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
(async () => {
 const reserve = http.createServer();const port = await listen(reserve);await new Promise(resolve => reserve.close(resolve));
 const origin = `http://127.0.0.1:${port}`;
 const env = { ...process.env };
 for (const key of Object.keys(env)) if (/SUPABASE|DATABASE_URL|RESEND|SENTRY|VERCEL|HUSTLE|TOKEN|SECRET|API_KEY|NEXT_PUBLIC_GA|POSTHOG/.test(key)) delete env[key];
 Object.assign(env,{NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:9',NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic-anonymous'});
 fs.mkdirSync(path.join(ROOT,'work/copy-link'),{recursive:true});
 const log = fs.createWriteStream(path.join(ROOT,'work/copy-link/browser-server.log'));
 const server = spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{cwd:ROOT,env,stdio:['ignore','pipe','pipe']});
 server.stdout.pipe(log);server.stderr.pipe(log);
 let browser;const reports=[];
 try {
  for(let i=0;;i++){try {await fetch(origin+'/hackathons');break;}catch {if(i===119)throw Error('Server timeout');await new Promise(resolve=>setTimeout(resolve,500));}}
  browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||'/usr/bin/chromium',headless:true});
  for(const width of [1440,390]){
   const context=await browser.newContext({viewport:{width,height:900},isMobile:width<500,hasTouch:width<500,reducedMotion:'reduce',serviceWorkers:'block'});
   const errors=[],reads=[],unexpected=[],documents=[],telemetry=[];
   const intercept = async route=>{

    const req=route.request(),url=new URL(req.url());
    if(url.pathname==='/rest/v1/hackathons'){
     assert.equal(req.method(),'GET');assert.equal(url.searchParams.get('status'),'eq.approved');assert.equal(url.searchParams.get('archived'),'eq.false');
     assert(!url.searchParams.get('select').includes('*'));
     reads.push(req.url());
     const cursor=url.searchParams.get('id')?.slice(3);
     // Include intentionally hidden rows: application defense must discard them too.
     const rows=records.filter(row=>!cursor||row.id>cursor);
     return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(rows)});
    }
    if(url.origin==='https://scripts.simpleanalyticscdn.com'&&url.pathname==='/latest.js'){telemetry.push(url.hostname);return route.fulfill({contentType:'text/javascript',body:'/* telemetry disabled in offline audit */'});}
    if(url.origin==='https://o4512114060623872.ingest.us.sentry.io'&&url.pathname==='/api/4512114074517504/envelope/'){telemetry.push(url.hostname);return route.fulfill({status:200,contentType:'application/json',body:'{}'});}
    if(url.origin===origin){
     if(req.isNavigationRequest())documents.push(req.url());
     return route.continue();
    }
    unexpected.push(req.method()+' '+url.origin+url.pathname);return route.abort();
   };
   await context.route('**/*', intercept);
   const page=await context.newPage();page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin+'/hackathons?tab=upcoming&topic=ai%2Fml&mode=online&sort=date&q=Campus#shared');
   await expect(page.getByRole('link',{name:'AI/ML Campus Challenge',exact:true})).toBeVisible();
   await expect(page.getByRole('tab',{name:/^Upcoming/})).toHaveAttribute('aria-selected','true');
   await expect(page.getByRole('searchbox',{name:'Search hackathons'})).toHaveValue('Campus');
   await expect(page.getByText('Private Sentinel',{exact:true})).toHaveCount(0);await expect(page.getByText('Archived Sentinel',{exact:true})).toHaveCount(0);
   const marker=await page.evaluate(()=>{window.__auditMarker=Math.random().toString();return window.__auditMarker;});
   const queryCount=reads.length,historyLength=await page.evaluate(()=>history.length),documentCount=documents.length;
   await page.getByRole('searchbox',{name:'Search hackathons'}).fill('AI/ML');
   await expect.poll(()=>new URL(page.url()).searchParams.get('q')).toBe('AI/ML');
   assert.equal(await page.evaluate(()=>history.length),historyLength,'Filter edits should replace the current entry');
   const select=async value=>{
    if(width<1024){await page.getByRole('button',{name:'Filters',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();}
    const trigger=width<1024?page.getByRole('dialog').getByRole('button',{name:/^Topic \/ domain:/}):page.getByRole('button',{name:/^Topic \/ domain:/});
    await trigger.click();await page.getByRole('option',{name:value,exact:true}).click();
    if(width<1024){await page.getByRole('dialog').getByRole('button',{name:/^Show \d+ events?$/}).click();}
   };
   await select('Climate');await expect(page.getByText('No events found',{exact:true})).toBeVisible();
   assert.equal(new URL(page.url()).searchParams.get('topic'),'climate');
   assert.equal(reads.length,queryCount,'Changing filters must not query the database');
   assert.equal(documents.length,documentCount,'Changing filters must not load a document');
   assert.equal(await page.evaluate(()=>window.__auditMarker),marker);
   // Real Next-patched native history, rather than a mock of useSearchParams.
   await page.evaluate(()=>history.pushState(null,'','/hackathons?tab=upcoming&topic=ai%2Fml&mode=online&sort=date&q=Campus#shared'));
   await expect(page.getByRole('link',{name:'AI/ML Campus Challenge',exact:true})).toBeVisible();
   await page.goBack();await expect(page.getByText('No events found',{exact:true})).toBeVisible();
   assert.equal(new URL(page.url()).searchParams.get('topic'),'climate');
   await page.goForward();await expect(page.getByRole('link',{name:'AI/ML Campus Challenge',exact:true})).toBeVisible();
   assert.equal(new URL(page.url()).hash,'#shared');assert.equal(reads.length,queryCount);
   await page.reload();await expect(page.getByRole('link',{name:'AI/ML Campus Challenge',exact:true})).toBeVisible();
   await expect(page.getByRole('searchbox',{name:'Search hackathons'})).toHaveValue('Campus');
   if(width===1440)await expect(page.getByRole('button',{name:'Topic / domain: AI/ML',exact:true})).toBeVisible();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow');
   await page.screenshot({path:path.join(out,`${baseline ? "before" : "after"}-${width}.png`),fullPage:true});
   if (baseline) {
    await expect(page.getByRole('button',{name:'Copy link to filtered hackathons',exact:true})).toHaveCount(0);
   } else {
    await context.grantPermissions(['clipboard-read','clipboard-write'],{origin});
    const copy=page.getByRole('button',{name:'Copy link to filtered hackathons',exact:true});
    await expect(copy).toHaveCount(1);await expect(copy).toHaveAccessibleDescription('Copies these filters as a public discovery link.');
    if(width<500)assert((await copy.boundingBox()).height>=44,'Copy action touch target');
    const beforeCopyReads=reads.length,beforeCopyDocs=documents.length,beforeCopyUrl=page.url();
    // Keyboard activation with the real browser Clipboard API.
    await copy.focus();await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({hasText:'Link copied.'})).toBeVisible();
    const copied=await page.evaluate(()=>navigator.clipboard.readText());
    assert.equal(copied,'https://www.hackermate.in/hackathons?tab=upcoming&q=Campus&mode=online&topic=ai%2Fml');
    assert.equal(reads.length,beforeCopyReads);assert.equal(documents.length,beforeCopyDocs);assert.equal(page.url(),beforeCopyUrl);
    const fresh=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
    await fresh.route('**/*',intercept);const recipient=await fresh.newPage();
    const portable=new URL(copied);await recipient.goto(origin+portable.pathname+portable.search);
    await expect(recipient.getByRole('link',{name:'AI/ML Campus Challenge',exact:true})).toBeVisible();
    await expect(recipient.getByRole('tab',{name:/^Upcoming/})).toHaveAttribute('aria-selected','true');
    await expect(recipient.getByRole('searchbox',{name:'Search hackathons'})).toHaveValue('Campus');
    assert.deepEqual(await fresh.cookies(),[]);await fresh.close();
    // Personal views explain their conversion before the user activates copying.
    await page.goto(origin+'/hackathons?tab=saved&sort=relevant&topic=ai%2Fml&mode=online&q=Campus&token=secret#fragment');
    await expect(page.getByRole('button',{name:'Copy link to filtered hackathons'})).toHaveAccessibleDescription('Copies public discovery with date order, not your saved list.');
    await page.screenshot({path:path.join(out,`saved-${width}.png`),fullPage:true});
    await page.getByRole('button',{name:'Copy link to filtered hackathons'}).click();
    await expect(page.getByRole('status').filter({hasText:'Link copied.'})).toBeVisible();
    assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'https://www.hackermate.in/hackathons?q=Campus&mode=online&topic=ai%2Fml&sort=date');
    // Denial/unsupported/insecure cases cannot report success, and expose the same sanitized URL manually.
    for(const failure of ['denied','unsupported','insecure']){
     await page.goto(origin+'/hackathons?topic=ai%2Fml&sort=date&q=AI%2FML+%26+C%2B%2B&email=private%40example.test');
     const button=page.getByRole('button',{name:'Copy link to filtered hackathons'});await expect(button).toBeVisible();
     await page.evaluate(failure=>{
      if(failure==='insecure')Object.defineProperty(window,'isSecureContext',{configurable:true,value:false});
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:failure==='unsupported'?undefined:{writeText:()=>Promise.reject(new DOMException('Denied','NotAllowedError'))}});
     },failure);
     await button.click();await expect(page.getByRole('alert').filter({hasText:'Couldn’t copy automatically.'})).toBeVisible();
     await expect(page.getByRole('status').filter({hasText:'Link copied.'})).toHaveCount(0);
     const manual=page.getByRole('textbox',{name:'Link to copy manually'});
     await expect(manual).toHaveValue('https://www.hackermate.in/hackathons?q=AI%2FML+%26+C%2B%2B&topic=ai%2Fml&sort=date');
     await manual.focus();assert.equal(await manual.evaluate(el=>el.selectionEnd-el.selectionStart),await manual.evaluate(el=>el.value.length));
     assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Fallback overflow');
     if(failure==='denied'&&width===390)await page.screenshot({path:path.join(out,'clipboard-failure-390.png'),fullPage:true});
    }
    await page.goto(beforeCopyUrl);await expect(page.getByRole('link',{name:'AI/ML Campus Challenge',exact:true})).toBeVisible();
   }
   // A new guest context must restore from the copied URL, without previous component/session state.
   const second=await context.newPage();await second.goto(page.url());await expect(second.getByRole('link',{name:'AI/ML Campus Challenge',exact:true})).toBeVisible();
   await second.close();
   await page.goto(origin+'/hackathons?tab=invalid&mode=invalid&platform=invalid&sort=invalid&from=2026-02-30&q=one&q=two');
   await expect(page.getByRole('tab',{name:'Discover',exact:true})).toHaveAttribute('aria-selected','true');
   await expect(page.getByRole('searchbox',{name:'Search hackathons'})).toHaveValue('');
   await expect(page.getByRole('link',{name:'AI/ML Campus Challenge',exact:true})).toBeVisible();
   await expect(page.getByRole('link',{name:'Climate Studio',exact:true})).toBeVisible();
   assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
   reports.push({width,passed:true,checks:['guest URL initialization','search/topic edits update URL','no filter reload/query','replaceState history length','real Next Back/Forward restoration','refresh','copied link in new page','invalid/duplicate values default','approval/archive restrictions','no overflow',...(!baseline?['single accessible Copy action','44px mobile target','real clipboard via keyboard','fresh guest copied-link restoration','personal-view conversion notice','clipboard denial/unsupported/insecure manual fallback','encoded search and context stripping','copy preserves URL/read count']:[])],initialPublicReads:queryCount,offlineTelemetryResponses:telemetry.length});
   await context.close();
  }
  fs.writeFileSync(path.join(out,baseline?'baseline-results.json':'browser-results.json'),JSON.stringify({base:'fb3fd3df89836cc782f3123ef296cbc5600a1768',reports},null,2)+'\n');
  console.log((baseline?'Baseline':'Copy link')+' production Next guest checks passed at 1440/390px; no filter/copy database reads or document navigations.');
 }finally{if(browser)await browser.close();server.kill();log.end();}
})().catch(err=>{console.error(err);process.exitCode=1;});
