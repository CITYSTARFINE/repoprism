import { unzipSync } from 'fflate';
import {
  LIMITS,
  normalizePath,
  normalizeRoot,
  exclusionReason,
  decodeText,
  analyzeRepository,
  createIgnoreMatcher,
} from './core.js';

export async function importZipFile(file) {
  if (!file || !Number.isSafeInteger(file.size) || file.size < 0)
    throw new Error('Invalid ZIP file.');
  if (file.size > LIMITS.archiveBytes)
    throw new Error('ZIP exceeds 50 MiB. Choose a smaller archive.');
  return importZip(new Uint8Array(await file.arrayBuffer()), file.name);
}

export function importZip(bytes, name = 'repository') {
  if (bytes.byteLength > LIMITS.archiveBytes)
    throw new Error('ZIP exceeds 50 MiB. Choose a smaller archive.');
  let count = 0,
    total = 0;
  const seen = new Set(),
    skipped = [],
    metadata = [];
  const expanded = unzipSync(bytes, {
    filter(file) {
      if (file.name.endsWith('/')) return false;
      const path = normalizePath(file.name);
      if (seen.has(path)) throw new Error('ZIP contains duplicate file paths.');
      seen.add(path);
      metadata.push({ path });
      if (++count > 100000) throw new Error('ZIP contains too many entries.');
      const reason = exclusionReason(path);
      if (reason) {
        skipped.push({ path, reason });
        return false;
      }
      if (!Number.isSafeInteger(file.originalSize) || file.originalSize < 0)
        throw new Error('Invalid ZIP size.');
      if (file.originalSize > LIMITS.fileBytes) {
        skipped.push({ path, reason: 'file exceeds 2 MiB' });
        return false;
      }
      total += file.originalSize;
      if (total > LIMITS.totalBytes || seen.size - skipped.length > LIMITS.files)
        throw new Error('ZIP exceeds the analysis limits (5,000 files / 50 MiB).');
      return true;
    },
  });
  const { root } = normalizeRoot(metadata);
  const strip = (path) => (root ? path.slice(root.length + 1) : path);
  const entries = Object.entries(expanded).map(([path, data]) => ({
    path: strip(normalizePath(path)),
    content: decodeText(data),
  }));
  return analyzeRepository(
    entries,
    root || name.replace(/\.zip$/i, ''),
    skipped.map((entry) => ({ ...entry, path: strip(entry.path) })),
  );
}

export async function importFolder(files, name = 'repository') {
  if (files.length > 100000)
    throw new Error('Folder contains too many entries. Choose a source subfolder.');
  const rooted = normalizeRoot(
    files.map((file) => ({ path: file.webkitRelativePath || file.name, file })),
  );
  const skipped = [],
    entries = [];
  let total = 0;
  const ignoreFile = rooted.entries.find((entry) => entry.path === '.gitignore');
  const ignore = createIgnoreMatcher(
    ignoreFile && ignoreFile.file.size <= LIMITS.fileBytes ? await ignoreFile.file.text() : '',
  );
  for (const { path, file } of rooted.entries) {
    const reason = exclusionReason(path) || (ignore(path) ? 'root .gitignore rule' : null);
    if (reason) {
      skipped.push({ path, reason });
      continue;
    }
    if (file.size > LIMITS.fileBytes) {
      skipped.push({ path, reason: 'file exceeds 2 MiB' });
      continue;
    }
    total += file.size;
    if (total > LIMITS.totalBytes || entries.length >= LIMITS.files)
      throw new Error('Folder exceeds the analysis limits (5,000 files / 50 MiB).');
    const bytes = new Uint8Array(await file.arrayBuffer());
    entries.push({ path, content: decodeText(bytes) });
  }
  return analyzeRepository(entries, rooted.root || name, skipped);
}
