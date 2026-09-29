import * as vscode from 'vscode';
import * as fs from 'fs';
import { detectGrailsModules, collectGrailsModuleSourceFiles } from './grails_module_detector';
import { CallSiteIndexStore } from './call_site_index_store';
import { CallSiteRecord } from './call_site_extractor';
import { findWordMatches } from './text_scan_logic';
import { findDeclarationTarget, findReferenceTarget, resolveUsages, UsageHierarchy } from './usage_lookup_logic';

const SOURCE_EXCLUDE = '**/{node_modules,.git,build,target,out}/**';
const CONCURRENCY = 64;

export async function collectSourceFilePaths(): Promise<string[]> {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	const configuredModules = vscode.workspace.getConfiguration('codeGroovy').get<string[]>('modules');
	const grailsModules = workspaceFolders
		? detectGrailsModules(workspaceFolders, configuredModules)
		: [];

	if (grailsModules.length > 0) {
		return collectGrailsModuleSourceFiles(grailsModules);
	}

	const maxFiles = vscode.workspace.getConfiguration('codeGroovy').get<number>('index.maxSourceFiles', 0);
	const files = await vscode.workspace.findFiles('**/*.{groovy,java}', SOURCE_EXCLUDE, maxFiles > 0 ? maxFiles : undefined);
	return files.map(file => file.fsPath);
}

export async function findWordOccurrences(
	word: string,
	receiverFieldName?: string,
	token?: vscode.CancellationToken,
	files?: string[]
): Promise<vscode.Location[]> {
	if (!word || word.length < 2) {
		return [];
	}

	const filePaths = files ?? await collectSourceFilePaths();
	const results: vscode.Location[] = [];

	let index = 0;
	const worker = async (): Promise<void> => {
		while (index < filePaths.length) {
			if (token?.isCancellationRequested) {
				return;
			}
			const current = filePaths[index++];
			let text: string;
			try {
				text = await fs.promises.readFile(current, 'utf8');
			} catch {
				continue;
			}
			const uri = vscode.Uri.file(current);
			for (const match of findWordMatches(text, word, receiverFieldName)) {
				results.push(wordLocation(uri, match.line, match.column, word));
			}
		}
	};

	const workerCount = Math.min(CONCURRENCY, filePaths.length) || 1;
	await Promise.all(Array.from({ length: workerCount }, () => worker()));

	return results;
}

export function callSiteToLocation(record: CallSiteRecord): vscode.Location {
	return wordLocation(vscode.Uri.file(record.sourcePath), record.line, record.column, record.methodName);
}

function wordLocation(uri: vscode.Uri, line: number, column: number, word: string): vscode.Location {
	return new vscode.Location(uri, new vscode.Range(line, column, line, column + word.length));
}

export class ReferenceProvider implements vscode.ReferenceProvider {
	constructor(
		private readonly callSiteIndex: CallSiteIndexStore,
		private readonly hierarchy: UsageHierarchy
	) {}

	async provideReferences(
		document: vscode.TextDocument,
		position: vscode.Position,
		context: vscode.ReferenceContext,
		token: vscode.CancellationToken
	): Promise<vscode.Location[] | undefined> {
		const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
		if (!wordRange) {
			return undefined;
		}

		const word = document.getText(wordRange);
		const documentText = document.getText();
		const line = wordRange.start.line;
		const target = findReferenceTarget(documentText, document.uri.fsPath, line, wordRange.start.character, word);

		let results: vscode.Location[];
		if (target) {
			const resolution = resolveUsages(target, this.callSiteIndex, 'references', this.hierarchy);
			results = resolution.records.map(callSiteToLocation);
			for (const scan of resolution.textScans) {
				if (target.kind === 'method' && results.length > 0) {
					break;
				}
				const scanned = await findWordOccurrences(word, scan.receiverFieldName, token, scan.files);
				results = target.kind === 'class' ? mergeByLine(scanned, results) : scanned;
			}
			if (results.length === 0) {
				results = resolution.superDeclarations.map(declaration =>
					wordLocation(vscode.Uri.file(declaration.sourcePath), declaration.line, declaration.column, word));
			}
		} else {
			results = findWordMatches(documentText, word)
				.map(match => new vscode.Location(document.uri, new vscode.Range(match.line, match.column, match.line, match.column + word.length)));
		}

		if (!findDeclarationTarget(documentText, document.uri.fsPath, line, word, wordRange.start.character)) {
			return results;
		}
		const declUri = document.uri.toString();
		const usages = results.filter(location => !(location.uri.toString() === declUri && location.range.start.line === line));
		return context.includeDeclaration
			? [new vscode.Location(document.uri, wordRange), ...usages]
			: usages;
	}
}

function mergeByLine(primary: vscode.Location[], secondary: vscode.Location[]): vscode.Location[] {
	const lineKey = (location: vscode.Location) => `${location.uri.toString()}::${location.range.start.line}`;
	const covered = new Set(primary.map(lineKey));
	return [...primary, ...secondary.filter(location => !covered.has(lineKey(location)))];
}
