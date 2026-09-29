import * as path from 'path';
import { CallSiteRecord, resolveReceiverType } from './call_site_extractor';
import { parseDocumentSymbols } from './symbol_parser';

export type UsageTarget =
	| { kind: 'class'; name: string }
	| { kind: 'method'; name: string; className: string };

export interface UsageLookupIndex {
	lookup(methodName: string, receiverName?: string): CallSiteRecord[];
	lookupByReceiver(receiverName: string): CallSiteRecord[];
	filesMentioning(typeName: string): string[];
	isReady(): boolean;
}

export interface TextScan {
	receiverFieldName?: string;
	files?: string[];
}

export interface UsageResolution {
	records: CallSiteRecord[];
	textScans: TextScan[];
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
	word: string
): UsageTarget | undefined {
	const symbols = parseDocumentSymbols(documentText, sourcePath);
	if (symbols.classes.some(cls => cls.line === line && cls.simpleName === word)) {
		return { kind: 'class', name: word };
	}
	const method = symbols.methods.find(candidate => candidate.line === line && candidate.name === word);
	if (!method) {
		return undefined;
	}
	const className = simpleName(method.classFqn);
	if (word === className) {
		return { kind: 'class', name: word };
	}
	return { kind: 'method', name: word, className };
}

export function findReferenceTarget(
	documentText: string,
	sourcePath: string,
	line: number,
	wordStart: number,
	word: string
): UsageTarget | undefined {
	const declaration = findDeclarationTarget(documentText, sourcePath, line, word);
	if (declaration) {
		return declaration;
	}
	if (/^[A-Z]/.test(word)) {
		return { kind: 'class', name: word };
	}

	const lineText = documentText.split(/\r\n|\r|\n/)[line] ?? '';
	const receiver = lineText.slice(0, wordStart).match(/([A-Za-z_]\w*)\s*[?*]?\.\s*$/)?.[1];
	const after = lineText.slice(wordStart + word.length);
	const isCall = /^\s*\(/.test(after) || (receiver !== undefined && /^\s*\{/.test(after));
	if (!isCall) {
		return undefined;
	}
	if (receiver && receiver !== 'this') {
		return { kind: 'method', name: word, className: receiverClassName(documentText, line, receiver) };
	}
	return { kind: 'method', name: word, className: owningClassName(documentText, sourcePath, line) };
}

export function resolveUsages(target: UsageTarget, index: UsageLookupIndex, mode: UsageMode): UsageResolution {
	if (target.kind === 'class') {
		const records = uniqueRecords([
			...index.lookupByReceiver(target.name),
			...index.lookup(target.name),
			...(target.name.endsWith('Service') ? index.lookupByReceiver(grailsFieldNameForClass(target.name)) : [])
		]);
		if (mode === 'navigate' && records.length > 0) {
			return { records, textScans: [] };
		}
		if (!index.isReady()) {
			return { records, textScans: [{}] };
		}
		const files = index.filesMentioning(target.name);
		return { records, textScans: files.length > 0 ? [{ files }] : [] };
	}

	const fieldName = grailsFieldNameForClass(target.className);
	const records = index.lookup(target.name).filter(record => isScopedCall(record, target.className, fieldName));
	if (records.length > 0 || index.isReady()) {
		return { records, textScans: [] };
	}
	return { records, textScans: [{ receiverFieldName: fieldName }] };
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

function isScopedCall(record: CallSiteRecord, className: string, fieldName: string): boolean {
	if (record.receiverName === undefined || record.receiverName === 'this') {
		return fileClassName(record.sourcePath) === className;
	}
	return record.receiverName === fieldName
		|| record.receiverName === className
		|| record.receiverType === className;
}

function receiverClassName(documentText: string, line: number, receiver: string): string {
	const declaredType = resolveReceiverType(documentText, line, receiver);
	if (declaredType) {
		return declaredType;
	}
	return /^[A-Z]/.test(receiver) ? receiver : receiver.charAt(0).toUpperCase() + receiver.slice(1);
}

function owningClassName(documentText: string, sourcePath: string, line: number): string {
	const classes = parseDocumentSymbols(documentText, sourcePath).classes.filter(cls => cls.line <= line);
	const owner = classes[classes.length - 1];
	return owner ? owner.simpleName : fileClassName(sourcePath);
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
