import * as vscode from 'vscode';
import { ClassIndexStore, indexJarFqns, indexSourceText, IndexedType, MAX_INDEXED_CLASSES } from './class_index_store';
import { hashWorkspaceBuildFiles, resolveProjectClasspath } from './classpath_resolver';
import { ImportCodeActionProvider } from './import_code_action_provider';
import { ImportCompletionProvider } from './import_completion_provider';
import { ImportOrderDiagnostics } from './import_order_diagnostics';
import { listClassFqnsFromJar } from './jar_class_scanner';

const CACHE_KEY = 'codeGroovy.classpathIndex.v1';
const SOURCE_EXCLUDE = '**/{node_modules,.git,build,target,out}/**';

interface CachedClasspath {
	hash: string;
	types: Array<{ simpleName: string; fqn: string }>;
}

export class ClassIndex implements vscode.Disposable {
	private readonly store = new ClassIndexStore();
	private readonly completionProvider = new ImportCompletionProvider(this.store);
	private readonly codeActionProvider = new ImportCodeActionProvider(this.store);
	private readonly importOrderDiagnostics = new ImportOrderDiagnostics();
	private readonly disposables: vscode.Disposable[] = [];
	private sourceTimer: ReturnType<typeof setTimeout> | undefined;
	private classpathTimer: ReturnType<typeof setTimeout> | undefined;
	private warnedClasspath = false;

	async start(context: vscode.ExtensionContext): Promise<void> {
		this.importOrderDiagnostics.start();
		this.disposables.push(
			this.importOrderDiagnostics,
			vscode.languages.registerCompletionItemProvider(
				{ language: 'groovy' },
				this.completionProvider
			),
			vscode.languages.registerCodeActionsProvider(
				{ language: 'groovy' },
				this.codeActionProvider,
				{ providedCodeActionKinds: ImportCodeActionProvider.providedCodeActionKinds }
			)
		);

		const sourceWatcher = vscode.workspace.createFileSystemWatcher('**/*.{groovy,java}');
		sourceWatcher.onDidCreate(() => this.scheduleSourceRefresh());
		sourceWatcher.onDidChange(() => this.scheduleSourceRefresh());
		sourceWatcher.onDidDelete(() => this.scheduleSourceRefresh());
		this.disposables.push(sourceWatcher);

		const buildWatcher = vscode.workspace.createFileSystemWatcher(
			'**/{build.gradle,build.gradle.kts,settings.gradle,settings.gradle.kts,gradle.lockfile,pom.xml}'
		);
		buildWatcher.onDidCreate(() => this.scheduleClasspathRefresh(context));
		buildWatcher.onDidChange(() => this.scheduleClasspathRefresh(context));
		buildWatcher.onDidDelete(() => this.scheduleClasspathRefresh(context));
		this.disposables.push(buildWatcher);

		await this.refreshSource();
		void this.refreshClasspath(context);
	}

	getStore(): ClassIndexStore {
		return this.store;
	}

	dispose(): void {
		if (this.sourceTimer) {
			clearTimeout(this.sourceTimer);
		}
		if (this.classpathTimer) {
			clearTimeout(this.classpathTimer);
		}
		this.disposables.forEach(d => d.dispose());
	}

	private scheduleSourceRefresh(): void {
		if (this.sourceTimer) {
			clearTimeout(this.sourceTimer);
		}
		this.sourceTimer = setTimeout(() => {
			void this.refreshSource();
		}, 400);
	}

	private scheduleClasspathRefresh(context: vscode.ExtensionContext): void {
		if (this.classpathTimer) {
			clearTimeout(this.classpathTimer);
		}
		this.classpathTimer = setTimeout(() => {
			void this.refreshClasspath(context);
		}, 2000);
	}

	private async refreshSource(): Promise<void> {
		const files = await vscode.workspace.findFiles('**/*.{groovy,java}', SOURCE_EXCLUDE, 5000);
		const types: IndexedType[] = [];
		for (const file of files) {
			try {
				const bytes = await vscode.workspace.fs.readFile(file);
				types.push(...indexSourceText(Buffer.from(bytes).toString('utf8'), file.fsPath));
			} catch {
				// skip unreadable source
			}
		}
		this.store.removeBySource('workspace');
		this.store.add(types);
	}

	private async refreshClasspath(context: vscode.ExtensionContext): Promise<void> {
		const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!root) {
			return;
		}

		const hash = hashWorkspaceBuildFiles(root);
		const cached = context.workspaceState.get<CachedClasspath>(CACHE_KEY);
		if (cached?.hash === hash && cached.types?.length) {
			this.store.removeBySource('jar');
			this.store.add(cached.types.map(type => ({ ...type, source: 'jar' as const })));
			return;
		}

		const resolution = await resolveProjectClasspath(root);
		if (resolution.warning && !this.warnedClasspath) {
			this.warnedClasspath = true;
			void vscode.window.showWarningMessage(
				`${resolution.warning} Auto-import is limited to workspace source until the classpath is available.`
			);
		}

		const types: IndexedType[] = [];
		for (const jar of resolution.jars) {
			if (types.length >= MAX_INDEXED_CLASSES) {
				break;
			}
			try {
				const remaining = MAX_INDEXED_CLASSES - types.length;
				const fqns = listClassFqnsFromJar(jar).slice(0, remaining);
				types.push(...indexJarFqns(fqns, jar));
			} catch {
				// skip unreadable jars
			}
		}

		this.store.removeBySource('jar');
		this.store.add(types);

		if (types.length > 0) {
			await context.workspaceState.update(CACHE_KEY, {
				hash,
				types: types.map(type => ({ simpleName: type.simpleName, fqn: type.fqn }))
			});
		}
	}
}
