import * as vscode from 'vscode';

export const sortDependeces = () => {
    let activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor || !activeEditor.document || activeEditor.document.languageId !== 'groovy') return;

    const dependecesCondition = (text: string) => { return (text.startsWith("def ") && text.endsWith("Service")) };
    return sortLines(activeEditor, dependecesCondition, false);
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