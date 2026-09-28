import * as vscode from 'vscode';
import { parseDocumentSymbols } from './symbol_parser';
import { findMethodsWithNoUsages, findClassesWithNoIndexedCallSite, UnusedSymbolHint } from './no_usages_logic';
import { CallSiteIndexStore } from './call_site_index_store';
import { findWordOccurrences } from './reference_provider';

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
				void this.refresh(document);
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
		this.timer = setTimeout(() => void this.refresh(document), 300);
	}

	private async refresh(document: vscode.TextDocument): Promise<void> {
		if (document.languageId !== 'groovy' || document.isClosed) {
			return;
		}

		const parsed = parseDocumentSymbols(document.getText(), document.uri.fsPath);

		const methodHints = findMethodsWithNoUsages(
			parsed.methods,
			methodName => this.callSiteIndex.lookup(methodName).length > 0
		);

		const classCandidates = findClassesWithNoIndexedCallSite(
			parsed.classes,
			className => this.callSiteIndex.lookup(className).length > 0 || this.callSiteIndex.lookupByReceiver(className).length > 0
		);
		const classHints = await this.confirmClassesHaveNoTextualUsage(classCandidates, document);

		if (document.isClosed) {
			return;
		}

		const diagnostics = [...methodHints, ...classHints].map(hint => toDiagnostic(hint));
		this.collection.set(document.uri, diagnostics);
	}

	private async confirmClassesHaveNoTextualUsage(
		candidates: UnusedSymbolHint[],
		document: vscode.TextDocument
	): Promise<UnusedSymbolHint[]> {
		const declUri = document.uri.toString();
		const confirmed: UnusedSymbolHint[] = [];
		for (const candidate of candidates) {
			const matches = await findWordOccurrences(candidate.name);
			const realUsage = matches.some(location => !(location.uri.toString() === declUri && location.range.start.line === candidate.line));
			if (!realUsage) {
				confirmed.push(candidate);
			}
		}
		return confirmed;
	}
}

function toDiagnostic(hint: UnusedSymbolHint): vscode.Diagnostic {
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
}
