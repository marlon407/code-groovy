import { listExistingImports, parsePackageName } from './class_parser';

export interface ImportInsertion {
	/** Offset in the document text where the import line should be inserted. */
	offset: number;
	/** Full text to insert, including trailing newline. */
	text: string;
	/** Whether an import is actually needed. */
	needed: boolean;
}

/**
 * Computes where/how to insert `import fqn` into a Groovy/Java source file.
 */
export function planImportInsertion(documentText: string, fqn: string): ImportInsertion {
	const packageName = parsePackageName(documentText);
	const typePackage = fqn.includes('.') ? fqn.slice(0, fqn.lastIndexOf('.')) : '';

	if (typePackage && typePackage === packageName) {
		return { offset: 0, text: '', needed: false };
	}

	const existing = listExistingImports(documentText);
	if (existing.has(fqn) || existing.has(typePackage)) {
		// exact import or star import of the package
		return { offset: 0, text: '', needed: false };
	}

	// Also treat `import foo.Bar` already present via simple scan of lines.
	const importLine = `import ${fqn}`;
	const lines = documentText.split(/\n/);
	for (const line of lines) {
		if (line.trim() === importLine || line.trim() === `${importLine};`) {
			return { offset: 0, text: '', needed: false };
		}
	}

	const offset = findImportInsertOffset(documentText);
	return {
		offset,
		text: `${importLine}\n`,
		needed: true
	};
}

export function findImportInsertOffset(documentText: string): number {
	const lines = documentText.split('\n');
	let offset = 0;
	let afterPackage = 0;
	let afterLastImport: number | undefined;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const newline = i < lines.length - 1 ? 1 : 0;
		const lineEnd = offset + line.length + newline;
		const trimmed = line.trim();

		if (/^package\b/.test(trimmed)) {
			afterPackage = lineEnd;
		} else if (/^import\b/.test(trimmed)) {
			afterLastImport = lineEnd;
		} else if (trimmed && (afterPackage || afterLastImport !== undefined)) {
			break;
		}

		offset = lineEnd;
	}

	return afterLastImport ?? afterPackage;
}

export function applyImportInsertion(documentText: string, insertion: ImportInsertion): string {
	if (!insertion.needed) {
		return documentText;
	}
	return (
		documentText.slice(0, insertion.offset) +
		insertion.text +
		documentText.slice(insertion.offset)
	);
}

export function needsImport(documentText: string, fqn: string): boolean {
	return planImportInsertion(documentText, fqn).needed;
}
