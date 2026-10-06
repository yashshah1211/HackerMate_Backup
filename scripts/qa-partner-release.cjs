/* eslint-disable @typescript-eslint/no-require-imports -- Offline browser release evidence. */
// Real component HTML/CSS with synthetic fixtures. No .env, Supabase or remote
// assets. This checks layout/native keyboard controls, not full Next hydration.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const presentation = require('./partner-presentation-harness.cjs');
const { dashboardHarness, participant, team, EVENT: WORKSPACE_EVENT } = require('./organizer-workspace-harness.cjs');
const { uiHarness, event, EVENT, PARTNER, TARGET } = require('./partner-admin-harness.cjs');
const root = path.resolve(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(root, 'scratch', 'release-browser'));
const chromePath = process.env.PARTNER_TEST_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const pages = new Map();
let server, chrome, ws, profile;

async function fixtures() {
  const chunks = path.join(root, '.next/static/chunks');
  assert(fs.existsSync(chunks), 'Compile the app first for the repository font assets');
  const fonts = fs.readdirSync(chunks).filter(f => f.endsWith('.css')).flatMap(f =>
    fs.readFileSync(path.join(chunks, f), 'utf8').match(/@font-face\{[^}]*\}/g) || []).join('\n').replaceAll('../media/', '/fonts/');
  const base = `${fonts}:root{--font-ui:'Instrument Sans';--font-display-face:'Bricolage Grotesque';--font-code:'JetBrains Mono';--logo-green:#a3e635;--logo-cyan:#22d3ee}body{margin:0;background:#0f0f0e}`;
  const add = (key, html, css) => pages.set(key, `<!doctype html><html lang="en" class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${base}${css}</style></head><body>${html}</body></html>`);
  const config = presentation.load('src/lib/partners/config.ts');
  const Page = presentation.load('src/components/partners/PublicEventPage.tsx').default;
  const publicCss = fs.readFileSync(path.join(root, 'src/components/partners/PublicEventPage.module.css'), 'utf8');
  const publicFixtures = {
    full: presentation.fixture({ partner: { features: { portal_version: 'organizer-v1', official_website: 'https://example.invalid', approved_links: [{ label: 'Event rules', url: 'https://example.invalid/rules' }] } } }),
    minimal: presentation.fixture({ partner: { tagline: null }, event: { start_date: null, end_date: null, mode: null, location: null, min_team_size: null, max_team_size: null, website_url: null } }),
    'no-event': presentation.fixture({ partner: { hackathon_id: null } }),
    long: presentation.fixture({ partner: { partner_name: 'International Independent Builders Collective' }, event: { name: 'International Collaborative Engineering Build Weekend', location: 'The multidisciplinary engineering and technology campus, east auditorium' } }),
  };
  for (const [name, f] of Object.entries(publicFixtures)) {
    const cfg = config.normalizePartnerConfig(f.partner);
    add(`public/${name}`, renderToStaticMarkup(React.createElement(Page, { config: cfg, event: f.partner.hackathon_id ? config.normalizePublicEvent(f.event, cfg) : null })), publicCss);
  }
  const workspaceCss = fs.readFileSync(path.join(root, 'src/components/partners/OrganizerDashboard.module.css'), 'utf8');
  const rows = Array.from({ length: 500 }, (_, i) => participant(i + 1, { event_teams: [], full_name: i ? `Builder ${i + 1}` : 'Alexandria Chandra Vishwanathan Ramanathan', college: 'International Institute of Multidisciplinary Engineering and Applied Technology', skills: ['TypeScript', 'React', 'PostgreSQL', 'Systems design', 'Data engineering', 'Accessibility', 'Cloud infrastructure', 'Technical writing'] }));
  const teams = Array.from({ length: 5 }, (_, i) => team(i + 1, { team_name: 'Independent Applied Engineering and Systems Research Collective ' + i, registered_member_count: 0, roster: Array.from({ length: i + 2 }, (_, j) => ({ user_id: participant(j + 1).user_id, full_name: 'Team member ' + j, registered_for_event: false })), roles_needed: ['Frontend engineering', 'Product design'], event_min_team_size: 2, event_max_team_size: 4 }));
  const workspaceFixtures = [{ name: 'zero', rows: [], teams: [], query: '' }, { name: 'five', rows: rows.slice(0, 5), teams: teams.slice(0, 1), query: 'tab=participants' }, { name: 'twenty', rows: rows.slice(0, 20), teams, query: 'tab=participants' }, { name: 'fivehundred', rows, teams, query: 'tab=participants&pPage=2' }, { name: 'teams', rows, teams, query: 'tab=teams' }, { name: 'error', rows, teams, query: 'tab=participants', error: true }];
  for (const f of workspaceFixtures) {
    const fetcher = async url => {
      if (f.error) return Response.json({ error: 'Fixture API unavailable' }, { status: 500 });
      const q = new URL(url, 'https://example.invalid').searchParams;
      const meta = { eventId: WORKSPACE_EVENT, section: q.get('section'), retrievedAt: '2026-10-06T12:30:00Z' };
      if (q.get('section') === 'overview') return Response.json({ ...meta, metrics: { registration_count: f.rows.length, confirmed_count: f.rows.filter(r => r.status === 'confirmed').length, waitlisted_count: f.rows.filter(r => r.status === 'waitlisted').length, team_count: f.teams.length, participants_in_team: 0, participants_without_team: f.rows.length, looking_for_team_count: f.rows.filter(r => r.looking_for_team).length, looking_without_team_count: f.rows.filter(r => r.looking_for_team).length } });
      let source = q.get('section') === 'teams' ? f.teams : f.rows;
      if (q.get('sizeState') === 'below_min') source = source.filter(t => t.member_count < t.event_min_team_size);
      if (q.get('sizeState') === 'above_max') source = source.filter(t => t.member_count > t.event_max_team_size);
      const page = Number(q.get('page')), pageSize = Number(q.get('pageSize'));
      return Response.json({ ...meta, rows: source.slice((page - 1) * pageSize, page * pageSize), pagination: { page, pageSize, total: source.length, totalPages: Math.ceil(source.length / pageSize), hasNext: page * pageSize < source.length } });
    };
    const h = await dashboardHarness({ query: f.query, identity: { minTeamSize: f.name === 'zero' ? null : 2, maxTeamSize: f.name === 'zero' ? null : 4 }, fetcher });
    if (['five', 'twenty', 'fivehundred'].includes(f.name)) assert(h.html.includes('International Institute of Multidisciplinary'), `${f.name}: populated participant fixture did not load`);
    if (f.name === 'teams') assert(h.html.includes('Independent Applied Engineering'), 'Team fixture did not load');
    if (f.error) assert(h.html.includes('temporarily unavailable'), 'Error fixture did not show unavailable state');
    add(`workspace/${f.name}`, h.html, workspaceCss);
  }
  const css = (await require('postcss')([require('@tailwindcss/postcss')({ base: root })]).process(fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8'), { from: path.join(root, 'src/app/globals.css') })).css;
  const partner = { id: PARTNER, revision: '0'.repeat(64), slug: 'fixture-partner', partner_name: 'Fixture Collective', hackathon_id: EVENT, tagline: 'Approved introduction', logo_url: null, banner_url: null, accent_color: '#b4f461', portal_version: 'organizer-v1', official_website: 'https://example.invalid', public_contact: null, approved_links: [{ label: 'Public rules', url: 'https://example.invalid/rules' }], registration_mode: 'external' };
  const organizer = { user_id: TARGET, full_name: 'Alexandria Chandra Vishwanathan Ramanathan', created_at: '2026-01-01' };
  for (const name of ['new', 'v1', 'legacy', 'missing', 'error', 'confirm']) {
    const p = name === 'new' ? null : { ...partner, ...(name === 'legacy' ? { portal_version: 'legacy' } : {}), ...(name === 'missing' ? { hackathon_id: '00000000-0000-4000-8000-000000000999' } : {}) };
    const e = event(), events = name === 'missing' ? [] : [e];
    const management = await uiHarness('PartnerManagement', { onChanged: async () => {} }, async () => name === 'error' ? Response.json({ error: 'Configuration service is unavailable.' }, { status: 500 }) : Response.json({ partners: p ? [p] : [], events }));
    if (p && name !== 'error') await management.choose(PARTNER);
    const editor = await uiHarness('PartnerConfigEditor', { partner: p, events, saved() {} }, async () => Response.json({}));
    if (!p) await editor.choose(EVENT);
    const access = await uiHarness('PartnerOrganizerAccess', { eventId: EVENT, eventName: e.name }, async () => Response.json({ eventId: EVENT, organizers: ['v1', 'confirm'].includes(name) ? [organizer] : [] }));
    if (name === 'confirm') await access.click('Revoke assignment');
    add(`admin/${name}`, `<main>${management.html.replace('CHILD_COMPONENT', editor.html).replace('CHILD_COMPONENT', access.html)}</main>`, `${css}body{padding:20px;font-family:'Instrument Sans',sans-serif;color:#f2f0ea}main{max-width:1100px;margin:auto}`);
  }
}

(async () => {
  try {
    await fixtures(); fs.mkdirSync(out, { recursive: true });
    server = http.createServer((req, res) => {
      if (req.url.startsWith('/fonts/')) {
        const file = path.join(root, '.next/static/media', path.basename(req.url));
        if (fs.existsSync(file)) { res.setHeader('Content-Type', 'font/woff2'); res.end(fs.readFileSync(file)); return; }
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(pages.get(req.url.slice(1)) || 'Missing fixture');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    profile = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nexhack-release-chrome-'));
    chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
    chrome.on('error', error => { console.error(error.message); });
    const active = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; !fs.existsSync(active) && i < 150; i++) await delay(100);
    assert(fs.existsSync(active), 'Chrome did not start');
    const debugPort = fs.readFileSync(active, 'utf8').split('\n')[0];
    const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
    ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let sequence = 0; const pending = new Map();
    ws.onmessage = e => { const m = JSON.parse(e.data); if (pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); if (m.error) p.reject(Error(JSON.stringify(m.error))); else p.resolve(m.result); } };
    const cdp = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
    await cdp('Page.enable');
    const checks = [...pages.keys()].flatMap(key => (key.startsWith('admin/') ? [390, 768, 1024, 1440] : [360, 390, 768, 1024, 1440]).map(width => ({ key, width, scale: 1 })));
    checks.push({ key: 'public/full', width: 512, scale: 2 }, { key: 'public/long', width: 180, scale: 2 }, { key: 'workspace/five', width: 512, scale: 2 }, { key: 'workspace/teams', width: 180, scale: 2 }, { key: 'admin/v1', width: 512, scale: 2 }, { key: 'admin/confirm', width: 360, scale: 2 });
    const navigate = async check => {
      await cdp('Emulation.setDeviceMetricsOverride', { width: check.width, height: 1100, deviceScaleFactor: check.scale, mobile: false });
      await cdp('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/${check.key}` }); await delay(120);
      await cdp('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });
    };
    const reports = [];
    for (const check of checks) {
      await navigate(check);
      await cdp('Runtime.evaluate', { expression: "document.querySelector('form details')?.setAttribute('open','');document.querySelector('.mobileRow')?.setAttribute('open','');document.querySelector('.rowDetails')?.setAttribute('open','')" });
      const r = await cdp('Runtime.evaluate', { expression: 'JSON.stringify({width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth,privatePII:document.body.textContent.includes("PRIVATE_")})', returnByValue: true });
      const report = { ...check, ...JSON.parse(r.result.value) };
      assert(report.scroll <= check.width && report.body <= check.width && !report.privatePII, JSON.stringify(report)); reports.push(report);
      if (check.width === 390 || check.width === 1440 || check.scale === 2) {
        const shot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        fs.writeFileSync(path.join(out, `${check.key.replace('/', '-')}-${check.width}-scale${check.scale}.png`), Buffer.from(shot.data, 'base64'));
      }
    }
    const focus = {};
    for (const [surface, key, count] of [['public', 'public/full', 4], ['workspace', 'workspace/five', 10], ['admin', 'admin/v1', 8]]) {
      await navigate({ key, width: 390, scale: 1 }); focus[surface] = [];
      for (let i = 0; i < count; i++) {
        await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        const r = await cdp('Runtime.evaluate', { expression: 'JSON.stringify({tag:document.activeElement.tagName,outline:getComputedStyle(document.activeElement).outlineStyle,label:document.activeElement.getAttribute("aria-label")||document.activeElement.textContent||document.activeElement.name})', returnByValue: true });
        const f = JSON.parse(r.result.value); assert.notEqual(f.tag, 'BODY', `${surface}: Tab missed controls`); assert.notEqual(f.outline, 'none', `${surface}: invisible focus`); focus[surface].push(f);
      }
    }
    await cdp('Browser.close');
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ reports, focus, scope: 'Offline real component HTML/CSS with synthetic hook/API fixtures. No full Next hydration or Supabase session. 200% reflow represented by equivalent CSS viewport and scale 2, not browser UI zoom.' }, null, 2));
    console.log(JSON.stringify({ layouts: reports.length, overflow: 0, keyboardStops: Object.values(focus).reduce((n, a) => n + a.length, 0), output: out }));
  } finally {
    ws?.close(); chrome?.kill(); if (server) await new Promise(resolve => server.close(resolve));
    if (profile) {
      await delay(400); const resolved = fs.realpathSync(profile);
      assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir())); assert(path.basename(resolved).startsWith('nexhack-release-chrome-'));
      fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
