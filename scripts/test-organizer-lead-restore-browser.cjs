/* eslint-disable @typescript-eslint/no-require-imports -- Real outreach tab in desktop/mobile Chromium; loopback only. */
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const { test } = require('node:test');
const { build } = require('esbuild');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const { chromium, expect } = require('@playwright/test');
const { ID, OTHER } = require('./organizer-restore-harness.cjs');
const ROOT = path.resolve(__dirname,'..');
const removed = (id,title) => ({id,title,pitchSentAt:null,hasLastRecipient:false,imageRequests:0});

test('review, pagination, cancellation, conflict and existing CRM management in desktop/mobile Chromium',async()=>{
  const bundle = await build({stdin:{contents:`import React,{useState} from 'react';import{createRoot}from'react-dom/client';
    import Tab from './src/app/admin/_tabs/OutreachTab';import{NotificationProvider}from'./src/context/NotificationContext';
    window.fixture={refreshes:0};function App(){
      const[leads,setLeads]=useState([
        {id:'${ID}',title:'Synthetic active',organizer_email:'active@example.invalid',status:'new',unstop_url:'https://example.invalid/active',created_at:'2026-01-01',notes:'fixture'},
        {id:'${OTHER}',title:'Synthetic held',organizer_email:'held@example.invalid',status:'restored_review',unstop_url:'https://example.invalid/held',created_at:'2026-01-01'}]);
      const[query,setQuery]=useState('');return <NotificationProvider><Tab leads={leads} setLeads={setLeads} loadingLeads={false} loadLeads={async()=>{window.fixture.refreshes++;}} searchQuery={query} setSearchQuery={setQuery}/></NotificationProvider>}
    createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:ROOT,loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'}});
  const css = await postcss([tailwind()]).process('@import "tailwindcss";',{from:path.join(ROOT,'src/app/hm05-fixture.css')});
  const server=http.createServer((req,res)=>{
    res.setHeader('content-type',req.url==='/bundle.js'?'text/javascript':req.url==='/style.css'?'text/css':'text/html');
    res.end(req.url==='/bundle.js'?bundle.outputFiles[0].text:req.url==='/style.css'?css.css:'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  });
  let browser;
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
    browser=await chromium.launch();
    for(const width of [1440,390]) for(const success of [true,false]){
      const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',reducedMotion:'reduce'});
      try{
        const writes=[],reads=[],external=[];let restored=false;
        await context.route('**/*',route=>{
          const req=route.request(),url=new URL(req.url());
          if(url.origin!==origin){external.push(req.url());return route.abort();}
          if(url.pathname==='/api/admin/organizer-leads/removed'){
            reads.push(url.search);
            return route.fulfill({json:{leads:restored?[]:[url.searchParams.has('cursor')?removed(OTHER,'Synthetic removed B'):removed(ID,'Synthetic removed A')],nextCursor:restored||url.searchParams.has('cursor')?null:ID}});
          }
          if(url.pathname==='/api/admin/organizer-leads/restore'){
            writes.push({path:url.pathname,body:req.postDataJSON()});restored=success;
            return route.fulfill({status:success?200:409,json:success?{success:true,leadId:ID,status:'restored_review'}:{error:'Conflict'}});
          }
          if(url.pathname==='/api/admin/organizer-leads/update-status'){
            const body=req.postDataJSON();writes.push({path:url.pathname,body});
            return route.fulfill({json:{success:true,lead:{id:body.leadId,status:body.status,notes:body.notes,organizer_email:body.organizerEmail}}});
          }
          if(url.pathname==='/api/admin/send-organizer-pitch'){
            writes.push({path:url.pathname,body:req.postDataJSON()});
            return route.fulfill({json:{dispatch:{intendedRecipientAccepted:true},accounting:{status:'recorded'}}});
          }
          if(url.pathname.startsWith('/api/'))throw Error('Unexpected API '+url.pathname);
          return route.continue();
        });
        const page=await context.newPage();await page.goto(origin);
        await expect(page.getByRole('button',{name:'Review held',exact:true})).toBeDisabled();
        assert.equal(reads.length,0,'No removed records loaded until workflow opened');
        await page.getByRole('button',{name:'Review Removed Leads',exact:true}).click();
        const dialog=page.getByRole('dialog');
        await expect(dialog.getByText('Synthetic removed A',{exact:true})).toBeVisible();
        await expect(dialog.getByText(/human reading unconfirmed/)).toBeVisible();
        const box=await dialog.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1);
        assert.equal(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'No horizontal overflow at mobile width');
        await dialog.getByRole('button',{name:'Next page',exact:true}).click();
        await expect(dialog.getByText('Synthetic removed B',{exact:true})).toBeVisible();
        await dialog.getByRole('button',{name:'Previous page',exact:true}).click();
        await expect(dialog.getByText('Synthetic removed A',{exact:true})).toBeVisible();
        await dialog.getByRole('button',{name:'Review',exact:true}).click();
        await expect(dialog.getByText('Restore Synthetic removed A?',{exact:true})).toBeVisible();assert.equal(writes.length,0);
        await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(writes.length,0);
        await dialog.getByRole('button',{name:'Review',exact:true}).click();
        await dialog.getByRole('button',{name:'Confirm selected restoration',exact:true}).click();
        await expect(dialog.getByText(success?/Selected lead restored to review hold/:/Lead is no longer removed/)).toBeVisible();
        assert.deepEqual(writes,[{path:'/api/admin/organizer-leads/restore',body:{leadId:ID}}]);
        assert.equal(await page.evaluate(()=>window.fixture.refreshes),success?1:0);
        if(!success){await expect(dialog.getByRole('button',{name:'Confirm selected restoration',exact:true})).toBeDisabled();await dialog.getByRole('button',{name:'Refresh removed list',exact:true}).click();await expect(dialog.getByText('Synthetic removed A',{exact:true})).toBeVisible();}
        await dialog.getByRole('button',{name:'Close',exact:true}).click();
        const activeRow=page.getByRole('row').filter({hasText:'Synthetic active'});
        await activeRow.getByRole('combobox').selectOption('replied');
        await expect(activeRow.getByRole('combobox')).toHaveValue('replied');
        await activeRow.getByRole('button',{name:'Notes',exact:true}).click();
        await expect(page.getByText('Edit Lead CRM Details',{exact:true})).toBeVisible();
        await page.getByPlaceholder('Record negotiation details, Telegram handles, custom requirements, or follow-up notes...').fill('Synthetic CRM review');
        await page.getByRole('button',{name:'Save CRM Details',exact:true}).click();
        await expect(activeRow.getByText('Synthetic CRM review',{exact:true})).toBeVisible();
        await activeRow.getByRole('button',{name:'Re-pitch',exact:true}).click();
        await expect(page.getByText('Pitch Partnership for Synthetic active',{exact:true})).toBeVisible();
        assert.equal(writes.filter(w=>w.path==='/api/admin/send-organizer-pitch').length,0,'Opening composer does not send');
        await page.getByRole('button',{name:'Send Proposal',exact:true}).click();
        await expect(page.getByText('Provider accepted the proposal. Delivery is not confirmed.',{exact:true})).toBeVisible();
        assert.equal(writes.filter(w=>w.path==='/api/admin/send-organizer-pitch').length,1);
        assert.equal(writes.at(-1).body.leadId,ID);
        assert.deepEqual(external,[]);
      }finally{await context.close();}
    }
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
});
