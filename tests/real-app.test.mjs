import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../app/index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../app/manifest.webmanifest', import.meta.url), 'utf8'));

assert.match(html, /AI-OS/);
assert.match(html, /data-view="world"/);
assert.match(html, /data-view="decisions"/);
assert.match(html, /data-view="focus"/);
assert.match(html, /\/api\/app-state/);
assert.match(html, /\/api\/cards\?campaign=/);
assert.match(html, /frontier-lab-acceptance/);
assert.match(html, /url\.json/);
assert.match(html, /reconnect/i);
assert.match(html, /AbortController|timeout/i);
assert.doesNotMatch(html, /location\.replace\([^)]*currentTunnel/);
assert.doesNotMatch(html, /href\s*=\s*BASE/);
assert.doesNotMatch(html, /One calm surface for the whole AI-OS organism/);
assert.match(manifest.start_url, /^\.\//);
assert.equal(manifest.display, 'standalone');
console.log('REAL_APP_STRUCTURE_PASS same-origin=true internal-views=3');
