import * as vscode from 'vscode';
import {
	computeIndexPercent,
	formatIndexCount,
	IndexPhase
} from './index_status_logic';

export interface IndexSummary {
	sourceFiles: number;
	workspaceTypes: number;
	artifactEntries: number;
	artifactClasses: number;
	jarTypes: number;
	jarCount: number;
	classpathTool?: string;
	fromCache?: boolean;
	warning?: string;
}

export class IndexStatusBar implements vscode.Disposable {
	private readonly output = vscode.window.createOutputChannel('Code Groovy Index');
	private readonly statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
	private phase: IndexPhase = 'idle';
	private sourceDone = 0;
	private sourceTotal = 0;
	private jarDone = 0;
	private jarTotal = 0;
	private detail = '';
	private summary: IndexSummary | undefined;

	constructor(private readonly commandId = 'cgroovy.showIndexOutput') {
		this.statusBar.command = this.commandId;
	}

	start(context: vscode.ExtensionContext): void {
		context.subscriptions.push(this.output, this.statusBar);
		this.setPhase('source', 'Scanning workspace source…');
	}

	dispose(): void {
		this.statusBar.dispose();
		this.output.dispose();
	}

	showOutput(): void {
		this.output.show(true);
	}

	log(line: string): void {
		this.output.appendLine(line);
	}

	beginSourceScan(fileCount: number): void {
		this.sourceDone = 0;
		this.sourceTotal = fileCount;
		this.log(`Indexing workspace source: ${fileCount} file(s)`);
		this.setPhase('source', `source 0/${fileCount}`);
	}

	progressSource(filePath: string, done: number): void {
		this.sourceDone = done;
		const name = filePath.split(/[/\\]/).pop() ?? filePath;
		this.setPhase('source', `source ${done}/${this.sourceTotal} · ${name}`);
	}

	beginClasspathResolve(tool: string): void {
		this.log(`Resolving classpath (${tool})…`);
		this.setPhase('classpath-resolve', `${tool} classpath`);
	}

	beginClasspathFromCache(typeCount: number): void {
		this.log(`Classpath index loaded from cache (${typeCount} type(s))`);
		this.jarDone = 0;
		this.jarTotal = 0;
	}

	beginJarScan(jarCount: number): void {
		this.jarDone = 0;
		this.jarTotal = jarCount;
		this.log(`Scanning ${jarCount} JAR(s)…`);
		this.setPhase('classpath-jars', `jars 0/${jarCount}`);
	}

	progressJar(jarPath: string, done: number): void {
		this.jarDone = done;
		const name = jarPath.split(/[/\\]/).pop() ?? jarPath;
		this.setPhase('classpath-jars', `jars ${done}/${this.jarTotal} · ${name}`);
	}

	complete(summary: IndexSummary): void {
		this.summary = summary;
		this.phase = summary.warning ? 'warning' : 'ready';
		this.detail = this.buildReadyDetail(summary);
		this.log(this.detail);
		if (summary.warning) {
			this.log(`Warning: ${summary.warning}`);
		}
		this.render();
	}

	setError(message: string): void {
		this.phase = 'error';
		this.detail = message;
		this.log(`Error: ${message}`);
		this.render();
	}

	private setPhase(phase: IndexPhase, detail: string): void {
		this.phase = phase;
		this.detail = detail;
		this.render();
	}

	private buildReadyDetail(summary: IndexSummary): string {
		const parts = [
			`${summary.workspaceTypes} src`,
			`${summary.artifactClasses} artifacts`,
			`${formatIndexCount(summary.jarTypes)} deps`
		];
		if (summary.fromCache) {
			parts.push('cached classpath');
		} else if (summary.classpathTool) {
			parts.push(summary.classpathTool);
		}
		return parts.join(' · ');
	}

	private render(): void {
		const percent = computeIndexPercent(
			this.phase,
			this.sourceDone,
			this.sourceTotal,
			this.jarDone,
			this.jarTotal
		);

		switch (this.phase) {
			case 'source':
			case 'classpath-resolve':
			case 'classpath-jars':
				this.statusBar.text = `$(sync~spin) Groovy ${percent}% · ${this.detail}`;
				this.statusBar.tooltip = 'Indexing project for auto-import and navigation';
				this.statusBar.show();
				break;
			case 'ready':
				this.statusBar.text = `$(check) Groovy · ${this.detail}`;
				this.statusBar.tooltip = 'Index ready — click to open Code Groovy Index output';
				this.statusBar.show();
				break;
			case 'warning':
				this.statusBar.text = `$(warning) Groovy · ${this.detail}`;
				this.statusBar.tooltip = this.summary?.warning ?? 'Index ready with warnings';
				this.statusBar.show();
				break;
			case 'error':
				this.statusBar.text = '$(error) Groovy index';
				this.statusBar.tooltip = this.detail;
				this.statusBar.show();
				break;
			default:
				this.statusBar.hide();
		}
	}
}
