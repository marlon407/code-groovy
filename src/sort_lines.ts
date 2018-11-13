import * as vscode from 'vscode';

import FileParser from './file_parser';

export const sortDependeces = () => {
    let activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor || !activeEditor.document || activeEditor.document.languageId !== 'groovy') return;

    let fileText = activeEditor.document.getText()
    activeEditor.edit(editBuilder => {
      let deps = new FileParser(fileText).dependences()
      const lines: string[] = [];
      deps.map((dep: any) => {
        if (!activeEditor) return;
        const range = new vscode.Range(dep.start_line, 0, dep.start_line + 1, 0);
        editBuilder.delete(range);
        lines.push(dep.line);
      });

      lines.sort();

      removeBlanks(lines);
      removeDuplicates(lines);
      lines.push("");

      const position = new vscode.Position(deps[0].start_line, 0);
      editBuilder.insert(position, lines.join('\n'));
    });
}

export const sortImports = () => {
    let activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor || !activeEditor.document || activeEditor.document.languageId !== 'groovy')  return;

    const importCondition = (text: string) => { return text.startsWith("import") };
    return sortLines(activeEditor, importCondition, true);
}

function sortLines(textEditor: vscode.TextEditor, condition: Function, addBlanksLines: boolean) {
    const lines: string[] = [];
    let lastImportLine : any;
    let firstImportLine : any;
    for (let i = 0; i <= textEditor.document.lineCount - 1; i++) {
        let text = textEditor.document.lineAt(i).text;
        if (condition(text.replace(/^\s\s*/, ''))) {
          if (firstImportLine == undefined) firstImportLine = i
          lastImportLine = i;
          lines.push(text);
        }
    }

    if (lines.length == 0) return;

    lines.sort();

    removeBlanks(lines);
    removeDuplicates(lines);

    if (addBlanksLines) addBlanks(lines);
  
    return textEditor.edit(editBuilder => {
      const range = new vscode.Range(firstImportLine, 0, lastImportLine, textEditor.document.lineAt(lastImportLine).text.length);
      editBuilder.replace(range, lines.join('\n'));
    });
}

function removeBlanks(lines: string[]) {
  for (let i = 0; i < lines.length; ++i) {
    if (lines[i].trim() === '') {
      lines.splice(i, 1);
      i--;
    }
  }
}

function removeDuplicates(lines: string[]) {
  for (let i = 1; i < lines.length; ++i) {
    if (lines[i - 1] === lines[i]) {
      lines.splice(i, 1);
      i--;
    }
  }
}

function addBlanks(lines: string[]) {
  for (let i = 1; i < lines.length; ++i) {
    let lastPackage = lines[i-1].split(" ")[1].split(".");
    let currentPackage = lines[i].split(" ")[1].split(".");

    if (currentPackage[0] == lastPackage[0]) {
      continue;
    }
    lines.splice(i, 0, "");
    i++
  }
}