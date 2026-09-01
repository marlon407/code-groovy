import { ProjectTagLibTag } from './taglib_parser';

const AFTER_NAMESPACE_RE = /<?([A-Za-z_]\w*)([:.])([A-Za-z_]\w*)?$/;
const HTML_AFTER_NAMESPACE_RE = /<([A-Za-z_]\w*)([:.])([A-Za-z_]\w*)?$/;
const NAMESPACE_PREFIX_RE = /<?([A-Za-z_]\w*)$/;
const ATTR_CONTEXT_RE = /<([A-Za-z_]\w*):([A-Za-z_]\w+)\b([^>]*)$/;

export type TagLibCompletionKind = 'namespace' | 'method' | 'attribute';

export interface TagLibCompletion {
	kind: TagLibCompletionKind;
	label: string;
	insertText: string;
	replaceLength: number;
	detail: string;
	filterText?: string;
	documentation?: string;
}

export function resolveTagLibCompletions(
	linePrefix: string,
	tags: ProjectTagLibTag[]
): TagLibCompletion[] {
	const attrItems = attributesForOpenTag(linePrefix, tags);
	if (attrItems) {
		return attrItems;
	}

	const afterNamespace = linePrefix.match(AFTER_NAMESPACE_RE);
	if (afterNamespace) {
		return methodsForNamespace(afterNamespace, linePrefix, tags);
	}

	return namespacesForPrefix(linePrefix, tags);
}

function attributesForOpenTag(
	linePrefix: string,
	tags: ProjectTagLibTag[]
): TagLibCompletion[] | undefined {
	const match = linePrefix.match(ATTR_CONTEXT_RE);
	if (!match) {
		return undefined;
	}

	const namespace = match[1];
	const method = match[2];
	const attrsSoFar = match[3];
	if (!/^\s/.test(attrsSoFar)) {
		return undefined;
	}
	if (isInsideAttributeValue(attrsSoFar)) {
		return [];
	}

	const tag = tags.find(t => t.namespace === namespace && t.method === method);
	if (!tag || tag.attributes.length === 0) {
		return [];
	}

	const alreadyUsed = new Set(
		[...attrsSoFar.matchAll(/\b([A-Za-z_]\w*)\s*=/g)].map(m => m[1])
	);
	const typedMatch = attrsSoFar.match(/(?:^|\s)([A-Za-z_]\w*)$/);
	const typed = typedMatch?.[1] ?? '';

	return tag.attributes
		.filter(attr => !alreadyUsed.has(attr) && attr.startsWith(typed))
		.map(attr => ({
			kind: 'attribute' as const,
			label: attr,
			insertText: `${attr}="$1"$0`,
			replaceLength: typed.length,
			detail: `${tag.name} attribute`
		}));
}

function methodsForNamespace(
	match: RegExpMatchArray,
	linePrefix: string,
	tags: ProjectTagLibTag[]
): TagLibCompletion[] {
	const namespace = match[1];
	const methodPrefix = match[3] ?? '';
	const typedFragment = match[0];
	const asHtmlTag = HTML_AFTER_NAMESPACE_RE.test(linePrefix);
	const expressionContext = isExpressionContext(linePrefix);

	return tags
		.filter(tag => tag.namespace === namespace && tag.method.startsWith(methodPrefix))
		.map(tag => {
			let insertText: string;
			let replaceLength: number;

			if (expressionContext) {
				insertText = tag.method;
				replaceLength = methodPrefix.length;
			} else if (asHtmlTag) {
				insertText = tag.usesBody
					? `${tag.method}$0></${tag.name}>`
					: `${tag.method}$0 />`;
				replaceLength = methodPrefix.length;
			} else {
				insertText = tag.usesBody
					? `<${tag.name}>$0</${tag.name}>`
					: `<${tag.name}$0 />`;
				replaceLength = typedFragment.length;
			}

			return {
				kind: 'method' as const,
				label: tag.method,
				insertText,
				replaceLength,
				detail: `${tag.namespace} taglib`,
				filterText: `${tag.method} ${tag.name} ${tag.namespace}.${tag.method}`,
				documentation: tag.usesBody
					? 'Uses body content.'
					: 'No body usage in source → self-closing.'
			};
		});
}

function namespacesForPrefix(
	linePrefix: string,
	tags: ProjectTagLibTag[]
): TagLibCompletion[] {
	const prefixMatch = linePrefix.match(NAMESPACE_PREFIX_RE);
	if (!prefixMatch) {
		return [];
	}

	const typed = prefixMatch[1];
	const asHtmlTag = linePrefix.endsWith(`<${typed}`);
	const namespaces = [...new Set(
		tags
			.map(tag => tag.namespace)
			.filter(namespace => namespace.startsWith(typed))
	)].sort();

	return namespaces.map(namespace => ({
		kind: 'namespace' as const,
		label: namespace,
		insertText: asHtmlTag ? `${namespace}:` : `${namespace}.`,
		replaceLength: typed.length,
		detail: 'Project taglib',
		filterText: namespace
	}));
}

function isInsideAttributeValue(attrsSoFar: string): boolean {
	let inDouble = false;
	let inSingle = false;
	for (const ch of attrsSoFar) {
		if (ch === '"' && !inSingle) {
			inDouble = !inDouble;
		} else if (ch === "'" && !inDouble) {
			inSingle = !inSingle;
		}
	}
	return inDouble || inSingle;
}

function isExpressionContext(linePrefix: string): boolean {
	const openExpr = linePrefix.lastIndexOf('${');
	const closeExpr = linePrefix.lastIndexOf('}');
	return openExpr > closeExpr;
}
