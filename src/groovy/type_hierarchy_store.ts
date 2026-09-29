import { ParsedMethod } from './symbol_parser';

const MAX_HIERARCHY_DEPTH = 12;

export interface HierarchyType {
	simpleName: string;
	extendsTypes?: string[];
	implementsTypes?: string[];
}

export interface MethodDeclaration {
	sourcePath: string;
	line: number;
	column: number;
}

export class TypeHierarchyStore {
	private readonly parents = new Map<string, string[]>();
	private readonly children = new Map<string, string[]>();
	private readonly methodsByClass = new Map<string, ParsedMethod[]>();

	add(types: HierarchyType[], methods: ParsedMethod[]): void {
		for (const type of types) {
			for (const parent of [...(type.extendsTypes ?? []), ...(type.implementsTypes ?? [])]) {
				push(this.parents, type.simpleName, parent);
				push(this.children, parent, type.simpleName);
			}
		}
		for (const method of methods) {
			push(this.methodsByClass, simpleName(method.classFqn), method);
		}
	}

	clear(): void {
		this.parents.clear();
		this.children.clear();
		this.methodsByClass.clear();
	}

	ancestorsOf(className: string): string[] {
		return walk(this.parents, className);
	}

	descendantsOf(className: string): string[] {
		return walk(this.children, className);
	}

	methodDeclarations(className: string, methodName: string): MethodDeclaration[] {
		return (this.methodsByClass.get(className) ?? [])
			.filter(method => method.name === methodName && method.sourcePath !== undefined)
			.map(method => ({ sourcePath: method.sourcePath as string, line: method.line, column: method.column }));
	}
}

function walk(edges: Map<string, string[]>, start: string): string[] {
	const found = new Set<string>();
	let frontier = [start];
	for (let depth = 0; depth < MAX_HIERARCHY_DEPTH && frontier.length > 0; depth++) {
		const next: string[] = [];
		for (const name of frontier) {
			for (const related of edges.get(name) ?? []) {
				if (related !== start && !found.has(related)) {
					found.add(related);
					next.push(related);
				}
			}
		}
		frontier = next;
	}
	return [...found];
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
	const list = map.get(key);
	if (list) {
		list.push(value);
	} else {
		map.set(key, [value]);
	}
}

function simpleName(fqn: string): string {
	return fqn.includes('.') ? fqn.slice(fqn.lastIndexOf('.') + 1) : fqn;
}
