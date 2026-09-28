import { ParsedMethod, ParsedClassSymbol } from './symbol_parser';

export interface UnusedSymbolHint {
	name: string;
	line: number;
	column: number;
}

export function findMethodsWithNoUsages(
	methods: ParsedMethod[],
	hasAnyCallSite: (methodName: string) => boolean
): UnusedSymbolHint[] {
	return methods
		.filter(method => !hasAnyCallSite(method.name))
		.map(method => ({ name: method.name, line: method.line, column: method.column }));
}

export function findClassesWithNoIndexedCallSite(
	classes: ParsedClassSymbol[],
	hasAnyCallSite: (className: string) => boolean
): UnusedSymbolHint[] {
	return classes
		.filter(cls => !hasAnyCallSite(cls.simpleName))
		.map(cls => ({ name: cls.simpleName, line: cls.line, column: cls.column }));
}
