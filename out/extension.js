'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const sortLines = require("./sort_lines");
const groovy_document_symbol_provider_1 = require("./groovy_document_symbol_provider");
function activate(context) {
    const commands = [
        vscode.commands.registerCommand('cgroovy.organizeImports', sortLines.sortImports),
        vscode.commands.registerCommand('cgroovy.organizeDependences', sortLines.sortDependeces),
    ];
    const languages = [
        vscode.languages.registerDocumentSymbolProvider({ language: 'groovy', scheme: 'file' }, new groovy_document_symbol_provider_1.default())
    ];
    commands.forEach(command => context.subscriptions.push(command));
    languages.forEach(language => context.subscriptions.push(language));
}
exports.activate = activate;
function deactivate() {
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map