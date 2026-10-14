import { parse as parseJavaScript } from '@babel/parser';
import { parse as parseJsonc } from 'jsonc-parser';

// Resolve paths inside the imported repository without accessing a filesystem.
function joinInside(directory, target) {
  if (typeof target !== 'string' || target.startsWith('/') || /^[a-z]:/i.test(target)) return null;
  const parts = directory ? directory.split('/') : [];
  for (const part of target.replaceAll('\\', '/').split('/')) {
    if (part === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
}
const directoryOf = (path) => path.split('/').slice(0, -1).join('/');
function resolveModule(base, index) {
  if (base === null) return null;
  const extensions = [
    '.ts',
    '.tsx',
    '.d.ts',
    '.mts',
    '.d.mts',
    '.cts',
    '.d.cts',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.json',
    '.vue',
    '.svelte',
    '.css',
  ];
  const candidates = [
    base,
    ...extensions.map((ext) => base + ext),
    ...extensions.map((ext) => base + '/index' + ext),
  ];
  if (/\.(js|jsx|mjs|cjs)$/.test(base))
    candidates.push(
      base.replace(/\.js$/, '.ts'),
      base.replace(/\.jsx$/, '.tsx'),
      base.replace(/\.mjs$/, '.mts'),
      base.replace(/\.cjs$/, '.cts'),
    );
  return candidates.find((path) => index.has(path)) || null;
}

export function createAliasResolver(files) {
  const index = new Map(files.map((file) => [file.path, file]));
  const configs = new Map(),
    diagnostics = [],
    loading = new Set();
  function load(path) {
    if (configs.has(path)) return configs.get(path);
    if (loading.has(path)) {
      diagnostics.push({
        path,
        detail: 'Circular local config inheritance; aliases may be incomplete.',
      });
      return null;
    }
    const file = index.get(path);
    if (!file) return null;
    loading.add(path);
    const errors = [];
    const config = parseJsonc(file.content, errors, { allowTrailingComma: true });
    if (errors.length || !config || typeof config !== 'object' || Array.isArray(config)) {
      diagnostics.push({
        path,
        detail: 'Invalid config JSON; aliases from this config were not applied.',
      });
      loading.delete(path);
      configs.set(path, null);
      return null;
    }
    const directory = directoryOf(path);
    let inherited = { baseUrl: null, paths: {}, pathsDirectory: directory };
    for (const target of typeof config.extends === 'string'
      ? [config.extends]
      : Array.isArray(config.extends)
        ? config.extends
        : []) {
      if (typeof target !== 'string' || !target.startsWith('.')) {
        diagnostics.push({
          path,
          detail: 'Package-based config inheritance is not loaded; aliases may be incomplete.',
        });
        continue;
      }
      const base = joinInside(directory, target);
      const parent =
        base === null ? null : [base, base + '.json'].find((candidate) => index.has(candidate));
      if (!parent) {
        diagnostics.push({
          path,
          detail: 'Local parent config not found; aliases may be incomplete.',
        });
        continue;
      }
      const loaded = load(parent);
      if (loaded) inherited = { ...inherited, ...loaded };
    }
    const options =
      config.compilerOptions && typeof config.compilerOptions === 'object'
        ? config.compilerOptions
        : {};
    const result = { ...inherited };
    if (typeof options.baseUrl === 'string')
      result.baseUrl = joinInside(directory, options.baseUrl);
    if (options.paths && typeof options.paths === 'object' && !Array.isArray(options.paths)) {
      result.paths = options.paths;
      result.pathsDirectory = directory;
    }
    if (Array.isArray(config.references) && config.references.length)
      diagnostics.push({
        path,
        detail:
          'Project references do not select a config automatically; only nearest tsconfig/jsconfig and local extends are applied.',
      });
    loading.delete(path);
    configs.set(path, result);
    return result;
  }
  for (const file of files) if (/(^|\/)(tsconfig|jsconfig)\.json$/.test(file.path)) load(file.path);
  function forFile(path) {
    let directory = directoryOf(path);
    while (true) {
      for (const name of ['tsconfig.json', 'jsconfig.json']) {
        const configPath = directory ? directory + '/' + name : name;
        if (index.has(configPath)) return load(configPath);
      }
      if (!directory) return null;
      directory = directoryOf(directory);
    }
  }
  return {
    diagnostics,
    resolve(from, spec) {
      if (spec.startsWith('.'))
        return { path: resolveModule(joinInside(directoryOf(from), spec), index), local: true };
      const config = forFile(from);
      if (!config) return { path: null, local: false };
      const patterns = Object.keys(config.paths).sort((a, b) => {
        const aStar = a.indexOf('*'),
          bStar = b.indexOf('*');
        return (
          Number(aStar !== -1) - Number(bStar !== -1) ||
          bStar - aStar ||
          b.length - a.length ||
          a.localeCompare(b)
        );
      });
      for (const pattern of patterns) {
        const star = pattern.indexOf('*');
        if (pattern.indexOf('*', star + 1) !== -1 && star !== -1) continue;
        let replacement = '';
        if (star === -1) {
          if (pattern !== spec) continue;
        } else {
          const head = pattern.slice(0, star),
            tail = pattern.slice(star + 1);
          if (
            !spec.startsWith(head) ||
            !spec.endsWith(tail) ||
            spec.length < head.length + tail.length
          )
            continue;
          replacement = spec.slice(head.length, tail ? -tail.length : undefined);
        }
        const targets = config.paths[pattern];
        if (!Array.isArray(targets)) continue;
        for (const target of targets) {
          if (typeof target !== 'string') continue;
          const resolved = resolveModule(
            joinInside(config.baseUrl ?? config.pathsDirectory, target.replace('*', replacement)),
            index,
          );
          if (resolved) return { path: resolved, local: true };
        }
        // A matching paths rule takes precedence over baseUrl fallback.
        return { path: null, local: true };
      }
      const resolved =
        config.baseUrl === null ? null : resolveModule(joinInside(config.baseUrl, spec), index);
      return { path: resolved, local: Boolean(resolved) };
    },
  };
}

function jsSpecifiers(file) {
  const specifiers = new Set();
  let diagnostic = null;
  const blocks =
    file.language === 'HTML'
      ? [...file.content.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].map((match) => ({
          content: match[2],
          typescript: /\blang\s*=\s*["']ts["']/i.test(match[1]),
        }))
      : [{ content: file.content, typescript: file.language === 'TypeScript' }];
  for (const block of blocks) {
    const plugins = ['decorators-legacy'];
    if (block.typescript) plugins.push(['typescript', { dts: /\.d\.[cm]?ts$/.test(file.path) }]);
    if (!block.typescript || /\.tsx$/.test(file.path)) plugins.push('jsx');
    try {
      const ast = parseJavaScript(block.content, {
        sourceType: 'unambiguous',
        plugins,
        errorRecovery: true,
        allowReturnOutsideFunction: true,
        createImportExpressions: true,
        attachComment: false,
      });
      if (ast.errors.length) diagnostic = 'Recovered syntax errors; imports may be incomplete.';
      const stack = [ast.program];
      while (stack.length) {
        const node = stack.pop();
        if (
          [
            'ImportDeclaration',
            'ExportNamedDeclaration',
            'ExportAllDeclaration',
            'ImportExpression',
          ].includes(node.type) &&
          node.source?.type === 'StringLiteral'
        )
          specifiers.add(node.source.value);
        if (node.type === 'TSImportType' && node.argument?.type === 'StringLiteral')
          specifiers.add(node.argument.value);
        if (
          node.type === 'TSImportEqualsDeclaration' &&
          node.moduleReference?.expression?.type === 'StringLiteral'
        )
          specifiers.add(node.moduleReference.expression.value);
        if (
          node.type === 'CallExpression' &&
          (node.callee?.type === 'Import' ||
            (node.callee?.type === 'Identifier' && node.callee.name === 'require')) &&
          node.arguments?.[0]?.type === 'StringLiteral'
        )
          specifiers.add(node.arguments[0].value);
        for (const [key, value] of Object.entries(node)) {
          if (['loc', 'start', 'end', 'extra', 'comments', 'errors'].includes(key)) continue;
          if (Array.isArray(value)) {
            for (const item of value) if (item && typeof item.type === 'string') stack.push(item);
          } else if (value && typeof value === 'object' && typeof value.type === 'string')
            stack.push(value);
        }
      }
    } catch {
      diagnostic = 'Syntax could not be parsed; imports from this script were omitted.';
    }
  }
  return { specifiers: [...specifiers], diagnostic };
}

export function extractStaticImports(
  file,
  index,
  aliases = createAliasResolver([...index.values()]),
) {
  const local = new Set(),
    external = new Set(),
    unresolved = new Set();
  let diagnostic = null;
  if (['JavaScript', 'TypeScript', 'HTML'].includes(file.language)) {
    const parsed = jsSpecifiers(file);
    diagnostic = parsed.diagnostic;
    for (const spec of parsed.specifiers) {
      const resolution = aliases.resolve(file.path, spec);
      if (resolution.path) {
        if (resolution.path !== file.path) local.add(resolution.path);
      } else if (resolution.local) unresolved.add(spec);
      else if (!spec.startsWith('/') && !spec.includes('://'))
        external.add(
          spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0],
        );
    }
  } else if (file.language === 'Python') {
    // Mask comments and string literals first; Python resolution remains heuristic.
    const source = file.content.replace(
      /#[^\r\n]*|'''[\s\S]*?'''|"""[\s\S]*?"""|'(?:\\.|[^'\\\r\n])*'|"(?:\\.|[^"\\\r\n])*"/g,
      (value) => value.replace(/[^\r\n]/g, ' '),
    );
    for (const match of source.matchAll(
      /^\s*(?:from\s+([.\w]+)\s+import\s+([\w*, ]+)|import\s+([\w.]+))/gm,
    )) {
      const spec = match[1] || match[3];
      let prefix;
      if (spec.startsWith('.')) {
        const dots = spec.match(/^\.+/)[0].length;
        const directory = file.path.split('/').slice(0, -1);
        prefix =
          dots - 1 > directory.length
            ? null
            : directory
                .slice(0, directory.length - (dots - 1))
                .concat(spec.slice(dots).split('.').filter(Boolean))
                .join('/');
      } else prefix = spec.replaceAll('.', '/');
      const candidates = prefix === null ? [] : [prefix + '.py', prefix + '/__init__.py'];
      if (prefix !== null && match[2])
        for (const item of match[2].split(',').map((value) => value.trim()))
          candidates.push((prefix ? prefix + '/' : '') + item + '.py');
      const found = candidates.filter((path) => index.has(path) && path !== file.path);
      found.forEach((path) => local.add(path));
      if (!found.length && !spec.startsWith('.')) external.add(spec.split('.')[0]);
      else if (!found.length) unresolved.add(spec);
    }
  }
  return {
    imports: [...local].sort(),
    external: [...external].sort(),
    unresolved: [...unresolved].sort(),
    parseDiagnostic: diagnostic,
  };
}
