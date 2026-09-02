import * as vscode from 'vscode';
import { findOutOfOrderImports } from './import_order_logic';

const DIAGNOSTIC_SOURCE = 'code-groovy';

export class ImportOrderDiagnostics implements vscode.Disposable {
	private readonly collection = vscode.languages.createDiagnosticCollection('codeGroovyImportOrder');
	private readonly disposables: vscode.Disposable[] = [];
	private timer: ReturnType<typeof setTimeout> | undefined;

	start(): void {
		this.disposables.push(
			this.collection,
			vscode.workspace.onDidChangeTextDocument(event => {
				if (event.document.languageId === 'groovy') {
					this.schedule(event.document);
				}
			}),
			vscode.workspace.onDidOpenTextDocument(document => {
				if (document.languageId === 'groovy') {
					this.schedule(document);
				}
			}),
			vscode.workspace.onDidCloseTextDocument(document => {
				this.collection.delete(document.uri);
			}),
			vscode.languages.registerCodeActionsProvider(
				{ language: 'groovy' },
				{
					provideCodeActions: (document, _range, context) => {
						const hasOurs = context.diagnostics.some(
							d => d.source === DIAGNOSTIC_SOURCE && d.code === 'import-order'
						);
						if (!hasOurs) {
							return [];
						}
						const action = new vscode.CodeAction(
							'Organize imports',
							vscode.CodeActionKind.QuickFix
						);
						action.command = {
							command: 'cgroovy.organizeImports',
							title: 'Organize imports'
						};
						action.diagnostics = context.diagnostics.filter(
							d => d.source === DIAGNOSTIC_SOURCE && d.code === 'import-order'
						);
						action.isPreferred = false;
						return [action];
					}
				},
				{ providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
			)
		);

		for (const document of vscode.workspace.textDocuments) {
			if (document.languageId === 'groovy') {
				this.refresh(document);
			}
		}
	}

	dispose(): void {
		if (this.timer) {
			clearTimeout(this.timer);
		}
		this.disposables.forEach(d => d.dispose());
	}

	private schedule(document: vscode.TextDocument): void {
		if (this.timer) {
			clearTimeout(this.timer);
		}
		this.timer = setTimeout(() => this.refresh(document), 300);
	}

	private refresh(document: vscode.TextDocument): void {
		if (document.languageId !== 'groovy' || document.isClosed) {
			return;
		}

		const diagnostics = findOutOfOrderImports(document.getText()).map(item => {
			const line = document.lineAt(item.line);
			const diagnostic = new vscode.Diagnostic(
				line.range,
				`Import is out of order (comes after '${item.previousText}'). Use Organize Imports to fix.`,
				vscode.DiagnosticSeverity.Warning
			);
			diagnostic.source = DIAGNOSTIC_SOURCE;
			diagnostic.code = 'import-order';
			return diagnostic;
		});

		this.collection.set(document.uri, diagnostics);
	}
}
