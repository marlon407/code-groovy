import * as vscode from 'vscode';
import { resolveGradleProjectRoot } from '../groovy/classpath_resolver';
import {
	findOpenTagBefore,
	listResourceAttributeValues,
	resolveGspResourcePath
} from './gsp_resource_path_logic';

/**
 * Underlines the full template/src/url attribute value (not just one path segment)
 * and opens the resolved view/asset on Ctrl+click.
 */
export class GspResourceLinkProvider implements vscode.DocumentLinkProvider {
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
			for (const hit of listResourceAttributeValues(text)) {
				if (hit.value.includes('${')) {
					continue;
				}
				const openTag = findOpenTagBefore(text, hit.valueStart);
				const targetPath = resolveGspResourcePath({
					attrName: hit.name,
					attrValue: hit.value,
					tag: openTag,
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
