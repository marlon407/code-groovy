import * as fs from 'fs';
import { ClassIndexStore } from './class_index_store';
import { resolveDeclarationPosition } from './declaration_position';
import { GrailsArtifactIndex } from './grails_artifact_index';
import {
	findMethodInClassHierarchy,
	preferReferencedEntries,
	findMethodInText,
	parseTypeDeclaration
} from './method_navigation_logic';
import { buildImportMap, rankTypeMatches, resolveSimpleTypeName } from './type_resolver';
import { resolveJarTypeDefinition } from './sources_jar_resolver';
import { candidateClassNamesForReceiver, serviceBeanToClassName } from './service_bean';
import { findGrailsSourceForFqn } from './fqn_source_resolver';
import { findFieldInClassHierarchy, ParsedDocumentSymbols, ParsedEnumConstant, parseDocumentSymbols } from './symbol_parser';
import { resolveReceiverType } from './call_site_extractor';

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

	const fieldTargets = resolveFieldTargets(context, before);
	if (fieldTargets.length > 0) {
		return fieldTargets;
	}

	const constantTargets = resolveConstantTargets(context, before);
	if (constantTargets.length > 0) {
		return constantTargets;
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
		if (receiver !== 'this') {
			const chainType = resolveReceiverChainType(context, before);
			const declaredType = resolveReceiverType(context.documentText, context.line, receiver);
			const candidates = [...new Set([
				...(chainType ? [chainType] : []),
				...(declaredType ? [simpleTypeName(declaredType)] : []),
				...candidateClassNamesForReceiver(receiver)
			])];
			for (const className of candidates) {
				const found = findMethodInArtifactHierarchy(context, className, methodName);
				if (found.length > 0) {
					return found;
				}
			}
			return [];
		}
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
		methodName,
		new Set(),
		0,
		context.documentText
	);
	return locations.map(loc => ({
		uri: loc.filePath,
		line: loc.line,
		column: loc.column,
		label: `${className}.${methodName}`
	}));
}

function resolveFieldTargets(context: DefinitionContext, before: string): DefinitionTarget[] {
	const fieldName = context.word;
	if (!fieldName || /^[A-Z]/.test(fieldName)) {
		return [];
	}
	if (!/\.\s*$/.test(before)) {
		return [];
	}

	const receiver = getReceiverName(before);
	if (!receiver) {
		return [];
	}

	if (receiver === 'this') {
		return resolveOwnFieldTarget(context, fieldName);
	}

	const chainType = resolveReceiverChainType(context, before);
	const scopedType = resolveReceiverType(context.documentText, context.line, receiver);
	const declaredType = declaredFieldTypeName(context.documentText, context.sourcePath, receiver);
	const candidates = [...new Set([
		...(chainType ? [chainType] : []),
		...(scopedType ? [simpleTypeName(scopedType)] : []),
		...(declaredType ? [declaredType] : []),
		...candidateClassNamesForReceiver(receiver)
	])];

	for (const className of candidates) {
		const found = findFieldInArtifactHierarchy(context, className, fieldName);
		if (found.length > 0) {
			return found;
		}
	}
	return [];
}

function resolveOwnFieldTarget(context: DefinitionContext, fieldName: string): DefinitionTarget[] {
	const ownField = parseDocumentSymbols(context.documentText, context.sourcePath).fields.find(
		field => field.classMember && field.name === fieldName
	);
	if (ownField) {
		return [{ uri: context.sourcePath, line: ownField.line, column: ownField.column, label: fieldName }];
	}

	const typeDecl = parseTypeDeclaration(context.documentText);
	if (!typeDecl) {
		return [];
	}
	for (const parent of typeDecl.parents) {
		const inherited = findFieldInArtifactHierarchy(context, parent, fieldName);
		if (inherited.length > 0) {
			return inherited;
		}
	}
	return [];
}

function declaredFieldTypeName(documentText: string, sourcePath: string, name: string): string | undefined {
	return parseDocumentSymbols(documentText, sourcePath).fields.find(field => field.classMember && field.name === name)?.typeName;
}

function findFieldInArtifactHierarchy(
	context: DefinitionContext,
	className: string,
	fieldName: string
): DefinitionTarget[] {
	const locations = findFieldInClassHierarchy(
		filePath => readFileSafe(filePath),
		name => findClassEntries(context, name),
		className,
		fieldName
	);
	return locations.map(loc => ({
		uri: loc.filePath,
		line: loc.line,
		column: loc.column,
		label: `${className}.${fieldName}`
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

function resolveConstantTargets(context: DefinitionContext, before: string): DefinitionTarget[] {
	const name = context.word;
	const own = parseDocumentSymbols(context.documentText, context.sourcePath);
	const declared = own.enumConstants.find(constant =>
		constant.line === context.line && constant.column === context.wordStart && constant.name === name);
	if (declared) {
		return [enumConstantDeclarationTarget(context, own, declared)];
	}

	if (!/\.\s*$/.test(before)) {
		if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
			return [];
		}
		const ownConstant = own.enumConstants.find(constant => constant.name === name);
		if (ownConstant) {
			return [{ uri: context.sourcePath, line: ownConstant.line, column: ownConstant.column, label: name }];
		}
		const ownField = own.fields.find(field => field.classMember && field.name === name);
		return ownField ? [{ uri: context.sourcePath, line: ownField.line, column: ownField.column, label: name }] : [];
	}

	const receiver = getReceiverName(before);
	if (!receiver || !/^[A-Z]/.test(receiver)) {
		return [];
	}
	const entries = preferReferencedEntries(findClassEntries(context, receiver), receiver, readFileSafe, context.documentText);
	for (const entry of entries) {
		const content = readFileSafe(entry.filePath);
		const constant = content
			? parseDocumentSymbols(content, entry.filePath).enumConstants.find(candidate =>
				candidate.name === name && simpleTypeName(candidate.enumFqn) === receiver)
			: undefined;
		if (constant) {
			return [{ uri: entry.filePath, line: constant.line, column: constant.column, label: `${receiver}.${name}` }];
		}
	}
	return findFieldInArtifactHierarchy(context, receiver, name);
}

function enumConstantDeclarationTarget(
	context: DefinitionContext,
	symbols: ParsedDocumentSymbols,
	constant: ParsedEnumConstant
): DefinitionTarget {
	const constructors = symbols.constructors.filter(candidate => candidate.classFqn === constant.enumFqn);
	const constructor = constructors.find(candidate => candidate.parameterCount === constant.argumentCount) ?? constructors[0];
	if (constructor) {
		return { uri: context.sourcePath, line: constructor.line, column: constructor.column, label: simpleTypeName(constant.enumFqn) };
	}
	const enumClass = symbols.classes.find(cls => cls.fqn === constant.enumFqn);
	return { uri: context.sourcePath, line: enumClass?.line ?? 0, column: enumClass?.column ?? 0, label: simpleTypeName(constant.enumFqn) };
}

function getReceiverName(beforeMethod: string): string | undefined {
	const match = beforeMethod.match(/([A-Za-z_]\w*)\s*[?*]?\.\s*$/);
	return match?.[1];
}

function resolveReceiverChainType(context: DefinitionContext, before: string): string | undefined {
	const chain = before.match(/((?:[A-Za-z_]\w*\s*[?*]?\.\s*){2,})$/)?.[1];
	if (!chain || /[)\].]$/.test(before.slice(0, before.length - chain.length))) {
		return undefined;
	}
	const segments = chain.split(/\s*[?*]?\.\s*/).filter(Boolean);
	let typeName = chainRootType(context, segments[0]);
	for (const segment of segments.slice(1)) {
		if (!typeName) {
			return undefined;
		}
		typeName = fieldTypeInHierarchy(context, typeName, segment, context.documentText);
	}
	return typeName;
}

function chainRootType(context: DefinitionContext, root: string): string | undefined {
	if (root === 'this') {
		return parseTypeDeclaration(context.documentText)?.name;
	}
	if (/^[A-Z]/.test(root)) {
		return root;
	}
	const declared = resolveReceiverType(context.documentText, context.line, root);
	return declared ? simpleTypeName(declared) : undefined;
}

function fieldTypeInHierarchy(
	context: DefinitionContext,
	className: string,
	fieldName: string,
	referencingContent: string,
	depth = 0
): string | undefined {
	if (depth > 12) {
		return undefined;
	}
	for (const entry of preferReferencedEntries(findClassEntries(context, className), className, readFileSafe, referencingContent)) {
		const content = readFileSafe(entry.filePath);
		if (!content) {
			continue;
		}
		const parsed = parseDocumentSymbols(content, entry.filePath);
		if (parsed.enumConstants.some(constant => constant.name === fieldName && simpleTypeName(constant.enumFqn) === className)) {
			return className;
		}
		const field = parsed.fields.find(candidate => candidate.classMember && candidate.name === fieldName
			&& simpleTypeName(candidate.classFqn) === className);
		if (field) {
			return simpleTypeName(field.typeName);
		}
		const ownClass = parsed.classes.find(cls => cls.simpleName === className);
		for (const parent of [...(ownClass?.extendsTypes ?? []), ...(ownClass?.implementsTypes ?? [])]) {
			const inherited = fieldTypeInHierarchy(context, simpleTypeName(parent), fieldName, content, depth + 1);
			if (inherited) {
				return inherited;
			}
		}
	}
	return undefined;
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

function simpleTypeName(typeName: string): string {
	return typeName.includes('.') ? typeName.slice(typeName.lastIndexOf('.') + 1) : typeName;
}
