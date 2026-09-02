import * as fs from 'fs';

/**
 * Points at the type declaration line instead of file top.
 */
export function resolveDeclarationPosition(filePath: string, className: string): { line: number; column: number } {
	try {
		const content = fs.readFileSync(filePath, 'utf8');
		const pattern = new RegExp(`\\b(?:class|interface|trait|enum)\\s+${escapeRegex(className)}\\b`);
		const lines = content.split('\n');
		for (let line = 0; line < lines.length; line++) {
			const column = lines[line].search(pattern);
			if (column >= 0) {
				return { line, column };
			}
		}
	} catch {
		// fall through
	}
	return { line: 0, column: 0 };
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
