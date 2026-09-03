import * as fs from 'fs';
import { GrailsArtifactIndex } from './grails_artifact_index';
import { listMethodsInClassHierarchy, ListedMethod } from './method_navigation_logic';
import { candidateClassNamesForReceiver } from './service_bean';

export interface MethodCompletion {
	name: string;
	className: string;
	detail: string;
}

export interface MethodCompletionContext {
	linePrefix: string;
	documentText: string;
	artifactIndex: GrailsArtifactIndex;
	readFile?: (filePath: string) => string | undefined;
}

const MEMBER_ACCESS_RE = /([A-Za-z_]\w*)\s*\.\s*([A-Za-z_]\w*)?$/;

export function parseMemberAccess(linePrefix: string): { receiver: string; prefix: string } | undefined {
	const match = linePrefix.match(MEMBER_ACCESS_RE);
	if (!match) {
		return undefined;
	}
	return {
		receiver: match[1],
		prefix: match[2] ?? ''
	};
}

export function resolveReceiverClassNames(documentText: string, receiver: string): string[] {
	const names = candidateClassNamesForReceiver(receiver);
	const typed = findDeclaredTypeForIdentifier(documentText, receiver);
	if (typed) {
		names.unshift(typed);
	}
	return [...new Set(names)];
}

/** Prefer an explicit typed field/param/local: `WidgetService widgetService` */
export function findDeclaredTypeForIdentifier(documentText: string, identifier: string): string | undefined {
	const escaped = escapeRegex(identifier);
	const patterns = [
		new RegExp(`\\b([A-Z][\\w]*)\\s+${escaped}\\s*(?:=|;|,|\\)|$)`, 'm'),
		new RegExp(`\\b([A-Z][\\w]*)\\s+${escaped}\\s*\\n`, 'm')
	];
	for (const pattern of patterns) {
		const match = documentText.match(pattern);
		if (match?.[1]) {
			return match[1];
		}
	}
	return undefined;
}

export function resolveMethodCompletions(context: MethodCompletionContext): MethodCompletion[] {
	const access = parseMemberAccess(context.linePrefix);
	if (!access) {
		return [];
	}

	const readFile = context.readFile ?? ((filePath: string) => {
		try {
			return fs.readFileSync(filePath, 'utf8');
		} catch {
			return undefined;
		}
	});

	const findEntries = (className: string) => context.artifactIndex.findAllByClassName(className);
	const prefix = access.prefix.toLowerCase();
	const seen = new Set<string>();
	const completions: MethodCompletion[] = [];

	for (const className of resolveReceiverClassNames(context.documentText, access.receiver)) {
		const methods = listMethodsInClassHierarchy(readFile, findEntries, className);
		for (const method of methods) {
			if (prefix && !method.name.toLowerCase().startsWith(prefix)) {
				continue;
			}
			if (seen.has(method.name)) {
				continue;
			}
			seen.add(method.name);
			completions.push(toCompletion(method, className));
		}
		if (completions.length > 0) {
			break;
		}
	}

	return completions;
}

function toCompletion(method: ListedMethod, fallbackClass: string): MethodCompletion {
	const className = method.className || fallbackClass;
	return {
		name: method.name,
		className,
		detail: `${className}.${method.name}`
	};
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
