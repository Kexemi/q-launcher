import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
const source = scripts.at(-1)?.[1];
assert(source, 'launcher script missing');

const store = new Map();
let requests = [];
let approved = false;

function boot(seed) {
  const elements = new Map();
  const windowListeners = new Map();
  const documentListeners = new Map();
  const el = id => {
    if (!elements.has(id)) elements.set(id, { id, style: {}, innerHTML: '', textContent: '' });
    return elements.get(id);
  };
  const location = {
    hash: '', pathname: '/q-launcher/', href: 'https://kexemi.github.io/q-launcher/',
    replaced: null,
    replace(url) { this.replaced = url; },
  };
  const context = {
    console, URL, URLSearchParams, Uint8Array, Date,
    document: {
      getElementById: el,
      visibilityState: 'visible',
      addEventListener(type, handler) { documentListeners.set(type, handler); },
    },
    addEventListener(type, handler) { windowListeners.set(type, handler); },
    history: { replaceState() {} },
    location,
    navigator: { clipboard: { writeText() {} } },
    localStorage: {
      getItem(k) { return store.has(k) ? store.get(k) : null; },
      setItem(k, v) { store.set(k, String(v)); },
      removeItem(k) { store.delete(k); },
    },
    crypto: {
      randomUUID() { return 'device-12345678'; },
      getRandomValues(a) { for (let i = 0; i < a.length; i++) a[i] = seed + i; return a; },
    },
    fetch(url, opts = {}) {
      if (String(url).includes('url.json')) return Promise.resolve({ json: async () => ({ url: 'https://console.example' }) });
      if (String(url).includes('/api/pair/request')) {
        requests.push(JSON.parse(opts.body));
        return Promise.resolve({ json: async () => ({ ok: true }) });
      }
      if (String(url).includes('/api/pair/status')) {
        return Promise.resolve({ json: async () => approved
          ? ({ ok: true, approved: true, token: 'TESTTOKEN', pane: 'hermes' })
          : ({ ok: true, approved: false, pending: true }) });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
    setInterval() { return 1; }, clearInterval() {}, setTimeout,
  };
  vm.runInNewContext(source, context, { filename: 'launcher-index-script.js' });
  return { context, location, elements, windowListeners, documentListeners };
}

const first = boot(1);
await new Promise(r => setTimeout(r, 20));
const firstCode = store.get('aios_pair_code');
assert.match(firstCode, /^[A-Z0-9]{6}$/);
assert.equal(requests.at(-1).code, firstCode);

const second = boot(20);
await new Promise(r => setTimeout(r, 20));
assert.equal(store.get('aios_pair_code'), firstCode, 'reload must reuse the pending pairing code');
assert.equal(requests.at(-1).code, firstCode, 'server request must reuse the same code after reload');

approved = true;
assert.equal(typeof second.windowListeners.get('pageshow'), 'function', 'returning from Telegram must have a pageshow pairing hook');
assert.equal(typeof second.windowListeners.get('focus'), 'function', 'returning from Telegram must have a focus pairing hook');
assert.equal(typeof second.windowListeners.get('online'), 'function', 'network return must resume pairing');
assert.equal(typeof second.documentListeners.get('visibilitychange'), 'function', 'foreground visibility must resume pairing');
second.windowListeners.get('pageshow')();
await new Promise(r => setTimeout(r, 20));
assert.equal(store.get('aios_token'), 'TESTTOKEN');
assert.equal(store.has('aios_pair_code'), false, 'approved pending code must be cleared');
assert.match(second.location.replaced, /\/t\/TESTTOKEN\/#hermes$/);
console.log('PAIRING_RELOAD_AND_AUTO_RESUME_PASS');
