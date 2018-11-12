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
      
}

export function deactivate() {
}
