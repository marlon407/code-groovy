# Change Log
All notable changes to the "code-groovy" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]
- Discover project `*TagLib.groovy` files and suggest tag methods after `namespace:` / `namespace.` in `.gsp`
- Infer self-closing vs body tags from `body()` usage; clean empty/broken tag pairs without undoing a typed `/`
- Support both `g:if` and `g.if` snippet prefixes (without bare `if`) so `g.if` does not leave a leftover `g.`
- Coexist with Emmet in `.gsp`: keep HTML abbreviations, disable Emmet-on-Tab, and own `g.*` / `asset.*` completions so `g.each` does not become `<g class="each">`
- Add fixture-based completion-chain unit tests under `src/test/fixtures`

## [0.1.3]
- Remove unused tslint and pin patched transitive dependencies (npm audit: 0)
- Require Node 24 for development (`engines.node` and `@types/node`)
- Upgrade Mocha to 12

## [0.1.2]
- Update development dependencies so the extension installs and packages on current Node and VS Code/Cursor
- Replace the deprecated `vscode` package with `@types/vscode`
- Raise `engines.vscode` to `^1.74.0` (runtime behavior unchanged)