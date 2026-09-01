import * as vscode from 'vscode';

/**
 * Emmet treats `g.each` as tag + class (`<g class="each">`).
 * Coexist by keeping Emmet for HTML abbreviations, but:
 * - not expanding on Tab (user accepts a suggestion instead)
 * - ranking language snippets above Emmet abbreviations
 */
export async function ensureGspEmmetCoexistence(): Promise<void> {
	const emmet = vscode.workspace.getConfiguration('emmet');
	const include = emmet.get<Record<string, string>>('includeLanguages') ?? {};
	if (include.gsp !== 'html') {
		await emmet.update(
			'includeLanguages',
			{ ...include, gsp: 'html' },
			vscode.ConfigurationTarget.Global
		);
	}

	const emmetGsp = vscode.workspace.getConfiguration('emmet', { languageId: 'gsp' });
	if (emmetGsp.get<boolean>('triggerExpansionOnTab') !== false) {
		await emmetGsp.update(
			'triggerExpansionOnTab',
			false,
			vscode.ConfigurationTarget.Global,
			true
		);
	}

	const editorGsp = vscode.workspace.getConfiguration('editor', { languageId: 'gsp' });
	if (editorGsp.get<string>('snippetSuggestions') !== 'top') {
		await editorGsp.update(
			'snippetSuggestions',
			'top',
			vscode.ConfigurationTarget.Global,
			true
		);
	}
}
