import { ParsedMethod } from './symbol_parser';
import { isInsideStringLiteral } from './text_scan_logic';

export interface CallSiteRecord {
	methodName: string;
	receiverName: string | undefined;
	sourcePath: string;
	line: number;
	column: number;
}

const CALL_SITE_RE = /\b(?:([A-Za-z_]\w*)\s*\.\s*)?([A-Za-z_]\w*)\s*([({])/g;

export function extractCallSites(text: string, sourcePath: string): CallSiteRecord[] {
	const records: CallSiteRecord[] = [];
	const lines = text.split(/\r\n|\r|\n/);

	for (let lineNo = 0; lineNo < lines.length; lineNo++) {
		const line = lines[lineNo];
		if (!line.includes('(') && !line.includes('{')) {
			continue;
		}
		CALL_SITE_RE.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = CALL_SITE_RE.exec(line)) !== null) {
			const [, receiverName, methodName, delimiter] = match;
			if (delimiter === '{' && !receiverName) {
				continue;
			}
			const methodStart = line.lastIndexOf(methodName, match.index + match[0].length - 1);
			if (isInsideStringLiteral(line, methodStart)) {
				continue;
			}
			records.push({
				methodName,
				receiverName,
				sourcePath,
				line: lineNo,
				column: methodStart
			});
		}
	}

	return records;
}

export function excludeDeclarationCallSites(callSites: CallSiteRecord[], methods: ParsedMethod[]): CallSiteRecord[] {
	const declarationKeys = new Set(
		methods
			.filter(method => method.sourcePath !== undefined)
			.map(method => declarationKey(method.sourcePath as string, method.line, method.column, method.name))
	);
	return callSites.filter(callSite => {
		if (callSite.receiverName) {
			return true;
		}
		return !declarationKeys.has(declarationKey(callSite.sourcePath, callSite.line, callSite.column, callSite.methodName));
	});
}

function declarationKey(sourcePath: string, line: number, column: number, name: string): string {
	return `${sourcePath}::${line}::${column}::${name}`;
}
