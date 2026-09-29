import { ParsedMethod } from './symbol_parser';
import { isImportLine, maskNonCode } from './text_scan_logic';

export interface CallSiteRecord {
	methodName: string;
	receiverName: string | undefined;
	receiverType?: string;
	sourcePath: string;
	line: number;
	column: number;
}

export interface SourceAnalysis {
	callSites: CallSiteRecord[];
	typeMentions: string[];
}

interface ReceiverDeclaration {
	name: string;
	type: string;
	line: number;
}

const CALL_SITE_RE = /\b(?:([A-Za-z_]\w*)\s*[?*]?\.\s*)?([A-Za-z_]\w*)\s*([({])/g;
const TYPED_DECLARATION_RE = /\b([A-Z]\w*)(?:<[^()]*?>)?(?:\[\])*\s+([a-z_]\w*)(?=\s*(?:[=,;)]|->|$))/g;
const DEF_NEW_RE = /\bdef\s+([a-z_]\w*)\s*=\s*new\s+([A-Z]\w*)/g;
const TYPE_MENTION_RE = /\b[A-Z]\w*/g;

const RESERVED_WORDS = new Set([
	'if', 'else', 'for', 'while', 'switch', 'catch', 'synchronized', 'return',
	'throw', 'assert', 'new', 'in', 'instanceof', 'super', 'this'
]);

const internPool = new Map<string, string>();

function intern(value: string): string {
	const pooled = internPool.get(value);
	if (pooled !== undefined) {
		return pooled;
	}
	const copy = Buffer.from(value, 'utf8').toString('utf8');
	internPool.set(copy, copy);
	return copy;
}

export function extractCallSites(text: string, sourcePath: string): CallSiteRecord[] {
	return analyzeSource(text, sourcePath).callSites;
}

export function analyzeSource(text: string, sourcePath: string): SourceAnalysis {
	const lines = maskNonCode(text).split(/\r\n|\r|\n/);
	const originalLines = text.split(/\r\n|\r|\n/);
	const declarations = collectReceiverDeclarations(lines);
	const callSites: CallSiteRecord[] = [];
	const typeMentions = new Set<string>();

	for (let lineNo = 0; lineNo < lines.length; lineNo++) {
		const line = lines[lineNo];
		if (!isImportLine(originalLines[lineNo] ?? '') && !/^\s*package\s/.test(line)) {
			for (const mention of line.match(TYPE_MENTION_RE) ?? []) {
				typeMentions.add(intern(mention));
			}
		}
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
			if (RESERVED_WORDS.has(methodName)) {
				continue;
			}
			const methodStart = line.lastIndexOf(methodName, match.index + match[0].length - 1);
			if (!receiverName && line.charAt(methodStart - 1) === '@') {
				continue;
			}
			const receiverType = receiverName && /^[a-z_]/.test(receiverName) && receiverName !== 'this'
				? nearestDeclarationType(declarations, receiverName, lineNo)
				: undefined;
			callSites.push({
				methodName: intern(methodName),
				receiverName: receiverName === undefined ? undefined : intern(receiverName),
				...(receiverType ? { receiverType: intern(receiverType) } : {}),
				sourcePath,
				line: lineNo,
				column: methodStart
			});
		}
	}

	return { callSites, typeMentions: [...typeMentions] };
}

export function resolveReceiverType(text: string, line: number, receiverName: string): string | undefined {
	const declarations = collectReceiverDeclarations(maskNonCode(text).split(/\r\n|\r|\n/));
	return nearestDeclarationType(declarations, receiverName, line);
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

function collectReceiverDeclarations(maskedLines: string[]): Map<string, ReceiverDeclaration[]> {
	const byName = new Map<string, ReceiverDeclaration[]>();
	const add = (name: string, type: string, line: number) => {
		const list = byName.get(name) ?? [];
		list.push({ name, type, line });
		byName.set(name, list);
	};
	for (let lineNo = 0; lineNo < maskedLines.length; lineNo++) {
		const line = maskedLines[lineNo];
		if (!/[A-Z]/.test(line)) {
			continue;
		}
		for (const re of [TYPED_DECLARATION_RE, DEF_NEW_RE]) {
			re.lastIndex = 0;
			let match: RegExpExecArray | null;
			while ((match = re.exec(line)) !== null) {
				if (re === TYPED_DECLARATION_RE) {
					add(match[2], match[1], lineNo);
				} else {
					add(match[1], match[2], lineNo);
				}
			}
		}
	}
	return byName;
}

function nearestDeclarationType(
	declarations: Map<string, ReceiverDeclaration[]>,
	name: string,
	line: number
): string | undefined {
	const candidates = declarations.get(name);
	if (!candidates?.length) {
		return undefined;
	}
	const preceding = candidates.filter(declaration => declaration.line <= line);
	return (preceding.length > 0 ? preceding[preceding.length - 1] : candidates[0]).type;
}

function declarationKey(sourcePath: string, line: number, column: number, name: string): string {
	return `${sourcePath}::${line}::${column}::${name}`;
}
