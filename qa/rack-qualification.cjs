// Hosted-CI/local qualification only. No deployment, production keys or .env files.
(async () => {
  const { default: fs } = await import('node:fs');
  const { default: path } = await import('node:path');
  const { default: http } = await import('node:http');
  const { spawn } = await import('node:child_process');
  const { pathToFileURL } = await import('node:url');
  const mode = process.argv[2];
  if (!['tests', 'browser', 'funnel-browser', 'build', 'retirement', 'ppt-browser'].includes(mode)) throw Error('Choose tests, browser, funnel-browser, build, retirement or ppt-browser');
  for (const file of ['.env', '.env.local', '.env.production', '.env.production.local', '.env.development', '.env.development.local', '.env.test', '.env.test.local']) {
    if (fs.existsSync(file)) throw Error('Refusing qualification with environment file: ' + file);
  }
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'TEMP', 'TMP', 'COMSPEC']) if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, { CI: 'true', NEXT_TELEMETRY_DISABLED: '1', EVALUATOR_GENERATION_ENABLED: 'false',
    NODE_OPTIONS: '--import=' + pathToFileURL(path.resolve('qa/fixtures/rack-network-guard.mjs')).href });
  let server, reads = 0, mutations = 0;
  try {
    if (mode === 'build' || mode === 'retirement') {
      server = http.createServer((req, res) => {
        res.setHeader('content-type', 'application/json');
        if (!['GET', 'HEAD'].includes(req.method)) { mutations++; res.statusCode = 405; res.end('{}'); return; }
        reads++; res.setHeader('content-range', '0-0/0'); res.end(req.method === 'HEAD' ? '' : '[]');
      });
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      Object.assign(env, { NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:' + server.address().port,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anonymous', NEXT_PUBLIC_SITE_URL: 'https://offline.example.invalid',
        NEXT_FONT_GOOGLE_MOCKED_RESPONSES: path.resolve('qa/fixtures/rack-font-mock.cjs') });
    }
    const tests = ['scripts/test-rack-it-up-2026.cjs', 'scripts/test-rack-conversion-funnel.cjs', 'scripts/test-partner-presentation.cjs', 'scripts/test-partner-discovery-navigation.cjs', 'scripts/test-partner-admin.cjs', 'scripts/test-partner-authorization.cjs',
      'scripts/test-auth-return-paths.cjs', 'scripts/test-auth-return-ui.cjs', 'scripts/test-onboarding-submission.cjs', 'scripts/test-public-hackathon-browsing.cjs', 'scripts/test-event-compatibility.cjs'];
    const args = mode === 'retirement' ? ['qa/browser/feature-retirement.cjs'] : mode === 'ppt-browser' ? ['scripts/test-evaluator-reliability-browser.cjs'] : mode === 'build' ? ['node_modules/next/dist/bin/next', 'build', '--webpack']
      : mode === 'browser' ? ['qa/browser/rack-it-up-2026.cjs'] : mode === 'funnel-browser' ? ['qa/browser/rack-conversion-funnel.cjs'] : ['--test', '--test-concurrency=1', ...tests];
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, { env, stdio: 'inherit', timeout: 600000 });
      child.on('error', reject); child.on('exit', value => resolve(value ?? 1));
    });
    console.log(JSON.stringify({ mode, exit: code, syntheticReads: reads, mutations }));
    if (code !== 0 || mutations !== 0) process.exitCode = 1;
  } finally { if (server) await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
