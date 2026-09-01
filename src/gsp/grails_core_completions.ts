export interface GrailsCoreCompletion {
	label: string;
	insertText: string;
	replaceLength: number;
	detail: string;
}

interface CoreSnippet {
	/** Typed trigger without the leading "g." / "asset." namespace piece handled separately. */
	method: string;
	insertText: string;
	detail: string;
}

const G_SNIPPETS: CoreSnippet[] = [
	{
		method: 'if',
		insertText: '<g:if test="${ $1 }">\n   $2\n</g:if>',
		detail: 'Grails g:if'
	},
	{
		method: 'else',
		insertText: '<g:else>\n   $1\n</g:else>',
		detail: 'Grails g:else'
	},
	{
		method: 'elseif',
		insertText: '<g:elseif test="${ $1 }">\n   $2\n</g:elseif>',
		detail: 'Grails g:elseif'
	},
	{
		method: 'each',
		insertText: '<g:each var="${1:item}" in="${ ${2:items} }">\n   $3\n</g:each>',
		detail: 'Grails g:each'
	},
	{
		method: 'render',
		insertText: '<g:render template="$1" model="[\'$2\':$2]" />',
		detail: 'Grails g:render'
	},
	{
		method: 'set',
		insertText: '<g:set var="$1" value="$2"/>',
		detail: 'Grails g:set'
	},
	{
		method: 'link',
		insertText: '<g:link controller="$1" action="$2">$3</g:link>',
		detail: 'Grails g:link'
	},
	{
		method: 'form',
		insertText: '<g:form controller="$1" action="$2">\n   $3\n</g:form>',
		detail: 'Grails g:form'
	},
	{
		method: 'message',
		insertText: '<g:message code="$1"/>',
		detail: 'Grails g:message'
	}
];

const ASSET_SNIPPETS: CoreSnippet[] = [
	{
		method: 'stylesheet',
		insertText: '<asset:stylesheet src="${1:application.css}"/>',
		detail: 'Asset Pipeline stylesheet'
	},
	{
		method: 'javascript',
		insertText: '<asset:javascript src="${1:application.js}"/>',
		detail: 'Asset Pipeline javascript'
	},
	{
		method: 'image',
		insertText: '<asset:image src="$1" alt="$2"/>',
		detail: 'Asset Pipeline image'
	},
	{
		method: 'link',
		insertText: '<asset:link rel="${1:shortcut icon}" href="${2:favicon.ico}" type="${3:image/x-icon}"/>',
		detail: 'Asset Pipeline link'
	}
];

const CORE_PREFIX_RE = /(?:^|[^A-Za-z0-9_])((g|asset))([:.])([A-Za-z_]\w*)?$/;

/**
 * Completions for built-in Grails/Asset triggers (`g.each`, `g:if`, `asset.javascript`).
 * These win over Emmet's `tag.class` interpretation of the same dotted form.
 */
export function resolveGrailsCoreCompletions(linePrefix: string): GrailsCoreCompletion[] {
	const match = linePrefix.match(CORE_PREFIX_RE);
	if (!match) {
		return [];
	}

	const namespace = match[2];
	const separator = match[3];
	const methodPrefix = match[4] ?? '';
	const typedFragment = `${namespace}${separator}${methodPrefix}`;
	const snippets = namespace === 'g' ? G_SNIPPETS : ASSET_SNIPPETS;

	return snippets
		.filter(snippet => snippet.method.startsWith(methodPrefix))
		.map(snippet => ({
			label: snippet.method,
			insertText: snippet.insertText,
			replaceLength: typedFragment.length,
			detail: snippet.detail
		}));
}
