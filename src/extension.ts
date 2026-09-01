'use strict';

import * as vscode from 'vscode';
import * as sortLines from './sort_lines';
import GroovyDocumentSymbolProvider from './groovy_document_symbol_provider';

export function activate(context: vscode.ExtensionContext) {
    
    const commands = [
      vscode.commands.registerCommand('cgroovy.organizeImports', sortLines.sortImports),
      vscode.commands.registerCommand('cgroovy.organizeDependences', sortLines.sortDependeces),
    ];
    
    const languages = [
      vscode.languages.registerDocumentSymbolProvider(  { language: 'groovy', scheme: 'file' }, new GroovyDocumentSymbolProvider())
    ];

    commands.forEach(command => context.subscriptions.push(command));
    languages.forEach(language => context.subscriptions.push(language));
    ensureGspEmmetMapping();
}

function ensureGspEmmetMapping(): void {
    const emmet = vscode.workspace.getConfiguration('emmet');
    const include = emmet.get<Record<string, string>>('includeLanguages') ?? {};
    if (include.gsp === 'html') {
        return;
    }
    emmet.update('includeLanguages', { ...include, gsp: 'html' }, vscode.ConfigurationTarget.Global);
}

export function deactivate() {
}
