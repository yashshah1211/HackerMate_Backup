/* eslint-disable @typescript-eslint/no-require-imports -- Offline TypeScript module tests. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..');

function harness(overrides = {}, globals = {}) {
  const cache = new Map();
  const env = { GEMINI_API_KEY: 'offline-fixture-key' };
  function load(relative) {
    const filename = path.resolve(ROOT, relative);
    if (cache.has(filename)) return cache.get(filename);
    const exports = {};
    cache.set(filename, exports);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(code, {
      exports, Buffer, URL, AbortSignal, Uint8Array, Response, Request, Headers, setTimeout, clearTimeout,
      process: { env }, console: { log() {}, warn() {}, error() {} },
      // Network is forbidden unless a test supplies an explicit mock.
      fetch: async () => { throw new Error('Unexpected live network call'); },
      ...globals,
      require(name) {
        if (Object.hasOwn(overrides, name)) return overrides[name];
        if (name.startsWith('@/') || name.startsWith('.')) {
          const target = name.startsWith('@/') ? path.join(ROOT, 'src', name.slice(2)) : path.resolve(path.dirname(filename), name);
          const file = ['.ts', '.tsx', ''].map(ext => target + ext).find(file => fs.existsSync(file) && fs.statSync(file).isFile());
          if (file) return load(path.relative(ROOT, file));
        }
        return require(name);
      },
    }, { filename });
    return exports;
  }
  return { load, env };
}
module.exports = { harness, ROOT };
