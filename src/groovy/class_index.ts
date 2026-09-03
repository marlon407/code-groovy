import * as vscode from 'vscode';
import { ClassIndexStore, indexJarFqns, IndexedType, MAX_INDEXED_CLASSES } from './class_index_store';
import { hashWorkspaceBuildFiles, resolveGradleProjectRoot, resolveProjectClasspath } from './classpath_resolver';
import { detectGrailsModules, collectGrailsModuleSourceFiles } from './grails_module_detector';
import { DefinitionProvider } from './definition_provider';
import { GrailsArtifactIndex, indexGroovyFile } from './grails_artifact_index';
import { ImportCodeActionProvider } from './import_code_action_provider';
import { ImportCompletionProvider } from './import_completion_provider';
import { ImportOrderDiagnostics } from './import_order_diagnostics';
import { GroovydocHoverProvider } from './groovydoc_hover_provider';
import { IndexStatusBar } from './index_status';
import { listClassFqnsFromJar } from './jar_class_scanner';
import { MethodCompletionProvider } from './method_completion_provider';
import { MethodIndexStore } from './method_index_store';
import { RenameProvider } from './rename_provider';
import { indexWorkspaceDocument } from './workspace_symbol_index';

const CACHE_KEY = 'codeGroovy.classpathIndex.v2';
const SOURCE_EXCLUDE = '**/{node_modules,.git,build,target,out}/**';

interface CachedClasspath {
	hash: string;
	types: Array<{ simpleName: string; fqn: string }>;
	jars?: string[];
}

interface RefreshOptions {
	showProgress?: boolean;
	forceClasspath?: boolean;
}

export class ClassIndex implements vscode.Disposable {
	private readonly store = new ClassIndexStore();
	private readonly methodStore = new MethodIndexStore();
	private readonly artifactIndex = new GrailsArtifactIndex();
	private readonly completionProvider = new ImportCompletionProvider(this.store);
	private readonly methodCompletionProvider = new MethodCompletionProvider(this.artifactIndex);
	private readonly codeActionProvider = new ImportCodeActionProvider(this.store);
	private readonly definitionProvider = new DefinitionProvider(
		this.store,
		this.artifactIndex,
		() => this.lastClasspathJars
	);
	private readonly renameProvider = new RenameProvider();
	private readonly importOrderDiagnostics = new ImportOrderDiagnostics();
	private readonly disposables: vscode.Disposable[] = [];
	private sourceTimer: ReturnType<typeof setTimeout> | undefined;
	private classpathTimer: ReturnType<typeof setTimeout> | undefined;
	private warnedClasspath = false;
	private statusBar: IndexStatusBar | undefined;
	private extensionContext: vscode.ExtensionContext | undefined;
	private initialIndexComplete = false;
	private lastClasspathWarning: string | undefined;
	private lastClasspathTool: ClasspathResolution['tool'] | undefined;
	private lastJarCount = 0;
	private lastClasspathJars: string[] = [];
	private lastSourceFileCount = 0;
	private classpathFromCache = false;

	async start(context: vscode.ExtensionContext): Promise<void> {
		this.extensionContext = context;
		this.statusBar = new IndexStatusBar();
		this.statusBar.start(context);
		this.statusBar.log('Code Groovy index started');

		this.importOrderDiagnostics.start();
		this.disposables.push(
			this.importOrderDiagnostics,
			vscode.languages.registerCompletionItemProvider(
				{ language: 'groovy' },
				this.completionProvider
			),
			vscode.languages.registerCompletionItemProvider(
				{ language: 'groovy' },
				this.methodCompletionProvider,
				'.'
			),
			vscode.languages.registerCodeActionsProvider(
				{ language: 'groovy' },
				this.codeActionProvider,
				{ providedCodeActionKinds: ImportCodeActionProvider.providedCodeActionKinds }
			),
			vscode.languages.registerDefinitionProvider(
				{ language: 'groovy' },
				this.definitionProvider
			),
			vscode.languages.registerHoverProvider(
				{ language: 'groovy' },
				new GroovydocHoverProvider(this.store)
			),
			vscode.languages.registerRenameProvider(
				{ language: 'groovy' },
				this.renameProvider
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
		buildWatcher.onDidCreate(() => this.scheduleClasspathRefresh());
		buildWatcher.onDidChange(() => this.scheduleClasspathRefresh());
		buildWatcher.onDidDelete(() => this.scheduleClasspathRefresh());
		this.disposables.push(buildWatcher);

		await this.refreshSource({ showProgress: true });
		await this.refreshClasspath({ showProgress: true });
		this.initialIndexComplete = true;
	}

	async rebuildIndex(): Promise<void> {
		const context = this.extensionContext;
		if (!context) {
			return;
		}
		this.warnedClasspath = false;
		this.lastClasspathWarning = undefined;
		await context.workspaceState.update(CACHE_KEY, undefined);
		await this.refreshSource({ showProgress: true });
		await this.refreshClasspath({ showProgress: true, forceClasspath: true });
	}

	showIndexOutput(): void {
		this.statusBar?.showOutput();
	}

	getStore(): ClassIndexStore {
		return this.store;
	}

	getMethodStore(): MethodIndexStore {
		return this.methodStore;
	}

	getArtifactIndex(): GrailsArtifactIndex {
		return this.artifactIndex;
	}

	getClasspathJars(): string[] {
		return this.lastClasspathJars;
	}

	dispose(): void {
		if (this.sourceTimer) {
			clearTimeout(this.sourceTimer);
		}
		if (this.classpathTimer) {
			clearTimeout(this.classpathTimer);
		}
		this.statusBar?.dispose();
		this.disposables.forEach(d => d.dispose());
	}

	private scheduleSourceRefresh(): void {
		if (this.sourceTimer) {
			clearTimeout(this.sourceTimer);
		}
		this.sourceTimer = setTimeout(() => {
			void this.refreshSource({ showProgress: false });
		}, 400);
	}

	private scheduleClasspathRefresh(): void {
		if (this.classpathTimer) {
			clearTimeout(this.classpathTimer);
		}
		this.classpathTimer = setTimeout(() => {
			void this.refreshClasspath({ showProgress: true, forceClasspath: true });
		}, 2000);
	}

	private async refreshSource(options: RefreshOptions = {}): Promise<void> {
		const showProgress = options.showProgress ?? false;
		const workspaceFolders = vscode.workspace.workspaceFolders;
		const configuredModules = vscode.workspace.getConfiguration('codeGroovy').get<string[]>('modules');
		const grailsModules = workspaceFolders
			? detectGrailsModules(workspaceFolders, configuredModules)
			: [];
		let filePaths: string[];

		if (grailsModules.length > 0) {
			filePaths = collectGrailsModuleSourceFiles(grailsModules);
			if (showProgress) {
				this.statusBar?.log(
					`Grails modules: ${grailsModules.map(module => module.name).join(', ')} (${filePaths.length} source file(s))`
				);
			}
		} else {
			const maxFiles = vscode.workspace.getConfiguration('codeGroovy').get<number>('index.maxSourceFiles', 0);
			const files = await vscode.workspace.findFiles(
				'**/*.{groovy,java}',
				SOURCE_EXCLUDE,
				maxFiles > 0 ? maxFiles : undefined
			);
			filePaths = files.map(file => file.fsPath);
			if (showProgress) {
				this.statusBar?.log(`Workspace scan: ${filePaths.length} source file(s)`);
			}
		}

		this.lastSourceFileCount = filePaths.length;

		if (showProgress) {
			this.statusBar?.beginSourceScan(filePaths.length);
		}

		const types: IndexedType[] = [];
		const methods: ReturnType<typeof indexWorkspaceDocument>['methods'] = [];
		this.artifactIndex.clear();
		for (let index = 0; index < filePaths.length; index++) {
			const filePath = filePaths[index];
			try {
				const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
				const text = Buffer.from(bytes).toString('utf8');
				const indexed = indexWorkspaceDocument(text, filePath);
				types.push(...indexed.types);
				methods.push(...indexed.methods);
				if (filePath.endsWith('.groovy')) {
					this.artifactIndex.addEntry(indexGroovyFile(filePath));
				}
			} catch {
				// skip unreadable source
			}
			if (showProgress) {
				this.statusBar?.progressSource(filePath, index + 1);
			}
		}
		this.store.removeBySource('workspace');
		this.methodStore.clear();
		this.store.add(types);
		this.methodStore.add(methods);

		if (!showProgress && this.initialIndexComplete) {
			this.finalizeStatus();
		}
	}

	private async refreshClasspath(options: RefreshOptions = {}): Promise<void> {
		const context = this.extensionContext;
		const showProgress = options.showProgress ?? false;
		const forceClasspath = options.forceClasspath ?? false;
		const folderRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		const root = folderRoot ? resolveGradleProjectRoot(folderRoot) : undefined;
		if (!root || !context) {
			if (showProgress) {
				this.finalizeStatus();
			}
			return;
		}

		const hash = hashWorkspaceBuildFiles(root);
		const cached = context.workspaceState.get<CachedClasspath>(CACHE_KEY);
		if (!forceClasspath && cached?.hash === hash && cached.types?.length) {
			this.store.removeBySource('jar');
			this.store.add(cached.types.map(type => ({ ...type, source: 'jar' as const })));
			if (cached.jars?.length) {
				this.lastClasspathJars = cached.jars;
			} else {
				const resolution = await resolveProjectClasspath(root);
				this.lastClasspathJars = resolution.jars;
				await context.workspaceState.update(CACHE_KEY, {
					hash: cached.hash,
					types: cached.types,
					jars: resolution.jars
				});
				this.statusBar?.log(`Classpath JAR list refreshed (${resolution.jars.length} JAR(s))`);
			}
			this.lastJarCount = this.lastClasspathJars.length;
			this.classpathFromCache = true;
			if (showProgress) {
				this.statusBar?.beginClasspathFromCache(cached.types.length);
			}
			this.finalizeStatus();
			return;
		}

		this.classpathFromCache = false;
		if (showProgress) {
			this.statusBar?.beginClasspathResolve('Gradle/Maven');
		}

		const resolution = await resolveProjectClasspath(root);
		this.lastClasspathTool = resolution.tool;
		this.lastClasspathWarning = resolution.warning;

		if (resolution.warning && !this.warnedClasspath) {
			this.warnedClasspath = true;
			void vscode.window.showWarningMessage(
				`${resolution.warning} Auto-import is limited to workspace source until the classpath is available.`
			);
		}

		const jars = resolution.jars;
		this.lastClasspathJars = jars;
		this.lastJarCount = jars.length;
		if (showProgress) {
			this.statusBar?.beginJarScan(jars.length);
		}

		const types: IndexedType[] = [];
		for (let index = 0; index < jars.length; index++) {
			const jar = jars[index];
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
			if (showProgress) {
				this.statusBar?.progressJar(jar, index + 1);
			}
		}

		this.store.removeBySource('jar');
		this.store.add(types);

		if (types.length > 0) {
			await context.workspaceState.update(CACHE_KEY, {
				hash,
				types: types.map(type => ({ simpleName: type.simpleName, fqn: type.fqn })),
				jars
			});
		}

		if (showProgress) {
			this.finalizeStatus();
		}
	}

	private finalizeStatus(): void {
		if (!this.statusBar) {
			return;
		}
		const toolLabel = formatClasspathTool(this.lastClasspathTool);
		this.statusBar.complete({
			sourceFiles: this.lastSourceFileCount,
			workspaceTypes: this.store.countBySource('workspace'),
			artifactEntries: this.artifactIndex.entryCount(),
			artifactClasses: this.artifactIndex.classNameCount(),
			jarTypes: this.store.countBySource('jar'),
			jarCount: this.lastJarCount,
			classpathTool: toolLabel,
			fromCache: this.classpathFromCache,
			warning: this.lastClasspathWarning
		});
	}
}

type ClasspathResolution = Awaited<ReturnType<typeof resolveProjectClasspath>>;

function formatClasspathTool(tool: ClasspathResolution['tool'] | undefined): string | undefined {
	switch (tool) {
		case 'gradle':
			return 'Gradle';
		case 'maven':
			return 'Maven';
		case 'workspace':
			return 'workspace JARs';
		case 'none':
			return undefined;
		default:
			return undefined;
	}
}
