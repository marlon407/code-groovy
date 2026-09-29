import * as vscode from 'vscode';
import * as fs from 'fs';
import { detectGrailsModules, collectGrailsModuleSourceFiles } from './grails_module_detector';
import { CallSiteIndexStore } from './call_site_index_store';
import { CallSiteRecord } from './call_site_extractor';
import { escapeRegExp, isInsideStringLiteral, isImportLine, isInsideLineComment } from './text_scan_logic';
import { findDeclarationTarget, findReferenceTarget, resolveUsages } from './usage_lookup_logic';

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
	token?: vscode.CancellationToken
): Promise<vscode.Location[]> {
	if (!word || word.length < 2) {
		return [];
	}

	const filePaths = await collectSourceFilePaths();
	const pattern = receiverFieldName
		? '\\b' + escapeRegExp(receiverFieldName) + '\\s*\\.\\s*(' + escapeRegExp(word) + ')\\b'
		: '\\b(' + escapeRegExp(word) + ')\\b';
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
			if (!text.includes(word)) {
				continue;
			}
			const lines = text.split(/\r\n|\r|\n/);
			const lineRegex = new RegExp(pattern, 'gd');
			for (let lineNo = 0; lineNo < lines.length; lineNo++) {
				const line = lines[lineNo];
				if (!line.includes(word)) {
					continue;
				}
				if (isImportLine(line)) {
					continue;
				}
				lineRegex.lastIndex = 0;
				let match: RegExpExecArray | null;
				while ((match = lineRegex.exec(line)) !== null) {
					const groupIndices = (match as RegExpExecArray & { indices: Array<[number, number]> }).indices[1];
					const methodStart = groupIndices[0];
					if (isInsideStringLiteral(line, methodStart) || isInsideLineComment(line, methodStart)) {
						continue;
					}
					results.push(new vscode.Location(
						vscode.Uri.file(current),
						new vscode.Range(lineNo, methodStart, lineNo, methodStart + word.length)
					));
				}
			}
		}
	};

	const workerCount = Math.min(CONCURRENCY, filePaths.length) || 1;
	await Promise.all(Array.from({ length: workerCount }, () => worker()));

	return results;
}

export function callSiteToLocation(record: CallSiteRecord): vscode.Location {
	return new vscode.Location(
		vscode.Uri.file(record.sourcePath),
		new vscode.Position(record.line, record.column)
	);
}

export class ReferenceProvider implements vscode.ReferenceProvider {
	constructor(private readonly callSiteIndex: CallSiteIndexStore) {}

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
			const resolution = resolveUsages(target, this.callSiteIndex, 'references');
			results = resolution.records.map(callSiteToLocation);
			if (target.kind === 'class') {
				if (resolution.textScans.length > 0) {
					results = mergeByLine(await findWordOccurrences(word, undefined, token), results);
				}
			} else {
				for (const scan of resolution.textScans) {
					if (results.length > 0) {
						break;
					}
					results = await findWordOccurrences(word, scan.receiverFieldName, token);
				}
			}
		} else {
			results = await findWordOccurrences(word, undefined, token);
		}

		if (!findDeclarationTarget(documentText, document.uri.fsPath, line, word)) {
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
