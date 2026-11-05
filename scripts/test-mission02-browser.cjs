/* eslint-disable @typescript-eslint/no-require-imports -- Actual UI/CSS in isolated Chromium; no production services. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const ROOT = path.resolve(__dirname, '..');

test('Mission02/03 Chromium: conversation/history/composer/task/permission state at desktop and mobile', async () => {
  const fixture = `
    export const state = {route:'team-one', sends:[],toasts:[],pending:[],channels:[],holdOne:false,oldLoad:null,failSend:false,historyReads:0,taskWrites:[],taskStatus:'todo'};
    window.fixture=state;
    const message=id=>({id:id+'-message',conversation_id:id,sender_id:'other',content:id+' private message',is_read:false,created_at:'2026-11-05T10:00:00Z'});
    const task=id=>({id,team_id:'team-one',title:id,status:'todo',priority:'medium',assignee_id:null,due_date:null,created_at:'2026-11-05T10:00:00Z'});
    const history=n=>({...message('history'),id:'m'+n,content:'History '+n+'!',created_at:'2026-11-05T10:'+String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')+'.123456Z'});
    state.history=history;
    state.event=(event,payload)=>state.channels.find(c=>c.name==='messages:history').callbacks.find(c=>c.filter.table==='messages'&&c.filter.event===event).callback(payload);
    export const supabase={auth:{async getUser(){return {data:{user:{id:'me',email:'me@example.invalid'}},error:null}}},
      rpc(name,args){if(name==='send_message_with_mentions'){state.sends.push(args);if(state.failSend)return Promise.resolve({data:null,error:{code:'42501',message:'Synthetic send denied'}});return new Promise(resolve=>state.pending.push(resolve))}
        return Promise.resolve({data:name==='ensure_team_conversation'?'team-conversation':null,error:null})},
      from(table){let filters=[],single=false,op='read',value,older;return {select(){return this},eq(...v){filters.push(v);return this},in(){return this},or(v){older=v;return this},gt(){return this},order(){return this},range(){return this},limit(){return this},update(v){op='update';value=v;return this},
        delete(){op='delete';return this},maybeSingle(){single=true;return this},single(){single=true;return this},
        then(resolve,reject){let rows=[];const id=filters.find(([k])=>k==='conversation_id')?.[1];
          if(table==='messages'){rows=[message(id)];if(state.holdOne&&id==='one')return new Promise(done=>state.oldLoad=()=>done({data:rows,error:null})).then(resolve,reject)}
          if(table==='messages'&&id==='history'){
            const high=++state.historyReads===1?100:70;
            rows=Array.from({length:30},(_,i)=>history(high-i));state.historyCursor=older;
            return new Promise(done=>state.resolveHistory=()=>done({data:rows,error:null})).then(resolve,reject);
          }
          if(table==='conversations')rows=[{type:'dm'}];
          if(table==='conversation_participants')rows=[{user_id:'me',cleared_at:null},{user_id:'other'}];
          if(table==='profiles')rows=['me','other'].map(id=>({id,full_name:id,avatar_url:null,college:null}));
          if(table==='teams'){const team=filters.find(([k])=>k==='id')?.[1];rows=team?[{id:team,name:team,owner_id:team==='team-one'?'me':'someone-else',team_hackathons:[]}]:[]}
          if(table==='team_tasks'&&op==='read')rows=[{...task('task-one'),status:state.taskStatus},task('task-two')];
          if(table==='team_tasks'&&op==='update')return new Promise(done=>state.taskWrites.push(()=>{state.taskStatus=value.status;done({data:{id:'task-one'},error:null})})).then(resolve,reject);
          return Promise.resolve({data:single?rows[0]||null:rows,error:null}).then(resolve,reject)} }},
      channel(name){const c={name,callbacks:[],on(event,filter,callback){this.callbacks.push({event,filter,callback});return this},subscribe(){return this},unsubscribe(){},send(){},presenceState(){return {}},track(){}};state.channels.push(c);return c},removeChannel(){} };
    export const subscribeWithRetry=channel=>()=>channel.unsubscribe();
    export const useParams=()=>({id:state.route});
    export const useSearchParams=()=>new URLSearchParams('tab=tasks');
    export const useRouter=()=>({replace(){}});
    export const usePathname=()=>'/teams/'+state.route+'/workspace';
    export const useNotification=()=>({showToast:(...args)=>state.toasts.push(args),confirm:config=>config.onConfirm()});
  `;
  const entry = `import React,{useState} from 'react';import{createRoot}from'react-dom/client';
    import Chat from './src/components/chatThread';import Workspace from './src/app/teams/[id]/workspace/page';
    import{state}from'@/lib/supabase';
    function App(){const[conversation,setConversation]=useState('one'),[workspace,setWorkspace]=useState(false),[revision,setRevision]=useState(0);
      Object.assign(state,{switchConversation:setConversation,showWorkspace:()=>setWorkspace(true),switchTeam:id=>{state.route=id;setRevision(n=>n+1)}});
      return <main data-v2 style={{height:'100dvh',minWidth:0}} data-revision={revision}>{workspace?<Workspace/>:<Chat conversationId={conversation} currentUserId="me" height="100dvh"/>}</main>}
    createRoot(document.getElementById('root')).render(<App/>);`;
  const bundle = await build({ stdin: { contents: entry, resolveDir: ROOT, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"' }, plugins: [{ name: 'synthetic-collaboration', setup(builder) {
      builder.onResolve({ filter: /^(@\/lib\/supabase|next\/navigation|@\/context\/NotificationContext)$/ }, () => ({ path: 'client', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: fixture, loader: 'js' }));
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'link' }));
      builder.onLoad({ filter: /.*/, namespace: 'link' }, () => ({ contents: "import React from 'react';export default ({href,children,...props})=><a href={href} {...props}>{children}</a>;", resolveDir: ROOT, loader: 'jsx' }));
      builder.onResolve({ filter: /^@\/components\/(LinkPreviewCard|ImageLightbox|VoiceNotePlayer|ShareModal|PPTEvaluatorTab|SmartGapFiller|workspace\/(SharedTeamDocument|HackathonRunMode))$/ }, () => ({ path: 'empty', namespace: 'empty' }));
      builder.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: 'export default function(){return null}' }));
    } }] });
  const css = await postcss([tailwind({ base: ROOT })]).process(fs.readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8'), { from: path.join(ROOT, 'src/app/globals.css') });
  const server = http.createServer((req, res) => {
    if (req.url === '/bundle.js') { res.setHeader('content-type','text/javascript'); res.end(bundle.outputFiles[0].text); }
    else if (req.url === '/style.css') { res.setHeader('content-type','text/css'); res.end(css.css); }
    else { res.setHeader('content-type','text/html'); res.end('<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>'); }
  });
  let browser;
  try {
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
    const origin='http://127.0.0.1:'+server.address().port;
    browser=await chromium.launch();
    const output=path.join(ROOT,'scratch/mission02/browser');fs.mkdirSync(output,{recursive:true});
    for(const width of [1440,390]){
      const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
      try{
        const external=[],errors=[];
        await context.route('**/*',route=>{const req=route.request();if(new URL(req.url()).origin===origin&&req.method()==='GET')return route.continue();external.push(req.url());return route.abort()});
        const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
        await page.goto(origin);await expect(page.getByText('one private message',{exact:true})).toBeVisible();
        const input=page.getByRole('textbox',{name:'Message',exact:true});await input.fill('Private draft for one');
        await page.evaluate(()=>window.fixture.switchConversation('two'));
        await expect(input).toHaveValue('');await expect(page.getByText('two private message',{exact:true})).toBeVisible();
        await expect(page.getByText('one private message',{exact:true})).toHaveCount(0);
        await input.fill('One intended message');await input.press('Enter');await input.press('Enter');
        await page.waitForFunction(()=>window.fixture.sends.length===1);assert.equal(await page.evaluate(()=>window.fixture.sends.length),1);
        await input.fill('Newer unsent draft');await page.evaluate(()=>window.fixture.pending[0]({data:'saved',error:null}));await expect(input).toHaveValue('Newer unsent draft');
        await page.evaluate(()=>window.fixture.switchConversation('history'));await page.waitForFunction(()=>typeof window.fixture.resolveHistory==='function');
        await page.evaluate(()=>{const s=window.fixture;s.event('INSERT',{new:s.history(101)});s.event('UPDATE',{new:{...s.history(99),content:'Newer realtime edit'}});s.event('DELETE',{old:{id:'m100'}});s.resolveHistory()});
        await expect(page.getByText('History 101!',{exact:true})).toHaveCount(1);await expect(page.getByText('History 100!',{exact:true})).toHaveCount(0);
        await expect(page.getByText('Newer realtime edit',{exact:true})).toHaveCount(1);
        await page.getByRole('log',{name:'Messages'}).evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll',{bubbles:true}))});
        await page.waitForFunction(()=>window.fixture.historyReads===2);
        await page.evaluate(()=>{const s=window.fixture;s.event('INSERT',{new:s.history(102)});s.event('DELETE',{old:{id:'m70'}});s.resolveHistory()});
        await expect(page.getByText('History 71!',{exact:true})).toHaveCount(1);await expect(page.getByText('History 41!',{exact:true})).toHaveCount(1);
        await expect(page.getByText('History 70!',{exact:true})).toHaveCount(0);
        assert((await page.evaluate(()=>window.fixture.historyCursor)).includes('created_at.lt.'));
        await page.evaluate(()=>window.fixture.showWorkspace());await expect(page.getByRole('button',{name:'task-one',exact:true})).toBeVisible();
        const status=page.getByRole('combobox',{name:'Status for task-one',exact:true});
        await status.selectOption('in_progress');await status.selectOption('completed');
        await page.waitForFunction(()=>window.fixture.taskWrites.length===1);assert.equal(await page.evaluate(()=>window.fixture.taskWrites.length),1);
        await page.evaluate(()=>window.fixture.taskWrites[0]());await page.waitForFunction(()=>window.fixture.taskWrites.length===2);
        await page.evaluate(()=>window.fixture.taskWrites[1]());await expect(status).toHaveValue('completed');
        assert.equal(await page.evaluate(()=>window.fixture.taskStatus),'completed');
        await page.getByRole('button',{name:'Delete task task-one',exact:true}).click();await page.waitForFunction(()=>window.fixture.toasts.length>0);
        assert.equal(await page.evaluate(()=>window.fixture.toasts.some(args=>args[1]==='success')),false);
        await expect(page.getByRole('button',{name:'task-one',exact:true})).toBeVisible();
        await page.screenshot({path:path.join(output,'tasks-'+width+'.png')});
        await status.selectOption('in_progress');await status.selectOption('todo');
        await page.waitForFunction(()=>window.fixture.taskWrites.length===3);
        await page.evaluate(()=>window.fixture.switchTeam('team-two'));await expect(page.getByText("team-two's workspace is members-only",{exact:true})).toBeVisible();
        await page.evaluate(()=>window.fixture.taskWrites[2]());
        assert.equal(await page.evaluate(()=>window.fixture.taskWrites.length),3,'queued old-workspace edit must not dispatch after route unmount');
        await expect(page.getByRole('button',{name:'New task',exact:true})).toHaveCount(0);
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.screenshot({path:path.join(output,'visitor-'+width+'.png')});
        assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
        console.log('PASS '+width+'px: thread isolation, single send, retained draft, cursor/realtime history, serialized task commits, honest deletion and membership gate; zero external requests');
      }finally{await context.close()}
    }
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
});
