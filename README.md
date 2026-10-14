<p align="center"><img src="public/favicon.svg" width="64" alt="RepoPrism logo"></p>
<h1 align="center">RepoPrism</h1>
<p align="center"><strong>See your code. Shape your context.</strong><br>Explore a repository visually, then take just the code your AI task needs.</p>
<p align="center">Local analysis · Interactive maps · Focused context · No API keys</p>
<p align="center"><a href="https://github.com/CITYSTARFINE/repoprism/releases/tag/v0.2.0">Download v0.2.0</a> · <a href="https://github.com/CITYSTARFINE/repoprism/actions/workflows/check.yml">CI checks</a></p>
<p align="center"><a href="README.zh-CN.md">简体中文</a> · <a href="#quick-start">Quick start</a> · <a href="#cli">CLI</a> · <a href="docs/RESEARCH.zh-CN.md">Research & positioning</a> · <a href="CONTRIBUTING.md">Contribute</a></p>

![Actual RepoPrism workspace, showing illustrative demo files](docs/images/workspace.png)

You have inherited a repository. You need to understand the relevant files before changing anything—or before pasting thousands of lines into an AI chat.

RepoPrism gives you a **code map, an import graph, and a context selection workbench** in one local tool. Open a folder or drop a ZIP. Inspect a file, follow its dependencies, review signals, and export selected source as redacted Markdown.

## What you can do

- **Explore the code map.** File area represents source size; drill into folders, search paths, and color by language, estimated context size, or review signals.
- **Follow imports.** Babel parses JavaScript/TypeScript syntax, including multiline and type-only imports. Common `tsconfig`/`jsconfig` `paths` and `baseUrl` aliases are linked locally. Python imports use a separate heuristic. Inspect dependencies and callers; add dependencies up to two hops away.
- **Find review starting points.** Large files, shared modules, import cycles, TODO markers, and recognized credential patterns are shown with file paths. These are hints for a human, not quality scores.
- **Shape AI context.** Describe a task, choose an approximate budget, get deterministic file suggestions, and adjust the selection yourself. See which ranked files did not fit, then preview the complete redacted Markdown before copying or downloading it.
- **Take useful artifacts away.** Export source context as Markdown, a metadata report, or a standalone SVG map for documentation.
- **Keep the repository local.** Analysis happens in a Web Worker. No account, external API, telemetry, or source uploads. Imported repositories are held in memory and cleared on reload.
- **Use it offline after setup.** The production build caches its application shell after the first successful visit on HTTPS or localhost. The cache contains app assets, not imported source.

English and Simplified Chinese interfaces are included. The initial project is explicitly labeled **illustrative demo data**, including a synthetic token used to demonstrate masking.

## Quick start

**Just want to try it?** [Download the portable HTML](https://github.com/CITYSTARFINE/repoprism/releases/download/v0.2.0/repoprism-portable-v0.2.0.html), then double-click it. The entire app, including its analysis worker, is embedded. No installation, server or network is needed. The portable workflow is verified in Chromium/Edge; use the hosted build if your browser restricts local files.

For development:

Requires Node.js 22.12+ (or 24+).

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. The demo is ready immediately. Click **Open folder** or **Import ZIP** to analyze your own project.

For the production app, including offline support:

```bash
npm run build
npm run preview
```

Serve `dist/` with any static host. The source `index.html` requires a server; the generated `dist/repoprism.html` is the separate double-clickable build. A released web ZIP can also be served without installing Node dependencies.

## A practical workflow

1. Open a project and search for `session`.
2. Inspect the authentication entry file and its callers.
3. Click **+ Dependencies** to include local imports.
4. Enter a task such as “Find why sessions expire earlier than expected.”
5. Review the selection and masked source, then export Markdown into your AI tool.

Suggestions are based on task-word matches, common entry files, shared modules and imports. Common Chinese task terms such as authentication and session expiry map to English identifiers through a small explicit vocabulary. Suggestions do **not** use an LLM or determine semantic relevance as a human can. If no keywords match, the UI says so; candidates that do not fit the budget are listed for inspection. The budget includes Markdown wrappers, paths, task text and relationships. Manual selections can exceed it; exports are never silently truncated.

## CLI

The CLI reuses the browser analysis engine. It does not execute project code or configuration.

```bash
# Suggest source for a task and print context to stdout
npm run analyze -- ../my-project --task "understand authentication" --budget 8000

# Choose exact paths
npm run analyze -- ../my-project --include src/auth.ts,README.md

# Write a new metadata-only report; existing output files are never overwritten
npm run analyze -- ../my-project --format report --out report.md

# Machine-readable metadata without source content
node bin/repoprism.js ../my-project --format json
```

Run `npm run analyze -- --help` for all options. The package is not published to npm; there is no `npx repoprism` command promised by this release.

## How this relates to other tools

[Repomix](https://github.com/yamadashy/repomix), [Gitingest](https://github.com/coderamp-labs/gitingest), and [code2prompt](https://github.com/mufeedvh/code2prompt) already address repository-to-context workflows. RepoPrism's focus is **visual inspection and manual selection before export**. It is a small companion to mature tooling, with deliberately fewer configuration and integration features.

## Boundaries worth knowing

| Area                | Current behavior                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input               | Folder picker or ZIP; UTF-8 text only. ZIP imports strip a common outer directory.                                                                                                                                                                                                                                                                                                                                                |
| Limits              | 5,000 eligible files, 2 MiB per file, 50 MiB total input text; ZIP input limited to 50 MiB.                                                                                                                                                                                                                                                                                                                                       |
| Exclusions          | Dependencies, build directories, binaries, lockfiles, minified output, `.env` values, and common private-key filenames. See `src/core.js`.                                                                                                                                                                                                                                                                                        |
| Ignore rules        | Root `.gitignore` subset: `*`, `**`, `?`, common directory rules, and `!`. Nested ignore files, escaped syntax, character classes and full Git precedence are not implemented. Default exclusions cannot be re-included.                                                                                                                                                                                                          |
| Imports             | Babel syntax parsing for JS/TS (including declaration files); script blocks in HTML/Vue/Svelte; a heuristic for Python. Nearest `tsconfig.json`/`jsconfig.json`, JSONC, `paths`, `baseUrl` and local relative `extends` are supported. Project references, package-based config inheritance, computed imports, Rust/Go imports and runtime loading are not resolved. Parsing failures and missing relative imports are disclosed. |
| Graph               | The graph view shows up to 120 files within the current filter. The active file and its neighbors take priority, then connection count. Analysis and reports still cover all eligible files.                                                                                                                                                                                                                                      |
| Import cancellation | Cancel an in-progress job and keep the current repository/selection. Jobs exceeding 60 seconds are stopped. ZIP size is checked before reading its bytes.                                                                                                                                                                                                                                                                         |
| Tokens              | Character heuristic, **not** a model tokenizer. Non-ASCII characters receive a larger estimate. Model counts may differ.                                                                                                                                                                                                                                                                                                          |
| Redaction           | Known key formats, credential assignments, credential URLs and private-key blocks. Detection is incomplete and may produce false positives. Inspect before sharing.                                                                                                                                                                                                                                                               |
| Persistence         | Imported source stays in memory. Reload clears your repository and selection. Only the shipped app shell is cached for offline use.                                                                                                                                                                                                                                                                                               |
| Metrics             | Text lines include comments, blank lines, configuration and documentation; no semantic complexity or Git churn score is claimed.                                                                                                                                                                                                                                                                                                  |

See [SECURITY.md](SECURITY.md) for the data flow and security scope.

## Develop and verify

```bash
npm run check
npm test
npm run test:e2e
```

Browser tests run against the production build and cover real folder/ZIP import, masked exports, selection, mobile width, offline reload/import, repository-subpath hosting, and the standalone file with zero HTTP requests. Windows uses installed Microsoft Edge. On Linux/macOS, install Chromium once with `npx playwright install chromium`.

The GitHub **Check** workflow runs core/CLI tests and production browser tests. A separate, manually triggered **Deploy GitHub Pages** workflow publishes `dist/`; see [publishing instructions](docs/PUBLISHING.md). No repository identity or live demo URL has been invented.

## Contributing

Useful contributions start with real repositories that reveal a failure: unresolved imports, a filtering mistake, an unreadable map, or a poor context suggestion. Share a minimal, credential-free reproduction. See [CONTRIBUTING.md](CONTRIBUTING.md).

Next candidate improvements are project-reference config selection, a more accurate optional tokenizer, and parser-backed Python imports. They are plans, not current features. See [CHANGELOG.md](CHANGELOG.md) for shipped changes.

## License

MIT. Runtime dependencies are [fflate](https://github.com/101arrowz/fflate), [Babel parser](https://babeljs.io/docs/babel-parser), and [jsonc-parser](https://github.com/microsoft/node-jsonc-parser), all MIT. Full notices ship with the web and portable builds. The earlier Nightshift prototype is preserved in ignored local history and excluded from the release source.
