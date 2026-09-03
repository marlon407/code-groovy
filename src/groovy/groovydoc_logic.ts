/**
 * Convert a Groovydoc / Javadoc comment body (inner text only) into Markdown
 * suitable for VS Code hovers.
 */
export function groovydocToMarkdown(rawBody: string): string {
	let body = rawBody
		.replace(/\r\n/g, '\n')
		.split('\n')
		.map(line => line.replace(/^\s*\*\s?/, ''))
		.join('\n')
		.trim();

	if (!body) {
		return '';
	}

	body = body.replace(/\{@code\s+([^}]+)\}/g, '`$1`');
	body = body.replace(/\{@link(?:plain)?\s+([^}\s]+)(?:\s+[^}]*)?\}/g, (_, target: string) => {
		return '`' + target.replace('#', '.') + '`';
	});
	body = body.replace(/\{@literal\s+([^}]+)\}/g, '$1');

	body = body.replace(/<pre(?:\s[^>]*)?>([\s\S]*?)<\/pre>/gi, (_, code: string) => {
		return '\n```groovy\n' + decodeBasicHtml(code).trim() + '\n```\n';
	});
	body = body.replace(/<code>([\s\S]*?)<\/code>/gi, '`$1`');
	body = body.replace(/<\/?p>/gi, '\n\n');
	body = body.replace(/<br\s*\/?>/gi, '\n');
	body = body.replace(/<\/?b>/gi, '**');
	body = body.replace(/<\/?i>/gi, '_');
	body = body.replace(/<\/?em>/gi, '_');
	body = body.replace(/<\/?ul>/gi, '\n');
	body = body.replace(/<\/?ol>/gi, '\n');
	body = body.replace(/<li>/gi, '- ');
	body = body.replace(/<\/li>/gi, '\n');
	body = body.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
	body = body.replace(/<[^>]+>/g, '');
	body = decodeBasicHtml(body);

	const lines = body.split('\n');
	const prose: string[] = [];
	const tags: string[] = [];

	for (const line of lines) {
		const tagMatch = line.match(/^@(param|return|returns|throws|exception|see|since|author|deprecated|version)\b\s*(.*)$/i);
		if (tagMatch) {
			tags.push(formatTag(tagMatch[1].toLowerCase(), tagMatch[2].trim()));
		} else {
			prose.push(line);
		}
	}

	const proseText = prose.join('\n').replace(/\n{3,}/g, '\n\n').trim();
	const tagText = tags.filter(Boolean).join('\n\n');
	return [proseText, tagText].filter(Boolean).join('\n\n');
}

export interface GroovydocSymbol {
	name: string;
	kind: 'type' | 'method' | 'closure';
	markdown: string;
	/** Offset of the declaration start in the source text. */
	declarationOffset: number;
}

const DOC_RE = /\/\*\*([\s\S]*?)\*\//g;
const DECL_AFTER_DOC_RE = /^\s*(?:(?:public|private|protected|static|final|abstract|synchronized|native)\s+)*(?:(class|interface|trait|enum)\s+([A-Za-z_]\w*)|(?:def|[A-Za-z_][\w.]*(?:\s*<[^>{;]+>)?)\s+([A-Za-z_]\w*)\s*(?:\(|=))/;

/**
 * Collect Groovydoc-backed symbols from Groovy/Java source text.
 */
export function collectGroovydocSymbols(text: string): GroovydocSymbol[] {
	const symbols: GroovydocSymbol[] = [];
	DOC_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = DOC_RE.exec(text)) !== null) {
		const markdown = groovydocToMarkdown(match[1]);
		if (!markdown) {
			continue;
		}
		const afterDoc = text.slice(match.index + match[0].length);
		const decl = afterDoc.match(DECL_AFTER_DOC_RE);
		if (!decl) {
			continue;
		}
		const declarationOffset = match.index + match[0].length + (decl.index ?? 0);
		if (decl[1] && decl[2]) {
			symbols.push({
				name: decl[2],
				kind: 'type',
				markdown,
				declarationOffset
			});
			continue;
		}
		if (decl[3]) {
			const rest = afterDoc.slice(decl.index ?? 0);
			const isClosure = /=\s*\{/.test(rest.slice(0, decl[0].length + 8));
			symbols.push({
				name: decl[3],
				kind: isClosure ? 'closure' : 'method',
				markdown,
				declarationOffset
			});
		}
	}
	return symbols;
}

export function findGroovydocForName(text: string, symbolName: string): string | undefined {
	const symbols = collectGroovydocSymbols(text).filter(s => s.name === symbolName);
	if (symbols.length === 0) {
		return undefined;
	}
	return symbols[0].markdown;
}

export function findGroovydocNearOffset(text: string, offset: number): string | undefined {
	const symbols = collectGroovydocSymbols(text);
	let best: GroovydocSymbol | undefined;
	for (const symbol of symbols) {
		if (symbol.declarationOffset <= offset) {
			if (!best || symbol.declarationOffset > best.declarationOffset) {
				best = symbol;
			}
		}
	}
	if (!best) {
		return undefined;
	}
	// Only accept if the hover is reasonably close to the declaration line (same member).
	const between = text.slice(best.declarationOffset, offset);
	if (between.length > 400) {
		return undefined;
	}
	if ((between.match(/\{/g) || []).length > (between.match(/\}/g) || []).length + 1) {
		return undefined;
	}
	return best.markdown;
}

function formatTag(tag: string, rest: string): string {
	switch (tag) {
		case 'param': {
			const m = rest.match(/^(\S+)\s*(.*)$/);
			if (!m) {
				return `**@param** ${rest}`;
			}
			return m[2] ? `**@param** \`${m[1]}\` — ${m[2]}` : `**@param** \`${m[1]}\``;
		}
		case 'return':
		case 'returns':
			return rest ? `**Returns:** ${rest}` : '**Returns**';
		case 'throws':
		case 'exception': {
			const m = rest.match(/^(\S+)\s*(.*)$/);
			if (!m) {
				return `**Throws:** ${rest}`;
			}
			return m[2] ? `**Throws:** \`${m[1]}\` — ${m[2]}` : `**Throws:** \`${m[1]}\``;
		}
		case 'see':
			return `**See:** ${rest}`;
		case 'since':
			return `**Since:** ${rest}`;
		case 'author':
			return `**Author:** ${rest}`;
		case 'deprecated':
			return rest ? `**Deprecated:** ${rest}` : '**Deprecated**';
		case 'version':
			return `**Version:** ${rest}`;
		default:
			return `**@${tag}** ${rest}`.trim();
	}
}

function decodeBasicHtml(text: string): string {
	return text
		.replace(/&nbsp;/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"');
}
