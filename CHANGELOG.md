# Change Log
All notable changes to the "code-groovy" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]
- Enable HTML Emmet/HTML language features in `.gsp`, with coexistence settings so Emmet does not steal `g.each` / project `namespace.method`
- Add IntelliSense/hover hints for common Grails `g:` and Asset Pipeline `asset:` tags via HTML custom data
- Discover project `*TagLib.groovy` files and suggest tag methods/attributes after `namespace:` / `namespace.` in `.gsp`
- Infer self-closing vs body tags from `body()` usage; clean empty/broken tag pairs without undoing a typed `/`
- Serve Grails/Asset GSP completions from the provider (not JSON snippets) so accepting `g:each` after typing `g.each` never leaves `g.`
- Add broad fixture/scenario unit tests for core triggers, project taglibs, and empty/broken tag cleanup

## [0.1.3]
- Remove unused tslint and pin patched transitive dependencies (npm audit: 0)
- Require Node 24 for development (`engines.node` and `@types/node`)
- Upgrade Mocha to 12

## [0.1.2]
- Update development dependencies so the extension installs and packages on current Node and VS Code/Cursor
- Replace the deprecated `vscode` package with `@types/vscode`
- Raise `engines.vscode` to `^1.74.0` (runtime behavior unchanged)
