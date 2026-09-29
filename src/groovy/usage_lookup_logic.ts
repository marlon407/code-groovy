import * as path from 'path';
import { CallSiteRecord, CHAINED_RECEIVER, receiverBefore, receiverChain, resolveReceiverType } from './call_site_extractor';
import { ParsedClassSymbol, parseDocumentSymbols } from './symbol_parser';
import { maskNonCode } from './text_scan_logic';
import { MethodDeclaration, parseImports } from './type_hierarchy_store';

export type UsageTarget =
	| { kind: 'class'; name: string }
	| { kind: 'method'; name: string; className: string; classFqn?: string; chain?: ReceiverChain };

export interface ReceiverChain {
	rootType: string;
	path: string[];
}

export interface UsageLookupIndex {
	lookup(methodName: string, receiverName?: string): CallSiteRecord[];
	lookupByReceiver(receiverName: string): CallSiteRecord[];
	filesMentioning(typeName: string): string[];
	isReady(): boolean;
}

export interface UsageHierarchy {
	resolveClass(simpleName: string): string[];
	parentsOf(fqn: string): string[];
	childrenOf(fqn: string): string[];
	methodDeclarations(fqn: string, methodName: string): MethodDeclaration[];
	memberType?(fqn: string, memberName: string): string | undefined;
}

interface UsageScope {
	classNames: Set<string>;
	superCallerNames: Set<string>;
	fieldNames: Set<string>;
	ancestorsDeclaring: string[];
	resolveChain?: (rootType: string, path: string[]) => string | undefined;
}

const MAX_HIERARCHY_DEPTH = 12;

export interface TextScan {
	receiverFieldName?: string;
	files?: string[];
}

export interface UsageResolution {
	records: CallSiteRecord[];
	textScans: TextScan[];
	superDeclarations: MethodDeclaration[];
}

export type UsageMode = 'navigate' | 'references';

export function grailsFieldNameForClass(className: string): string {
	if (className.length > 1 && isUpperCase(className.charAt(0)) && isUpperCase(className.charAt(1))) {
		return className;
	}
	return className.charAt(0).toLowerCase() + className.slice(1);
}

export function findDeclarationTarget(
	documentText: string,
	sourcePath: string,
	line: number,
	word: string,
	wordStart?: number
): UsageTarget | undefined {
	const symbols = parseDocumentSymbols(documentText, sourcePath);
	const atWord = (column: number) => wordStart === undefined || column === wordStart;
	if (symbols.classes.some(cls => cls.line === line && cls.simpleName === word && atWord(cls.column))) {
		return { kind: 'class', name: word };
	}
	const method = symbols.methods.find(candidate => candidate.line === line && candidate.name === word && atWord(candidate.column));
	if (!method) {
		return undefined;
	}
	const className = simpleName(method.classFqn);
	if (word === className) {
		return { kind: 'class', name: word };
	}
	return { kind: 'method', name: word, className, classFqn: method.classFqn };
}

export function findReferenceTarget(
	documentText: string,
	sourcePath: string,
	line: number,
	wordStart: number,
	word: string
): UsageTarget | undefined {
	const declaration = findDeclarationTarget(documentText, sourcePath, line, word, wordStart);
	if (declaration) {
		return declaration;
	}
	if (/^[A-Z]/.test(word)) {
		return { kind: 'class', name: word };
	}

	const maskedText = maskNonCode(documentText);
	const maskedLines = maskedText.split('\n');
	const lineText = maskedLines[line] ?? '';
	const lineStart = maskedLines.slice(0, line).reduce((offset, text) => offset + text.length + 1, 0);
	const receiverMatch = lineText.slice(0, wordStart).match(/([A-Za-z_]\w*)\s*[?*]?\.\s*$/);
	const receiver = receiverMatch?.[1] ?? receiverBefore(maskedText, lineStart + wordStart);
	const after = lineText.slice(wordStart + word.length);
	const isCall = /^\s*\(/.test(after) || (receiver !== undefined && /^\s*\{/.test(after));
	if (!isCall || receiver === CHAINED_RECEIVER) {
		return undefined;
	}
	if (receiver === 'super') {
		const owner = owningClass(documentText, sourcePath, line);
		const parent = owner?.extendsTypes[0] ?? owner?.implementsTypes[0];
		if (!parent) {
			return undefined;
		}
		const parentFqn = resolveTypeFqn(parent, owner?.packageName ?? '', parseImports(documentText));
		return { kind: 'method', name: word, className: simpleName(parent), ...(parentFqn ? { classFqn: parentFqn } : {}) };
	}
	const chain = receiverMatch && receiverMatch.index !== undefined
		? receiverChain(maskedText, lineStart + receiverMatch.index, receiverMatch[1])
		: undefined;
	if (chain) {
		const rootType = chainRootTypeAt(documentText, sourcePath, line, chain[0]);
		return {
			kind: 'method',
			name: word,
			className: capitalize(chain[chain.length - 1]),
			...(rootType ? { chain: { rootType, path: chain.slice(1) } } : {})
		};
	}
	if (receiver && receiver !== 'this') {
		return { kind: 'method', name: word, className: receiverClassName(documentText, line, receiver) };
	}
	return { kind: 'method', name: word, className: owningClassName(documentText, sourcePath, line) };
}

export function resolveUsages(
	target: UsageTarget,
	index: UsageLookupIndex,
	mode: UsageMode,
	hierarchy?: UsageHierarchy
): UsageResolution {
	if (target.kind === 'class') {
		const records = uniqueRecords([
			...index.lookupByReceiver(target.name),
			...index.lookup(target.name),
			...(target.name.endsWith('Service') ? index.lookupByReceiver(grailsFieldNameForClass(target.name)) : [])
		]);
		if (mode === 'navigate' && records.length > 0) {
			return { records, textScans: [], superDeclarations: [] };
		}
		if (!index.isReady()) {
			return { records, textScans: [{}], superDeclarations: [] };
		}
		const files = index.filesMentioning(target.name);
		return { records, textScans: files.length > 0 ? [{ files }] : [], superDeclarations: [] };
	}

	const chainType = target.chain && hierarchy?.memberType
		? chainResolver(hierarchy)(target.chain.rootType, target.chain.path)
		: undefined;
	const scope = buildScope(chainType ? { name: target.name, className: chainType } : target, hierarchy);
	const records = index.lookup(target.name).filter(record => isScopedCall(record, scope));
	const superDeclarations = records.length > 0 || !hierarchy
		? []
		: scope.ancestorsDeclaring.flatMap(ancestor => hierarchy.methodDeclarations(ancestor, target.name));
	if (records.length > 0 || index.isReady()) {
		return { records, textScans: [], superDeclarations };
	}
	return { records, textScans: [{ receiverFieldName: grailsFieldNameForClass(target.className) }], superDeclarations };
}

function buildScope(target: { name: string; className: string; classFqn?: string }, hierarchy: UsageHierarchy | undefined): UsageScope {
	const known = hierarchy ? hierarchy.resolveClass(target.className) : [];
	const roots = target.classFqn && known.includes(target.classFqn) ? [target.classFqn] : known;
	const ancestorsDeclaring = hierarchy
		? walkHierarchy(roots, fqn => hierarchy.parentsOf(fqn)).filter(fqn => hierarchy.methodDeclarations(fqn, target.name).length > 0)
		: [];
	const subclassNames = new Set<string>();
	const superCallerNames = new Set<string>();
	if (hierarchy) {
		walkHierarchy(roots, fqn => hierarchy.childrenOf(fqn).filter(child => {
			superCallerNames.add(simpleName(child));
			if (hierarchy.methodDeclarations(child, target.name).length > 0) {
				return false;
			}
			subclassNames.add(simpleName(child));
			return true;
		}));
	}
	const classNames = new Set([target.className, ...ancestorsDeclaring.map(simpleName), ...subclassNames]);
	return {
		classNames,
		superCallerNames,
		fieldNames: new Set([...classNames].map(grailsFieldNameForClass)),
		ancestorsDeclaring,
		resolveChain: hierarchy?.memberType ? chainResolver(hierarchy) : undefined
	};
}

function chainResolver(hierarchy: UsageHierarchy): (rootType: string, path: string[]) => string | undefined {
	const cache = new Map<string, string | undefined>();
	const memberTypeOf = (typeName: string, memberName: string): string | undefined => {
		const key = `${typeName}#${memberName}`;
		if (!cache.has(key)) {
			const roots = hierarchy.resolveClass(typeName);
			const candidates = [...roots, ...walkHierarchy(roots, fqn => hierarchy.parentsOf(fqn))];
			const found = candidates.map(fqn => hierarchy.memberType?.(fqn, memberName)).find(Boolean);
			cache.set(key, found ? simpleName(found) : undefined);
		}
		return cache.get(key);
	};
	return (rootType, path) => {
		let typeName: string | undefined = rootType;
		for (const segment of path) {
			typeName = typeName ? memberTypeOf(typeName, segment) : undefined;
		}
		return typeName;
	};
}

function walkHierarchy(roots: string[], next: (fqn: string) => string[]): string[] {
	const found = new Set<string>();
	let frontier = roots;
	for (let depth = 0; depth < MAX_HIERARCHY_DEPTH && frontier.length > 0; depth++) {
		const following: string[] = [];
		for (const fqn of frontier) {
			for (const related of next(fqn)) {
				if (!found.has(related) && !roots.includes(related)) {
					found.add(related);
					following.push(related);
				}
			}
		}
		frontier = following;
	}
	return [...found];
}

export function uniqueRecords(records: CallSiteRecord[]): CallSiteRecord[] {
	const seen = new Set<string>();
	return records.filter(record => {
		const key = `${record.sourcePath}::${record.line}::${record.column}`;
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

function isScopedCall(record: CallSiteRecord, scope: UsageScope): boolean {
	const owner = record.ownerClass ?? fileClassName(record.sourcePath);
	if (record.receiverName === undefined || record.receiverName === 'this') {
		return scope.classNames.has(owner);
	}
	if (record.receiverName === 'super') {
		return scope.superCallerNames.has(owner);
	}
	if (record.receiverName === CHAINED_RECEIVER) {
		return false;
	}
	if (record.receiverRootType && record.receiverPath && scope.resolveChain) {
		const chainType = scope.resolveChain(record.receiverRootType, record.receiverPath);
		if (chainType) {
			return scope.classNames.has(chainType);
		}
	}
	if (record.receiverType) {
		return scope.classNames.has(record.receiverType);
	}
	return scope.fieldNames.has(record.receiverName) || scope.classNames.has(record.receiverName);
}

function chainRootTypeAt(documentText: string, sourcePath: string, line: number, root: string): string | undefined {
	if (root === 'this') {
		return owningClassName(documentText, sourcePath, line);
	}
	if (/^[A-Z]/.test(root)) {
		return root;
	}
	const declared = resolveReceiverType(documentText, line, root);
	return declared ? simpleName(declared) : undefined;
}

function capitalize(name: string): string {
	return /^[A-Z]/.test(name) ? name : name.charAt(0).toUpperCase() + name.slice(1);
}

function receiverClassName(documentText: string, line: number, receiver: string): string {
	const declaredType = resolveReceiverType(documentText, line, receiver);
	if (declaredType) {
		return declaredType;
	}
	return /^[A-Z]/.test(receiver) ? receiver : receiver.charAt(0).toUpperCase() + receiver.slice(1);
}

function owningClassName(documentText: string, sourcePath: string, line: number): string {
	return owningClass(documentText, sourcePath, line)?.simpleName ?? fileClassName(sourcePath);
}

function owningClass(documentText: string, sourcePath: string, line: number): ParsedClassSymbol | undefined {
	const classes = parseDocumentSymbols(documentText, sourcePath).classes.filter(cls => cls.line <= line && cls.endLine >= line);
	return classes[classes.length - 1];
}

function resolveTypeFqn(typeName: string, packageName: string, imports: string[]): string | undefined {
	if (typeName.includes('.')) {
		return typeName;
	}
	const explicit = imports.find(entry => !entry.endsWith('.*') && entry.endsWith(`.${typeName}`));
	if (explicit) {
		return explicit;
	}
	return packageName ? `${packageName}.${typeName}` : undefined;
}

function fileClassName(sourcePath: string): string {
	return path.basename(sourcePath, path.extname(sourcePath));
}

function simpleName(fqn: string): string {
	return fqn.includes('.') ? fqn.slice(fqn.lastIndexOf('.') + 1) : fqn;
}

function isUpperCase(char: string): boolean {
	return char !== char.toLowerCase() && char === char.toUpperCase();
}
