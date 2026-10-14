import { readdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const files = [];
await copyFile('LICENSE', 'dist/LICENSE.txt');
await copyFile('THIRD_PARTY_NOTICES.md', 'dist/THIRD_PARTY_NOTICES.txt');
async function walk(folder = 'dist', relative = '') {
  for (const item of await readdir(folder, { withFileTypes: true })) {
    const name = relative ? relative + '/' + item.name : item.name;
    if (item.isDirectory()) await walk(path.join(folder, item.name), name);
    else if (item.isFile() && item.name !== 'sw.js') files.push(name);
  }
}
await walk();
files.sort();
const hash = createHash('sha256');
for (const file of files) hash.update(await readFile(path.join('dist', file)));
const version = 'repoprism-' + hash.digest('hex').slice(0, 16);
const source = `// Generated app-shell cache. Repository content is never cached here.
const PREFIX = 'repoprism:' + new URL(self.registration.scope).pathname + ':';
const CACHE = PREFIX + ${JSON.stringify(version)};
const ASSETS = ${JSON.stringify(files)};
const urls = ASSETS.map(name => new URL(name, self.registration.scope).href);
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(urls))));
self.addEventListener('activate', event => event.waitUntil(Promise.all([
  caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))),
  self.clients.claim()
])));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const home = new URL(self.registration.scope).pathname;
  if (event.request.mode === 'navigate' && (url.pathname === home || url.pathname === new URL('index.html', self.registration.scope).pathname)) {
    event.respondWith(fetch(event.request).catch(() => caches.match(new URL('index.html', self.registration.scope).href)));
  } else if (urls.includes(url.href)) {
    event.respondWith(caches.match(url.href).then(cached => cached || fetch(event.request)));
  }
});
`;
await writeFile('dist/sw.js', source);
console.log('Offline app shell generated: ' + files.length + ' assets.');
