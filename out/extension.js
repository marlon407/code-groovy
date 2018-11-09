'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const groovy_document_symbol_provider_1 = require("./groovy_document_symbol_provider");
function sortLines(textEditor, condition, addBlanksLines) {
    const lines = [];
    let lastImportLine;
    let firstImportLine;
    for (let i = 0; i <= textEditor.document.lineCount - 1; i++) {
        let text = textEditor.document.lineAt(i).text;
        if (condition(text.replace(/^\s\s*/, ''))) {
            if (firstImportLine == undefined)
                firstImportLine = i;
            lastImportLine = i;
            lines.push(text);
        }
    }
    if (lines.length == 0)
        return;
    lines.sort();
    removeBlanks(lines);
    removeDuplicates(lines);
    if (addBlanksLines)
        addBlanks(lines);
    return textEditor.edit(editBuilder => {
        const range = new vscode.Range(firstImportLine, 0, lastImportLine, textEditor.document.lineAt(lastImportLine).text.length);
        editBuilder.replace(range, lines.join('\n'));
    });
}
function removeBlanks(lines) {
    for (let i = 0; i < lines.length; ++i) {
        if (lines[i].trim() === '') {
            lines.splice(i, 1);
            i--;
        }
    }
}
function removeDuplicates(lines) {
    for (let i = 1; i < lines.length; ++i) {
        if (lines[i - 1] === lines[i]) {
            lines.splice(i, 1);
            i--;
        }
    }
}
function addBlanks(lines) {
    for (let i = 1; i < lines.length; ++i) {
        let lastPackage = lines[i - 1].split(" ")[1].split(".");
        let currentPackage = lines[i].split(" ")[1].split(".");
        if (currentPackage[0] == lastPackage[0]) {
            continue;
        }
        lines.splice(i, 0, "");
        i++;
    }
}
function activate(context) {
    let disposable = vscode.commands.registerCommand('extension.organizeImports', function () {
        let activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || !activeEditor.document || activeEditor.document.languageId !== 'groovy') {
            return;
        }
        let importCondition = (text) => { return text.startsWith("import"); };
        return sortLines(activeEditor, importCondition, true);
    });
    context.subscriptions.push(disposable);
    let disposable2 = vscode.commands.registerCommand('extension.organizeDependences', function () {
        let activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || !activeEditor.document || activeEditor.document.languageId !== 'groovy') {
            return;
        }
        let dependecesCondition = (text) => { return (text.startsWith("def ") && text.endsWith("Service")); };
        return sortLines(activeEditor, dependecesCondition, false);
    });
    context.subscriptions.push(disposable2);
    let selector = {
        language: 'groovy',
        scheme: 'file'
    };
    context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(selector, new groovy_document_symbol_provider_1.default()));
}
exports.activate = activate;
function deactivate() {
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map