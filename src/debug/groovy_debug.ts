import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { GroovyJavaDebugAdapter } from './groovy_debug_adapter';
import { registerGroovyDebugInspection } from './groovy_debug_inspect';
import {
	buildGradleDebugCommand,
	buildInitialDebugConfigurations,
	defaultLaunchName,
	defaultRequest,
	detectDebugProject,
	DetectedDebugProject,
	dynamicDebugConfigurations,
	GroovyDebugInput,
	GradleDebugStatus,
	isJdwpListening,
	JAVA_DEBUG_EXTENSION_ID,
	pickJavaProjectName,
	readGradleDebugStatus,
	toJavaAttachConfig
} from './groovy_debug_logic';

export function registerGroovyDebug(context: vscode.ExtensionContext): void {
	try {
		const controller = new GroovyDebugController();
		context.subscriptions.push(
			controller,
			vscode.debug.registerDebugConfigurationProvider('groovy', controller),
			vscode.debug.registerDebugConfigurationProvider(
				'groovy',
				new GroovyDynamicConfigProvider(),
				vscode.DebugConfigurationProviderTriggerKind.Dynamic
			),
			vscode.debug.registerDebugAdapterDescriptorFactory('groovy', new GroovyDebugAdapterFactory()),
			vscode.commands.registerCommand('cgroovy.debugApp', () => controller.startFromCommand())
		);
		registerGroovyDebugInspection(context);
	} catch (error) {
		console.error('Code Groovy debug registration failed', error);
		void vscode.window.showErrorMessage(
			`Code Groovy debug failed to register: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}

class GroovyDebugController implements vscode.DebugConfigurationProvider, vscode.Disposable {
	private launched: ChildProcess | undefined;
	private launchedSessionName: string | undefined;
	private readonly output = vscode.window.createOutputChannel('Code Groovy Debug');
	private readonly status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
	private readonly disposables: vscode.Disposable[] = [
		this.output,
		this.status,
		vscode.debug.onDidTerminateDebugSession(session => {
			if (this.launchedSessionName && session.name === this.launchedSessionName) {
				this.launchedSessionName = undefined;
				this.stopLaunchedProcess();
				this.hideDebugStatus();
			}
		})
	];

	dispose(): void {
		this.stopLaunchedProcess();
		this.hideDebugStatus();
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
	}

	async resolveDebugConfiguration(
		folder: vscode.WorkspaceFolder | undefined,
		config: vscode.DebugConfiguration,
		token?: vscode.CancellationToken
	): Promise<vscode.DebugConfiguration | undefined> {
		if (config.type && config.type !== 'groovy') {
			return config;
		}

		if (!(await ensureJavaDebugger())) {
			return undefined;
		}

		const project = this.detectProject(folder);
		const input = config as GroovyDebugInput;
		if (!input.request) {
			input.request = defaultRequest(project.kind, Boolean(project.gradlew));
		}
		if (!input.name) {
			input.name = input.request === 'launch' ? defaultLaunchName(project.kind) : 'Groovy: Attach';
		}

		if (input.request === 'launch') {
			const started = await this.launchGradle(project, input, token);
			if (!started) {
				return undefined;
			}
		}

		input.projectName = pickJavaProjectName({
			configured: input.projectName,
			launchModule: input.module || project.launchModule,
			projectRoot: project.projectRoot,
			jdtNames: await listJdtProjectNames()
		});
		const javaConfig = toJavaAttachConfig(
			input,
			project.sourcePaths,
			input.request === 'launch' ? defaultLaunchName(project.kind) : 'Groovy: Attach'
		);
		if (input.request === 'launch') {
			this.launchedSessionName = javaConfig.name;
		}
		return {
			...javaConfig,
			type: 'groovy'
		};
	}

	async startFromCommand(): Promise<void> {
		const folder = vscode.workspace.workspaceFolders?.[0];
		const project = this.detectProject(folder);
		const request = defaultRequest(project.kind, Boolean(project.gradlew));
		await vscode.debug.startDebugging(folder, {
			type: 'groovy',
			request,
			name: request === 'launch' ? defaultLaunchName(project.kind) : 'Groovy: Attach'
		});
	}

	private detectProject(folder: vscode.WorkspaceFolder | undefined): DetectedDebugProject {
		const workspaceRoot = folder?.uri.fsPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!workspaceRoot) {
			return {
				kind: 'unknown',
				projectRoot: '',
				sourcePaths: []
			};
		}

		const configuredModules = vscode.workspace.getConfiguration('codeGroovy').get<string[]>('modules', ['domain', 'web', 'api']);
		return detectDebugProject(workspaceRoot, configuredModules);
	}

	private async launchGradle(
		project: DetectedDebugProject,
		input: GroovyDebugInput,
		token?: vscode.CancellationToken
	): Promise<boolean> {
		const command = buildGradleDebugCommand(project, input);
		if (!command) {
			void vscode.window.showErrorMessage(
				'No Gradle wrapper found. Start the app with JDWP and use Groovy: Attach, or open a Gradle project.'
			);
			return false;
		}

		this.stopLaunchedProcess();
		this.hideDebugStatus();
		this.output.clear();
		this.output.appendLine(`${command.command} ${command.args.join(' ')}`);
		this.output.appendLine(`cwd: ${command.cwd}`);
		this.output.show(true);
		this.setDebugStatus({ phase: 'starting', message: 'Starting Gradle…' });

		const timeoutMs = vscode.workspace.getConfiguration('codeGroovy.debug').get<number>('attachTimeoutMs', 180_000);

		return vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: 'Groovy debug',
				cancellable: true
			},
			async (progress, progressToken) => {
				const combined = token
					? mergeCancellation(token, progressToken)
					: progressToken;
				return this.spawnAndWaitForJdwp(
					command.command,
					command.args,
					command.cwd,
					timeoutMs,
					combined,
					progress
				);
			}
		);
	}

	private spawnAndWaitForJdwp(
		command: string,
		args: string[],
		cwd: string,
		timeoutMs: number,
		token: vscode.CancellationToken,
		progress: vscode.Progress<{ message?: string }>
	): Promise<boolean> {
		return new Promise(resolve => {
			let settled = false;
			let buffer = '';
			let timer: NodeJS.Timeout | undefined;
			let lastProgress = '';
			let notifiedBuild = false;
			let notifiedRunning = false;
			const child = spawn(command, args, {
				cwd,
				env: process.env,
				shell: process.platform === 'win32',
				detached: process.platform !== 'win32'
			});
			this.launched = child;

			const finish = (ok: boolean, message?: string) => {
				if (settled) {
					return;
				}
				settled = true;
				cancelListener.dispose();
				if (timer) {
					clearTimeout(timer);
				}
				if (!ok) {
					this.launchedSessionName = undefined;
					this.stopLaunchedProcess();
					this.hideDebugStatus();
					if (message) {
						void vscode.window.showErrorMessage(message);
					}
				}
				resolve(ok);
			};

			const cancelListener = token.onCancellationRequested(() => {
				finish(false, 'Groovy debug start cancelled.');
			});
			if (token.isCancellationRequested) {
				finish(false, 'Groovy debug start cancelled.');
				return;
			}

			timer = setTimeout(() => {
				finish(false, `Timed out waiting for JDWP after ${Math.round(timeoutMs / 1000)}s. Check the Code Groovy Debug output.`);
			}, timeoutMs);

			const onChunk = (chunk: Buffer) => {
				const text = chunk.toString('utf8');
				buffer += text;
				this.output.append(text);
				const status = readGradleDebugStatus(buffer);
				this.setDebugStatus(status);
				if (!settled && status.message !== lastProgress) {
					lastProgress = status.message;
					progress.report({ message: status.message });
				}
				if (!notifiedBuild && status.phase === 'jdwp') {
					notifiedBuild = true;
					void vscode.window.showInformationMessage('Debug JVM is listening.');
				}
				if (!notifiedRunning && status.phase === 'running') {
					notifiedRunning = true;
					void vscode.window.showInformationMessage('Application is running.');
				}
				if (isJdwpListening(buffer)) {
					finish(true);
				}
			};

			child.stdout?.on('data', onChunk);
			child.stderr?.on('data', onChunk);
			child.on('error', err => {
				finish(false, `Failed to start Gradle: ${err.message}`);
			});
			child.on('close', code => {
				if (!settled) {
					finish(
						false,
						`Gradle exited before the app opened a debug port (code ${code}). Check the Code Groovy Debug output. Port 5005 may already be in use.`
					);
				}
			});
		});
	}

	private setDebugStatus(status: GradleDebugStatus): void {
		const icons: Record<GradleDebugStatus['phase'], string> = {
			starting: '$(sync~spin)',
			compiling: '$(sync~spin)',
			compiled: '$(check)',
			jdwp: '$(debug-alt)',
			running: '$(play)',
			failed: '$(error)'
		};
		this.status.text = `${icons[status.phase]} Groovy: ${status.message}`;
		this.status.tooltip = 'Code Groovy debug';
		this.status.show();
	}

	private hideDebugStatus(): void {
		this.status.hide();
	}

	private stopLaunchedProcess(): void {
		const child = this.launched;
		this.launched = undefined;
		if (!child?.pid) {
			return;
		}
		if (process.platform === 'win32') {
			spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
			return;
		}
		try {
			process.kill(-child.pid, 'SIGTERM');
		} catch {
			child.kill('SIGTERM');
		}
	}
}

class GroovyDynamicConfigProvider implements vscode.DebugConfigurationProvider {
	provideDebugConfigurations(
		folder: vscode.WorkspaceFolder | undefined,
		_token?: vscode.CancellationToken
	): vscode.ProviderResult<vscode.DebugConfiguration[]> {
		const existing = vscode.workspace.getConfiguration('launch', folder).get<Array<{ type?: string }>>('configurations');
		return dynamicDebugConfigurations(buildInitialDebugConfigurations(), existing);
	}
}

async function ensureJavaDebugger(): Promise<boolean> {
	const javaDebug = vscode.extensions.getExtension(JAVA_DEBUG_EXTENSION_ID);
	if (!javaDebug) {
		const choice = await vscode.window.showErrorMessage(
			'Debugging Groovy/Grails requires the Debugger for Java extension.',
			'Install'
		);
		if (choice === 'Install') {
			await vscode.commands.executeCommand('workbench.extensions.installExtension', JAVA_DEBUG_EXTENSION_ID);
			void vscode.window.showInformationMessage('Install Debugger for Java, then start debug again.');
		}
		return false;
	}
	return true;
}

class GroovyDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
	async createDebugAdapterDescriptor(
		_session: vscode.DebugSession,
		_executable: vscode.DebugAdapterExecutable | undefined
	): Promise<vscode.DebugAdapterDescriptor> {
		if (!(await ensureJavaDebugger())) {
			throw new Error('Debugger for Java is not installed.');
		}
		const port = await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: 'Starting Java debug adapter…'
			},
			() => waitForJavaDebugPort()
		);
		return new vscode.DebugAdapterInlineImplementation(new GroovyJavaDebugAdapter(port));
	}
}

async function waitForJavaDebugPort(): Promise<number> {
	const redhat = vscode.extensions.getExtension('redhat.java');
	const javaDebug = vscode.extensions.getExtension(JAVA_DEBUG_EXTENSION_ID);
	if (redhat) {
		const api = await redhat.activate() as { serverReady?: () => Thenable<void> } | undefined;
		if (api && typeof api.serverReady === 'function') {
			await api.serverReady();
		}
	}
	if (javaDebug && !javaDebug.isActive) {
		await javaDebug.activate();
	}

	const commandNames = ['vscode.java.startDebugSession', 'java.startDebugSession'];
	let lastError: Error | undefined;
	for (let attempt = 0; attempt < 25; attempt++) {
		const available = await vscode.commands.getCommands(true);
		for (const name of commandNames) {
			if (!available.includes(name)) {
				continue;
			}
			try {
				const port = await vscode.commands.executeCommand(name);
				if (typeof port === 'number' && port > 0) {
					return port;
				}
				lastError = new Error(`${name} returned ${String(port)}`);
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
			}
		}
		await sleep(400);
	}

	throw lastError ?? new Error(
		'Java language server did not start a debug port. Wait until Language Support for Java finishes loading, then try again.'
	);
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function listJdtProjectNames(): Promise<string[]> {
	try {
		const uris = await vscode.commands.executeCommand<string[]>('java.project.getAll');
		if (!Array.isArray(uris)) {
			return [];
		}
		return uris
			.map(uri => {
				try {
					return path.basename(vscode.Uri.parse(uri).fsPath);
				} catch {
					return path.basename(String(uri).replace(/\/$/, ''));
				}
			})
			.filter(Boolean);
	} catch {
		return [];
	}
}

function mergeCancellation(
	first: vscode.CancellationToken,
	second: vscode.CancellationToken
): vscode.CancellationToken {
	const source = new vscode.CancellationTokenSource();
	first.onCancellationRequested(() => source.cancel());
	second.onCancellationRequested(() => source.cancel());
	if (first.isCancellationRequested || second.isCancellationRequested) {
		source.cancel();
	}
	return source.token;
}
