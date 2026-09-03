import { DefinitionTarget } from '../groovy/definition_resolver';
import { findTagLibCallAtPosition } from './gsp_definition_logic';
import { resolveGspResourcePath } from './gsp_resource_path_logic';
import { ProjectTagLibTag, tagMatchesReceiver } from './taglib_parser';

export interface GroovyNamedArgHit {
	name: string;
	value: string;
	valueStart: number;
	valueEnd: number;
}

const NAMED_ARG_RE = /\b(template|src|url|file)\s*:\s*(["'])([^"']*)\2/g;
const TAGLIB_BEAN_RE = /^[A-Za-z_]\w*TagLib$/;

export function listGroovyNamedArgValues(lineText: string): GroovyNamedArgHit[] {
	const hits: GroovyNamedArgHit[] = [];
	NAMED_ARG_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = NAMED_ARG_RE.exec(lineText)) !== null) {
		const name = match[1];
		const value = match[3];
		const valueStart = match.index + match[0].indexOf(match[2] + value) + 1;
		const valueEnd = valueStart + value.length;
		hits.push({ name, value, valueStart, valueEnd });
	}
	return hits;
}

export function findGroovyNamedArgAtPosition(
	lineText: string,
	character: number
): GroovyNamedArgHit | undefined {
	return listGroovyNamedArgValues(lineText).find(
		hit => character >= hit.valueStart && character <= hit.valueEnd
	);
}

export function resolveGroovyTagLibDefinitions(options: {
	documentText: string;
	line: number;
	character: number;
	workspaceRoot?: string;
	tags: ProjectTagLibTag[];
}): DefinitionTarget[] {
	const lines = options.documentText.split('\n');
	const lineText = lines[options.line] ?? '';

	if (options.workspaceRoot) {
		const namedArg = findGroovyNamedArgAtPosition(lineText, options.character);
		if (namedArg && !namedArg.value.includes('${')) {
			const resourcePath = resolveGspResourcePath({
				attrName: namedArg.name,
				attrValue: namedArg.value,
				tag: namedArg.name === 'template' ? { namespace: 'g', method: 'render' } : undefined,
				workspaceRoot: options.workspaceRoot
			});
			if (resourcePath) {
				return [{ uri: resourcePath, line: 0, column: 0, label: namedArg.value }];
			}
		}
	}

	const offset = offsetAt(lines, options.line, options.character);
	const call = findTagLibCallAtPosition(options.documentText, offset);
	if (call) {
		const projectTag = options.tags.find(
			tag => tagMatchesReceiver(tag, call.namespace) && tag.method === call.method
		);
		if (projectTag) {
			return [{
				uri: projectTag.sourcePath,
				line: projectTag.methodLine,
				column: projectTag.methodColumn,
				label: projectTag.name
			}];
		}
	}

	const word = wordAt(lineText, options.character);
	if (word && TAGLIB_BEAN_RE.test(word)) {
		const tag = options.tags.find(item => tagMatchesReceiver(item, word));
		if (tag) {
			return [{ uri: tag.sourcePath, line: 0, column: 0, label: tag.className ?? word }];
		}
	}

	return [];
}

function offsetAt(lines: string[], line: number, character: number): number {
	let offset = 0;
	for (let i = 0; i < line; i++) {
		offset += (lines[i]?.length ?? 0) + 1;
	}
	return offset + character;
}

function wordAt(lineText: string, character: number): string | undefined {
	if (character < 0 || character > lineText.length) {
		return undefined;
	}
	let start = character;
	let end = character;
	while (start > 0 && /[A-Za-z0-9_]/.test(lineText[start - 1])) {
		start -= 1;
	}
	while (end < lineText.length && /[A-Za-z0-9_]/.test(lineText[end])) {
		end += 1;
	}
	if (start === end || !/^[A-Za-z_]/.test(lineText[start])) {
		return undefined;
	}
	return lineText.slice(start, end);
}
