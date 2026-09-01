import { ProjectTagLibTag } from './taglib_parser';

const EMPTY_PAIR_RE = /<([A-Za-z_]\w*:[A-Za-z_]\w*)(\s[^>]*)?>\s*<\/\1>/g;
const BROKEN_SELF_CLOSE_RE = /<([A-Za-z_]\w*:[A-Za-z_]\w*)(\s[^>]*)?\/>\s*<\/\1>/g;

export interface TextReplacement {
	start: number;
	end: number;
	text: string;
}

/**
 * - Empty `<tag></tag>` → `<tag />` when the taglib does not use a body.
 * - Broken `<tag/></tag>` → `<tag />` for any known project tag (keeps the `/`,
 *   drops the leftover closing tag). Never rewrites back to open/close, so typing
 *   `/` is not undone.
 */
export function planEmptySelfCloseReplacements(
	text: string,
	tags: ProjectTagLibTag[]
): TextReplacement[] {
	if (tags.length === 0) {
		return [];
	}

	const byName = new Map(tags.map(tag => [tag.name, tag]));
	const replacements: TextReplacement[] = [];

	BROKEN_SELF_CLOSE_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = BROKEN_SELF_CLOSE_RE.exec(text)) !== null) {
		const tag = byName.get(match[1]);
		if (!tag) {
			continue;
		}
		const attrs = normalizeTagAttrs(match[2]);
		const replacement = `<${tag.name}${attrs} />`;
		if (match[0] !== replacement) {
			replacements.push({
				start: match.index,
				end: match.index + match[0].length,
				text: replacement
			});
		}
	}

	EMPTY_PAIR_RE.lastIndex = 0;
	while ((match = EMPTY_PAIR_RE.exec(text)) !== null) {
		const tag = byName.get(match[1]);
		if (!tag || tag.usesBody) {
			continue;
		}
		const attrs = normalizeTagAttrs(match[2]);
		const replacement = `<${tag.name}${attrs} />`;
		if (match[0] !== replacement) {
			replacements.push({
				start: match.index,
				end: match.index + match[0].length,
				text: replacement
			});
		}
	}

	replacements.sort((a, b) => b.start - a.start);

	const edits: TextReplacement[] = [];
	let guard = Number.POSITIVE_INFINITY;
	for (const replacement of replacements) {
		if (replacement.end > guard) {
			continue;
		}
		guard = replacement.start;
		edits.push(replacement);
	}

	return edits;
}

function normalizeTagAttrs(raw: string | undefined): string {
	if (!raw || !raw.trim()) {
		return '';
	}
	return raw.trimEnd();
}

export function applyTextReplacements(text: string, replacements: TextReplacement[]): string {
	let result = text;
	const ordered = [...replacements].sort((a, b) => b.start - a.start);
	for (const replacement of ordered) {
		result = result.slice(0, replacement.start) + replacement.text + result.slice(replacement.end);
	}
	return result;
}
