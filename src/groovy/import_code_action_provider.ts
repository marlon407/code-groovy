import * as vscode from 'vscode';
import { ClassIndexStore } from './class_index_store';
import { resolveImportCodeActions } from './import_code_action_logic';

export class ImportCodeActionProvider implements vscode.CodeActionProvider {
	static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

	constructor(private readonly store: ClassIndexStore) {}

	provideCodeActions(
		document: vscode.TextDocument,
		range: vscode.Range
	): vscode.CodeAction[] {
		const line = document.lineAt(range.start.line);
		const plans = resolveImportCodeActions(
			document.getText(),
			line.text,
			range.start.character,
			this.store
		);

		return plans.map(plan => {
			const action = new vscode.CodeAction(plan.title, vscode.CodeActionKind.QuickFix);
			action.edit = new vscode.WorkspaceEdit();
			const start = document.positionAt(plan.insertion.offset);
			action.edit.insert(document.uri, start, plan.insertion.text);
			return action;
		});
	}
}
