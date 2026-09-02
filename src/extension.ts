'use strict';

import * as vscode from 'vscode';
import * as sortLines from './sort_lines';
import GroovyDocumentSymbolProvider from './groovy_document_symbol_provider';
import { ensureGspEmmetCoexistence } from './gsp/gsp_emmet_coexistence';
import { ClassIndex } from './groovy/class_index';
import { registerJarContentProvider } from './groovy/jar_content_provider';
import { TagLibIndex } from './gsp/taglib_index';

let classIndex: ClassIndex | undefined;

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
    registerJarContentProvider(context);

    const tagLibIndex = new TagLibIndex();
    context.subscriptions.push(tagLibIndex);
    void tagLibIndex.start(context);

    classIndex = new ClassIndex();
    context.subscriptions.push(classIndex);
    context.subscriptions.push(
      vscode.commands.registerCommand('cgroovy.showIndexOutput', () => classIndex?.showIndexOutput()),
      vscode.commands.registerCommand('cgroovy.rebuildIndex', () => classIndex?.rebuildIndex())
    );
    void classIndex.start(context);
}

export function deactivate() {
}
