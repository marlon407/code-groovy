import * as path from 'path';

export interface ProjectTagLibTag {
	name: string;
	namespace: string;
	method: string;
	attributes: string[];
	/** True when the closure invokes `body()` / `body.call`, so the tag needs content. */
	usesBody: boolean;
	sourcePath: string;
}

const NAMESPACE_RE = /static\s+namespace\s*=\s*['"]([^'"]+)['"]/;
const CLASS_RE = /class\s+(\w+TagLib)\b/;
const TAG_RE = /^\s*def\s+([A-Za-z_]\w*)\s*=\s*\{/gm;
const ATTR_RE = /attrs(?:\.containsKey\(\s*['"](\w+)['"]\s*\)|\[\s*['"](\w+)['"]\s*\]|\.(\w+))/g;
const ATTR_LIST_RE = /\w*[Aa]ttributes?\w*\s*=\s*\[([^\]]*)\]/g;
const STRING_LITERAL_RE = /['"]([A-Za-z_]\w*)['"]/g;
const SERVICE_RE = /Service$/;
const ATTR_METHOD_DENYLIST = new Set([
	'findAll', 'find', 'each', 'collect', 'any', 'every', 'containsKey',
	'get', 'put', 'size', 'isEmpty', 'keySet', 'values', 'entrySet', 'withDefault'
]);
const BODY_USE_RE = /\bbody\s*(?:\(|\.call\b)/;

export function parseTagLibSource(text: string, sourcePath: string): ProjectTagLibTag[] {
	const namespaceMatch = text.match(NAMESPACE_RE);
	const classMatch = text.match(CLASS_RE);
	const namespace = namespaceMatch?.[1]
		?? (classMatch ? namespaceFromClassName(classMatch[1]) : undefined);

	if (!namespace) {
		return [];
	}

	const tags: ProjectTagLibTag[] = [];
	TAG_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = TAG_RE.exec(text)) !== null) {
		const tagName = match[1];
		if (SERVICE_RE.test(tagName)) {
			continue;
		}

		const blockStart = match.index + match[0].length;
		const block = extractClosureBody(text, blockStart);
		const attributes = extractAttributes(block);

		tags.push({
			name: `${namespace}:${tagName}`,
			namespace,
			method: tagName,
			attributes,
			usesBody: BODY_USE_RE.test(block),
			sourcePath
		});
	}

	return tags;
}

function namespaceFromClassName(className: string): string {
	const base = className.replace(/TagLib$/, '');
	if (!base) {
		return className;
	}
	return base.charAt(0).toLowerCase() + base.slice(1);
}

function extractClosureBody(text: string, start: number): string {
	let depth = 1;
	for (let i = start; i < text.length; i++) {
		const ch = text[i];
		if (ch === '{') {
			depth++;
		} else if (ch === '}') {
			depth--;
			if (depth === 0) {
				return text.slice(start, i);
			}
		}
	}
	return text.slice(start, Math.min(text.length, start + 2000));
}

export function extractAttributes(block: string): string[] {
	const attrs = new Set<string>();

	ATTR_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = ATTR_RE.exec(block)) !== null) {
		const name = match[1] || match[2] || match[3];
		if (name && !ATTR_METHOD_DENYLIST.has(name)) {
			attrs.add(name);
		}
	}

	ATTR_LIST_RE.lastIndex = 0;
	while ((match = ATTR_LIST_RE.exec(block)) !== null) {
		const listBody = match[1];
		STRING_LITERAL_RE.lastIndex = 0;
		let literal: RegExpExecArray | null;
		while ((literal = STRING_LITERAL_RE.exec(listBody)) !== null) {
			attrs.add(literal[1]);
		}
	}

	return Array.from(attrs).sort();
}

export function toHtmlCustomData(tags: ProjectTagLibTag[]) {
	return {
		version: 1.1,
		tags: tags.map(tag => ({
			name: tag.name,
			description: `Project taglib from ${path.basename(tag.sourcePath)}`,
			attributes: tag.attributes.map(name => ({ name }))
		}))
	};
}
