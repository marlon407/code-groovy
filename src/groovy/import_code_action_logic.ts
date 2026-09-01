import { ClassIndexStore } from './class_index_store';
import { ImportInsertion, planImportInsertion } from './import_edits';

export interface ImportCodeActionPlan {
	title: string;
	fqn: string;
	simpleName: string;
	insertion: ImportInsertion;
}

export function extractTypeNameAt(
	lineText: string,
	character: number
): { name: string; start: number; end: number } | undefined {
	let start = Math.min(Math.max(character, 0), lineText.length);
	let end = start;
	while (start > 0 && /[A-Za-z0-9_]/.test(lineText[start - 1])) {
		start -= 1;
	}
	while (end < lineText.length && /[A-Za-z0-9_]/.test(lineText[end])) {
		end += 1;
	}
	const name = lineText.slice(start, end);
	if (!/^[A-Z][A-Za-z0-9_]*$/.test(name)) {
		return undefined;
	}
	return { name, start, end };
}

export function resolveImportCodeActions(
	documentText: string,
	lineText: string,
	character: number,
	store: ClassIndexStore
): ImportCodeActionPlan[] {
	const word = extractTypeNameAt(lineText, character);
	if (!word) {
		return [];
	}

	const actions: ImportCodeActionPlan[] = [];
	for (const type of store.lookup(word.name)) {
		const insertion = planImportInsertion(documentText, type.fqn);
		if (!insertion.needed) {
			continue;
		}
		actions.push({
			title: `Add import for '${type.fqn}'`,
			fqn: type.fqn,
			simpleName: type.simpleName,
			insertion
		});
	}
	return actions;
}
