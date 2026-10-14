import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRepository } from '../src/core.js';
const find = (repo, path) => repo.files.find((file) => file.path === path);

test('JS comments, strings and regex literals do not create fake dependencies', () => {
  const repo = analyzeRepository([
    {
      path: 'main.ts',
      content: `// import './fake';\n/* require('./fake') */\nconst note = "import './fake'";\nconst regex = /require\\('fake'\\)/;\nimport './real';`,
    },
    { path: 'fake.ts', content: '' },
    { path: 'real.ts', content: '' },
  ]);
  assert.deepEqual(find(repo, 'main.ts').imports, ['real.ts']);
});
test('multiline imports, TS type imports, re-exports and literal dynamic imports work', () => {
  const repo = analyzeRepository([
    {
      path: 'main.ts',
      content: `import type {\n  User\n} from './types';\nexport * from './real';\nconst lazy = import('./lazy');\ntype T = import('./types').User;`,
    },
    { path: 'types.ts', content: 'export type User = string;' },
    { path: 'real.ts', content: '' },
    { path: 'lazy.ts', content: '' },
  ]);
  assert.deepEqual(find(repo, 'main.ts').imports, ['lazy.ts', 'real.ts', 'types.ts']);
});
test('JSONC paths aliases and baseUrl link to local files instead of external packages', () => {
  const repo = analyzeRepository([
    {
      path: 'tsconfig.json',
      content:
        '{ // comment\n "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"], }, }, }',
    },
    {
      path: 'src/main.ts',
      content: `import '@/lib/auth'; import 'src/lib/utils'; import 'react';`,
    },
    { path: 'src/lib/auth.ts', content: '' },
    { path: 'src/lib/utils.ts', content: '' },
  ]);
  assert.deepEqual(find(repo, 'src/main.ts').imports, ['src/lib/auth.ts', 'src/lib/utils.ts']);
  assert.deepEqual(find(repo, 'src/main.ts').external, ['react']);
});
test('local inherited aliases keep the declaring config location and nested configs win', () => {
  const repo = analyzeRepository([
    {
      path: 'configs/base.json',
      content: '{"compilerOptions":{"paths":{"@shared/*":["../shared/*"]}}}',
    },
    { path: 'tsconfig.json', content: '{"extends":"./configs/base"}' },
    { path: 'main.ts', content: `import '@shared/auth'` },
    { path: 'shared/auth.ts', content: '' },
    { path: 'apps/web/tsconfig.json', content: '{"compilerOptions":{"paths":{"@/*":["src/*"]}}}' },
    { path: 'apps/web/main.ts', content: `import '@/view'` },
    { path: 'apps/web/src/view.ts', content: '' },
  ]);
  assert.deepEqual(find(repo, 'main.ts').imports, ['shared/auth.ts']);
  assert.deepEqual(find(repo, 'apps/web/main.ts').imports, ['apps/web/src/view.ts']);
});
test('config cycles and missing local imports produce visible diagnostics', () => {
  const repo = analyzeRepository([
    { path: 'tsconfig.json', content: '{"extends":"./base.json"}' },
    { path: 'base.json', content: '{"extends":"./tsconfig.json"}' },
    { path: 'main.ts', content: `import './missing'; import '../../outside';` },
  ]);
  assert(repo.signals.some((signal) => signal.type === 'config'));
  assert.deepEqual(find(repo, 'main.ts').unresolved, ['../../outside', './missing']);
});
test('unparseable syntax is reported rather than claiming an empty verified graph', () => {
  const repo = analyzeRepository([
    { path: 'bad.ts', content: 'const = ???; import "./real";' },
    { path: 'real.ts', content: '' },
  ]);
  assert(find(repo, 'bad.ts').parseDiagnostic);
  assert(repo.signals.some((signal) => signal.type === 'parse'));
});
test('Python docstrings and comments do not create false imports', () => {
  const repo = analyzeRepository([
    { path: 'main.py', content: '"""\nimport fake\n"""\n# import fake\nimport real\n' },
    { path: 'real.py', content: '' },
    { path: 'fake.py', content: '' },
  ]);
  assert.deepEqual(find(repo, 'main.py').imports, ['real.py']);
});
test('Vue and HTML inspect only script blocks, not template text', () => {
  const repo = analyzeRepository([
    {
      path: 'View.vue',
      content: `<template><p>import './fake'</p></template><script lang="ts">import './real';</script>`,
    },
    { path: 'real.ts', content: '' },
    { path: 'fake.ts', content: '' },
  ]);
  assert.deepEqual(find(repo, 'View.vue').imports, ['real.ts']);
});
test('relative type imports resolve declaration files', () => {
  const repo = analyzeRepository([
    { path: 'main.ts', content: `import type { User } from './types';` },
    { path: 'types.d.ts', content: 'export interface User { name: string }' },
  ]);
  assert.deepEqual(find(repo, 'main.ts').imports, ['types.d.ts']);
});
test('missing configured aliases are reported as local misses rather than external packages', () => {
  const repo = analyzeRepository([
    { path: 'tsconfig.json', content: '{"compilerOptions":{"paths":{"@/*":["src/*"]}}}' },
    { path: 'src/main.ts', content: `import '@/missing'; import 'react';` },
  ]);
  assert.deepEqual(find(repo, 'src/main.ts').unresolved, ['@/missing']);
  assert.deepEqual(find(repo, 'src/main.ts').external, ['react']);
});
