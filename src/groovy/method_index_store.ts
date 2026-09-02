import { ParsedMethod } from './symbol_parser';

export interface IndexedMethod {
	name: string;
	line: number;
	column: number;
	classFqn: string;
	sourcePath?: string;
}

export class MethodIndexStore {
	private readonly byClass = new Map<string, IndexedMethod[]>();
	private readonly byName = new Map<string, IndexedMethod[]>();

	add(methods: ParsedMethod[]): void {
		for (const method of methods) {
			const indexed: IndexedMethod = {
				name: method.name,
				line: method.line,
				column: method.column,
				classFqn: method.classFqn,
				sourcePath: method.sourcePath
			};
			this.push(this.byClass, method.classFqn, indexed);
			this.push(this.byName, method.name, indexed);
		}
	}

	lookupInClass(classFqn: string, methodName: string): IndexedMethod[] {
		const methods = this.byClass.get(classFqn) ?? [];
		return methods.filter(method => method.name === methodName);
	}

	lookupByName(methodName: string): IndexedMethod[] {
		return [...(this.byName.get(methodName) ?? [])];
	}

	clear(): void {
		this.byClass.clear();
		this.byName.clear();
	}

	private push(map: Map<string, IndexedMethod[]>, key: string, method: IndexedMethod): void {
		const list = map.get(key) ?? [];
		if (!list.some(existing => existing.classFqn === method.classFqn && existing.line === method.line)) {
			list.push(method);
			map.set(key, list);
		}
	}
}
