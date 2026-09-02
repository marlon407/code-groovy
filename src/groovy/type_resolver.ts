import { parsePackageName } from './class_parser';
import { ClassIndexStore, IndexedType } from './class_index_store';
import { ParsedDocumentSymbols, serviceNameToClassName } from './symbol_parser';

export interface ImportMap {
	bySimpleName: Map<string, string>;
	packageName: string;
}

export function buildImportMap(documentText: string): ImportMap {
	const packageName = parsePackageName(documentText);
	const bySimpleName = new Map<string, string>();
	const importRe = /^\s*import\s+(?:static\s+)?([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)(?:\.\*)?\s*;?\s*$/gm;
	let match: RegExpExecArray | null;
	while ((match = importRe.exec(documentText)) !== null) {
		const fqn = match[1];
		const simpleName = fqn.includes('.') ? fqn.slice(fqn.lastIndexOf('.') + 1) : fqn;
		bySimpleName.set(simpleName, fqn);
	}
	return { bySimpleName, packageName };
}

export function resolveSimpleTypeName(
	simpleName: string,
	importMap: ImportMap,
	store: ClassIndexStore
): string[] {
	const fqns: string[] = [];
	if (importMap.bySimpleName.has(simpleName)) {
		fqns.push(importMap.bySimpleName.get(simpleName)!);
	}
	if (importMap.packageName) {
		fqns.push(`${importMap.packageName}.${simpleName}`);
	}
	for (const type of store.lookup(simpleName)) {
		if (!fqns.includes(type.fqn)) {
			fqns.push(type.fqn);
		}
	}
	return fqns;
}

export function resolveVariableType(
	varName: string,
	documentSymbols: ParsedDocumentSymbols,
	importMap: ImportMap,
	store: ClassIndexStore
): string[] {
	for (const field of documentSymbols.fields) {
		if (field.name === varName) {
			return resolveSimpleTypeName(field.typeName, importMap, store);
		}
	}
	if (varName.endsWith('Service')) {
		return resolveSimpleTypeName(serviceNameToClassName(varName), importMap, store);
	}
	return [];
}

export function resolveSuperTypeFqns(classFqn: string, store: ClassIndexStore): string[] {
	const type = store.lookupByFqn(classFqn);
	if (!type) {
		return [];
	}
	const supers: string[] = [];
	for (const simple of type.extendsTypes ?? []) {
		const matches = store.lookup(simple);
		if (matches.length > 0) {
			supers.push(matches[0].fqn);
		}
	}
	for (const simple of type.implementsTypes ?? []) {
		const matches = store.lookup(simple);
		for (const match of matches) {
			if (!supers.includes(match.fqn)) {
				supers.push(match.fqn);
			}
		}
	}
	return supers;
}

export function rankTypeMatches(matches: IndexedType[], preferredPackage?: string): IndexedType[] {
	return [...matches].sort((a, b) => {
		const aWorkspace = a.source === 'workspace' ? 0 : 1;
		const bWorkspace = b.source === 'workspace' ? 0 : 1;
		if (aWorkspace !== bWorkspace) {
			return aWorkspace - bWorkspace;
		}
		if (preferredPackage) {
			const aPkg = a.fqn.startsWith(preferredPackage + '.') ? 0 : 1;
			const bPkg = b.fqn.startsWith(preferredPackage + '.') ? 0 : 1;
			if (aPkg !== bPkg) {
				return aPkg - bPkg;
			}
		}
		return a.fqn.localeCompare(b.fqn);
	});
}
