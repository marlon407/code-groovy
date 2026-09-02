const MAX_HIERARCHY_DEPTH = 12;

export interface MethodLocation {
	filePath: string;
	line: number;
	column: number;
}

export function parseTypeDeclaration(content: string): { name: string; parents: string[] } | undefined {
	const match = content.match(
		/\b(?:class|trait|interface)\s+(\w+)(?:\s*<[^>]+>)?(?:\s+extends\s+([^{]+?))?(?:\s+implements\s+([^{]+?))?\s*\{/m
	);
	if (!match) {
		return undefined;
	}
	return {
		name: match[1],
		parents: [...splitTypeNames(match[2]), ...splitTypeNames(match[3])]
	};
}

const GROOVY_PRIMITIVE_AND_COMMON_TYPES =
	'void|boolean|Boolean|String|Map|List|Set|Integer|Long|Double|Float|Object|int|long|double|float|char|byte|short';

export function findMethodInText(content: string, methodName: string): MethodLocation[] {
	const escaped = escapeRegex(methodName);
	const patterns = [
		new RegExp(
			`^\\s*(?:@\\w+(?:\\([^)]*\\))?\\s*)*(?:(?:public|private|protected|static|final|synchronized)\\s+)*def\\s+${escaped}\\s*\\(`
		),
		new RegExp(
			`^\\s*(?:@\\w+(?:\\([^)]*\\))?\\s*)*(?:(?:public|private|protected|static|final|synchronized)\\s+)*(?:${GROOVY_PRIMITIVE_AND_COMMON_TYPES})\\s+${escaped}\\s*\\(`
		),
		new RegExp(
			`^\\s*(?:@\\w+(?:\\([^)]*\\))?\\s*)*(?:(?:public|private|protected|static|final|synchronized)\\s+)*[A-Z][\\w.<>,\\[\\]\\s]*\\s+${escaped}\\s*\\(`
		)
	];

	const locations: MethodLocation[] = [];
	const lines = content.split('\n');

	for (let line = 0; line < lines.length; line++) {
		const text = lines[line];
		if (!patterns.some(pattern => pattern.test(text))) {
			continue;
		}
		const column = text.search(new RegExp(`\\b${escaped}\\b`));
		if (column >= 0) {
			locations.push({ filePath: '', line, column });
		}
	}

	return locations;
}

export function findMethodInClassHierarchy(
	readFile: (filePath: string) => string | undefined,
	findEntries: (className: string) => Array<{ filePath: string }>,
	className: string,
	methodName: string,
	visited: Set<string> = new Set(),
	depth = 0
): MethodLocation[] {
	if (!className || visited.has(className) || depth > MAX_HIERARCHY_DEPTH) {
		return [];
	}
	visited.add(className);

	for (const entry of findEntries(className)) {
		const content = readFile(entry.filePath);
		if (!content) {
			continue;
		}

		const local = findMethodInText(content, methodName).map(loc => ({
			...loc,
			filePath: entry.filePath
		}));
		if (local.length > 0) {
			return local;
		}

		const typeDecl = parseTypeDeclaration(content);
		if (typeDecl) {
			const inherited = findMethodInParents(readFile, findEntries, typeDecl.parents, methodName, visited, depth + 1);
			if (inherited.length > 0) {
				return inherited;
			}
		}
	}

	return [];
}

function findMethodInParents(
	readFile: (filePath: string) => string | undefined,
	findEntries: (className: string) => Array<{ filePath: string }>,
	parents: string[],
	methodName: string,
	visited: Set<string>,
	depth: number
): MethodLocation[] {
	for (const parent of parents) {
		const found = findMethodInClassHierarchy(readFile, findEntries, parent, methodName, visited, depth);
		if (found.length > 0) {
			return found;
		}
	}
	return [];
}

function splitTypeNames(segment?: string): string[] {
	if (!segment) {
		return [];
	}
	const withoutGenerics = stripGenerics(segment);
	return withoutGenerics
		.split(',')
		.map(part => part.trim())
		.map(part => part.split(/\s+/).filter(Boolean).pop() || '')
		.map(part => part.split('.').pop() || '')
		.filter(name => /^\w+$/.test(name));
}

function stripGenerics(value: string): string {
	let result = '';
	let depth = 0;
	for (const char of value) {
		if (char === '<') {
			depth += 1;
			continue;
		}
		if (char === '>') {
			depth = Math.max(0, depth - 1);
			continue;
		}
		if (depth === 0) {
			result += char;
		}
	}
	return result;
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
