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
