import * as assert from 'assert';
import { resolveGrailsCoreCompletions } from '../../gsp/grails_core_completions';

suite('grails_core_completions', () => {
	test('g.each expands to g:each tag, not an Emmet class abbreviation', () => {
		const items = resolveGrailsCoreCompletions('g.each');
		const each = items.find(i => i.label === 'each');
		assert.ok(each);
		assert.ok(each!.insertText.includes('<g:each'));
		assert.ok(!each!.insertText.includes('class="each"'));
		assert.strictEqual(each!.replaceLength, 'g.each'.length);
	});

	test('supports both dotted and colon separators', () => {
		const dotted = resolveGrailsCoreCompletions('g.if');
		const colon = resolveGrailsCoreCompletions('g:if');
		assert.ok(dotted.some(i => i.label === 'if' && i.insertText.includes('<g:if')));
		assert.ok(colon.some(i => i.label === 'if' && i.insertText.includes('<g:if')));
	});

	test('asset.javascript is owned by core completions', () => {
		const items = resolveGrailsCoreCompletions('asset.java');
		assert.ok(items.some(i => i.label === 'javascript' && i.insertText.includes('<asset:javascript')));
	});

	test('leaves plain HTML Emmet abbreviations alone', () => {
		assert.deepStrictEqual(resolveGrailsCoreCompletions('div.container'), []);
		assert.deepStrictEqual(resolveGrailsCoreCompletions('ul>li'), []);
	});
});
