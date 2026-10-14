# Publish RepoPrism

This checkout is ready for a GitHub repository. It has not been pushed or deployed automatically; no repository URL is configured.

## Local preview

```bash
npm ci
npm run dev
```

For the production build, use `npm run build` and `npm run preview`. `dist/` is a self-contained static site. It uses relative asset paths, so a repository subpath is supported.

## GitHub repository

Suggested name: `repoprism` (verify availability in your own account).

Description:

> Explore a repository visually. Follow imports and export focused, redacted AI context—entirely on your device.

Topics:

```text
developer-tools code-visualization repository-analysis local-first
ai-context typescript python dependency-graph privacy
```

Commit the source, lockfile, screenshots, tests and documentation. Leave ignored `node_modules/`, `dist/`, `.local/` and test output out of Git.

## GitHub Pages

The included workflow uses GitHub's official Pages actions. It publishes only when manually triggered.

1. In the repository, open **Settings → Pages** and choose **GitHub Actions** as the source.
2. Open **Actions → Deploy GitHub Pages → Run workflow** on the default branch.
3. The workflow installs locked dependencies, runs core tests, builds `dist/`, uploads the artifact and deploys it.
4. Use the actual URL returned by the deployment. Add that URL to the repository's Website field and README once verified.

The separate Check workflow runs browser tests on pushes and pull requests. GitHub environment protection rules may add an approval step for Pages. Documentation source: [Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Release downloads

```bash
npm run build
npm run package
```

This creates three files in `.local/releases/`, with SHA-256 checksums in the same directory:

- **Portable HTML:** `repoprism-portable-v0.2.0.html`; double-click to use it without a server, installation or network. All app assets and the worker are embedded. Verified in Chromium/Edge; other browsers may restrict local files. Clipboard restrictions have a Markdown-download fallback.
- **Web ZIP:** unpack and run `python -m http.server 8000` in that folder, then open `http://localhost:8000`. No npm install is needed to use the built app. HTTPS or localhost is needed for offline caching and clipboard access.
- **Source ZIP:** full original source, documentation, tests and lockfile, without dependencies or machine-local output. Run `npm ci` to develop it.

Attach these files and checksums to a release after verification. The initial project has no npm publication or signed-binary claim.

## Launch material

The honest product pitch, demo sequence and feedback questions are in [LAUNCH-KIT.zh-CN.md](LAUNCH-KIT.zh-CN.md). Replace the explicit URL placeholders with verified URLs before posting. No external messages have been sent by this workflow.
