import { parsePackageName } from './class_parser';

export interface ParsedMethod {
	name: string;
	line: number;
	column: number;
	classFqn: string;
	sourcePath?: string;
}

export interface ParsedField {
	name: string;
	typeName: string;
	line: number;
	column: number;
	classFqn: string;
}

export interface ParsedClassSymbol {
	simpleName: string;
	fqn: string;
	packageName: string;
	kind: 'class' | 'interface' | 'trait' | 'enum';
	line: number;
	column: number;
	extendsTypes: string[];
	implementsTypes: string[];
	sourcePath?: string;
}

export interface ParsedDocumentSymbols {
	packageName: string;
	classes: ParsedClassSymbol[];
	methods: ParsedMethod[];
	fields: ParsedField[];
}

const CLASS_LINE_RE =
	/^\s*(?:(?:public|protected|private|static|final|abstract|sealed|non-sealed)\s+)*(class|interface|trait|enum)\s+([A-Za-z_]\w*)(?:\s+extends\s+([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*))?(?:\s+implements\s+([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*))?\b/;
const METHOD_LINE_RE =
	/^\s*(?:(?:public|protected|private|static|final|abstract|synchronized)\s+)*(?:def|[A-Za-z_]\w+)\s+([A-Za-z_]\w*)\s*\(/;
const FIELD_LINE_RE =
	/^\s*(?:(?:public|protected|private|static|final)\s+)*([A-Z][A-Za-z0-9_]*)\s+([a-zA-Z_]\w*)\s*(?:=|;|$)/;
const SERVICE_INJECT_RE = /^\s*def\s+([a-z][A-Za-z0-9_]*Service)\s*(?:=|;|$)/;
const TYPED_FIELD_RE =
	/^\s*(?:(?:public|protected|private|static|final)\s+)*([A-Z][A-Za-z0-9_]*)\s+([a-zA-Z_]\w*)\s*=/;

function splitTypeList(raw: string | undefined): string[] {
	if (!raw) {
		return [];
	}
	return raw.split(',').map(part => part.trim()).filter(Boolean);
}

export function parseDocumentSymbols(text: string, sourcePath?: string): ParsedDocumentSymbols {
	const packageName = parsePackageName(text);
	const lines = text.split('\n');
	const classes: ParsedClassSymbol[] = [];
	const methods: ParsedMethod[] = [];
	const fields: ParsedField[] = [];
	let currentClassFqn = packageName ? `${packageName}.${inferScriptClassName(sourcePath)}` : inferScriptClassName(sourcePath);

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('//')) {
			continue;
		}

		const classMatch = line.match(CLASS_LINE_RE);
		if (classMatch) {
			const kind = classMatch[1] as ParsedClassSymbol['kind'];
			const simpleName = classMatch[2];
			const fqn = packageName ? `${packageName}.${simpleName}` : simpleName;
			const column = line.indexOf(simpleName);
			classes.push({
				simpleName,
				fqn,
				packageName,
				kind,
				line: i,
				column: column >= 0 ? column : 0,
				extendsTypes: splitTypeList(classMatch[3]),
				implementsTypes: splitTypeList(classMatch[4]),
				sourcePath
			});
			currentClassFqn = fqn;
			continue;
		}

		const methodMatch = line.match(METHOD_LINE_RE);
		if (methodMatch) {
			const name = methodMatch[1];
			if (!isReservedName(name)) {
				const column = line.indexOf(name);
				methods.push({
					name,
					line: i,
					column: column >= 0 ? column : 0,
					classFqn: currentClassFqn,
					sourcePath
				});
			}
			continue;
		}

		const serviceMatch = line.match(SERVICE_INJECT_RE);
		if (serviceMatch) {
			const serviceName = serviceMatch[1];
			const typeName = serviceNameToClassName(serviceName);
			const column = line.indexOf(serviceName);
			fields.push({
				name: serviceName,
				typeName,
				line: i,
				column: column >= 0 ? column : 0,
				classFqn: currentClassFqn
			});
			continue;
		}

		const typedField = line.match(TYPED_FIELD_RE) ?? line.match(FIELD_LINE_RE);
		if (typedField) {
			const typeName = typedField[1];
			const name = typedField[2];
			const column = line.indexOf(name, line.indexOf(typeName) + typeName.length);
			fields.push({
				typeName,
				name,
				line: i,
				column: column >= 0 ? column : 0,
				classFqn: currentClassFqn
			});
		}
	}

	if (classes.length === 0 && (methods.length > 0 || fields.length > 0)) {
		const scriptName = inferScriptClassName(sourcePath);
		const fqn = packageName ? `${packageName}.${scriptName}` : scriptName;
		classes.push({
			simpleName: scriptName,
			fqn,
			packageName,
			kind: 'class',
			line: 0,
			column: 0,
			extendsTypes: [],
			implementsTypes: [],
			sourcePath
		});
	}

	return { packageName, classes, methods, fields };
}

const MAX_HIERARCHY_DEPTH = 12;

export interface FieldLocation {
	filePath: string;
	line: number;
	column: number;
}

export function findFieldInClassHierarchy(
	readFile: (filePath: string) => string | undefined,
	findEntries: (className: string) => Array<{ filePath: string }>,
	className: string,
	fieldName: string,
	visited: Set<string> = new Set(),
	depth = 0
): FieldLocation[] {
	if (!className || visited.has(className) || depth > MAX_HIERARCHY_DEPTH) {
		return [];
	}
	visited.add(className);

	for (const entry of findEntries(className)) {
		const content = readFile(entry.filePath);
		if (!content) {
			continue;
		}
		const parsed = parseDocumentSymbols(content, entry.filePath);
		const field = parsed.fields.find(candidate => candidate.name === fieldName);
		if (field) {
			return [{ filePath: entry.filePath, line: field.line, column: field.column }];
		}

		const ownClass = parsed.classes.find(cls => cls.simpleName === className);
		const parents = [...(ownClass?.extendsTypes ?? []), ...(ownClass?.implementsTypes ?? [])];
		for (const parent of parents) {
			const inherited = findFieldInClassHierarchy(readFile, findEntries, parent, fieldName, visited, depth + 1);
			if (inherited.length > 0) {
				return inherited;
			}
		}
	}

	return [];
}

export function serviceNameToClassName(serviceName: string): string {
	if (!serviceName.endsWith('Service') || serviceName.length <= 'Service'.length) {
		return serviceName;
	}
	const prefix = serviceName.slice(0, -'Service'.length);
	return prefix.charAt(0).toUpperCase() + prefix.slice(1) + 'Service';
}

function inferScriptClassName(sourcePath?: string): string {
	if (!sourcePath) {
		return 'Script';
	}
	const base = sourcePath.replace(/\\/g, '/').split('/').pop() ?? 'Script';
	return base.replace(/\.(groovy|java)$/, '');
}

function isReservedName(name: string): boolean {
	return name === 'if' || name === 'for' || name === 'while' || name === 'switch';
}
