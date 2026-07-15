import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const repo = process.cwd();
const originalHtml = await readFile(join(repo, 'app/index.html'), 'utf8');
const originalBuild = originalHtml.match(/const APP_BUILD="([^"]+)";/)?.[1];
assert.ok(originalBuild, 'APP_BUILD marker missing');
let servedBuild = originalBuild;
let advertisedBuild = servedBuild;
let htmlRequests = 0;
const versionRequests = [];
const mime = { '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const server = createServer(async (req, res) => {
  try {
    const rawPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (rawPath === '/q-launcher/app') {
      res.writeHead(308, { Location: '/q-launcher/app/' });
      res.end();
      return;
    }
    const mountedPath = rawPath.startsWith('/q-launcher/') ? rawPath.slice('/q-launcher'.length) : rawPath;
    if (mountedPath === '/app/app-version.json') {
      versionRequests.push(req.headers);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ schema: 'aios.owner_app.version.v1', version: advertisedBuild, canonical_path: '/q-launcher/app/', update_strategy: 'foreground-no-store-same-url', service_worker: false }));
      return;
    }
    let rel = mountedPath;
    if (rel.endsWith('/')) rel += 'index.html';
    if (rel === '/app/index.html') {
      htmlRequests += 1;
      const html = originalHtml.replace(/const APP_BUILD="[^"]+";/, `const APP_BUILD="${servedBuild}";`);
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' });
      res.end(html);
      return;
    }
    const file = normalize(join(repo, rel.replace(/^\//, '')));
    if (!file.startsWith(normalize(repo))) throw Error('scope');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 665 } });
  const initialVersionResponse = page.waitForResponse((response) => response.url().includes('/app/app-version.json'));
  await page.goto(`${origin}/q-launcher/app#world`, { waitUntil: 'domcontentloaded' });
  await initialVersionResponse;
  await page.waitForTimeout(100);
  assert.equal(new URL(page.url()).pathname, '/q-launcher/app/');
  assert.equal(new URL(page.url()).hash, '#world');

  const nextBuild = `${originalBuild}-next`;
  advertisedBuild = nextBuild;
  const htmlBeforeLag = htmlRequests;
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  await page.waitForURL((url) => url.pathname === '/q-launcher/app/' && url.searchParams.get('app-build') === nextBuild && url.hash === '#world');
  await page.waitForFunction((build) => APP_BUILD === build, originalBuild);
  await page.waitForTimeout(600);
  const lagReloads = htmlRequests - htmlBeforeLag;
  assert.equal(lagReloads, 1, 'version-first CDN propagation must cause exactly one cache-busting reload');

  servedBuild = nextBuild;
  const htmlBeforeRecovery = htmlRequests;
  await page.evaluate((build) => {
    sessionStorage.setItem(`aios-update-retry:${build}`, String(Date.now() - 61000));
    window.dispatchEvent(new Event('pageshow'));
  }, nextBuild);
  await page.waitForFunction((build) => APP_BUILD === build, nextBuild);
  const recoveryReloads = htmlRequests - htmlBeforeRecovery;
  assert.equal(recoveryReloads, 1, 'foreground retry must load caught-up HTML without manual reload or reinstall');
  await page.waitForTimeout(350);
  const settledHtmlRequests = htmlRequests;
  await page.waitForTimeout(400);
  assert.equal(htmlRequests, settledHtmlRequests, 'settled build must not enter a reload loop');

  const final = new URL(page.url());
  assert.equal(final.origin, origin, 'update must never rotate app origin');
  assert.equal(final.pathname, '/q-launcher/app/', 'update must preserve canonical installed path');
  assert.equal(final.hash, '#world', 'update must preserve current app view');
  assert.equal(final.searchParams.get('app-build'), servedBuild);
  assert.ok(versionRequests.length >= 2, 'load and foreground must check current build');
  assert.ok(versionRequests.some((headers) => /no-cache|max-age=0/i.test(headers['cache-control'] || '')), 'no-store fetch must bypass stale version cache');
  const registrations = await page.evaluate(async () => navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0);
  assert.equal(registrations, 0, 'no stale service worker may own the permanent shell');
  console.log(JSON.stringify({ pass: true, canonical: '/q-launcher/app/', no_slash_entry_redirected: true, old_build: originalBuild, new_build: servedBuild, same_origin: true, service_workers: registrations, version_first_lag_reloads: lagReloads, automatic_recovery_reloads: recoveryReloads }));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
