import { importZipFile, importFolder } from './importers.js';

self.onmessage = async ({ data }) => {
  try {
    const repo =
      data.type === 'zip' ? await importZipFile(data.file) : await importFolder(data.files);
    self.postMessage({ ok: true, repo });
  } catch (error) {
    self.postMessage({ ok: false, error: error.message || 'Could not read this repository.' });
  }
};
