import * as vscode from 'vscode';
import { TagLibCompletionProvider } from './taglib_completion_provider';
import { buildEmptySelfCloseEdits } from './taglib_empty_tag_cleaner';
import { ProjectTagLibTag } from './taglib_parser';
import { scanWorkspaceTagLibs } from './taglib_scanner';

export class TagLibIndex implements vscode.Disposable {
	private readonly provider = new TagLibCompletionProvider();
	private readonly disposables: vscode.Disposable[] = [];
	private refreshTimer: ReturnType<typeof setTimeout> | undefined;
	private cleanTimer: ReturnType<typeof setTimeout> | undefined;
	private tags: ProjectTagLibTag[] = [];
	private cleaning = false;

	async start(context: vscode.ExtensionContext): Promise<void> {
		context.subscriptions.push(
			vscode.languages.registerCompletionItemProvider(
				{ language: 'gsp' },
				this.provider,
				'<',
				':',
				'.',
				' '
			)
		);

		const watcher = vscode.workspace.createFileSystemWatcher(
			'**/grails-app/taglib/**/*TagLib.groovy'
		);
		watcher.onDidCreate(() => this.scheduleRefresh());
		watcher.onDidChange(() => this.scheduleRefresh());
		watcher.onDidDelete(() => this.scheduleRefresh());
		this.disposables.push(watcher);

		this.disposables.push(
			vscode.workspace.onDidChangeTextDocument(event => {
				if (this.cleaning || event.document.languageId !== 'gsp' || event.contentChanges.length === 0) {
					return;
				}
				this.scheduleEmptyTagCleanup(event.document);
			})
		);

		await this.refresh();
	}

	getTags(): ProjectTagLibTag[] {
		return this.tags;
	}

	dispose(): void {
		if (this.refreshTimer) {
			clearTimeout(this.refreshTimer);
		}
		if (this.cleanTimer) {
			clearTimeout(this.cleanTimer);
		}
		this.disposables.forEach(d => d.dispose());
	}

	private scheduleRefresh(): void {
		if (this.refreshTimer) {
			clearTimeout(this.refreshTimer);
		}
		this.refreshTimer = setTimeout(() => {
			void this.refresh();
		}, 400);
	}

	private scheduleEmptyTagCleanup(document: vscode.TextDocument): void {
		if (this.cleanTimer) {
			clearTimeout(this.cleanTimer);
		}
		this.cleanTimer = setTimeout(() => {
			void this.cleanupEmptySelfClosingTags(document);
		}, 250);
	}

	private async cleanupEmptySelfClosingTags(document: vscode.TextDocument): Promise<void> {
		if (document.isClosed || document.languageId !== 'gsp') {
			return;
		}

		const edits = buildEmptySelfCloseEdits(document, this.tags);
		if (edits.length === 0) {
			return;
		}

		const workspaceEdit = new vscode.WorkspaceEdit();
		workspaceEdit.set(document.uri, edits);
		this.cleaning = true;
		try {
			await vscode.workspace.applyEdit(workspaceEdit);
		} finally {
			this.cleaning = false;
		}
	}

	private async refresh(): Promise<void> {
		this.tags = await scanWorkspaceTagLibs();
		this.provider.setTags(this.tags);
	}
}
