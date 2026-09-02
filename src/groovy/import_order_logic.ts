export interface OutOfOrderImport {
	/** 0-based line number in the document. */
	line: number;
	text: string;
	previousText: string;
}

/**
 * Returns import lines that are lexicographically before the previous import.
 * Does not suggest edits — only highlights disorder so Organize Imports stays opt-in.
 */
export function findOutOfOrderImports(documentText: string): OutOfOrderImport[] {
	const lines = documentText.split(/\n/);
	const result: OutOfOrderImport[] = [];
	let previous: { line: number; text: string } | undefined;
	let seenPackageOrImport = false;

	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i].trim();
		if (/^package\b/.test(trimmed)) {
			seenPackageOrImport = true;
			continue;
		}
		if (/^import\b/.test(trimmed)) {
			seenPackageOrImport = true;
			if (previous && trimmed.localeCompare(previous.text) < 0) {
				result.push({
					line: i,
					text: trimmed,
					previousText: previous.text
				});
			}
			previous = { line: i, text: trimmed };
			continue;
		}
		if (trimmed && seenPackageOrImport) {
			break;
		}
	}

	return result;
}
