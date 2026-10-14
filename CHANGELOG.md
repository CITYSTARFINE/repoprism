# Changelog

## 0.2.0 — 2026-10-14

Refines the inspect → select → export workflow before the first GitHub publication.

- Replaces regex JS/TS import extraction with Babel syntax parsing. Comments, strings and regex examples no longer create fake edges; multiline imports, type imports, declaration files and literal dynamic imports are supported.
- Resolves nearest tsconfig/jsconfig `paths` and `baseUrl`, JSONC and local config inheritance. Displays parsing, configuration and unresolved-local-import diagnostics.
- Discloses ranked candidates excluded by budget and unmatched task keywords. Avoids arbitrary filler files and adds a small explicit Chinese-to-English task vocabulary.
- Adds a complete redacted Markdown preview matching the copied/downloaded output.
- Adds import cancellation and a 60-second stop limit. Cancelling preserves the existing repository/selection; stale results cannot replace a newer import.
- Checks ZIP size before reading bytes into memory.
- Isolates offline caches by installation scope so an update cannot delete a different project's cache on the same origin.
- Preserves file-list scroll and checkbox focus, supports folder navigation with Enter/Space, and keeps the inspected file visible in capped graph views.
- Formats the source for review, adds shared formatting settings, archives the earlier unrelated prototype locally, and updates notices, screenshots, regression tests and release artifacts.

Boundaries: project references and package-based config inheritance remain unsupported; Python import resolution and token counts remain heuristic. Imported source still stays local and in memory.

## 0.1.0 — 2026-10-14

Initial local implementation: repository map, import graph, review signals, context selection, CLI, offline app shell, standalone HTML, English/Chinese UI and GitHub workflow files. No remote repository or deployment was created.
