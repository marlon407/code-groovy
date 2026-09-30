import * as vscode from 'vscode';
import { collectGrailsModuleSourceFiles, detectGrailsModules, GrailsModule } from './grails_module_detector';

const SOURCE_EXCLUDE = '**/{node_modules,.git,build,target,out}/**';

export interface SourceFileDiscovery {
	filePaths: string[];
	grailsModules: GrailsModule[];
}

export async function discoverSourceFiles(): Promise<SourceFileDiscovery> {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	const configuration = vscode.workspace.getConfiguration('codeGroovy');
	const grailsModules = workspaceFolders
		? detectGrailsModules(workspaceFolders, configuration.get<string[]>('modules'))
		: [];
	if (grailsModules.length > 0) {
		return { filePaths: collectGrailsModuleSourceFiles(grailsModules), grailsModules };
	}
	const maxFiles = configuration.get<number>('index.maxSourceFiles', 0);
	const files = await vscode.workspace.findFiles('**/*.{groovy,java}', SOURCE_EXCLUDE, maxFiles > 0 ? maxFiles : undefined);
	return { filePaths: files.map(file => file.fsPath), grailsModules };
}
