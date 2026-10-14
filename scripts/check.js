import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const files = ['vite.config.js', 'playwright.config.js'];
async function collect(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) await collect(file);
    else if (item.isFile() && file.endsWith('.js')) files.push(file);
  }
}
for (const directory of ['src', 'bin', 'scripts', 'tests']) await collect(directory);
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0 || result.error) {
    process.exitCode = 1;
    break;
  }
}
if (!process.exitCode) console.log(`Syntax checked ${files.length} JavaScript files.`);
