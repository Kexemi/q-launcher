import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../frontier/index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../frontier/manifest.webmanifest', import.meta.url), 'utf8'));

assert.match(html, /apple-mobile-web-app-capable/);
assert.match(html, /manifest\.webmanifest/);
assert.match(html, /location\.replace/);
assert.match(html, /\.\.\/app\/#world/);
assert.doesNotMatch(html, /\/api\/cards/);
assert.doesNotMatch(html, /frontier-lab-acceptance/);
assert.doesNotMatch(html, /[A-Za-z0-9]{32,}/, 'legacy migration must not embed a console token');
assert.equal(manifest.name, 'AI-OS');
assert.equal(manifest.start_url, '../app/#world');
assert.equal(manifest.scope, '../');
assert.equal(manifest.display, 'standalone');
console.log('FRONTIER_HOME_SCREEN_MIGRATION_PASS target=../app/#world same-origin=true');
