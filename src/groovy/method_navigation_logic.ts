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

const METHOD_DECL_LINE_RE =
	/^\s*(?:@\w+(?:\([^)]*\))?\s*)*(?:(?:public|private|protected|static|final|synchronized|abstract)\s+)*(?:def|(?:void|boolean|Boolean|String|Map|List|Set|Integer|Long|Double|Float|Object|int|long|double|float|char|byte|short)|[A-Z][\w.<>,\[\]\s]*)\s+([a-zA-Z_]\w*)\s*\(/;

export function findMethodInText(content: string, methodName: string): MethodLocation[] {
	return listMethodsInText(content).filter(loc => loc.name === methodName).map(loc => ({
		filePath: loc.filePath,
		line: loc.line,
		column: loc.column
	}));
}

export interface ListedMethod {
	name: string;
	filePath: string;
	line: number;
	column: number;
	className?: string;
}

export function listMethodsInText(content: string): ListedMethod[] {
	const locations: ListedMethod[] = [];
	const lines = content.split('\n');
	const typeDecl = parseTypeDeclaration(content);
	const ownClassName = typeDecl?.name;

	for (let line = 0; line < lines.length; line++) {
		const text = lines[line];
		const match = text.match(METHOD_DECL_LINE_RE);
		if (!match) {
			continue;
		}
		const name = match[1];
		// Skip constructors matching the enclosing type name.
		if (ownClassName && name === ownClassName) {
			continue;
		}
		const column = text.search(new RegExp(`\\b${escapeRegex(name)}\\s*\\(`));
		if (column >= 0) {
			locations.push({ name, filePath: '', line, column, className: ownClassName });
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
	return listMethodsInClassHierarchy(readFile, findEntries, className, visited, depth)
		.filter(method => method.name === methodName)
		.map(method => ({
			filePath: method.filePath,
			line: method.line,
			column: method.column
		}));
}

/** Lists methods on a type and its parents; local declarations win over inherited names. */
export function listMethodsInClassHierarchy(
	readFile: (filePath: string) => string | undefined,
	findEntries: (className: string) => Array<{ filePath: string }>,
	className: string,
	visited: Set<string> = new Set(),
	depth = 0
): ListedMethod[] {
	if (!className || visited.has(className) || depth > MAX_HIERARCHY_DEPTH) {
		return [];
	}
	visited.add(className);

	const byName = new Map<string, ListedMethod>();
	let parents: string[] = [];

	for (const entry of findEntries(className)) {
		const content = readFile(entry.filePath);
		if (!content) {
			continue;
		}

		for (const method of listMethodsInText(content)) {
			if (!byName.has(method.name)) {
				byName.set(method.name, {
					...method,
					filePath: entry.filePath,
					className
				});
			}
		}

		if (parents.length === 0) {
			parents = parseTypeDeclaration(content)?.parents ?? [];
		}
	}

	for (const parent of parents) {
		for (const inherited of listMethodsInClassHierarchy(
			readFile,
			findEntries,
			parent,
			visited,
			depth + 1
		)) {
			if (!byName.has(inherited.name)) {
				byName.set(inherited.name, inherited);
			}
		}
	}

	return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
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
