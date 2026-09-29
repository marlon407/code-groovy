import { ParsedMethod } from './symbol_parser';

const IMPORT_RE = /^\s*import\s+(?!static\s)([A-Za-z_][\w.]*?)(\.\*)?\s*(?:as\s+\w+\s*)?;?\s*$/gm;

export interface HierarchyType {
	simpleName: string;
	fqn: string;
	packageName?: string;
	extendsTypes?: string[];
	implementsTypes?: string[];
}

export interface MethodDeclaration {
	sourcePath: string;
	line: number;
	column: number;
}

interface PendingType {
	type: HierarchyType;
	imports: string[];
}

export function parseImports(text: string): string[] {
	const imports: string[] = [];
	IMPORT_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = IMPORT_RE.exec(text)) !== null) {
		imports.push(match[2] ? `${match[1]}.*` : match[1]);
	}
	return imports;
}

export class TypeHierarchyStore {
	private readonly pending: PendingType[] = [];
	private readonly fqnsBySimpleName = new Map<string, string[]>();
	private readonly parents = new Map<string, string[]>();
	private readonly children = new Map<string, string[]>();
	private readonly methodsByClass = new Map<string, ParsedMethod[]>();
	private resolved = true;

	add(types: HierarchyType[], methods: ParsedMethod[], imports: string[] = []): void {
		for (const type of types) {
			this.pending.push({ type, imports });
			push(this.fqnsBySimpleName, type.simpleName, type.fqn);
		}
		for (const method of methods) {
			push(this.methodsByClass, method.classFqn, method);
		}
		this.resolved = false;
	}

	clear(): void {
		this.pending.length = 0;
		this.fqnsBySimpleName.clear();
		this.parents.clear();
		this.children.clear();
		this.methodsByClass.clear();
		this.resolved = true;
	}

	resolveClass(simpleName: string): string[] {
		return this.fqnsBySimpleName.get(simpleName) ?? [];
	}

	parentsOf(fqn: string): string[] {
		this.resolve();
		return this.parents.get(fqn) ?? [];
	}

	childrenOf(fqn: string): string[] {
		this.resolve();
		return this.children.get(fqn) ?? [];
	}

	methodDeclarations(fqn: string, methodName: string): MethodDeclaration[] {
		return (this.methodsByClass.get(fqn) ?? [])
			.filter(method => method.name === methodName && method.sourcePath !== undefined)
			.map(method => ({ sourcePath: method.sourcePath as string, line: method.line, column: method.column }));
	}

	private resolve(): void {
		if (this.resolved) {
			return;
		}
		this.parents.clear();
		this.children.clear();
		for (const { type, imports } of this.pending) {
			for (const parentName of [...(type.extendsTypes ?? []), ...(type.implementsTypes ?? [])]) {
				const parent = this.resolveParent(parentName, type, imports);
				if (parent && parent !== type.fqn) {
					push(this.parents, type.fqn, parent);
					push(this.children, parent, type.fqn);
				}
			}
		}
		this.resolved = true;
	}

	private resolveParent(name: string, type: HierarchyType, imports: string[]): string | undefined {
		if (name.includes('.')) {
			return name;
		}
		const explicit = imports.find(entry => !entry.endsWith('.*') && entry.endsWith(`.${name}`));
		if (explicit) {
			return explicit;
		}
		const known = this.resolveClass(name);
		const packageName = type.packageName ?? (type.fqn.includes('.') ? type.fqn.slice(0, type.fqn.lastIndexOf('.')) : '');
		const samePackage = packageName ? `${packageName}.${name}` : name;
		if (known.includes(samePackage)) {
			return samePackage;
		}
		const wildcard = imports
			.filter(entry => entry.endsWith('.*'))
			.map(entry => `${entry.slice(0, -2)}.${name}`)
			.find(candidate => known.includes(candidate));
		if (wildcard) {
			return wildcard;
		}
		return known.length === 1 ? known[0] : undefined;
	}
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
	const list = map.get(key);
	if (list) {
		list.push(value);
	} else {
		map.set(key, [value]);
	}
}
