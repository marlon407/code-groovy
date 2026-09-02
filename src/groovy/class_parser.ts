export interface ParsedType {
	simpleName: string;
	fqn: string;
	packageName: string;
	kind: 'class' | 'interface' | 'trait' | 'enum';
	sourcePath?: string;
}

const PACKAGE_RE = /^\s*package\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*;?\s*$/m;
const TYPE_RE = /^\s*(?:(?:public|protected|private|static|final|abstract|sealed|non-sealed)\s+)*(class|interface|trait|enum)\s+([A-Za-z_]\w*)\b/gm;

export function parseTypesFromSource(text: string, sourcePath?: string): ParsedType[] {
	const packageMatch = text.match(PACKAGE_RE);
	const packageName = packageMatch?.[1] ?? '';

	const types: ParsedType[] = [];
	TYPE_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = TYPE_RE.exec(text)) !== null) {
		const kind = match[1] as ParsedType['kind'];
		const simpleName = match[2];
		if (!simpleName || simpleName.includes('$')) {
			continue;
		}
		types.push({
			simpleName,
			packageName,
			fqn: packageName ? `${packageName}.${simpleName}` : simpleName,
			kind,
			sourcePath
		});
	}

	return types;
}

export function parsePackageName(text: string): string {
	return text.match(PACKAGE_RE)?.[1] ?? '';
}

export function listExistingImports(text: string): Set<string> {
	const imports = new Set<string>();
	const importRe = /^\s*import\s+(static\s+)?([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)(?:\.\*)?\s*;?\s*$/gm;
	let match: RegExpExecArray | null;
	while ((match = importRe.exec(text)) !== null) {
		imports.add(match[2]);
	}
	return imports;
}
