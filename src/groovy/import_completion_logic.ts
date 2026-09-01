import { ClassIndexStore, IndexedType, MAX_COMPLETION_RESULTS } from './class_index_store';
import { ImportInsertion, planImportInsertion } from './import_edits';

const KEYWORD_TYPE_RE = /(?:implements|extends|as|new)\s+([A-Za-z_]\w*)$/;
const CAPITALIZED_TYPE_RE = /(?:^|[^A-Za-z0-9_.$])([A-Z][A-Za-z0-9_]*)$/;

export interface TypeCompletion {
	simpleName: string;
	fqn: string;
	replaceLength: number;
	importInsertion: ImportInsertion;
}

export function extractTypePrefix(linePrefix: string): { prefix: string; replaceLength: number } | undefined {
	const trimmedStart = linePrefix.replace(/^\s+/, '');
	if (/^import\b/.test(trimmedStart) || /^package\b/.test(trimmedStart)) {
		return undefined;
	}

	const keywordMatch = linePrefix.match(KEYWORD_TYPE_RE);
	if (keywordMatch) {
		return { prefix: keywordMatch[1], replaceLength: keywordMatch[1].length };
	}

	const capitalized = linePrefix.match(CAPITALIZED_TYPE_RE);
	if (capitalized) {
		return { prefix: capitalized[1], replaceLength: capitalized[1].length };
	}

	return undefined;
}

export function resolveTypeCompletions(
	linePrefix: string,
	documentText: string,
	store: ClassIndexStore,
	limit = MAX_COMPLETION_RESULTS
): TypeCompletion[] {
	const extracted = extractTypePrefix(linePrefix);
	if (!extracted || extracted.prefix.length < 1) {
		return [];
	}

	return store.lookupPrefix(extracted.prefix, limit).map(type => toCompletion(type, extracted.replaceLength, documentText));
}

export function completionsForExactName(
	simpleName: string,
	documentText: string,
	types: IndexedType[]
): TypeCompletion[] {
	return types.map(type => toCompletion(type, simpleName.length, documentText));
}

function toCompletion(type: IndexedType, replaceLength: number, documentText: string): TypeCompletion {
	return {
		simpleName: type.simpleName,
		fqn: type.fqn,
		replaceLength,
		importInsertion: planImportInsertion(documentText, type.fqn)
	};
}
