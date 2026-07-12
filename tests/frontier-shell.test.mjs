import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../frontier/index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../frontier/manifest.webmanifest', import.meta.url), 'utf8'));

assert.match(html, /apple-mobile-web-app-capable/);
assert.match(html, /manifest\.webmanifest/);
assert.match(html, /frontier-lab-acceptance/);
assert.match(html, /\.\.\/url\.json\?x=/);
assert.match(html, /localStorage\.getItem\("aios_token"\)/);
assert.match(html, /\/api\/cards/);
assert.match(html, /Later gates/);
assert.doesNotMatch(html, /One calm surface for the whole AI-OS organism/);
assert.doesNotMatch(html, /[A-Za-z0-9]{32,}/, 'public shell must not embed a console token');
assert.equal(manifest.start_url, './');
assert.equal(manifest.display, 'standalone');
console.log('FRONTIER_HOME_SCREEN_SHELL_PASS stable=same-origin campaign=frontier-lab-acceptance');
