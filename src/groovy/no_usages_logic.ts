import { ParsedMethod } from './symbol_parser';

export interface UnusedMethodHint {
	name: string;
	line: number;
	column: number;
}

export function findMethodsWithNoUsages(
	methods: ParsedMethod[],
	hasAnyCallSite: (methodName: string) => boolean
): UnusedMethodHint[] {
	return methods
		.filter(method => !hasAnyCallSite(method.name))
		.map(method => ({ name: method.name, line: method.line, column: method.column }));
}
