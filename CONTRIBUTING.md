# Contributing to Code Groovy

Thanks for your interest in improving Groovy, Grails and GSP support in VS Code and Cursor. Bug reports, fixes, features and reviews are all welcome.

## Before you start

- **Bugs**: open an issue using the bug report form, with a minimal snippet that reproduces the problem.
- **Features**: open a feature request or a discussion first, so we can agree on the approach before you invest time in a pull request.
- **First contribution?** Look for issues labeled [`good first issue`](https://github.com/code-groovy/code-groovy/labels/good%20first%20issue) or [`help wanted`](https://github.com/code-groovy/code-groovy/labels/help%20wanted), and comment on the issue so nobody duplicates the work.

## Development setup

Requirements: Node.js 24 or later, and VS Code or Cursor.

```bash
git clone https://github.com/<your-user>/code-groovy.git
cd code-groovy
npm install
npm run watch
```

Press `F5` to launch an Extension Development Host with the extension loaded.

## Tests

```bash
npm run test:unit      # fast unit tests, no editor required
npm test               # unit tests + integration tests in a VS Code instance
```

Unit tests live in `src/test/unit` and use fixtures from `src/test/fixtures`. Prefer putting logic in a `*_logic.ts` module that can be unit tested without the VS Code API, and keep the provider files thin.

## Pull requests

1. Fork the repository and create a branch from `master` (for example `feature/taglib-hover` or `fix/slashy-string`).
2. Keep each pull request focused on a single change.
3. Add or update tests for the behavior you changed.
4. Add an entry under `## [Unreleased]` in `CHANGELOG.md`.
5. Open the pull request and fill in the template. CI must pass, and a maintainer must approve it before merge.

Pull requests are squash-merged, so the pull request title becomes the commit message: write it in English, in the imperative mood (for example "Add hover for TagLib attributes").

## Releases

Releases to the Visual Studio Marketplace are made by the maintainers. Contributors do not need to bump the version in `package.json`.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.
