import * as vscode from 'vscode';
import { ClassIndexStore } from './class_index_store';
import { GrailsArtifactIndex } from './grails_artifact_index';
import { resolveDefinitions } from './definition_resolver';
import { resolveGradleProjectRoot } from './classpath_resolver';
import { resolveGspDefinitions } from '../gsp/gsp_definition_logic';
import { resolveGroovyTagLibDefinitions } from '../gsp/groovy_taglib_navigation_logic';
import { ProjectTagLibTag } from '../gsp/taglib_parser';
import * as path from 'path';
import { findWordOccurrences, grailsFieldNameForClass, callSiteToLocation } from './reference_provider';
import { CallSiteIndexStore } from './call_site_index_store';
import { parseDocumentSymbols } from './symbol_parser';

export class DefinitionProvider implements vscode.DefinitionProvider {
	constructor(
		private readonly classStore: ClassIndexStore,
		private readonly artifactIndex: GrailsArtifactIndex,
		private readonly getClasspathJars: () => string[],
		private readonly callSiteIndex: CallSiteIndexStore,
		private readonly getGspTags: () => ProjectTagLibTag[] = () => []
	) {}

	async provideDefinition(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	): Promise<vscode.Location | vscode.Location[] | undefined> {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		const workspaceRoot = workspaceFolder ? resolveGradleProjectRoot(workspaceFolder) : undefined;

		// Embedded `${...}` in GSP is routed to the Groovy language feature by VS Code.
		// Handle .gsp here so `demoUI.icon(...)` resolves like `<demoUI:icon>`.
		if (isGspDocument(document)) {
			const gspTargets = resolveGspDefinitions({
				documentText: document.getText(),
				line: position.line,
				character: position.character,
				sourcePath: document.uri.fsPath,
				workspaceRoot,
				classpathJars: this.getClasspathJars(),
				tags: this.getGspTags(),
				classStore: this.classStore,
				artifactIndex: this.artifactIndex
			});
			return toLocations(gspTargets);
		}

		const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
		const tagLibTargets = resolveGroovyTagLibDefinitions({
			documentText: document.getText(),
			line: position.line,
			character: position.character,
			workspaceRoot,
			tags: this.getGspTags()
		});
		if (tagLibTargets.length > 0) {
			return toLocations(tagLibTargets);
		}

		if (!wordRange) {
			return undefined;
		}

		const word = document.getText(wordRange);
		const targets = resolveDefinitions({
			documentText: document.getText(),
			line: position.line,
			character: position.character,
			word,
			wordStart: wordRange.start.character,
			sourcePath: document.uri.fsPath,
			workspaceRoot,
			classpathJars: this.getClasspathJars(),
			classStore: this.classStore,
			artifactIndex: this.artifactIndex
		});

		const declLine = wordRange.start.line;
		const meaningfulTargets = targets.filter(target => !(target.uri === document.uri.fsPath && target.line === declLine));

		if (meaningfulTargets.length > 0) {
			return toLocations(meaningfulTargets);
		}

		const parsedSymbols = parseDocumentSymbols(document.getText(), document.uri.fsPath);
		const isClassDeclaration = parsedSymbols.classes.some(cls => cls.line === declLine && cls.simpleName === word);

		let occurrences: vscode.Location[];
		if (isClassDeclaration) {
			occurrences = this.callSiteIndex.lookupByReceiver(word).map(callSiteToLocation);
			if (occurrences.length === 0) {
				occurrences = this.callSiteIndex.lookup(word).map(callSiteToLocation);
			}
			if (occurrences.length === 0 && word.endsWith('Service')) {
				occurrences = this.callSiteIndex.lookupByReceiver(grailsFieldNameForClass(word)).map(callSiteToLocation);
			}
			if (occurrences.length === 0) {
				occurrences = await findWordOccurrences(word, undefined, token);
			}
		} else {
			const declaringClassName = path.basename(document.uri.fsPath, path.extname(document.uri.fsPath));
			const receiverFieldName = grailsFieldNameForClass(declaringClassName);
			occurrences = this.callSiteIndex.lookup(word, receiverFieldName).map(callSiteToLocation);
			if (occurrences.length === 0) {
				occurrences = this.callSiteIndex.lookup(word).map(callSiteToLocation);
			}
			if (occurrences.length === 0 && !this.callSiteIndex.isReady()) {
				occurrences = await findWordOccurrences(word, receiverFieldName, token);
			}
			if (occurrences.length === 0 && !this.callSiteIndex.isReady()) {
				occurrences = await findWordOccurrences(word, undefined, token);
			}
		}
		const declUri = document.uri.toString();
		const usages = occurrences.filter(location => !(location.uri.toString() === declUri && location.range.start.line === declLine));

		if (usages.length === 0) {
			return undefined;
		}
		return usages.length === 1 ? usages[0] : usages;
	}
}

function isGspDocument(document: vscode.TextDocument): boolean {
	return document.languageId === 'gsp' || /\.gsp$/i.test(document.uri.fsPath);
}

function toLocations(
	targets: Array<{ uri: string; line: number; column: number }>
): vscode.Location | vscode.Location[] | undefined {
	if (targets.length === 0) {
		return undefined;
	}
	const locations = targets.map(target => new vscode.Location(
		target.uri.includes('jar:') ? vscode.Uri.parse(target.uri) : vscode.Uri.file(target.uri),
		new vscode.Position(target.line, target.column)
	));
	return locations.length === 1 ? locations[0] : locations;
}
