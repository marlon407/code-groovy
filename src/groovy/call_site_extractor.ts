import { ParsedClassSymbol, ParsedDocumentSymbols, ParsedMethod, parseDocumentSymbols } from './symbol_parser';
import { braceDepthAtLineStarts, isImportLine, maskNonCode, parenDepthAtLineStarts } from './text_scan_logic';

export const CHAINED_RECEIVER = '.';

export interface CallSiteRecord {
	methodName: string;
	receiverName: string | undefined;
	receiverType?: string;
	ownerClass?: string;
	sourcePath: string;
	line: number;
	column: number;
}

export interface SourceAnalysis {
	callSites: CallSiteRecord[];
	typeMentions: string[];
}

interface ReceiverDeclaration {
	type: string | undefined;
	line: number;
}

type ReceiverTypeResolver = (receiverName: string, line: number) => string | undefined;

const CALL_SITE_RE = /\b(?:([A-Za-z_]\w*)\s*[?*]?\.\s*)?([A-Za-z_]\w*)\s*([({])/g;
const TYPED_DECLARATION_RE = /\b([A-Z]\w*)(?:<[^()]*?>)?(?:\[\])*\s+([a-z_]\w*)(?=\s*(?:[=,;)]|->|$))/g;
const DEF_DECLARATION_RE =
	/\bdef\s+([a-z_]\w*)\s*=\s*(?:new\s+([A-Z]\w*)|([A-Z]\w*)\s*\.\s*(?:get|read|load|lock|find|findWhere|findBy\w+|findOrCreate\w+|findOrSave\w+)\s*\()?/g;
const CLOSURE_PARAMS_RE = /\{\s*([a-z_]\w*(?:\s*,\s*[a-z_]\w*)*)\s*->/g;
const TYPE_MENTION_RE = /\b[A-Z]\w*/g;
const LINE_BREAK_RE = /\r\n|\r|\n/g;

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

export function analyzeSource(
	text: string,
	sourcePath: string,
	symbols?: ParsedDocumentSymbols,
	maskedText = maskNonCode(text)
): SourceAnalysis {
	const parsed = symbols ?? parseDocumentSymbols(text, sourcePath, maskedText);
	const lines = maskedText.split(LINE_BREAK_RE);
	const originalLines = text.split(LINE_BREAK_RE);
	const lineStarts = lineStartOffsets(maskedText);
	const owners = ownerClassByLine(parsed.classes, lines.length);
	const resolveType = createReceiverTypeResolver(lines, maskedText, parsed, owners);
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
		const ownerClass = owners[lineNo]?.simpleName;
		CALL_SITE_RE.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = CALL_SITE_RE.exec(line)) !== null) {
			const [, capturedReceiver, methodName, delimiter] = match;
			const methodStart = line.lastIndexOf(methodName, match.index + match[0].length - 1);
			const receiverName = capturedReceiver ?? receiverBefore(maskedText, lineStarts[lineNo] + methodStart);
			if (delimiter === '{' && !receiverName) {
				continue;
			}
			if (RESERVED_WORDS.has(methodName)) {
				continue;
			}
			if (!receiverName && line.charAt(methodStart - 1) === '@') {
				continue;
			}
			const receiverType = receiverName && /^[a-z_]/.test(receiverName) && receiverName !== 'this'
				? resolveType(receiverName, lineNo)
				: undefined;
			callSites.push({
				methodName: intern(methodName),
				receiverName: receiverName === undefined ? undefined : intern(receiverName),
				...(receiverType ? { receiverType: intern(receiverType) } : {}),
				...(ownerClass ? { ownerClass: intern(ownerClass) } : {}),
				sourcePath,
				line: lineNo,
				column: methodStart
			});
		}
	}

	return { callSites, typeMentions: [...typeMentions] };
}

export function resolveReceiverType(text: string, line: number, receiverName: string): string | undefined {
	const maskedText = maskNonCode(text);
	const parsed = parseDocumentSymbols(text, undefined, maskedText);
	const lines = maskedText.split(LINE_BREAK_RE);
	const owners = ownerClassByLine(parsed.classes, lines.length);
	return createReceiverTypeResolver(lines, maskedText, parsed, owners)(receiverName, line);
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

export function ownerClassByLine(classes: ParsedClassSymbol[], lineCount: number): Array<ParsedClassSymbol | undefined> {
	const owners: Array<ParsedClassSymbol | undefined> = new Array(lineCount);
	const sorted = [...classes].sort((a, b) => a.line - b.line);
	const open: ParsedClassSymbol[] = [];
	let next = 0;
	for (let line = 0; line < lineCount; line++) {
		while (open.length > 0 && open[open.length - 1].endLine < line) {
			open.pop();
		}
		while (next < sorted.length && sorted[next].line === line) {
			open.push(sorted[next++]);
		}
		owners[line] = open[open.length - 1];
	}
	return owners;
}

export function receiverBefore(maskedText: string, offset: number): string | undefined {
	let i = skipWhitespaceBackward(maskedText, offset - 1);
	if (maskedText[i] !== '.') {
		return undefined;
	}
	i--;
	if (maskedText[i] === '?' || maskedText[i] === '*') {
		i--;
	}
	i = skipWhitespaceBackward(maskedText, i);
	const end = i + 1;
	while (i >= 0 && /\w/.test(maskedText[i])) {
		i--;
	}
	const identifier = maskedText.slice(i + 1, end);
	if (!/^[A-Za-z_]\w*$/.test(identifier) || maskedText[skipWhitespaceBackward(maskedText, i)] === '.') {
		return CHAINED_RECEIVER;
	}
	return identifier;
}

function skipWhitespaceBackward(text: string, index: number): number {
	let i = index;
	while (i >= 0 && /\s/.test(text[i])) {
		i--;
	}
	return i;
}

function lineStartOffsets(text: string): number[] {
	const starts = [0];
	LINE_BREAK_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = LINE_BREAK_RE.exec(text)) !== null) {
		starts.push(match.index + match[0].length);
	}
	return starts;
}

function createReceiverTypeResolver(
	maskedLines: string[],
	maskedText: string,
	symbols: ParsedDocumentSymbols,
	owners: Array<ParsedClassSymbol | undefined>
): ReceiverTypeResolver {
	const declarations = collectReceiverDeclarations(maskedLines);
	const scopeStarts = scopeStartByLine(maskedLines, braceDepthAtLineStarts(maskedText), parenDepthAtLineStarts(maskedText), owners);
	const classFields = new Map<string, string>();
	for (const field of symbols.fields) {
		if (field.classMember) {
			classFields.set(`${field.classFqn}#${field.name}`, field.typeName);
		}
	}

	return (receiverName, line) => {
		const scopeStart = scopeStarts[line] ?? 0;
		const visible = (declarations.get(receiverName) ?? []).filter(declaration => declaration.line >= scopeStart && declaration.line <= line);
		if (visible.length > 0) {
			return visible[visible.length - 1].type;
		}
		const owner = owners[line];
		return owner ? classFields.get(`${owner.fqn}#${receiverName}`) : undefined;
	};
}

function scopeStartByLine(
	maskedLines: string[],
	depths: number[],
	parenDepths: number[],
	owners: Array<ParsedClassSymbol | undefined>
): number[] {
	const starts: number[] = new Array(owners.length);
	let lastMemberLevelLine = 0;
	for (let line = 0; line < owners.length; line++) {
		const owner = owners[line];
		const memberDepth = owner?.bodyDepth ?? 0;
		const continuesDeclaration = (parenDepths[line] ?? 0) > 0 || /^\s*\{/.test(maskedLines[line] ?? '');
		if ((depths[line] ?? 0) <= memberDepth && !continuesDeclaration) {
			lastMemberLevelLine = line;
			starts[line] = memberDepth > 0 ? line : 0;
		} else {
			starts[line] = lastMemberLevelLine;
		}
	}
	return starts;
}

function collectReceiverDeclarations(maskedLines: string[]): Map<string, ReceiverDeclaration[]> {
	const byName = new Map<string, ReceiverDeclaration[]>();
	for (let lineNo = 0; lineNo < maskedLines.length; lineNo++) {
		const line = maskedLines[lineNo];
		const found: Array<{ index: number; name: string; type: string | undefined }> = [];
		if (/[A-Z]/.test(line)) {
			collectMatches(TYPED_DECLARATION_RE, line, match => found.push({ index: match.index, name: match[2], type: match[1] }));
		}
		if (line.includes('def')) {
			collectMatches(DEF_DECLARATION_RE, line, match => found.push({ index: match.index, name: match[1], type: match[2] ?? match[3] }));
		}
		if (line.includes('->')) {
			collectMatches(CLOSURE_PARAMS_RE, line, match => {
				for (const name of match[1].split(',')) {
					found.push({ index: match.index, name: name.trim(), type: undefined });
				}
			});
		}
		found.sort((a, b) => a.index - b.index);
		for (const declaration of found) {
			const list = byName.get(declaration.name) ?? [];
			list.push({ type: declaration.type, line: lineNo });
			byName.set(declaration.name, list);
		}
	}
	return byName;
}

function collectMatches(re: RegExp, line: string, onMatch: (match: RegExpExecArray) => void): void {
	re.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = re.exec(line)) !== null) {
		onMatch(match);
		if (match[0].length === 0) {
			re.lastIndex++;
		}
	}
}

function declarationKey(sourcePath: string, line: number, column: number, name: string): string {
	return `${sourcePath}::${line}::${column}::${name}`;
}
