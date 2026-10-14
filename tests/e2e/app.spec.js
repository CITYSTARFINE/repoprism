import { test, expect } from '@playwright/test';
import { zipSync, strToU8 } from 'fflate';
import { mkdir, readFile } from 'node:fs/promises';

test('demo map, inspector, graph, selection and redacted context work end to end', async ({
  page,
}) => {
  const errors = [],
    external = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (
      !request.url().startsWith('http://127.0.0.1:4173') &&
      !request.url().startsWith('blob:') &&
      !request.url().startsWith('data:')
    )
      external.push(request.url());
  });
  await page.goto('/');
  await expect(page.locator('#stat-files')).toHaveText('33');
  await expect(page.locator('#visualization svg')).toBeVisible();
  await page.locator('.file-open', { hasText: /^src\/hooks\/useSession.ts$/ }).click();
  await expect(page.locator('.detail-path')).toHaveText('src/hooks/useSession.ts');
  await expect(page.locator('#file-detail')).toContainText('src/lib/api.ts');
  await page.getByRole('button', { name: '+ Dependencies', exact: true }).click();
  await expect(page.locator('#selection-list')).toContainText('src/lib/validation.ts');
  await page.getByRole('button', { name: 'Import graph', exact: true }).click();
  await expect(page.locator('.graph-node')).not.toHaveCount(0);
  await expect(page.locator('.graph-edge.highlight')).not.toHaveCount(0);
  await page.locator('.file-open', { hasText: /^server\/config.ts$/ }).click();
  await expect(page.locator('.source-preview')).toContainText('[REDACTED]');
  await expect(page.locator('.source-preview')).not.toContainText('SYNTHETICDEMOONLY');
  if (await page.getByRole('button', { name: '+ Include', exact: true }).count())
    await page.getByRole('button', { name: '+ Include', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#download-context').click();
  const download = await downloadPromise;
  const text = await readFile(await download.path(), 'utf8');
  expect(text).toContain('server/config.ts');
  expect(text).toContain('[REDACTED]');
  expect(text).not.toContain('SYNTHETICDEMOONLY');
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('real ZIP goes through the worker with exclusions and UTF-8 intact', async ({ page }) => {
  const secret = 'ghp_' + 'X'.repeat(36);
  const zip = zipSync({
    'my-project/README.md': strToU8('# 我的项目'),
    'my-project/src/main.ts': strToU8(
      `import { x } from './lib';\nconst api_key = "${secret}";\nexport { x };`,
    ),
    'my-project/src/lib.ts': strToU8('export const x = 42;'),
    'my-project/.env': strToU8('PASSWORD=never_read_me'),
    'my-project/node_modules/a/index.js': strToU8('excluded'),
  });
  await page.goto('/');
  await page.locator('#zip-input').setInputFiles({
    name: 'my-project.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(zip),
  });
  await expect(page.locator('#repo-name')).toHaveText('my-project');
  await expect(page.locator('#stat-files')).toHaveText('3');
  await expect(page.locator('#stat-links')).toHaveText('1');
  await expect(page.locator('.source-preview')).toContainText('我的项目');
  await page.locator('.file-open', { hasText: /^src\/main.ts$/ }).click();
  await expect(page.locator('.source-preview')).toContainText('[REDACTED]');
  await expect(page.locator('body')).not.toContainText(secret);
  await expect(page.locator('body')).not.toContainText('never_read_me');
});

test('folder files retain their relative paths across the worker boundary', async ({
  page,
}, testInfo) => {
  const { writeFile, mkdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const folder = testInfo.outputPath('folder-fixture');
  await mkdir(join(folder, 'src'), { recursive: true });
  await writeFile(join(folder, 'README.md'), '# Folder fixture');
  await writeFile(join(folder, 'src', 'a.ts'), 'export const x = 1');
  await writeFile(join(folder, '.env'), 'PRIVATE=not_in_context');
  await page.goto('/');
  await page.locator('#folder-input').setInputFiles(folder);
  await expect(page.locator('#repo-name')).toHaveText('folder-fixture');
  await expect(page.locator('#stat-files')).toHaveText('2');
  await expect(page.locator('.file-open', { hasText: /^src\/a.ts$/ })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('not_in_context');
});

test('unsafe ZIP is rejected while the previous repository stays usable', async ({ page }) => {
  await page.goto('/');
  const zip = zipSync({ '../evil.ts': strToU8('export {}') });
  await page
    .locator('#zip-input')
    .setInputFiles({ name: 'bad.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) });
  await expect(page.locator('#notice')).toContainText('Unsafe');
  await expect(page.locator('#repo-name')).toHaveText('prism-demo');
  await expect(page.locator('#visualization svg')).toBeVisible();
});

test('search, budget overflow and language switching stay coherent', async ({ page }) => {
  await page.goto('/');
  await page.locator('#search').fill('no-such-file');
  await expect(page.locator('#file-list')).toContainText('No matching files');
  await page.locator('#clear-filter').click();
  await page.locator('#task').fill('authentication session');
  await page.locator('#budget').selectOption('4000');
  await page.locator('#auto-select').click();
  await expect(page.locator('#budget-fill')).not.toHaveClass('over');
  await page.locator('#task').fill('large task '.repeat(2500));
  await expect(page.locator('#budget-fill')).toHaveClass('over');
  await expect(page.locator('#context-warning')).toContainText('never silently truncated');
  await page.locator('#lang').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('#open-folder')).toHaveText('打开文件夹');
  await expect(page.locator('#context-warning')).toContainText('静默截断');
});

test('desktop and mobile layouts fit and produce actual project screenshots', async ({ page }) => {
  await mkdir('docs/images', { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto('/');
  await expect(page.locator('#visualization svg')).toBeVisible();
  await page.screenshot({ path: 'docs/images/workspace.png', fullPage: true });
  await page.locator('#view-graph').click();
  await page.screenshot({ path: 'docs/images/import-graph.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#view-map').click();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.locator('#lang').click();
  await expect(page.locator('#open-folder')).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.screenshot({ path: 'docs/images/mobile.png', fullPage: true });
});
test('the built app can reload and analyze a ZIP offline without storing repository data', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
      );
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#stat-files')).toHaveText('33');
  const zip = zipSync({
    'offline/README.md': strToU8('# offline'),
    'offline/main.ts': strToU8('export const offline = true;'),
  });
  await page
    .locator('#zip-input')
    .setInputFiles({ name: 'offline.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) });
  await expect(page.locator('#repo-name')).toHaveText('offline');
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys).toEqual([]);
  await context.setOffline(false);
});
test('production assets and analysis worker work under a repository subpath', async ({ page }) => {
  const { createServer } = await import('node:http');
  const { resolve, extname, sep } = await import('node:path');
  const root = resolve('dist');
  const prefix = '/nested/repoprism/';
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (!pathname.startsWith(prefix)) {
      response.writeHead(404).end();
      return;
    }
    const filename = resolve(root, pathname.slice(prefix.length) || 'index.html');
    if (!filename.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const bytes = await readFile(filename);
      const types = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
      };
      response
        .writeHead(200, { 'Content-Type': types[extname(filename)] || 'text/plain' })
        .end(bytes);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}${prefix}`);
    await expect(page.locator('#stat-files')).toHaveText('33');
    const zip = zipSync({
      'nested/README.md': strToU8('# Subpath fixture'),
      'nested/main.ts': strToU8('export {}'),
    });
    await page
      .locator('#zip-input')
      .setInputFiles({ name: 'nested.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) });
    await expect(page.locator('#repo-name')).toHaveText('nested');
    await expect(page.locator('#stat-files')).toHaveText('2');
    await expect(page.locator('#notice')).toBeHidden();
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
test('standalone HTML opens from file:// and imports without any server or network', async ({
  page,
}) => {
  const { pathToFileURL } = await import('node:url');
  const { resolve } = await import('node:path');
  const requests = [],
    errors = [];
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) requests.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(pathToFileURL(resolve('dist/repoprism.html')).href);
  await expect(page.locator('#stat-files')).toHaveText('33');
  const key = 'ghp_' + 'P'.repeat(36);
  const zip = zipSync({
    'portable/README.md': strToU8('# Portable'),
    'portable/main.ts': strToU8(`const api_key = '${key}';`),
  });
  await page
    .locator('#zip-input')
    .setInputFiles({ name: 'portable.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) });
  await expect(page.locator('#repo-name')).toHaveText('portable');
  await page.locator('.file-open', { hasText: /^main.ts$/ }).click();
  await expect(page.locator('.source-preview')).toContainText('[REDACTED]');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#download-context').click();
  const download = await downloadPromise;
  expect(await readFile(await download.path(), 'utf8')).not.toContain(key);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});
test('alias imports are resolved in the worker and comment imports are ignored', async ({
  page,
}) => {
  await page.goto('/');
  const zip = zipSync({
    'aliases/tsconfig.json': strToU8(
      '{ // JSONC\n "compilerOptions": {"paths":{"@/*":["src/*"]}} }',
    ),
    'aliases/src/main.ts': strToU8(
      `// import './fake';\nimport type { User } from '@/types';\nexport type { User };`,
    ),
    'aliases/src/types.ts': strToU8('export type User = string;'),
    'aliases/src/fake.ts': strToU8('export {};'),
  });
  await page
    .locator('#zip-input')
    .setInputFiles({ name: 'aliases.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) });
  await expect(page.locator('#repo-name')).toHaveText('aliases');
  await expect(page.locator('#stat-links')).toHaveText('1');
  await page.locator('.file-open', { hasText: /^src\/main.ts$/ }).click();
  await expect(page.locator('#file-detail')).toContainText('src/types.ts');
});
test('cancelled import preserves selection and its queued reply cannot replace a new job', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    let ordinal = 0;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        this.delayed = ++ordinal === 1;
      }
      set onmessage(handler) {
        super.onmessage = (event) => {
          if (this.delayed) window.__firstReplyQueued = true;
          setTimeout(() => handler(event), this.delayed ? 1200 : 0);
        };
      }
    };
  });
  await page.goto('/');
  const before = await page.locator('#selection-list').textContent();
  const old = zipSync({ 'old/README.md': strToU8('# old') });
  await page
    .locator('#zip-input')
    .setInputFiles({ name: 'old.zip', mimeType: 'application/zip', buffer: Buffer.from(old) });
  await expect.poll(() => page.evaluate(() => Boolean(window.__firstReplyQueued))).toBeTruthy();
  await page.locator('#cancel-import').click();
  await expect(page.locator('#repo-name')).toHaveText('prism-demo');
  await expect(page.locator('#selection-list')).toHaveText(before);
  const fresh = zipSync({
    'fresh/README.md': strToU8('# fresh'),
    'fresh/main.ts': strToU8('export const fresh = true;'),
  });
  await page
    .locator('#zip-input')
    .setInputFiles({ name: 'fresh.zip', mimeType: 'application/zip', buffer: Buffer.from(fresh) });
  await expect(page.locator('#repo-name')).toHaveText('fresh');
  await page.waitForTimeout(1400);
  await expect(page.locator('#repo-name')).toHaveText('fresh');
  await expect(page.locator('#cancel-import')).toBeHidden();
});
test('full context preview equals the exported Markdown and masks task credentials', async ({
  page,
}) => {
  await page.goto('/');
  const secret = 'ghp_' + 'V'.repeat(36);
  await page.locator('#task').fill('Review authentication. Supplied token: ' + secret);
  await page.locator('#preview-context').click();
  await expect(page.locator('#context-preview')).toBeVisible();
  const preview = await page.locator('#preview-text').inputValue();
  expect(preview).toContain('## Source');
  expect(preview).toContain('[REDACTED]');
  expect(preview).not.toContain(secret);
  await page.locator('#context-preview').screenshot({ path: 'docs/images/context-preview.png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('#context-preview')).not.toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#download-context').click();
  expect(await readFile(await (await downloadPromise).path(), 'utf8')).toBe(preview);
});
test('recommendations disclose a large matching file excluded by budget', async ({ page }) => {
  await page.goto('/');
  const zip = zipSync({
    'auth/README.md': strToU8('# project'),
    'auth/src/authentication.ts': strToU8(
      'export const session = true;\n' + '// session expiry auth\n'.repeat(1500),
    ),
  });
  await page
    .locator('#zip-input')
    .setInputFiles({ name: 'auth.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) });
  await expect(page.locator('#repo-name')).toHaveText('auth');
  await page.locator('#task').fill('理解会话过期问题');
  await page.locator('#budget').selectOption('4000');
  await page.locator('#auto-select').click();
  await expect(page.locator('#recommendation-note')).toContainText('did not fit the budget');
  await page.locator('#recommendation-note button').click();
  await expect(page.locator('.detail-path')).toHaveText('src/authentication.ts');
  await expect(page.locator('#selection-list')).not.toContainText('src/authentication.ts');
});
test('checkbox keyboard operations preserve file-list position and focus', async ({ page }) => {
  await page.goto('/');
  const checkbox = page.getByRole('checkbox', {
    name: 'Include tests/session.test.ts',
    exact: true,
  });
  await checkbox.scrollIntoViewIfNeeded();
  await checkbox.focus();
  const position = await page.locator('#file-list').evaluate((list) => list.scrollTop);
  expect(position).toBeGreaterThan(0);
  await checkbox.press('Space');
  await expect(checkbox).toBeFocused();
  expect(
    Math.abs((await page.locator('#file-list').evaluate((list) => list.scrollTop)) - position),
  ).toBeLessThan(2);
  await checkbox.press('Space');
  await expect(checkbox).toBeFocused();
});
test('folders can be opened with the keyboard and breadcrumb returns to the root', async ({
  page,
}) => {
  await page.goto('/');
  const folder = page.getByRole('button', { name: 'server', exact: true });
  await folder.focus();
  await folder.press('Enter');
  await expect(page.locator('#breadcrumb')).toContainText('server');
  await page
    .locator('#breadcrumb')
    .getByRole('button', { name: 'prism-demo', exact: true })
    .click();
  await expect(page.locator('#file-count')).toContainText('33 of 33');
});
test('offline cache activation preserves another installation on the same origin', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const register = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    navigator.serviceWorker.register = (...args) =>
      caches.open('repoprism:/another-project/:kept').then(() => register(...args));
  });
  await page.goto('/');
  const names = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
      );
    return caches.keys();
  });
  expect(names).toContain('repoprism:/another-project/:kept');
  expect(names.some((name) => name.startsWith('repoprism:/:'))).toBeTruthy();
});
