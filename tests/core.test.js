import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeRepository,
  normalizePath,
  normalizeRoot,
  createIgnoreMatcher,
  decodeText,
  redactSecrets,
  relatedFiles,
  buildContext,
  suggestFiles,
  buildTree,
  layoutTree,
  LIMITS,
  findCycles,
} from '../src/core.js';
import { importZip, importZipFile, importFolder } from '../src/importers.js';
import { demoEntries } from '../src/demo.js';
import { zipSync, strToU8 } from 'fflate';

test('paths reject traversal, drives, absolute paths and control characters', () => {
  for (const path of ['../secret', 'src/../../key', 'C:\\private', '/etc/passwd', 'bad\u0000.ts'])
    assert.throws(() => normalizePath(path));
  assert.equal(normalizePath('./src\\main.ts'), 'src/main.ts');
});
test('root normalization strips an archive wrapper, not mixed root files', () => {
  assert.equal(
    normalizeRoot([{ path: 'repo/src/main.ts' }, { path: 'repo/README.md' }]).root,
    'repo',
  );
  assert.equal(normalizeRoot([{ path: 'src/main.ts' }, { path: 'README.md' }]).root, null);
});
test('ignore matching supports common root rules, globs and re-includes', () => {
  const ignore = createIgnoreMatcher('cache/\n*.log\n/generated/**\n!keep.log\nsrc/**/*.tmp');
  for (const path of ['cache/x.ts', 'src/a.log', 'generated/x', 'src/a/b.tmp', 'src/a.tmp'])
    assert.equal(ignore(path), true, path);
  for (const path of ['keep.log', 'src/cacheable.ts', 'nested/generated/x'])
    assert.equal(ignore(path), false, path);
});
test('secrets are masked without exposing matched values in findings', () => {
  const key = 'ghp_' + 'A'.repeat(36),
    aws = 'AKIA' + 'B'.repeat(16);
  const raw = `api_key = "${key}"\nconst id = '${aws}';\npassword: "myactualpassword"\npassword: "your_password"\n`;
  const result = redactSecrets(raw);
  assert(!result.text.includes(key));
  assert(!result.text.includes(aws));
  assert(!result.text.includes('myactualpassword'));
  assert(result.text.includes('your_password'));
  assert.equal(result.findings.length, 3);
  assert(!JSON.stringify(result.findings).includes(key));
});
test('multi-line private keys are completely redacted, preserving line counts', () => {
  const raw = 'prefix\n-----BEGIN PRIVATE KEY-----\nabc\ndef\n-----END PRIVATE KEY-----\nsuffix';
  const result = redactSecrets(raw);
  assert.equal(result.text.split('\n').length, raw.split('\n').length);
  assert(!result.text.includes('abc'));
  assert.equal(result.findings[0].line, 2);
});
test('default filters and .gitignore exclude private, binary and generated files', () => {
  const repo = analyzeRepository([
    { path: '.gitignore', content: 'scratch/\n' },
    { path: 'scratch/note.ts', content: 'secret' },
    { path: '.env', content: 'private' },
    { path: 'node_modules/lib/index.js', content: 'ignored' },
    { path: 'image.png', content: 'ignored' },
    { path: 'src/index.ts', content: 'export {};' },
  ]);
  assert.deepEqual(
    repo.files.map((file) => file.path),
    ['.gitignore', 'src/index.ts'],
  );
  assert.equal(repo.skipped.length, 4);
});
test('static imports resolve TS, extension substitutions, index and require', () => {
  const repo = analyzeRepository([
    {
      path: 'src/main.ts',
      content: `import { x } from './a.js';\nexport { y } from './lib';\nconst z = require('../config.json');\nimport('react');`,
    },
    { path: 'src/a.ts', content: 'export const x = 1;' },
    { path: 'src/lib/index.ts', content: 'export const y = 2;' },
    { path: 'config.json', content: '{}' },
  ]);
  const main = repo.files.find((file) => file.path === 'src/main.ts');
  assert.deepEqual(main.imports, ['config.json', 'src/a.ts', 'src/lib/index.ts']);
  assert.deepEqual(main.external, ['react']);
});
test('Python relative and project-root imports resolve known files', () => {
  const repo = analyzeRepository([
    {
      path: 'pkg/main.py',
      content: 'from . import utils\nfrom pkg.helpers import work\nimport requests',
    },
    { path: 'pkg/utils.py', content: 'x = 1' },
    { path: 'pkg/helpers.py', content: 'def work(): pass' },
  ]);
  const main = repo.files.find((file) => file.path === 'pkg/main.py');
  assert.deepEqual(main.imports, ['pkg/helpers.py', 'pkg/utils.py']);
  assert.deepEqual(main.external, ['requests']);
});
test('cyclic dependencies terminate and respect depth', () => {
  const repo = analyzeRepository([
    { path: 'a.js', content: `import './b.js'` },
    { path: 'b.js', content: `import './a.js'; import './c.js'` },
    { path: 'c.js', content: '' },
  ]);
  assert.deepEqual(relatedFiles(repo, 'a.js', 1), ['a.js', 'b.js']);
  assert.deepEqual(relatedFiles(repo, 'a.js', 2), ['a.js', 'b.js', 'c.js']);
});
test('context masks task credentials and uses fences longer than source fences', () => {
  const key = 'ghp_' + 'Z'.repeat(30);
  const repo = analyzeRepository([{ path: 'README.md', content: '```\nhello\n```' }]);
  const output = buildContext(repo, ['README.md'], 'token: ' + key);
  assert(output.text.includes('````'));
  assert(!output.text.includes(key));
  assert.equal(output.files, 1);
});
test('suggestions fit the budget including task, paths and wrapper overhead', () => {
  const repo = analyzeRepository(demoEntries(), 'demo');
  const selected = suggestFiles(repo, 'authentication session expiry', 1800);
  assert(selected.length > 0);
  assert(buildContext(repo, selected, 'authentication session expiry').tokens <= 1800);
  assert(selected.some((path) => path.includes('session') || path.includes('auth')));
});
test('binary detection rejects NUL and invalid UTF-8', () => {
  assert.equal(decodeText(new Uint8Array([0, 65])), null);
  assert.equal(decodeText(new Uint8Array([255, 254])), null);
  assert.equal(decodeText(strToU8('中文')), '中文');
});
test('ZIP import strips wrapper and ignores private files', () => {
  const zip = zipSync({
    'project/src/main.ts': strToU8('export const x = 1;'),
    'project/.env': strToU8('PRIVATE=abc'),
    'project/README.md': strToU8('# demo'),
  });
  const repo = importZip(zip, 'project.zip');
  assert.equal(repo.name, 'project');
  assert.equal(repo.files.length, 2);
  assert(repo.skipped.some((file) => file.path === '.env'));
});
test('ZIP traversal is rejected and expansion limits are enforced', () => {
  assert.throws(() => importZip(zipSync({ '../evil.ts': strToU8('bad') })), /Unsafe/);
  const huge = new Uint8Array(LIMITS.fileBytes + 1);
  const repo = importZip(zipSync({ 'large.txt': huge, 'ok.ts': strToU8('x') }));
  assert.equal(repo.files.length, 1);
  assert.equal(repo.skipped[0].reason, 'file exceeds 2 MiB');
});
test('folder import does not read excluded files and preserves a project root', async () => {
  let readSecret = false;
  const text = 'export const x = 1';
  const repo = await importFolder([
    {
      webkitRelativePath: 'repo/src/a.ts',
      name: 'a.ts',
      size: text.length,
      arrayBuffer: async () => strToU8(text).buffer,
    },
    {
      webkitRelativePath: 'repo/.env',
      name: '.env',
      size: 100,
      arrayBuffer: async () => {
        readSecret = true;
        return new ArrayBuffer(0);
      },
    },
  ]);
  assert.equal(readSecret, false);
  assert.equal(repo.name, 'repo');
  assert.equal(repo.files[0].path, 'src/a.ts');
});
test('tree layout keeps all rendered cells inside the viewbox', () => {
  const repo = analyzeRepository(demoEntries());
  const tree = buildTree(repo.files);
  const cells = layoutTree(tree, 720, 390);
  assert(cells.length > repo.files.length);
  for (const cell of cells) {
    assert(cell.x >= 0 && cell.y >= 0);
    assert(cell.x + cell.w <= 720.001);
    assert(cell.y + cell.h <= 390.001);
  }
});
test('duplicate normalized paths fail instead of silently replacing content', () => {
  assert.throws(
    () =>
      analyzeRepository([
        { path: 'a.ts', content: '' },
        { path: './a.ts', content: '' },
      ]),
    /Duplicate/,
  );
});
test('strongly connected imports are reported and acyclic callers are excluded', () => {
  const files = [
    { path: 'a', imports: ['b'] },
    { path: 'b', imports: ['a'] },
    { path: 'c', imports: ['a'] },
    { path: 'd', imports: ['e'] },
    { path: 'e', imports: [] },
  ];
  assert.deepEqual(findCycles(files), [['a', 'b']]);
});
test('cycle detection handles a 5,000-file chain without recursive stack overflow', () => {
  const files = Array.from({ length: 5000 }, (_, i) => ({
    path: String(i),
    imports: i < 4999 ? [String(i + 1)] : [],
  }));
  assert.deepEqual(findCycles(files), []);
});
test('unquoted YAML credentials are masked while environment lookups are left intact', () => {
  const result = redactSecrets('api_key: abcdEFGH12345678\npassword = process.env.PASSWORD\n');
  assert(!result.text.includes('abcdEFGH12345678'));
  assert(result.text.includes('process.env.PASSWORD'));
});
test('an oversized ZIP file is rejected before its bytes are read', async () => {
  let read = false;
  await assert.rejects(
    importZipFile({
      name: 'huge.zip',
      size: LIMITS.archiveBytes + 1,
      arrayBuffer: async () => {
        read = true;
        return new ArrayBuffer(0);
      },
    }),
    /50 MiB/,
  );
  assert.equal(read, false);
});
