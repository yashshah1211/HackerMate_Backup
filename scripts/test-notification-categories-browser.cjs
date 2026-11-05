/* eslint-disable @typescript-eslint/no-require-imports -- Real notification UI/CSS with synthetic loopback data only. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const { rows } = require('./notification-category-fixtures.cjs');
const ROOT = path.resolve(__dirname, '..');
let assets;
function browserAssets() {
  return assets ||= (async () => {
    const client = `
      import {rows} from './scripts/notification-category-fixtures.cjs';
      const state={rows:rows(),queries:[],navigation:[],channels:[],pending:[],error:location.search.includes('error=1'),hold:true,closed:0};window.fixture=state;
      state.release=()=>{state.hold=false;for(const done of state.pending.splice(0))done()};
      state.emit=()=>{for(const c of state.channels)if(c.active)for(const fn of c.callbacks)fn()};
      export const router={push:url=>state.navigation.push(url)};
      export const supabase={auth:{getUser:async()=>({data:{user:{id:'00000000-0000-4000-8000-000000000098'}}})},
        from(table){const q={table,op:'read',filters:[],orders:[],excluded:[]};return{
          select(value){q.columns=value;return this},eq(...args){q.filters.push(args);return this},ilike(...args){q.filters.push(args);return this},not(...args){q.excluded.push(args);return this},order(...args){q.orders.push(args);return this},limit(n){q.limit=n;return this},
          update(value){q.op='update';q.value=value;return this},
          then(resolve,reject){state.queries.push(q);const read=()=>{
            if(table==='team_invites'||table==='teams')return{data:[],error:null};if(table!=='notifications')throw Error('Unexpected table '+table);
            if(q.op==='update'){for(const row of state.rows)if(q.filters.every(([key,value])=>key==='user_id'||row[key]===value))Object.assign(row,q.value);return{data:null,error:null}}
            if(state.error)return{data:null,error:{message:'Synthetic notification read failed'}};
            return{data:state.rows.map(({category,label,tone,...row})=>({...row})),error:null};
          };const wait=table==='notifications'&&q.op==='read'&&state.hold?new Promise(done=>state.pending.push(done)):Promise.resolve();return wait.then(read).then(resolve,reject)}
        }},
        channel(name){const channel={name,active:false,callbacks:[],on(event,filter,fn){this.filter=filter;this.callbacks.push(fn);return this}};state.channels.push(channel);return channel},
        async removeChannel(channel){channel.active=false}
      };
      export const subscribeWithRetry=channel=>{channel.active=true;return()=>{channel.active=false}};
    `;
    const bundle = await build({
      stdin: { contents: `import React,{useState}from'react';import{createRoot}from'react-dom/client';import Drawer from './src/components/NotificationDrawer';import Page from './src/app/notifications/page';
        function App(){const[open,setOpen]=useState(true);return location.pathname==='/notifications'?<Page/>:<Drawer isOpen={open} onClose={()=>{window.fixture.closed++;setOpen(false)}}/>}
        const root=createRoot(document.getElementById('root'));window.unmountFixture=()=>root.unmount();root.render(<App/>);`, resolveDir: ROOT, loader: 'tsx' },
      bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
      plugins: [{ name: 'notification-test-adapters', setup(builder) {
        builder.onResolve({ filter: /^(@\/lib\/supabase|next\/navigation)$/ }, () => ({ path: 'client', namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: client + '\nexport const useRouter=()=>router;', loader: 'js', resolveDir: ROOT }));
        builder.onResolve({ filter: /^(@\/components\/AuthGuard|@\/context\/NotificationContext|next\/link)$/ }, args => ({ path: args.path, namespace: 'boundaries' }));
        builder.onLoad({ filter: /.*/, namespace: 'boundaries' }, args => ({ contents: args.path==='next/link'?
          "import React from'react';export default({href,children,...props})=><a href={href} {...props}>{children}</a>;":
          "export default({children})=>children;export const useNotification=()=>({showToast(){},confirm(){throw Error('Unexpected deletion')}});", loader: 'jsx', resolveDir: ROOT }));
      } }],
    });
    const css = await postcss([tailwind({ base: ROOT })]).process(fs.readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8'), { from: path.join(ROOT, 'src/app/globals.css') });
    return { js: bundle.outputFiles[0].text, css: css.css };
  })();
}
for (const surface of ['drawer', 'page']) for (const width of [1440, 390]) {
  test(`notification ${surface}: exclusive categories, badge agreement and existing actions at ${width}px`, async () => {
    const bundle = await browserAssets();
    const server = http.createServer((req, res) => {
      if(req.url==='/app.js'){res.setHeader('content-type','text/javascript');res.end(bundle.js)}
      else if(req.url==='/app.css'){res.setHeader('content-type','text/css');res.end(bundle.css)}
      else{res.setHeader('content-type','text/html');res.end('<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>')}
    });
    let browser;
    try {
      await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
      const origin='http://127.0.0.1:'+server.address().port;
      browser=await chromium.launch();
      const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
      const external=[],errors=[];
      await context.route('**/*',route=>{const req=route.request();if(new URL(req.url()).origin===origin&&req.method()==='GET')return route.continue();external.push(req.url());return route.abort()});
      const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
      const url=origin+(surface==='drawer'?'/dashboard':'/notifications');
      await page.goto(url);await page.waitForFunction(()=>window.fixture.pending.length>0);
      await expect(page.locator('li')).toHaveCount(0);await page.evaluate(()=>window.fixture.release());
      try {await expect(page.locator('li')).toHaveCount(rows().length);} catch(error) {
        console.error({errors,fixture:await page.evaluate(()=>({queries:window.fixture.queries,rows:window.fixture.rows.length,pending:window.fixture.pending.length})),body:await page.locator('body').innerText()});throw error;
      }
      const expectedRows=rows();
      for(const filter of ['teams','connections','all','unread']) {
        await page.getByRole('tab',{name:new RegExp('^'+filter,'i')}).click();
        const expected=expectedRows.filter(n=>filter==='all'||(filter==='unread'?!n.is_read:n.category===filter));
        await expect(page.locator('li')).toHaveCount(expected.length);
        const messages=await page.locator('li p').evaluateAll(elements=>elements.map(el=>Array.from(el.childNodes).filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('').trim()));
        assert.deepEqual(messages,expected.map(n=>n.message));
        for(const [index,item] of expected.entries()){
          const row=page.locator('li').nth(index);await expect(row).toHaveCount(1);
          const tone={info:'text-info',accent:'text-accent-ink',ok:'text-ok',neutral:'text-ink-2',hack:'text-hack',proj:'text-proj'}[item.tone];
          await expect(row.getByText(item.label,{exact:true})).toHaveClass(new RegExp('\\b'+tone+'\\b'));
        }
      }
      // Read/unread changes must work across categories, and clicks keep links.
      const target=expectedRows.find(n=>n.category==='connections'&&!n.is_read);
      await page.locator('li').filter({hasText:target.message}).getByRole('button',{name:'Mark as read',exact:true}).click();
      await expect(page.locator('li').filter({hasText:target.message})).toHaveCount(0);
      await page.getByRole('tab',{name:'Connections',exact:true}).click();
      await page.locator('li').filter({hasText:target.message}).getByRole('button').first().click();
      await expect.poll(()=>page.evaluate(()=>window.fixture.navigation)).toEqual(['/connections']);
      if(surface==='drawer')await expect.poll(()=>page.evaluate(()=>window.fixture.closed)).toBe(1);
      await page.goto(url);await page.waitForFunction(()=>window.fixture.pending.length>0);await page.evaluate(()=>window.fixture.release());
      await expect(page.locator('li')).toHaveCount(expectedRows.length);
      await page.getByRole('tab',{name:'Teams',exact:true}).click();
      const invite=expectedRows.find(n=>n.label==='Invite');
      await page.locator('li').filter({hasText:invite.message}).getByRole('button').first().click();
      await expect.poll(()=>page.evaluate(()=>window.fixture.navigation)).toEqual([invite.link]);
      // Reopen through a fresh mount and exercise unknown realtime/unread + mark-all.
      await page.goto(url);await page.waitForFunction(()=>window.fixture.pending.length>0);await page.evaluate(()=>window.fixture.release());
      await expect(page.locator('li')).toHaveCount(expectedRows.length);
      await page.evaluate(()=>{window.fixture.rows.unshift({id:'synthetic-realtime',message:'Synthetic realtime status',is_read:false,link:null,created_at:new Date().toISOString()});window.fixture.emit()});
      await expect(page.locator('li')).toHaveCount(expectedRows.length+1);
      await page.getByRole('tab',{name:/^Unread/}).click();await expect(page.locator('li').filter({hasText:'Synthetic realtime status'})).toHaveCount(1);
      await page.getByRole('button',{name:'Mark all read',exact:true}).click();await expect(page.locator('li')).toHaveCount(0);
      const queries=await page.evaluate(()=>window.fixture.queries);
      const read=queries.find(q=>q.table==='notifications'&&q.op==='read');
      assert.deepEqual(read.orders,[['created_at',{ascending:false}]]);assert.equal(read.excluded.length,2);
      assert(read.filters.some(([key])=>key==='user_id'));
      assert(queries.every(q=>q.op==='read'||q.op==='update'));
      assert.deepEqual(await page.evaluate(()=>window.fixture.channels.filter(c=>c.active).map(c=>c.filter.filter)),['user_id=eq.00000000-0000-4000-8000-000000000098']);
      await page.evaluate(()=>window.unmountFixture());assert.equal(await page.evaluate(()=>window.fixture.channels.filter(c=>c.active).length),0);
      await page.goto(url+'?error=1');await page.waitForFunction(()=>window.fixture.pending.length>0);await page.evaluate(()=>window.fixture.release());
      await expect(page.getByText(/Couldn't load notifications/)).toBeVisible();await expect(page.locator('li')).toHaveCount(0);
      assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
      console.log(`PASS ${surface} ${width}px: categories/badges, read/actions/navigation, realtime, loading/error; no external requests`);
    } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
  });
}
