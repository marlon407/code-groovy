'use strict';

import * as vscode from 'vscode';
import * as sortLines from './sort_lines';
import GroovyDocumentSymbolProvider from './groovy_document_symbol_provider';
import { ensureGspEmmetCoexistence } from './gsp/gsp_emmet_coexistence';
import { TagLibIndex } from './gsp/taglib_index';

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

    void ensureGspEmmetCoexistence();

    const tagLibIndex = new TagLibIndex();
    context.subscriptions.push(tagLibIndex);
    void tagLibIndex.start(context);
}

export function deactivate() {
}
