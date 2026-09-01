import * as vscode from 'vscode';
import { ProjectTagLibTag } from './taglib_parser';
import { planEmptySelfCloseReplacements } from './taglib_empty_tag_logic';

export {
	applyTextReplacements,
	planEmptySelfCloseReplacements
} from './taglib_empty_tag_logic';

export function buildEmptySelfCloseEdits(
	document: vscode.TextDocument,
	tags: ProjectTagLibTag[]
): vscode.TextEdit[] {
	return planEmptySelfCloseReplacements(document.getText(), tags).map(replacement =>
		vscode.TextEdit.replace(
			new vscode.Range(
				document.positionAt(replacement.start),
				document.positionAt(replacement.end)
			),
			replacement.text
		)
	);
}
