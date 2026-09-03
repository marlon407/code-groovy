# Change Log
All notable changes to the "code-groovy" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]
- Support Ctrl+click / Go to Definition in `.gsp` for project TagLib tags (`<ns:tag>` / `ns.method`) and Groovy inside `${...}` / `<%...%>` (including when VS Code routes `${}` to the Groovy language)
- Disable HTML `editor.links` in `.gsp` so attribute values like `action="${g.createLink(...)}"` are not opened as fake file paths
- Point Grails `g:` tag hover/reference links at the legacy GSP docs (`docs-legacy-gsp`) instead of the broken `/docs/latest/ref/Tags/` URLs
- Support F2 rename for identifiers in the current Groovy file (skips comments/strings; same-file only)
- Highlight Grails tags (`g:if`, etc.) correctly when nested inside an HTML open tag in `.gsp`
- Ship a Groovy TextMate grammar (slashy strings + Spock quoted method names) so `.groovy` highlighting is owned by this extension
- Show Groovydoc / Javadoc comments on hover for Groovy types and methods (Markdown rendering of common tags)
- Include methods with generic return types (e.g. `Map`, `List<Map>`) in document symbols / outline
- Match square brackets `[` `]` in GSP bracket matching
- Include TagLib-style closure assignments (`def myTag = { ... }`) in document symbols / outline
- Auto-import Groovy/Java types from workspace source and Gradle/Maven JAR classpaths via IntelliSense and a Quick Fix
- Rank auto-import suggestions so workspace types like `Customer` stay above longer JAR names such as `CustomerAccountDTO`
- Insert auto-imported lines in sorted position without reshuffling existing imports; warn (yellow) on out-of-order import lines
- Add Ctrl+click Go to Definition for Groovy types, methods, services, and inherited methods (workspace + JAR sources when available)
- Suggest workspace/Grails methods on member access (`receiver.`) using the same artifact hierarchy as Go to Definition
- Improve navigation with Grails artifact index (class file name), service bean resolution, and method parsing adapted from grails-vscode patterns
- Enable HTML Emmet/HTML language features in `.gsp`, with coexistence settings so Emmet does not steal `g.each` / project `namespace.method`
- Add IntelliSense/hover hints for common Grails `g:` and Asset Pipeline `asset:` tags via HTML custom data
- Discover project `*TagLib.groovy` files and suggest tag methods/attributes after `namespace:` / `namespace.` in `.gsp`
- Infer self-closing vs body tags from `body()` usage; clean empty/broken tag pairs without undoing a typed `/`
- Serve Grails/Asset GSP completions from the provider (not JSON snippets) so accepting `g:each` after typing `g.each` never leaves `g.`
- Add broad fixture/scenario unit tests for core triggers, project taglibs, and empty/broken tag cleanup
- Show indexing progress in the status bar (percentage, current file/JAR, final counts) and a Code Groovy Index output channel
- Index entire workspace source trees (no 5k cap) and resolve Grails multi-module paths for go-to-definition fallbacks

## [0.1.3]
- Remove unused tslint and pin patched transitive dependencies (npm audit: 0)
- Require Node 24 for development (`engines.node` and `@types/node`)
- Upgrade Mocha to 12

## [0.1.2]
- Update development dependencies so the extension installs and packages on current Node and VS Code/Cursor
- Replace the deprecated `vscode` package with `@types/vscode`
- Raise `engines.vscode` to `^1.74.0` (runtime behavior unchanged)
