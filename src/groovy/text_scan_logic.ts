export function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isImportLine(line: string): boolean {
	return /^\s*import\s/.test(line);
}

type MaskFrame =
	| { kind: 'string'; delimiter: string; interpolates: boolean }
	| { kind: 'interpolation'; depth: number };

export function maskNonCode(text: string): string {
	const out = text.split('');
	const stack: MaskFrame[] = [];
	const blank = (from: number, to: number) => {
		for (let k = from; k < to && k < out.length; k++) {
			if (out[k] !== '\n') {
				out[k] = ' ';
			}
		}
	};

	let i = 0;
	while (i < text.length) {
		const top = stack[stack.length - 1];
		if (top?.kind === 'string') {
			if (text[i] === '\\') {
				blank(i, i + 2);
				i += 2;
				continue;
			}
			if (text.startsWith(top.delimiter, i)) {
				blank(i, i + top.delimiter.length);
				i += top.delimiter.length;
				stack.pop();
				continue;
			}
			if (top.interpolates && text[i] === '$' && text[i + 1] === '{') {
				blank(i, i + 2);
				i += 2;
				stack.push({ kind: 'interpolation', depth: 0 });
				continue;
			}
			if (top.delimiter.length === 1 && text[i] === '\n') {
				stack.pop();
				i++;
				continue;
			}
			blank(i, i + 1);
			i++;
			continue;
		}

		const ch = text[i];
		const next = text[i + 1];
		if (ch === '/' && next === '/') {
			const lineEnd = text.indexOf('\n', i);
			const stop = lineEnd === -1 ? text.length : lineEnd;
			blank(i, stop);
			i = stop;
			continue;
		}
		if (ch === '/' && next === '*') {
			const close = text.indexOf('*/', i + 2);
			const stop = close === -1 ? text.length : close + 2;
			blank(i, stop);
			i = stop;
			continue;
		}
		if (ch === '"' || ch === "'") {
			const delimiter = text.startsWith(ch.repeat(3), i) ? ch.repeat(3) : ch;
			blank(i, i + delimiter.length);
			stack.push({ kind: 'string', delimiter, interpolates: ch === '"' });
			i += delimiter.length;
			continue;
		}
		if (top?.kind === 'interpolation') {
			if (ch === '{') {
				top.depth++;
			} else if (ch === '}') {
				if (top.depth === 0) {
					blank(i, i + 1);
					stack.pop();
					i++;
					continue;
				}
				top.depth--;
			}
		}
		i++;
	}
	return out.join('');
}

export interface WordMatch {
	line: number;
	column: number;
}

export function findWordMatches(text: string, word: string, receiverFieldName?: string): WordMatch[] {
	if (!word || !text.includes(word)) {
		return [];
	}
	const pattern = receiverFieldName
		? `\\b${escapeRegExp(receiverFieldName)}\\s*[?*]?\\.\\s*(${escapeRegExp(word)})\\b`
		: `\\b(${escapeRegExp(word)})\\b`;
	const lineRegex = new RegExp(pattern, 'gd');
	const originalLines = text.split(/\r\n|\r|\n/);
	const maskedLines = maskNonCode(text).split(/\r\n|\r|\n/);
	const matches: WordMatch[] = [];
	for (let lineNo = 0; lineNo < maskedLines.length; lineNo++) {
		const line = maskedLines[lineNo];
		if (!line.includes(word) || isImportLine(originalLines[lineNo] ?? '')) {
			continue;
		}
		lineRegex.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = lineRegex.exec(line)) !== null) {
			const indices = (match as RegExpExecArray & { indices: Array<[number, number]> }).indices;
			matches.push({ line: lineNo, column: indices[1][0] });
		}
	}
	return matches;
}

export function braceDepthAtLineStarts(maskedText: string): number[] {
	const depths = [0];
	let depth = 0;
	for (const ch of maskedText) {
		if (ch === '{') {
			depth++;
		} else if (ch === '}') {
			depth = Math.max(0, depth - 1);
		} else if (ch === '\n') {
			depths.push(depth);
		}
	}
	return depths;
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
