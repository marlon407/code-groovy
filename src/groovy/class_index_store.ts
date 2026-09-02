import { parseTypesFromSource } from './class_parser';

export const MAX_INDEXED_CLASSES = 50_000;
export const MAX_COMPLETION_RESULTS = 50;

export interface IndexedType {
	simpleName: string;
	fqn: string;
	source: 'workspace' | 'jar';
	sourcePath?: string;
}

export function simpleNameFromFqn(fqn: string): string {
	const idx = fqn.lastIndexOf('.');
	return idx >= 0 ? fqn.slice(idx + 1) : fqn;
}

export function indexSourceText(text: string, sourcePath?: string): IndexedType[] {
	return parseTypesFromSource(text, sourcePath).map(type => ({
		simpleName: type.simpleName,
		fqn: type.fqn,
		source: 'workspace' as const,
		sourcePath
	}));
}

export function indexJarFqns(fqns: string[], jarPath?: string): IndexedType[] {
	return fqns.map(fqn => ({
		simpleName: simpleNameFromFqn(fqn),
		fqn,
		source: 'jar' as const,
		sourcePath: jarPath
	}));
}

export class ClassIndexStore {
	private readonly bySimpleName = new Map<string, IndexedType[]>();
	private count = 0;

	add(types: IndexedType[]): void {
		for (const type of types) {
			if (this.count >= MAX_INDEXED_CLASSES) {
				return;
			}
			const list = this.bySimpleName.get(type.simpleName) ?? [];
			if (list.some(existing => existing.fqn === type.fqn)) {
				continue;
			}
			list.push(type);
			this.bySimpleName.set(type.simpleName, list);
			this.count += 1;
		}
	}

	lookup(simpleName: string): IndexedType[] {
		return [...(this.bySimpleName.get(simpleName) ?? [])];
	}

	lookupPrefix(prefix: string, limit = MAX_COMPLETION_RESULTS): IndexedType[] {
		if (!prefix) {
			return [];
		}
		const lower = prefix.toLowerCase();
		const results: IndexedType[] = [];
		for (const [name, types] of this.bySimpleName) {
			if (name.toLowerCase().startsWith(lower)) {
				results.push(...types);
			}
		}
		results.sort((a, b) => compareTypeCompletions(a, b, lower));
		return results.slice(0, limit);
	}

	removeBySource(source: IndexedType['source']): void {
		for (const [name, types] of this.bySimpleName) {
			const kept = types.filter(type => type.source !== source);
			this.count -= types.length - kept.length;
			if (kept.length === 0) {
				this.bySimpleName.delete(name);
			} else {
				this.bySimpleName.set(name, kept);
			}
		}
	}

	clear(): void {
		this.bySimpleName.clear();
		this.count = 0;
	}

	size(): number {
		return this.count;
	}

	serialize(source: IndexedType['source']): Array<{ simpleName: string; fqn: string }> {
		const result: Array<{ simpleName: string; fqn: string }> = [];
		for (const types of this.bySimpleName.values()) {
			for (const type of types) {
				if (type.source === source) {
					result.push({ simpleName: type.simpleName, fqn: type.fqn });
				}
			}
		}
		return result;
	}
}

export function compareTypeCompletions(a: IndexedType, b: IndexedType, prefixLower: string): number {
	const aExact = a.simpleName.toLowerCase() === prefixLower ? 0 : 1;
	const bExact = b.simpleName.toLowerCase() === prefixLower ? 0 : 1;
	if (aExact !== bExact) {
		return aExact - bExact;
	}

	const aWorkspace = a.source === 'workspace' ? 0 : 1;
	const bWorkspace = b.source === 'workspace' ? 0 : 1;
	if (aWorkspace !== bWorkspace) {
		return aWorkspace - bWorkspace;
	}

	if (a.simpleName.length !== b.simpleName.length) {
		return a.simpleName.length - b.simpleName.length;
	}

	return a.simpleName.localeCompare(b.simpleName) || a.fqn.localeCompare(b.fqn);
}
