import * as vscode from 'vscode';

/**
 * Emmet treats `g.each` / `demoUI.foo` as `tag.class`, which fights Grails syntax.
 * Keep `gsp` mapped to HTML so "Emmet: Expand Abbreviation" still works for markup,
 * but hide Emmet from the suggest widget and disable expand-on-Tab in `.gsp`.
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
	const editorGsp = vscode.workspace.getConfiguration('editor', { languageId: 'gsp' });

	if (emmetGsp.get<boolean>('triggerExpansionOnTab') !== false) {
		await emmetGsp.update(
			'triggerExpansionOnTab',
			false,
			vscode.ConfigurationTarget.Global,
			true
		);
	}
	if (emmetGsp.get<boolean>('showAbbreviationSuggestions') !== false) {
		await emmetGsp.update(
			'showAbbreviationSuggestions',
			false,
			vscode.ConfigurationTarget.Global,
			true
		);
	}
	if (emmetGsp.get<string>('showExpandedAbbreviation') !== 'never') {
		await emmetGsp.update(
			'showExpandedAbbreviation',
			'never',
			vscode.ConfigurationTarget.Global,
			true
		);
	}
	if (editorGsp.get<string>('snippetSuggestions') !== 'top') {
		await editorGsp.update(
			'snippetSuggestions',
			'top',
			vscode.ConfigurationTarget.Global,
			true
		);
	}
}
