# Security and data flow

RepoPrism is a local code-inspection tool. Its signals and redaction are heuristics, not a comprehensive secret scanner or security audit.

## Browser data flow

1. The user explicitly selects files or a ZIP.
2. Files are sent to a local Web Worker. Known generated, binary and sensitive filenames are excluded; supported text is decoded as UTF-8.
3. Known credential patterns are masked before source is returned to the UI.
4. The browser holds analyzed, redacted source in memory. File previews use text nodes; repository content is not executed as HTML or JavaScript.
5. The user explicitly copies or downloads selected context. Reports and maps include file paths and metadata, without source content.

There are no source-upload endpoints, external model calls, analytics scripts or third-party fonts. Production hosting still serves application assets and may maintain normal hosting access logs. The production service worker caches shipped application files only, not imported repository data. Reload clears imported code and selection.

Clipboard and exported files are outside the application's control after export. Filenames themselves can contain sensitive information; review artifacts before distributing them.

## Input handling

- File paths with traversal, absolute drive/root prefixes or control characters are rejected.
- ZIP input is limited to 50 MiB; eligible text is limited to 5,000 files, 2 MiB per file and 50 MiB in total.
- ZIP file size is checked before reading its bytes. Browser import jobs can be cancelled and are terminated after 60 seconds; cancelled results cannot overwrite a newer import.
- The importer checks declared expansion sizes before decompression. Corrupt or adversarial archive handling is not a substitute for an OS/browser sandbox.
- CLI imports skip symbolic links and do not load or execute repository configuration.
- JS/TS syntax parsing and JSONC alias-config parsing operate on local text only. Relative config inheritance is resolved within the imported files; external packages and project references are not fetched or executed.
- CLI output files are created exclusively and cannot overwrite existing files.
- Context uses fences longer than source fences and labels repository source as untrusted data. This does not guarantee protection against prompt injection in a downstream AI tool.

## What masking covers

Rules currently cover recognizable GitHub tokens, AWS access-key identifiers, some service-token patterns, credential assignments/URLs and private-key blocks. Many other credential formats, split strings, encodings and secrets in arbitrary prose are not detected. Matches may be false positives; source previews show the masked value, not the original.

Excluded sensitive filenames are omitted, not “checked and declared safe.” Keep the original repository local and use an established secret scanner for serious credential audits.

## Reporting a vulnerability

After the repository is published, use GitHub private vulnerability reporting if the maintainer has enabled it. Do not post live credentials or private source in public issues. If no private channel is available, create a minimal public report that describes the affected behavior without exploit-sensitive data and ask the maintainer for a private follow-up channel.

No contact email, bug-bounty program or response-time commitment is invented by this initial release.
