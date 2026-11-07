/* eslint-disable @typescript-eslint/no-require-imports -- Real React/confirmation provider in isolated desktop/mobile Chromium. */
const assert=require('node:assert/strict'),path=require('node:path'),http=require('node:http');
const {test}=require('node:test'),{build}=require('esbuild'),postcss=require('postcss'),tailwind=require('@tailwindcss/postcss');
const {chromium,expect}=require('@playwright/test');
const ID='00000000-0000-4000-8000-000000000691',PRIOR='00000000-0000-4000-8000-000000000692',ROOT=path.resolve(__dirname,'..');
test('manual double clicks, uncertain outcomes and explicit repeat confirmation in desktop/mobile Chromium',async()=>{
 const js=await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import Tab from'./src/app/admin/_tabs/OutreachTab';import{NotificationProvider}from'./src/context/NotificationContext';
 window.fixture={refreshes:0};createRoot(document.getElementById('root')).render(<NotificationProvider><Tab leads={[{id:'${ID}',title:'Synthetic organizer',status:'new',organizer_email:'organizer@example.invalid',unstop_url:'https://example.invalid/fixture',created_at:'2026-01-01'}]} setLeads={()=>{}} loadingLeads={false} loadLeads={async()=>{window.fixture.refreshes++;}} searchQuery="" setSearchQuery={()=>{}}/></NotificationProvider>);`,resolveDir:ROOT,loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'}});
 const css=await postcss([tailwind()]).process('@import "tailwindcss";',{from:path.join(ROOT,'src/app/hm06-fixture.css')});
 const server=http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/bundle.js'?'text/javascript':req.url==='/style.css'?'text/css':'text/html');res.end(req.url==='/bundle.js'?js.outputFiles[0].text:req.url==='/style.css'?css.css:'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');});
 let browser;
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch();
  for(const width of [1440,390])for(const scenario of ['repeat','unknown']){
   const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',reducedMotion:'reduce'});
   try{
    const requests=[],external=[];let providerContacts=0;
    await context.route('**/*',async route=>{
     const req=route.request(),url=new URL(req.url());
     if(url.origin!==origin){external.push(req.url());return route.abort();}
     if(url.pathname==='/api/admin/send-organizer-pitch'){
      const payload=req.postDataJSON();requests.push(payload);await new Promise(r=>setTimeout(r,80));
      if(scenario==='unknown'){providerContacts++;return route.fulfill({status:502,json:{dispatch:{status:'unknown'},retrySafe:false}});}
      if(requests.length===1)return route.fulfill({status:409,json:{sendState:'approval_required',repeatOf:PRIOR,retrySafe:false}});
      assert.equal(payload.repeatOf,PRIOR);providerContacts++;
      return route.fulfill({json:{intentId:payload.intentId,dispatch:{status:'accepted',intendedRecipientAccepted:true},accounting:{status:'recorded'},intentJournal:'recorded',retrySafe:false}});
     }
     assert(!url.pathname.startsWith('/api/'),'Unexpected application endpoint');return route.continue();
    });
    const page=await context.newPage();await page.goto(origin);await page.getByRole('button',{name:'Pitch',exact:true}).click();
    const send=page.getByRole('button',{name:'Send Proposal',exact:true});
    await send.evaluate(el=>{el.click();el.click();});
    if(scenario==='unknown'){
     await expect(page.getByText('Email acceptance is not confirmed. Review durable state and provider history. DO NOT RESEND.',{exact:true}).first()).toBeVisible();
     await expect(send).toBeDisabled();assert.equal(requests.length,1);assert.equal(providerContacts,1);
     assert.equal(await page.evaluate(()=>window.fixture.refreshes),0);
    }else{
     const authorize=page.getByRole('button',{name:'Review and authorize separate re-pitch',exact:true});
     await expect(authorize).toBeVisible();assert.equal(requests.length,1);assert.equal(providerContacts,0);
     await authorize.click();const dialog=page.getByRole('alertdialog');
     await expect(dialog.getByText('AUTHORIZE A SEPARATE RE-PITCH',{exact:true})).toBeVisible();
     const box=await dialog.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1);
     await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(requests.length,1);assert.equal(providerContacts,0);
     await authorize.click();await page.getByRole('alertdialog').getByRole('button',{name:'Authorize another email',exact:true}).click();
     await expect(page.getByText('Provider accepted the proposal. Delivery is not confirmed.',{exact:true})).toBeVisible();
     assert.equal(requests.length,2);assert.equal(providerContacts,1);assert.notEqual(requests[0].intentId,requests[1].intentId);
     for(const key of ['leadId','recipientEmail','subject','contentHtml'])assert.equal(requests[0][key],requests[1][key]);
     assert.equal(await page.evaluate(()=>window.fixture.refreshes),1);
    }
    assert.deepEqual(external,[]);
   }finally{await context.close();}
  }
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
});
