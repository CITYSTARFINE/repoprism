import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';

const root = process.cwd();
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
await stat('dist/index.html').catch(() => {
  throw new Error('Run npm run build before packaging.');
});
const output = path.join(root, '.local', 'releases');
await mkdir(output, { recursive: true });
const excluded = new Set([
  'node_modules',
  '.git',
  '.local',
  'dist',
  'test-results',
  'playwright-report',
]);
async function collect(directory, prefix = '', skip = false) {
  const result = {};
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (
      entry.isSymbolicLink() ||
      (skip && (excluded.has(entry.name) || entry.name.endsWith('.log')))
    )
      continue;
    const name = prefix ? prefix + '/' + entry.name : entry.name;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(result, await collect(file, name, skip));
    else if (entry.isFile()) result[name] = new Uint8Array(await readFile(file));
  }
  return result;
}
const encoder = new TextEncoder();
const web = await collect(path.join(root, 'dist'));
web['START-HERE.txt'] = encoder.encode(
  'RepoPrism v' +
    version +
    '\n\nFastest: double-click repoprism.html (standalone app, verified in Chromium/Edge).\n\nFor hosting, unpack this archive. In this folder run:\n\n  python -m http.server 8000\n\nOpen http://localhost:8000 in your browser. The main index.html requires a server.\nNo npm installation is needed for this built web app. Imported code stays in memory.\n',
);
const source = await collect(root, 'repoprism', true);
const checksums = [];
for (const [kind, files] of [
  ['web', web],
  ['source', source],
]) {
  const name = `repoprism-${kind}-v${version}.zip`;
  const bytes = zipSync(files, { level: 6 });
  await writeFile(path.join(output, name), bytes);
  checksums.push(createHash('sha256').update(bytes).digest('hex') + '  ' + name);
  console.log(`${name}: ${(bytes.byteLength / 1024).toFixed(1)} KiB`);
}
await writeFile(path.join(output, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
const portableName = `repoprism-portable-v${version}.html`;
const portable = await readFile('dist/repoprism.html');
await writeFile(path.join(output, portableName), portable);
checksums.push(createHash('sha256').update(portable).digest('hex') + '  ' + portableName);
await writeFile(path.join(output, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
console.log(`${portableName}: ${(portable.byteLength / 1024).toFixed(1)} KiB`);
