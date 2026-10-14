import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRepository, suggestContext, buildContext } from '../src/core.js';

test('a matched implementation too large for the budget is disclosed', () => {
  const repo = analyzeRepository([
    { path: 'README.md', content: '# project' },
    {
      path: 'src/authentication.ts',
      content: '// authentication\n' + 'export const session = true;\n'.repeat(300),
    },
    { path: 'src/unrelated.ts', content: 'export const weather = 1;' },
  ]);
  const suggestion = suggestContext(repo, 'authentication', 1000);
  assert(
    suggestion.excluded.some(
      (file) => file.path === 'src/authentication.ts' && file.reason === 'budget',
    ),
  );
  assert(!suggestion.selected.includes('src/unrelated.ts'));
  assert(buildContext(repo, suggestion.selected, 'authentication').tokens <= 1000);
});
test('unmatched tasks are reported instead of filling the budget with arbitrary source', () => {
  const repo = analyzeRepository([
    { path: 'README.md', content: '# project' },
    { path: 'sunny.ts', content: 'export const sunny = true;' },
  ]);
  const suggestion = suggestContext(repo, 'authentication', 8000);
  assert.equal(suggestion.matched, false);
  assert.deepEqual(suggestion.selected, ['README.md']);
});
test('common Chinese task terms match English identifiers deterministically', () => {
  const repo = analyzeRepository([
    { path: 'session.ts', content: 'export const expiry = 3600;' },
    { path: 'sunny.ts', content: 'export const weather = true;' },
  ]);
  const suggestion = suggestContext(repo, '理解会话过期问题', 8000);
  assert.equal(suggestion.matched, true);
  assert(suggestion.selected.includes('session.ts'));
  assert(!suggestion.selected.includes('sunny.ts'));
});
test('context estimation includes long fences, Unicode paths, task masking and edges', () => {
  const repo = analyzeRepository([
    { path: '中文/main.ts', content: 'import "./auth";\n// ``````\nexport const 用户 = 1;' },
    { path: '中文/auth.ts', content: 'export const auth = "认证";' },
  ]);
  for (const budget of [200, 300, 500, 1000]) {
    const suggestion = suggestContext(repo, '会话认证', budget);
    assert(
      buildContext(repo, suggestion.selected, '会话认证').tokens <= budget ||
        !suggestion.selected.length,
    );
  }
});
