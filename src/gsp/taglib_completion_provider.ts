import * as vscode from 'vscode';
import { resolveGrailsCoreCompletions } from './grails_core_completions';
import { resolveTagLibCompletions } from './taglib_completion_logic';
import { ProjectTagLibTag } from './taglib_parser';

export class TagLibCompletionProvider implements vscode.CompletionItemProvider {
	private tags: ProjectTagLibTag[] = [];

	setTags(tags: ProjectTagLibTag[]): void {
		this.tags = tags;
	}

	provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position
	): vscode.CompletionItem[] {
		const linePrefix = document.lineAt(position).text.slice(0, position.character);
		const items: vscode.CompletionItem[] = [];

		for (const completion of resolveGrailsCoreCompletions(linePrefix)) {
			const item = new vscode.CompletionItem(
				{ label: completion.label, description: completion.detail },
				vscode.CompletionItemKind.Snippet
			);
			item.detail = completion.detail;
			item.sortText = `0_core_${completion.label}`;
			item.filterText = completion.filterText;
			item.insertText = new vscode.SnippetString(completion.insertText);
			item.range = new vscode.Range(
				position.translate(0, -completion.replaceLength),
				position
			);
			items.push(item);
		}

		for (const completion of resolveTagLibCompletions(linePrefix, this.tags)) {
			const kind = completion.kind === 'namespace'
				? vscode.CompletionItemKind.Module
				: completion.kind === 'attribute'
					? vscode.CompletionItemKind.Property
					: vscode.CompletionItemKind.Method;

			const item = new vscode.CompletionItem(completion.label, kind);
			if (completion.kind === 'method') {
				const preview = completion.insertText.replace(/\$\d+/g, '');
				item.label = {
					label: completion.label,
					description: preview.startsWith('<') ? preview : undefined
				};
			}

			item.detail = completion.detail;
			item.sortText = `0_taglib_${completion.label}`;
			if (completion.filterText) {
				item.filterText = completion.filterText;
			}
			if (completion.documentation) {
				item.documentation = new vscode.MarkdownString(completion.documentation);
			}
			if (completion.kind === 'namespace') {
				item.insertText = completion.insertText;
				item.command = {
					command: 'editor.action.triggerSuggest',
					title: 'Show taglib methods'
				};
			} else {
				item.insertText = new vscode.SnippetString(completion.insertText);
			}

			item.range = new vscode.Range(
				position.translate(0, -completion.replaceLength),
				position
			);
			items.push(item);
		}

		return items;
	}
}
