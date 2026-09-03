import * as vscode from 'vscode';
import { ClassIndexStore } from './class_index_store';
import { GrailsArtifactIndex } from './grails_artifact_index';
import { resolveDefinitions } from './definition_resolver';
import { resolveGradleProjectRoot } from './classpath_resolver';
import { resolveGspDefinitions } from '../gsp/gsp_definition_logic';
import { ProjectTagLibTag } from '../gsp/taglib_parser';

export class DefinitionProvider implements vscode.DefinitionProvider {
	constructor(
		private readonly classStore: ClassIndexStore,
		private readonly artifactIndex: GrailsArtifactIndex,
		private readonly getClasspathJars: () => string[],
		private readonly getGspTags: () => ProjectTagLibTag[] = () => []
	) {}

	provideDefinition(
		document: vscode.TextDocument,
		position: vscode.Position
	): vscode.Location | vscode.Location[] | undefined {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		const workspaceRoot = workspaceFolder ? resolveGradleProjectRoot(workspaceFolder) : undefined;

		// Embedded `${...}` in GSP is routed to the Groovy language feature by VS Code.
		// Handle .gsp here so `asaasUI.icon(...)` resolves like `<asaasUI:icon>`.
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
		if (!wordRange) {
			return undefined;
		}

		const targets = resolveDefinitions({
			documentText: document.getText(),
			line: position.line,
			character: position.character,
			word: document.getText(wordRange),
			wordStart: wordRange.start.character,
			sourcePath: document.uri.fsPath,
			workspaceRoot,
			classpathJars: this.getClasspathJars(),
			classStore: this.classStore,
			artifactIndex: this.artifactIndex
		});

		return toLocations(targets);
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
