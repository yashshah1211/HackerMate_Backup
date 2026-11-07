/* eslint-disable @typescript-eslint/no-require-imports -- Actual confirmation provider/tab in Chromium, loopback fixtures only. */
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const { test } = require('node:test');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');
const ROOT = path.resolve(__dirname, '..');

test('permanent deletion confirmation, cancellation and truthful feedback at desktop/mobile', async () => {
  const bundle = await build({ stdin: { contents: `import React,{useState} from 'react';import{createRoot}from'react-dom/client';
    import Tab from './src/app/admin/_tabs/NativeHackathonsTab';import{NotificationProvider}from'./src/context/NotificationContext';
    window.fixture={refreshes:0};function App(){const[rows,setRows]=useState([{id:'00000000-0000-4000-8000-000000000101',name:'Synthetic event',status:'pending',created_at:'2026-01-01'}]);
    return <NotificationProvider><Tab nativeHackathons={rows} onRefresh={async()=>{window.fixture.refreshes++;setRows([])}}/></NotificationProvider>}
    createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: ROOT, loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' } });
  const server = http.createServer((req, res) => { res.setHeader('content-type', req.url === '/bundle.js' ? 'text/javascript' : 'text/html'); res.end(req.url === '/bundle.js' ? bundle.outputFiles[0].text : '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>'); });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`; browser = await chromium.launch();
    for (const width of [1440, 390]) for (const accepted of [true, false]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
      try {
        const requests = [], external = [];
        await context.route('**/*', route => {
          const request = route.request(), url = new URL(request.url());
          if (url.origin !== origin) { external.push(request.url()); return route.abort(); }
          if (url.pathname === '/api/admin/hackathons') {
            assert.equal(request.method(), 'POST'); requests.push(request.postDataJSON());
            return route.fulfill({ status: accepted ? 200 : 409, contentType: 'application/json', body: JSON.stringify(accepted ? { success: true, message: 'Hackathon deleted. Teams and accounts preserved.' } : { error: 'Protected related data blocks deletion.' }) });
          }
          return route.continue();
        });
        const page = await context.newPage(); await page.goto(origin);
        await page.getByRole('button', { name: 'Delete', exact: true }).click();
        await expect(page.getByText('PERMANENTLY DELETE HACKATHON', { exact: true })).toBeVisible();
        await expect(page.getByText(/Teams and user accounts are preserved/)).toBeVisible(); assert.equal(requests.length, 0);
        await page.getByRole('button', { name: 'Cancel', exact: true }).click(); assert.equal(requests.length, 0);
        await page.getByRole('button', { name: 'Delete', exact: true }).click();
        await page.getByRole('button', { name: 'Delete Permanently', exact: true }).click();
        await expect(page.getByText(accepted ? 'Hackathon deleted. Teams and accounts preserved.' : 'Protected related data blocks deletion.', { exact: true })).toBeVisible();
        assert.equal(requests.length, 1); assert.equal(requests[0].action, 'delete');
        assert.equal(await page.evaluate(() => window.fixture.refreshes), accepted ? 1 : 0); assert.deepEqual(external, []);
      } finally { await context.close(); }
    }
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
