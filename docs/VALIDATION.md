# Validation record

RepoPrism 0.2.0, validated on 2026-10-14, Asia/Shanghai, in the Windows workspace. This records development evidence; it is not a third-party audit or proof of market demand. Numeric fixture observations are also saved in [validation-snapshot.json](validation-snapshot.json).

## Automated checks

- `npm run check`: JavaScript syntax checks passed.
- `npm test`: 40 core/CLI tests passed, including path handling, ignore rules, redaction, Babel imports, declaration files, local aliases and inherited JSONC, syntax/config diagnostics, cycles, task recommendations, budget exclusions, pre-read ZIP limits, actual CLI output and directory-link exclusion.
- `npm run test:e2e`: 16 production-browser scenarios cover the original demo/import/export/offline/subpath workflows plus alias imports, cancellation with a queued stale reply, exact preview/export equality, disclosed budget omissions, checkbox scroll/focus preservation, keyboard folder navigation and cache isolation between installations.
- Actual desktop, graph and mobile screenshots are generated into `docs/images/` by the browser suite and were visually inspected.

Browser validation uses the installed Microsoft Edge through Playwright. The configured GitHub workflow also runs core tests on Windows and Linux and production browser tests on Linux. That remote workflow has not run before repository publication.

## Public source fixture

Downloaded the public `101arrowz/fflate` master archive for local inspection only; no repository scripts were executed. Fixture archives stay in ignored `.local/fixtures/` and are absent from the release source ZIP.

Observed import result:

| Metric                                                |         Value |
| ----------------------------------------------------- | ------------: |
| Archive bytes                                         |       180,119 |
| Eligible files                                        |           132 |
| Text lines, including docs/configuration              |        13,192 |
| Resolved static local imports                         |            11 |
| Skipped files                                         |             2 |
| Estimated task-context tokens                         | 7,976 / 8,000 |
| Ranked candidates disclosed as not fitting the budget |            63 |
| JS/TS parse diagnostics                               |             0 |
| Local import + recommendation elapsed time            |  about 139 ms |

Task: `understand ZIP decompression and filtering`. Most suggested files were related API documentation and a ZIP test. The large central implementation did not fit the selected budget; it is now explicitly disclosed in the omitted-candidate list. This remains a concrete limitation of full-file, heuristic recommendations: **budget compliance is not the same as selecting the best semantic context**. Inspect recommendations and increase the budget or choose the necessary source explicitly.

Source: [fflate repository](https://github.com/101arrowz/fflate). The default branch changes over time; these observations are a point-in-time fixture check, not a benchmark comparison with another tool.

## Scale sample

A synthetic 5,000-file repository completed syntax-backed analysis in about 80 ms and task-based selection in about 8 ms on the development machine. The selected export was estimated at 7,990 / 8,000 tokens. A separate test verifies cycle detection on a 5,000-file import chain without recursive stack overflow.

Small synthetic files and one public repository do not establish performance for every codebase. No universal “instant analysis” or model-token accuracy claim is made.

## Remaining verification limits

- No remote GitHub Pages deployment has been performed or verified yet.
- Upload is pending the user's explicit confirmation and target-repository details; no repository creation, push or external publication has been performed.
- No adoption, retention or Star-growth data has been collected.
- Static import correctness and credential detection are intentionally incomplete; boundaries are documented in the README.
- Exact model tokenizers, nested Git ignore semantics and non-JS/TS/Python import graphs are not implemented.
