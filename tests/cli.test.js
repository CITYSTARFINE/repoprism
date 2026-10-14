import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readRepository } from '../bin/repoprism.js';
const run = promisify(execFile);
const cli = path.resolve('bin/repoprism.js');
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'repoprism-test-'));
  t.after(async () => {
    // Only remove the test-owned temporary directory with its verified prefix.
    assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()));
    assert(path.basename(root).startsWith('repoprism-test-'));
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, 'README.md'), '# CLI fixture');
  await writeFile(path.join(root, 'src', 'main.ts'), 'export const answer = 42;');
  await writeFile(path.join(root, '.env'), 'PASSWORD=private_value');
  return root;
}
test('CLI scans a directory, excludes private files and emits metadata-only JSON', async (t) => {
  const root = await fixture(t);
  const { stdout, stderr } = await run(process.execPath, [cli, root, '--format', 'json']);
  const output = JSON.parse(stdout);
  assert.equal(output.totals.files, 2);
  assert(!stdout.includes('private_value'));
  assert(!stdout.includes('export const answer'));
  assert.equal(stderr, '');
});
test('CLI exports only explicitly selected files and redacts known secrets', async (t) => {
  const root = await fixture(t),
    key = 'ghp_' + 'Q'.repeat(36);
  await writeFile(path.join(root, 'src', 'main.ts'), `const api_key = '${key}'`);
  const { stdout } = await run(process.execPath, [
    cli,
    root,
    '--include',
    'src/main.ts',
    '--task',
    'Review this code',
  ]);
  assert(stdout.includes('[REDACTED]'));
  assert(!stdout.includes(key));
  assert(!stdout.includes('# CLI fixture'));
});
test('CLI refuses to overwrite files', async (t) => {
  const root = await fixture(t),
    output = path.join(root, 'existing.md');
  await writeFile(output, 'keep this');
  await assert.rejects(
    run(process.execPath, [cli, root, '--format', 'report', '--out', output]),
    /EEXIST/,
  );
  assert.equal(await readFile(output, 'utf8'), 'keep this');
});
test('CLI rejects invalid options and excluded explicit selection', async (t) => {
  const root = await fixture(t);
  await assert.rejects(run(process.execPath, [cli, root, '--budget', 'NaN']), /Budget/);
  await assert.rejects(run(process.execPath, [cli, root, '--include', '.env']), /excluded/);
  await assert.rejects(run(process.execPath, [cli, root, '--execute']), /Unknown option/);
});
test('CLI skips symlinks rather than reading their targets', async (t) => {
  const root = await fixture(t);
  try {
    await symlink(
      path.join(root, 'src'),
      path.join(root, 'linked-src'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
  } catch (error) {
    if (['EPERM', 'EACCES'].includes(error.code)) {
      t.skip('Host does not allow symlink creation.');
      return;
    }
    throw error;
  }
  const repo = await readRepository(root);
  assert(!repo.files.some((file) => file.path.startsWith('linked-src/')));
  assert(repo.skipped.some((file) => file.reason === 'symbolic link'));
});
