import * as vscode from 'vscode';
import { parseDocumentSymbols } from './symbol_parser';
import { findMethodsWithNoUsages } from './no_usages_logic';
import { CallSiteIndexStore } from './call_site_index_store';

const DIAGNOSTIC_SOURCE = 'code-groovy';

export class NoUsagesDiagnostics implements vscode.Disposable {
	private readonly collection = vscode.languages.createDiagnosticCollection('codeGroovyNoUsages');
	private readonly disposables: vscode.Disposable[] = [];
	private timer: ReturnType<typeof setTimeout> | undefined;

	constructor(private readonly callSiteIndex: CallSiteIndexStore) {}

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
			})
		);

		this.refreshAllOpenDocuments();
	}

	/** Re-checks every open document; call after the workspace-wide call-site index finishes rebuilding. */
	refreshAllOpenDocuments(): void {
		for (const document of vscode.workspace.textDocuments) {
			if (document.languageId === 'groovy' && !document.isClosed) {
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

		const parsed = parseDocumentSymbols(document.getText(), document.uri.fsPath);
		const hints = findMethodsWithNoUsages(
			parsed.methods,
			methodName => this.callSiteIndex.lookup(methodName).length > 0
		);

		const diagnostics = hints.map(hint => {
			const range = new vscode.Range(hint.line, hint.column, hint.line, hint.column + hint.name.length);
			const diagnostic = new vscode.Diagnostic(
				range,
				`No usages found for '${hint.name}' in the indexed workspace source.`,
				vscode.DiagnosticSeverity.Hint
			);
			diagnostic.source = DIAGNOSTIC_SOURCE;
			diagnostic.code = 'no-usages';
			diagnostic.tags = [vscode.DiagnosticTag.Unnecessary];
			return diagnostic;
		});

		this.collection.set(document.uri, diagnostics);
	}
}
