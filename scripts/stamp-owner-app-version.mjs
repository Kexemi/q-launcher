import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const bundleFiles = [
  'app/index.html',
  'app/manifest.webmanifest',
  'app/icons/icon-180.png',
  'app/icons/icon-192.png',
  'app/icons/icon-512.png',
  'frontier/index.html',
  'frontier/manifest.webmanifest',
];
const hash = createHash('sha256');
for (const path of bundleFiles) {
  let bytes = await readFile(new URL(path, root));
  if (/\.(?:html|webmanifest)$/.test(path)) {
    let text = bytes.toString('utf8').replace(/\r\n/g, '\n');
    if (path === 'app/index.html') text = text.replace(/const APP_BUILD="[^"]+";/, 'const APP_BUILD="<VERSION>";');
    bytes = Buffer.from(text);
  }
  hash.update(path);
  hash.update('\0');
  hash.update(bytes);
  hash.update('\0');
}
const bundleSha256 = hash.digest('hex');
const version = `build-${bundleSha256.slice(0, 16)}`;
const indexUrl = new URL('app/index.html', root);
const currentIndex = await readFile(indexUrl, 'utf8');
const nextIndex = currentIndex.replace(/const APP_BUILD="[^"]+";/, `const APP_BUILD="${version}";`);
if (nextIndex === currentIndex && !currentIndex.includes(`const APP_BUILD="${version}";`)) {
  throw new Error('APP_BUILD marker missing');
}
if (nextIndex !== currentIndex) await writeFile(indexUrl, nextIndex, 'utf8');
const receipt = {
  schema: 'aios.owner_app.version.v1',
  version,
  canonical_path: '/q-launcher/app/',
  update_strategy: 'foreground-no-store-same-url',
  service_worker: false,
  bundle_files: bundleFiles,
  bundle_sha256: bundleSha256,
};
await writeFile(new URL('app/app-version.json', root), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(`OWNER_APP_VERSION_STAMP_PASS version=${version} bundle_sha256=${bundleSha256}`);
