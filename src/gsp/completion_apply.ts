/**
 * Simulates accepting a completion that replaces the trailing `replaceLength`
 * characters of `linePrefix` with `insertText` (snippet placeholders stripped).
 */
export function applyCompletionToLine(
	linePrefix: string,
	replaceLength: number,
	insertText: string
): string {
	if (replaceLength < 0 || replaceLength > linePrefix.length) {
		throw new Error(`Invalid replaceLength ${replaceLength} for "${linePrefix}"`);
	}
	const before = linePrefix.slice(0, linePrefix.length - replaceLength);
	const inserted = stripSnippetPlaceholders(insertText);
	return before + inserted;
}

export function stripSnippetPlaceholders(insertText: string): string {
	return insertText
		.replace(/\$\{\d+:([^}]*)\}/g, '$1')
		.replace(/\$\d+/g, '');
}

/** True when a Grails/Asset expansion left a dangling `g.` / `asset.` prefix. */
export function hasLeftoverNamespacePrefix(result: string): boolean {
	return /(?:^|[^A-Za-z0-9_])(?:g|asset)\.\s*</.test(result)
		|| result.startsWith('g.<')
		|| result.startsWith('asset.<');
}

/** True when Emmet-style `tag.class` leaked into our insert text. */
export function looksLikeEmmetClassExpansion(result: string): boolean {
	return /<g\s+class="each"/i.test(result)
		|| /<g\s+class="if"/i.test(result)
		|| /<asset\s+class=/i.test(result);
}
