/* eslint-disable @typescript-eslint/no-require-imports -- Explicit offline loader; never uses process credentials or the network. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..');
function load(relative, options = {}) {
  const filename = path.join(ROOT, relative);
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { exports, URL, Intl, Buffer, Date, AbortSignal: options.abortSignal || AbortSignal,
    process: { env: options.env || {} }, console: { log: (...args) => options.logs?.push(args), error: (...args) => options.logs?.push(args) },
    fetch: options.fetch || (() => { throw new Error('No real network in communications tests.'); }),
    require(name) {
      if (name === 'server-only') return {};
      if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
      if (name === 'next/navigation') return { notFound() { throw new Error('NEXT_NOT_FOUND'); } };
      if (name.startsWith('@/') || name.startsWith('.')) {
        const target = name.startsWith('@/') ? path.join(ROOT, 'src', name.slice(2)) : path.resolve(path.dirname(filename), name);
        const file = ['.ts', '.tsx'].map(ext => target + ext).find(fs.existsSync);
        if (file) return load(path.relative(ROOT, file), options);
      }
      return require(name);
    },
  }, { filename });
  return exports;
}
module.exports = { ROOT, load };
