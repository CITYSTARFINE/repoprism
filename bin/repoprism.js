#!/usr/bin/env node
import { readdir, readFile, lstat, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  LIMITS,
  exclusionReason,
  createIgnoreMatcher,
  decodeText,
  analyzeRepository,
  suggestContext,
  buildContext,
  reportMarkdown,
} from '../src/core.js';

const help = `RepoPrism — local repository analysis and focused AI context

Usage: node bin/repoprism.js [folder] [options]

  --task <text>          Rank files for a task (no LLM or API calls)
  --budget <number>      Estimated token budget; default 8000
  --include <paths>      Exact comma-separated paths, overriding suggestions
  --format <format>     context (default), report, or json (metadata only)
  --out <file>          Write a new file; never overwrite an existing file
  --help                Show this help

Examples:
  npm run analyze -- . --task "understand authentication"
  npm run analyze -- ../project --format report --out report.md

No source is executed. Symlinks are skipped. Known credentials are redacted.
Token counts are character estimates. Always review context before sharing.
`;
export async function readRepository(folder) {
  const root = await realpath(folder);
  const stat = await lstat(root);
  if (!stat.isDirectory()) throw new Error('Input must be a directory.');
  let ignoreText = '';
  try {
    const ignorePath = path.join(root, '.gitignore');
    const ignoreStat = await lstat(ignorePath);
    if (ignoreStat.isFile() && !ignoreStat.isSymbolicLink() && ignoreStat.size <= LIMITS.fileBytes)
      ignoreText = await readFile(ignorePath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const ignore = createIgnoreMatcher(ignoreText),
    entries = [],
    skipped = [];
  let bytes = 0,
    visited = 0;
  async function walk(relative = '') {
    const children = await readdir(path.join(root, relative), { withFileTypes: true });
    children.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      if (++visited > 100000)
        throw new Error('Too many filesystem entries. Choose a source subfolder.');
      const name = relative ? relative + '/' + child.name : child.name;
      const absolute = path.join(root, ...name.split('/'));
      const resolved = path.resolve(absolute);
      const within = path.relative(root, resolved);
      if (within.startsWith('..' + path.sep) || within === '..' || path.isAbsolute(within))
        throw new Error('Path outside repository.');
      if (child.isSymbolicLink()) {
        skipped.push({ path: name, reason: 'symbolic link' });
        continue;
      }
      const reason = exclusionReason(name) || (ignore(name) ? 'root .gitignore rule' : null);
      if (reason) {
        skipped.push({ path: name, reason });
        continue;
      }
      if (child.isDirectory()) {
        await walk(name);
        continue;
      }
      if (!child.isFile()) {
        skipped.push({ path: name, reason: 'not a regular file' });
        continue;
      }
      const fileStat = await lstat(absolute);
      if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
        skipped.push({ path: name, reason: 'not a regular file' });
        continue;
      }
      if (fileStat.size > LIMITS.fileBytes) {
        skipped.push({ path: name, reason: 'file exceeds 2 MiB' });
        continue;
      }
      bytes += fileStat.size;
      if (bytes > LIMITS.totalBytes || entries.length >= LIMITS.files)
        throw new Error('Repository exceeds 5,000 files / 50 MiB. Choose a smaller folder.');
      const content = decodeText(new Uint8Array(await readFile(absolute)));
      entries.push({ path: name, content });
    }
  }
  await walk();
  return analyzeRepository(entries, path.basename(root), skipped);
}
export async function main(args = process.argv.slice(2)) {
  const options = { task: '', budget: 8000, format: 'context' };
  let folder = '.',
    hasFolder = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(help);
      return;
    }
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (!['task', 'budget', 'include', 'format', 'out'].includes(key))
        throw new Error('Unknown option: ' + arg);
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error('Missing value for ' + arg);
      options[key] = key === 'budget' ? Number(value) : value;
    } else if (!hasFolder) {
      folder = arg;
      hasFolder = true;
    } else throw new Error('Unexpected argument: ' + arg);
  }
  if (!Number.isSafeInteger(options.budget) || options.budget < 100 || options.budget > 1000000)
    throw new Error('Budget must be an integer between 100 and 1000000.');
  if (!['context', 'report', 'json'].includes(options.format))
    throw new Error('Format must be context, report, or json.');
  const repo = await readRepository(folder);
  let output;
  if (options.format === 'report') output = reportMarkdown(repo);
  else if (options.format === 'json')
    output =
      JSON.stringify(
        {
          name: repo.name,
          totals: repo.totals,
          languages: repo.languages,
          edges: repo.edges,
          signals: repo.signals,
          skipped: repo.skipped,
          files: repo.files.map(({ content, ...metadata }) => metadata),
        },
        null,
        2,
      ) + '\n';
  else {
    const suggestion = options.include ? null : suggestContext(repo, options.task, options.budget);
    const paths = options.include
      ? options.include.split(',').map((value) => value.trim())
      : suggestion.selected;
    if (suggestion?.matched === false)
      process.stderr.write(
        'No task keywords matched; suggestions use project entry files and shared modules.\n',
      );
    if (suggestion?.excluded.length)
      process.stderr.write(
        `${suggestion.excluded.length} ranked candidates did not fit the budget; no files were truncated.\n`,
      );
    const valid = new Set(repo.files.map((file) => file.path));
    for (const selected of paths)
      if (!valid.has(selected)) throw new Error('File not found or excluded: ' + selected);
    const context = buildContext(repo, paths, options.task);
    if (context.tokens > options.budget)
      process.stderr.write(
        `Warning: ~${context.tokens} estimated tokens exceeds budget ${options.budget}; source is not truncated.\n`,
      );
    output = context.text;
  }
  if (options.out) {
    await writeFile(options.out, output, { encoding: 'utf8', flag: 'wx' });
    process.stderr.write('Saved ' + options.out + '\n');
  } else process.stdout.write(output);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write('RepoPrism: ' + error.message + '\n');
    process.exitCode = 1;
  });
}
