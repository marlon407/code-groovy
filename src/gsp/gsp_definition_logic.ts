import { DefinitionTarget, resolveDefinitions } from '../groovy/definition_resolver';
import { ClassIndexStore } from '../groovy/class_index_store';
import { GrailsArtifactIndex } from '../groovy/grails_artifact_index';
import { ProjectTagLibTag } from './taglib_parser';

export interface GspDefinitionContext {
	documentText: string;
	line: number;
	character: number;
	sourcePath: string;
	workspaceRoot?: string;
	classpathJars?: string[];
	tags: ProjectTagLibTag[];
	classStore: ClassIndexStore;
	artifactIndex: GrailsArtifactIndex;
}

const TAG_AT_RE = /<\/?([A-Za-z_]\w*):([A-Za-z_]\w*)/g;

export function findTagAtPosition(
	lineText: string,
	character: number
): { namespace: string; method: string } | undefined {
	TAG_AT_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = TAG_AT_RE.exec(lineText)) !== null) {
		const start = match.index;
		const end = start + match[0].length;
		if (character >= start && character < end) {
			return { namespace: match[1], method: match[2] };
		}
	}
	return undefined;
}

export function findEmbeddedGroovyAtOffset(
	documentText: string,
	offset: number
): { text: string; localOffset: number } | undefined {
	const dollar = findRegionContaining(documentText, offset, '${', '}');
	if (dollar) {
		return dollar;
	}
	return findRegionContaining(documentText, offset, '<%', '%>');
}

function findRegionContaining(
	documentText: string,
	offset: number,
	open: string,
	close: string
): { text: string; localOffset: number } | undefined {
	let searchFrom = 0;
	while (searchFrom < documentText.length) {
		const start = documentText.indexOf(open, searchFrom);
		if (start === -1 || start > offset) {
			return undefined;
		}
		const contentStart = start + open.length;
		const end = documentText.indexOf(close, contentStart);
		if (end === -1) {
			return undefined;
		}
		if (offset >= contentStart && offset < end) {
			return {
				text: documentText.slice(contentStart, end),
				localOffset: offset - contentStart
			};
		}
		searchFrom = end + close.length;
	}
	return undefined;
}

export function resolveGspDefinitions(context: GspDefinitionContext): DefinitionTarget[] {
	const lines = context.documentText.split('\n');
	const lineText = lines[context.line] ?? '';
	const tag = findTagAtPosition(lineText, context.character);
	if (tag) {
		const projectTag = context.tags.find(
			item => item.namespace === tag.namespace && item.method === tag.method
		);
		if (projectTag) {
			return [{
				uri: projectTag.sourcePath,
				line: projectTag.methodLine,
				column: projectTag.methodColumn,
				label: projectTag.name
			}];
		}
		return [];
	}

	const offset = offsetAt(lines, context.line, context.character);
	const embedded = findEmbeddedGroovyAtOffset(context.documentText, offset);
	if (!embedded) {
		return [];
	}

	const local = positionAt(embedded.text, embedded.localOffset);
	const wordRange = wordRangeAt(embedded.text, embedded.localOffset);
	if (!wordRange) {
		return [];
	}

	return resolveDefinitions({
		documentText: embedded.text,
		line: local.line,
		character: local.character,
		word: embedded.text.slice(wordRange.start, wordRange.end),
		wordStart: wordRange.start - lineStartOffset(embedded.text, local.line),
		sourcePath: context.sourcePath,
		workspaceRoot: context.workspaceRoot,
		classpathJars: context.classpathJars,
		classStore: context.classStore,
		artifactIndex: context.artifactIndex
	});
}

function offsetAt(lines: string[], line: number, character: number): number {
	let offset = 0;
	for (let i = 0; i < line; i++) {
		offset += (lines[i]?.length ?? 0) + 1;
	}
	return offset + character;
}

function positionAt(text: string, offset: number): { line: number; character: number } {
	const clamped = Math.max(0, Math.min(offset, text.length));
	const before = text.slice(0, clamped);
	const parts = before.split('\n');
	return {
		line: parts.length - 1,
		character: parts[parts.length - 1].length
	};
}

function lineStartOffset(text: string, line: number): number {
	if (line <= 0) {
		return 0;
	}
	const parts = text.split('\n');
	let offset = 0;
	for (let i = 0; i < line; i++) {
		offset += (parts[i]?.length ?? 0) + 1;
	}
	return offset;
}

function wordRangeAt(text: string, offset: number): { start: number; end: number } | undefined {
	if (offset < 0 || offset > text.length) {
		return undefined;
	}
	let start = offset;
	let end = offset;
	while (start > 0 && /[A-Za-z0-9_]/.test(text[start - 1])) {
		start -= 1;
	}
	while (end < text.length && /[A-Za-z0-9_]/.test(text[end])) {
		end += 1;
	}
	if (start === end || !/^[A-Za-z_]/.test(text[start])) {
		return undefined;
	}
	return { start, end };
}
