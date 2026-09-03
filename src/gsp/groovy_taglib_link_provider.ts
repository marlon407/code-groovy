import * as vscode from 'vscode';
import { resolveGradleProjectRoot } from '../groovy/classpath_resolver';
import { listGroovyNamedArgValues } from './groovy_taglib_navigation_logic';
import { resolveGspResourcePath } from './gsp_resource_path_logic';

/**
 * Underlines `template:` / `src:` named args in Groovy TagLibs (same targets as GSP).
 */
export class GroovyTagLibLinkProvider implements vscode.DocumentLinkProvider {
	provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		const workspaceRoot = workspaceFolder
			? resolveGradleProjectRoot(workspaceFolder)
			: undefined;
		if (!workspaceRoot) {
			return [];
		}

		const links: vscode.DocumentLink[] = [];
		for (let line = 0; line < document.lineCount; line++) {
			const text = document.lineAt(line).text;
			for (const hit of listGroovyNamedArgValues(text)) {
				if (hit.value.includes('${')) {
					continue;
				}
				const targetPath = resolveGspResourcePath({
					attrName: hit.name,
					attrValue: hit.value,
					tag: hit.name === 'template' ? { namespace: 'g', method: 'render' } : undefined,
					workspaceRoot
				});
				if (!targetPath) {
					continue;
				}
				const range = new vscode.Range(
					new vscode.Position(line, hit.valueStart),
					new vscode.Position(line, hit.valueEnd)
				);
				const link = new vscode.DocumentLink(range, vscode.Uri.file(targetPath));
				link.tooltip = `Open ${hit.value}`;
				links.push(link);
			}
		}
		return links;
	}
}
