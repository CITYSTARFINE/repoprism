import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const worker = await build({
  entryPoints: ['src/analysis-worker.js'],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
});
const appSource = (await readFile('src/app.js', 'utf8')).replace("import './style.css';", '');
const app = await build({
  stdin: { contents: appSource, resolveDir: path.resolve('src'), sourcefile: 'src/app.js' },
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  define: {
    __PORTABLE_WORKER_SOURCE__: JSON.stringify(worker.outputFiles[0].text),
    'import.meta.env.PROD': 'false',
  },
  // The portable branch eliminates the normal Vite worker URL.
  logOverride: { 'empty-import-meta': 'silent' },
});
let html = await readFile('index.html', 'utf8');
const css = await readFile('src/style.css', 'utf8');
const icon =
  'data:image/svg+xml;base64,' + (await readFile('public/favicon.svg')).toString('base64');
const license = await readFile('LICENSE', 'utf8');
const notices = await readFile('THIRD_PARTY_NOTICES.md', 'utf8');
html = html.replace('href="/favicon.svg"', `href="${icon}"`).replace('href="./"', 'href="#"');
html = html.replace('</head>', () => `<style>${css}</style>\n</head>`);
html = html.replace(
  '<script type="module" src="/src/app.js"></script>',
  () => '<script>' + app.outputFiles[0].text.replace(/<\/script/gi, '<\\/script') + '</script>',
);
html +=
  '\n<!--\nStandalone RepoPrism: all application assets are embedded. No repository source is persisted.\n\n' +
  license +
  '\n' +
  notices +
  '\n-->\n';
await writeFile('dist/repoprism.html', html);
console.log(`Portable HTML generated: ${(Buffer.byteLength(html) / 1024).toFixed(1)} KiB.`);
