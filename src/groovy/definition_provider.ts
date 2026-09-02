import * as vscode from 'vscode';
import { ClassIndexStore } from './class_index_store';
import { GrailsArtifactIndex } from './grails_artifact_index';
import { resolveDefinitions } from './definition_resolver';
import { resolveGradleProjectRoot } from './classpath_resolver';

export class DefinitionProvider implements vscode.DefinitionProvider {
	constructor(
		private readonly classStore: ClassIndexStore,
		private readonly artifactIndex: GrailsArtifactIndex,
		private readonly getClasspathJars: () => string[]
	) {}

	provideDefinition(
		document: vscode.TextDocument,
		position: vscode.Position
	): vscode.Location | vscode.Location[] | undefined {
		const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
		if (!wordRange) {
			return undefined;
		}

		const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		const targets = resolveDefinitions({
			documentText: document.getText(),
			line: position.line,
			character: position.character,
			word: document.getText(wordRange),
			wordStart: wordRange.start.character,
			sourcePath: document.uri.fsPath,
			workspaceRoot: workspaceFolder ? resolveGradleProjectRoot(workspaceFolder) : undefined,
			classpathJars: this.getClasspathJars(),
			classStore: this.classStore,
			artifactIndex: this.artifactIndex
		});

		if (targets.length === 0) {
			return undefined;
		}

		const locations = targets.map(target => new vscode.Location(
			target.uri.includes('jar:') ? vscode.Uri.parse(target.uri) : vscode.Uri.file(target.uri),
			new vscode.Position(target.line, target.column)
		));
		return locations.length === 1 ? locations[0] : locations;
	}
}
