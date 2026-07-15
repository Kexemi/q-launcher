import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const here = new URL('../', import.meta.url);
const appHtml = await readFile(new URL('app/index.html', here), 'utf8');
const appManifest = JSON.parse(await readFile(new URL('app/manifest.webmanifest', here), 'utf8'));
const frontierHtml = await readFile(new URL('frontier/index.html', here), 'utf8');
const frontierManifest = JSON.parse(await readFile(new URL('frontier/manifest.webmanifest', here), 'utf8'));
const version = JSON.parse(await readFile(new URL('app/app-version.json', here), 'utf8'));
const runtime = JSON.parse((await readFile(new URL('url.json', here), 'utf8')).replace(/^\uFEFF/, ''));

const CANONICAL_ID = '/q-launcher/app/';
assert.equal(appManifest.id, CANONICAL_ID, 'installed app identity must never rotate');
assert.equal(frontierManifest.id, CANONICAL_ID, 'legacy install surface must identify the same app');
assert.equal(appManifest.start_url, './#world');
assert.equal(appManifest.scope, '../');
assert.equal(appManifest.display, 'standalone');
assert.equal(frontierManifest.start_url, '../app/#world');
assert.equal(frontierManifest.scope, '../');
assert.equal(runtime.url, 'https://workstation.tail6bd8e8.ts.net');
assert.equal(runtime.transport, 'tailscale-serve');
assert.equal(runtime.stable, true);
assert.doesNotMatch(JSON.stringify(runtime), /trycloudflare\.com/i);
assert.match(frontierHtml, /location\.replace/);
assert.match(frontierHtml, /\.\.\/app\/#world/);

assert.equal(version.schema, 'aios.owner_app.version.v1');
assert.equal(version.canonical_path, CANONICAL_ID);
assert.equal(version.update_strategy, 'foreground-no-store-same-url');
assert.equal(version.service_worker, false);
const bundleFiles = [
  'app/index.html',
  'app/manifest.webmanifest',
  'app/icons/icon-180.png',
  'app/icons/icon-192.png',
  'app/icons/icon-512.png',
  'frontier/index.html',
  'frontier/manifest.webmanifest',
];
assert.deepEqual(version.bundle_files, bundleFiles);
const bundleHash = createHash('sha256');
for (const path of bundleFiles) {
  let bytes = await readFile(new URL(path, here));
  if (/\.(?:html|webmanifest)$/.test(path)) {
    let text = bytes.toString('utf8').replace(/\r\n/g, '\n');
    if (path === 'app/index.html') text = text.replace(/const APP_BUILD="[^"]+";/, 'const APP_BUILD="<VERSION>";');
    bytes = Buffer.from(text);
  }
  bundleHash.update(path);
  bundleHash.update('\0');
  bundleHash.update(bytes);
  bundleHash.update('\0');
}
const expectedBundleHash = bundleHash.digest('hex');
assert.equal(version.bundle_sha256, expectedBundleHash, 'release version must bind every install-critical byte');
assert.equal(version.version, `build-${expectedBundleHash.slice(0, 16)}`, 'version must change with install-critical bytes');
const build = appHtml.match(/const APP_BUILD="([^"]+)"/)?.[1];
assert.equal(build, version.version, 'HTML build and no-store version endpoint must agree');
assert.match(appHtml, /app-version\.json/);
assert.match(appHtml, /cache:\s*"no-store"/);
assert.match(appHtml, /pageshow/);
assert.match(appHtml, /visibilitychange/);
assert.match(appHtml, /app-build/);
assert.match(appHtml, /searchParams\.get\("app-build"\)===next/);
assert.match(appHtml, /location\.replace/);
assert.doesNotMatch(appHtml, /serviceWorker|service-worker/i, 'service workers can pin stale iOS builds');

assert.match(appHtml, /apple-mobile-web-app-capable/);
assert.match(appHtml, /apple-mobile-web-app-title/);
assert.match(appHtml, /icons\/icon-180\.png/);
const expectedIcons = new Map([
  ['icons/icon-192.png', '192x192'],
  ['icons/icon-512.png', '512x512'],
]);
for (const [src, sizes] of expectedIcons) {
  const row = appManifest.icons.find((icon) => icon.src === src);
  assert.ok(row, `manifest missing ${src}`);
  assert.equal(row.sizes, sizes);
  assert.equal(row.type, 'image/png');
}

function pngDimensions(buffer) {
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG');
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}
for (const [path, expected] of [
  ['app/icons/icon-180.png', [180, 180]],
  ['app/icons/icon-192.png', [192, 192]],
  ['app/icons/icon-512.png', [512, 512]],
]) {
  const bytes = await readFile(new URL(path, here));
  assert.deepEqual(pngDimensions(bytes), expected, `${path} must have true declared dimensions`);
}

console.log(`PERMANENT_HOME_SCREEN_CONTRACT_PASS id=${CANONICAL_ID} build=${version.version}`);
