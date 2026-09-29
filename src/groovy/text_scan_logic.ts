export function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isInsideStringLiteral(line: string, index: number): boolean {
	const prefix = line.slice(0, index);
	const doubleQuotes = (prefix.match(/(?<!\\)"/g) || []).length;
	const singleQuotes = (prefix.match(/(?<!\\)'/g) || []).length;
	return doubleQuotes % 2 === 1 || singleQuotes % 2 === 1;
}

export function isImportLine(line: string): boolean {
	return /^\s*import\s/.test(line);
}

export function isInsideLineComment(line: string, index: number): boolean {
	let searchFrom = 0;
	while (true) {
		const commentStart = line.indexOf('//', searchFrom);
		if (commentStart === -1) {
			return false;
		}
		if (!isInsideStringLiteral(line, commentStart)) {
			return index >= commentStart;
		}
		searchFrom = commentStart + 2;
	}
}

export function isInsideComment(text: string, offset: number): boolean {
	let i = 0;
	while (i < offset && i < text.length) {
		const ch = text[i];
		const next = text[i + 1];
		if (ch === '/' && next === '/') {
			const lineEnd = text.indexOf('\n', i);
			if (lineEnd === -1 || lineEnd >= offset) {
				return true;
			}
			i = lineEnd + 1;
			continue;
		}
		if (ch === '/' && next === '*') {
			const close = text.indexOf('*/', i + 2);
			if (close === -1 || close + 2 > offset) {
				return true;
			}
			i = close + 2;
			continue;
		}
		if (ch === '"' || ch === "'") {
			const end = findStringEnd(text, i, ch);
			if (end >= offset) {
				return false;
			}
			i = end;
			continue;
		}
		i++;
	}
	return false;
}

export function isInsideDocLink(line: string, character: number): boolean {
	const linkRe = /\{@link(?:plain)?\s+[^}]*\}/g;
	let match: RegExpExecArray | null;
	while ((match = linkRe.exec(line)) !== null) {
		if (character >= match.index && character < match.index + match[0].length) {
			return true;
		}
	}
	return false;
}

function findStringEnd(text: string, start: number, quote: string): number {
	const delimiter = text.startsWith(quote.repeat(3), start) ? quote.repeat(3) : quote;
	let j = start + delimiter.length;
	while (j < text.length) {
		if (text[j] === '\\') {
			j += 2;
			continue;
		}
		if (text.startsWith(delimiter, j)) {
			return j + delimiter.length;
		}
		if (delimiter.length === 1 && text[j] === '\n') {
			return j;
		}
		j++;
	}
	return text.length;
}
