# Contributing to RepoPrism

The most useful contribution is a real, reproducible failure in a repository workflow.

## Start here

```bash
npm ci
npm run dev
```

The code is intentionally small:

- `src/core.js`: pure analysis, redaction, dependency resolution, tree layout and context selection.
- `src/import-graph.js`: Babel import parsing and local tsconfig/jsconfig resolution.
- `src/importers.js`: guarded folder and ZIP ingestion.
- `src/analysis-worker.js`: browser worker boundary.
- `src/app.js`, `src/style.css`, `src/i18n.js`: UI, visuals and translations.
- `bin/repoprism.js`: local CLI; shares the analysis engine.
- `scripts/build-offline.js`: production application-shell cache generation.

## Good first changes

1. Add a minimal test for a valid static import that does not resolve correctly.
2. Correct an exclusion rule that drops legitimate source.
3. Improve keyboard navigation or map readability on a small screen.
4. Improve Chinese translations while keeping limitations clear.

Before proposing broader changes, describe the user problem, a concrete input, and the desired output. JS/TS parsing and local aliases already report unsupported cases. Project references and Python parsing remain possible follow-up work; avoid silently incomplete graphs.

## Tests

```bash
npm run check
npm test
npm run test:e2e
```

Run `npm run format` to apply the checked-in formatter settings, or `npm run format:check` to inspect formatting without edits.

The browser tests build and serve the production app. Windows uses installed Edge; other systems need `npx playwright install chromium`. Screenshots in `docs/images/` are produced by an actual UI test, not a design mockup.

Add behavior tests for meaningful changes in parsing, filters, redaction, import safety or context accounting. Avoid tests that only repeat implementation details. If screenshots change, inspect desktop and mobile versions before submitting.

## Pull requests

Explain the problem and resulting behavior, include a credential-free reproduction when useful, and state which checks passed. Keep the change focused. Do not add telemetry, uploaded source, LLM calls or account requirements without a separate design discussion.

Keep demo source original and clearly illustrative. Use deliberately synthetic credentials in tests. Never attach private repositories, real tokens or exported private context to an issue.

Contributions are made under the project's MIT license. Be specific, respectful and patient in reviews.
