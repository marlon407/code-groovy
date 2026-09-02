import * as fs from 'fs';
import { ClassIndexStore } from './class_index_store';
import { resolveDeclarationPosition } from './declaration_position';
import { GrailsArtifactIndex } from './grails_artifact_index';
import {
	findMethodInClassHierarchy,
	findMethodInText,
	parseTypeDeclaration
} from './method_navigation_logic';
import { buildImportMap, rankTypeMatches, resolveSimpleTypeName } from './type_resolver';
import { resolveJarTypeDefinition } from './sources_jar_resolver';
import { candidateClassNamesForReceiver, serviceBeanToClassName } from './service_bean';
import { findGrailsSourceForFqn } from './fqn_source_resolver';

export interface DefinitionTarget {
	uri: string;
	line: number;
	column: number;
	label?: string;
}

export interface DefinitionContext {
	documentText: string;
	line: number;
	character: number;
	word: string;
	wordStart: number;
	sourcePath: string;
	workspaceRoot?: string;
	classpathJars?: string[];
	classStore: ClassIndexStore;
	artifactIndex: GrailsArtifactIndex;
}

export function resolveDefinitions(context: DefinitionContext): DefinitionTarget[] {
	const lineText = context.documentText.split('\n')[context.line] ?? '';
	const before = lineText.slice(0, context.wordStart);

	const serviceClass = serviceBeanToClassName(context.word);
	if (serviceClass && !lineText.match(new RegExp(`\\bdef\\s+${escapeRegex(context.word)}\\s*\\(`))) {
		const serviceTargets = artifactTargets(context, serviceClass);
		if (serviceTargets.length > 0) {
			return serviceTargets;
		}
	}

	const methodTargets = resolveMethodTargets(context, lineText, before);
	if (methodTargets.length > 0) {
		return methodTargets;
	}

	if (/^[A-Z]/.test(context.word)) {
		const artifactTargetsResult = artifactTargets(context, context.word);
		if (artifactTargetsResult.length > 0) {
			return artifactTargetsResult;
		}
		return resolveTypeFromClasspath(context, context.word);
	}

	return [];
}

function resolveMethodTargets(
	context: DefinitionContext,
	lineText: string,
	before: string
): DefinitionTarget[] {
	const methodName = context.word;
	if (!methodName || methodName === 'def' || /^[A-Z]/.test(methodName)) {
		return [];
	}

	if (lineText.match(new RegExp(`^\\s*def\\s+${escapeRegex(methodName)}\\s*\\(`))) {
		return [];
	}

	const isReceiverCall = /\.\s*$/.test(before);
	if (!isReceiverCall && serviceBeanToClassName(methodName)) {
		return [];
	}

	if (isReceiverCall) {
		const receiver = getReceiverName(before);
		if (!receiver) {
			return [];
		}
		for (const className of candidateClassNamesForReceiver(receiver)) {
			const found = findMethodInArtifactHierarchy(context, className, methodName);
			if (found.length > 0) {
				return found;
			}
		}
		return [];
	}

	const local = findMethodInText(context.documentText, methodName).map(loc => ({
		uri: context.sourcePath,
		line: loc.line,
		column: loc.column,
		label: methodName
	}));
	if (local.length > 0) {
		return local;
	}

	const typeDecl = parseTypeDeclaration(context.documentText);
	if (!typeDecl) {
		return [];
	}

	for (const parent of typeDecl.parents) {
		const inherited = findMethodInArtifactHierarchy(context, parent, methodName);
		if (inherited.length > 0) {
			return inherited;
		}
	}

	return [];
}

function findMethodInArtifactHierarchy(
	context: DefinitionContext,
	className: string,
	methodName: string
): DefinitionTarget[] {
	const locations = findMethodInClassHierarchy(
		filePath => readFileSafe(filePath),
		name => findClassEntries(context, name),
		className,
		methodName
	);
	return locations.map(loc => ({
		uri: loc.filePath,
		line: loc.line,
		column: loc.column,
		label: `${className}.${methodName}`
	}));
}

function findClassEntries(context: DefinitionContext, className: string): Array<{ filePath: string }> {
	const artifactEntries = context.artifactIndex.findAllByClassName(className);
	if (artifactEntries.length > 0) {
		return artifactEntries;
	}
	if (!context.workspaceRoot) {
		return [];
	}
	const fqn = resolveFqnForSimpleName(context, className);
	if (!fqn) {
		return [];
	}
	const sourcePath = findGrailsSourceForFqn(fqn, context.workspaceRoot);
	return sourcePath ? [{ filePath: sourcePath }] : [];
}

function resolveTypeFromClasspath(context: DefinitionContext, simpleName: string): DefinitionTarget[] {
	const importMap = buildImportMap(context.documentText);
	const importedFqn = importMap.bySimpleName.get(simpleName);

	if (importedFqn) {
		const fromWorkspace = workspaceTargetForFqn(context, importedFqn, simpleName);
		if (fromWorkspace) {
			return [fromWorkspace];
		}
	}

	const fqns = resolveSimpleTypeName(simpleName, importMap, context.classStore);
	const ranked = rankTypeMatches(
		fqns.map(fqn => context.classStore.lookupByFqn(fqn)).filter((type): type is NonNullable<typeof type> => Boolean(type)),
		importMap.packageName
	);
	const fromStore = ranked.map(type => typeToTarget(type, context)).filter((target): target is DefinitionTarget => Boolean(target));
	if (fromStore.length > 0) {
		return fromStore;
	}

	if (importedFqn && context.classpathJars?.length) {
		const fromJars = resolveImportedTypeInJars(importedFqn, context.classpathJars);
		if (fromJars) {
			return [fromJars];
		}
	}

	return [];
}

function workspaceTargetForFqn(
	context: DefinitionContext,
	fqn: string,
	simpleName: string
): DefinitionTarget | undefined {
	if (!context.workspaceRoot) {
		return undefined;
	}
	const sourcePath = findGrailsSourceForFqn(fqn, context.workspaceRoot);
	if (!sourcePath) {
		return undefined;
	}
	const pos = resolveDeclarationPosition(sourcePath, simpleName);
	return { uri: sourcePath, line: pos.line, column: pos.column, label: fqn };
}

function resolveImportedTypeInJars(fqn: string, jars: string[]): DefinitionTarget | undefined {
	for (const jar of jars) {
		const resolved = resolveJarTypeDefinition(jar, fqn);
		if (resolved) {
			return { uri: resolved.uri, line: 0, column: 0, label: fqn };
		}
	}
	return undefined;
}

function artifactTargets(context: DefinitionContext, className: string): DefinitionTarget[] {
	const entries = context.artifactIndex.findAllByClassName(className);
	if (entries.length > 0) {
		return entries.map(entry => {
			const pos = resolveDeclarationPosition(entry.filePath, className);
			return {
				uri: entry.filePath,
				line: pos.line,
				column: pos.column,
				label: className
			};
		});
	}
	if (!context.workspaceRoot) {
		return [];
	}
	const fqn = resolveFqnForSimpleName(context, className);
	if (!fqn) {
		return [];
	}
	const sourcePath = findGrailsSourceForFqn(fqn, context.workspaceRoot);
	if (!sourcePath) {
		return [];
	}
	const pos = resolveDeclarationPosition(sourcePath, className);
	return [{
		uri: sourcePath,
		line: pos.line,
		column: pos.column,
		label: fqn
	}];
}

function resolveFqnForSimpleName(context: DefinitionContext, className: string): string | undefined {
	const importMap = buildImportMap(context.documentText);
	if (importMap.bySimpleName.has(className)) {
		return importMap.bySimpleName.get(className);
	}
	if (importMap.packageName) {
		return `${importMap.packageName}.${className}`;
	}
	return undefined;
}

function typeToTarget(
	type: {
		fqn: string;
		source: 'workspace' | 'jar';
		sourcePath?: string;
		declarationLine?: number;
		declarationColumn?: number;
	},
	context: DefinitionContext
): DefinitionTarget | undefined {
	if (type.source === 'workspace' && type.sourcePath) {
		return {
			uri: type.sourcePath,
			line: type.declarationLine ?? 0,
			column: type.declarationColumn ?? 0,
			label: type.fqn
		};
	}
	if (type.source === 'jar') {
		const simpleName = type.fqn.includes('.') ? type.fqn.slice(type.fqn.lastIndexOf('.') + 1) : type.fqn;
		const fromWorkspace = workspaceTargetForFqn(context, type.fqn, simpleName);
		if (fromWorkspace) {
			return fromWorkspace;
		}
		if (type.sourcePath) {
			const resolved = resolveJarTypeDefinition(type.sourcePath, type.fqn);
			if (resolved) {
				return {
					uri: resolved.uri,
					line: 0,
					column: 0,
					label: type.fqn
				};
			}
		}
		if (context.classpathJars?.length) {
			return resolveImportedTypeInJars(type.fqn, context.classpathJars);
		}
	}
	return undefined;
}

function getReceiverName(beforeMethod: string): string | undefined {
	const match = beforeMethod.match(/([A-Za-z_]\w*)\s*\.\s*$/);
	return match?.[1];
}

function readFileSafe(filePath: string): string | undefined {
	try {
		return fs.readFileSync(filePath, 'utf8');
	} catch {
		return undefined;
	}
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
