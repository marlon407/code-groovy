import * as vscode from 'vscode';
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
		const completions = resolveTagLibCompletions(linePrefix, this.tags);

		return completions.map(completion => {
			const kind = completion.kind === 'namespace'
				? vscode.CompletionItemKind.Module
				: completion.kind === 'attribute'
					? vscode.CompletionItemKind.Property
					: vscode.CompletionItemKind.Method;

			const item = new vscode.CompletionItem(
				completion.kind === 'method'
					? {
						label: completion.label,
						description: completion.insertText.includes('/>')
							? `<${completion.label} />`
							: `<${completion.label}>…</>`
					}
					: completion.label,
				kind
			);

			// Prefer showing the real tag preview from insert text for methods.
			if (completion.kind === 'method') {
				const preview = completion.insertText
					.replace(/\$\d+/g, '')
					.replace(/\$\{0\}/g, '');
				item.label = {
					label: completion.label,
					description: preview.startsWith('<') ? preview : undefined
				};
			}

			item.detail = completion.detail;
			item.sortText = `0_${completion.label}`;
			if (completion.filterText) {
				item.filterText = completion.filterText;
			}
			if (completion.documentation) {
				item.documentation = new vscode.MarkdownString(completion.documentation);
			}
			if (completion.kind === 'namespace') {
				item.preselect = completion.insertText.startsWith(completion.label);
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
			return item;
		});
	}
}
