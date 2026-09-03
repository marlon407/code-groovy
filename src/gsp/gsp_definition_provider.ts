import * as vscode from 'vscode';
import { ClassIndex } from '../groovy/class_index';
import { resolveGradleProjectRoot } from '../groovy/classpath_resolver';
import { resolveGspDefinitions } from './gsp_definition_logic';
import { TagLibIndex } from './taglib_index';

export class GspDefinitionProvider implements vscode.DefinitionProvider {
	constructor(
		private readonly tagLibIndex: TagLibIndex,
		private readonly classIndex: ClassIndex
	) {}

	provideDefinition(
		document: vscode.TextDocument,
		position: vscode.Position
	): vscode.Location | vscode.Location[] | undefined {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		const targets = resolveGspDefinitions({
			documentText: document.getText(),
			line: position.line,
			character: position.character,
			sourcePath: document.uri.fsPath,
			workspaceRoot: workspaceFolder ? resolveGradleProjectRoot(workspaceFolder) : undefined,
			classpathJars: this.classIndex.getClasspathJars(),
			tags: this.tagLibIndex.getTags(),
			classStore: this.classIndex.getStore(),
			artifactIndex: this.classIndex.getArtifactIndex()
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
