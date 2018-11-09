import * as vscode from 'vscode';

import FileParser from './file_parser'

export default class GoDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  public provideDocumentSymbols(
      document: vscode.TextDocument, token: vscode.CancellationToken):
      Thenable<vscode.SymbolInformation[]> {
        let fileText = document.getText()
        let symbol_informations = new FileParser(fileText, token, document).symbol_informations()
        return symbol_informations.map((symbol_information: any) => {
          const { name, type, start_line, end_line} = symbol_information
          const symbolKinds: any = {
            "class": vscode.SymbolKind.Class,
            "def": vscode.SymbolKind.Function,
            "public": vscode.SymbolKind.Function,
            "private": vscode.SymbolKind.Function,
            "protected": vscode.SymbolKind.Function
          }
          var rage = new vscode.Range( new vscode.Position(start_line, 0), new vscode.Position(end_line, 0) );
          return new vscode.SymbolInformation(name, symbolKinds[type], rage)
        })
  }
}
