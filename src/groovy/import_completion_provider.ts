import * as vscode from 'vscode';
import { ClassIndexStore } from './class_index_store';
import { resolveTypeCompletions, TypeCompletion } from './import_completion_logic';

export class ImportCompletionProvider implements vscode.CompletionItemProvider {
	constructor(private readonly store: ClassIndexStore) {}

	provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position
	): vscode.CompletionItem[] {
		const linePrefix = document.lineAt(position).text.slice(0, position.character);
		const completions = resolveTypeCompletions(linePrefix, document.getText(), this.store);
		return completions.map((completion, index) => this.toItem(document, position, completion, index));
	}

	private toItem(
		document: vscode.TextDocument,
		position: vscode.Position,
		completion: TypeCompletion,
		index: number
	): vscode.CompletionItem {
		const item = new vscode.CompletionItem(
			{ label: completion.simpleName, description: completion.fqn },
			vscode.CompletionItemKind.Class
		);
		item.detail = completion.fqn;
		item.insertText = completion.simpleName;
		item.filterText = completion.simpleName;
		item.sortText = `${String(index).padStart(4, '0')}_${completion.simpleName}_${completion.fqn}`;
		item.documentation = new vscode.MarkdownString('```groovy\nimport ' + completion.fqn + '\n```');
		item.range = new vscode.Range(position.translate(0, -completion.replaceLength), position);

		if (completion.importInsertion.needed) {
			const start = document.positionAt(completion.importInsertion.offset);
			item.additionalTextEdits = [vscode.TextEdit.insert(start, completion.importInsertion.text)];
		}

		return item;
	}
}
