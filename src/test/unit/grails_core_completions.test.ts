import * as assert from 'assert';
import {
	applyCompletionToLine,
	hasLeftoverNamespacePrefix,
	looksLikeEmmetClassExpansion
} from '../../gsp/completion_apply';
import { resolveGrailsCoreCompletions } from '../../gsp/grails_core_completions';

suite('grails_core_completions', () => {
	test('g.each expands to g:each tag, not an Emmet class abbreviation', () => {
		const items = resolveGrailsCoreCompletions('g.each');
		const each = items.find(i => i.label === 'g:each');
		assert.ok(each);
		const result = applyCompletionToLine('g.each', each!.replaceLength, each!.insertText);
		assert.ok(result.startsWith('<g:each'));
		assert.strictEqual(hasLeftoverNamespacePrefix(result), false);
		assert.strictEqual(looksLikeEmmetClassExpansion(result), false);
		assert.strictEqual(looksLikeEmmetClassExpansion(each!.insertText), false);
	});

	test('supports both dotted and colon separators with full replaceLength', () => {
		for (const typed of ['g.if', 'g:if']) {
			const item = resolveGrailsCoreCompletions(typed).find(i => i.label === 'g:if')!;
			assert.strictEqual(item.replaceLength, typed.length);
			const result = applyCompletionToLine(typed, item.replaceLength, item.insertText);
			assert.ok(result.startsWith('<g:if'));
			assert.strictEqual(hasLeftoverNamespacePrefix(result), false);
		}
	});

	test('asset.javascript is owned by core completions', () => {
		const items = resolveGrailsCoreCompletions('asset.java');
		assert.ok(items.some(i => i.label === 'asset:javascript'));
	});

	test('leaves plain HTML Emmet abbreviations alone', () => {
		assert.deepStrictEqual(resolveGrailsCoreCompletions('div.container'), []);
		assert.deepStrictEqual(resolveGrailsCoreCompletions('ul>li'), []);
	});
});
