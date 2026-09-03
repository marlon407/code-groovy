export interface TextRange {
	start: number;
	end: number;
}

export interface PrepareRenameResult {
	range: TextRange;
	placeholder: string;
}

const IDENTIFIER_RE = /^[A-Za-z_]\w*$/;

const GROOVY_KEYWORDS = new Set([
	'abstract', 'as', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class',
	'const', 'continue', 'def', 'default', 'do', 'double', 'else', 'enum', 'extends', 'false',
	'final', 'finally', 'float', 'for', 'goto', 'if', 'implements', 'import', 'in', 'instanceof',
	'int', 'interface', 'long', 'native', 'new', 'null', 'package', 'private', 'protected',
	'public', 'return', 'short', 'static', 'strictfp', 'super', 'switch', 'synchronized',
	'this', 'throw', 'throws', 'trait', 'transient', 'true', 'try', 'void', 'volatile', 'while'
]);

export function isValidIdentifier(name: string): boolean {
	return IDENTIFIER_RE.test(name);
}

export function isGroovyKeyword(name: string): boolean {
	return GROOVY_KEYWORDS.has(name);
}

export function wordRangeAt(documentText: string, offset: number): TextRange | undefined {
	if (offset < 0 || offset > documentText.length) {
		return undefined;
	}
	let start = offset;
	let end = offset;
	while (start > 0 && /[A-Za-z0-9_]/.test(documentText[start - 1])) {
		start -= 1;
	}
	while (end < documentText.length && /[A-Za-z0-9_]/.test(documentText[end])) {
		end += 1;
	}
	if (start === end) {
		return undefined;
	}
	const word = documentText.slice(start, end);
	if (!isValidIdentifier(word) || /^[0-9]/.test(word)) {
		return undefined;
	}
	return { start, end };
}

export function prepareLocalRename(documentText: string, offset: number): PrepareRenameResult | undefined {
	const range = wordRangeAt(documentText, offset);
	if (!range) {
		return undefined;
	}
	const placeholder = documentText.slice(range.start, range.end);
	if (isGroovyKeyword(placeholder)) {
		return undefined;
	}
	return { range, placeholder };
}

/**
 * Collect same-file rename edits for an identifier, skipping comments and string literals.
 * MVP for F2: does not cross files and does not attempt semantic scope analysis.
 */
export function collectLocalRenameEdits(
	documentText: string,
	oldName: string,
	newName: string
): TextRange[] {
	if (!isValidIdentifier(oldName) || !isValidIdentifier(newName) || oldName === newName) {
		return [];
	}
	if (isGroovyKeyword(newName)) {
		return [];
	}

	const edits: TextRange[] = [];
	let i = 0;
	const length = documentText.length;

	while (i < length) {
		const ch = documentText[i];
		const next = documentText[i + 1];

		if (ch === '/' && next === '/') {
			i = skipUntil(documentText, i + 2, '\n');
			continue;
		}
		if (ch === '/' && next === '*') {
			i = skipBlockComment(documentText, i + 2);
			continue;
		}
		if (ch === '"' && documentText.startsWith('"""', i)) {
			i = skipTripleQuoted(documentText, i + 3, '"""');
			continue;
		}
		if (ch === "'" && documentText.startsWith("'''", i)) {
			i = skipTripleQuoted(documentText, i + 3, "'''");
			continue;
		}
		if (ch === '"' || ch === "'") {
			i = skipQuoted(documentText, i + 1, ch);
			continue;
		}

		if (/[A-Za-z_]/.test(ch)) {
			const start = i;
			i += 1;
			while (i < length && /[A-Za-z0-9_]/.test(documentText[i])) {
				i += 1;
			}
			const word = documentText.slice(start, i);
			if (word === oldName) {
				edits.push({ start, end: i });
			}
			continue;
		}

		i += 1;
	}

	return edits;
}

function skipUntil(text: string, from: number, endChar: string): number {
	const idx = text.indexOf(endChar, from);
	return idx === -1 ? text.length : idx + endChar.length;
}

function skipBlockComment(text: string, from: number): number {
	const idx = text.indexOf('*/', from);
	return idx === -1 ? text.length : idx + 2;
}

function skipQuoted(text: string, from: number, quote: string): number {
	let i = from;
	while (i < text.length) {
		const ch = text[i];
		if (ch === '\\') {
			i += 2;
			continue;
		}
		if (ch === quote) {
			return i + 1;
		}
		if (ch === '\n') {
			return i;
		}
		i += 1;
	}
	return text.length;
}

function skipTripleQuoted(text: string, from: number, delimiter: string): number {
	const idx = text.indexOf(delimiter, from);
	return idx === -1 ? text.length : idx + delimiter.length;
}

export function applyLocalRename(documentText: string, oldName: string, newName: string): string {
	const edits = collectLocalRenameEdits(documentText, oldName, newName);
	if (edits.length === 0) {
		return documentText;
	}
	let result = '';
	let cursor = 0;
	for (const edit of edits) {
		result += documentText.slice(cursor, edit.start);
		result += newName;
		cursor = edit.end;
	}
	result += documentText.slice(cursor);
	return result;
}
