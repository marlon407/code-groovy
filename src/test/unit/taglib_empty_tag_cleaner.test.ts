import * as assert from 'assert';
import {
	applyTextReplacements,
	planEmptySelfCloseReplacements
} from '../../gsp/taglib_empty_tag_logic';
import { ProjectTagLibTag } from '../../gsp/taglib_parser';

const tags: ProjectTagLibTag[] = [
	{
		name: 'demoUI:accountLink',
		namespace: 'demoUI',
		method: 'accountLink',
		attributes: [],
		usesBody: false,
		sourcePath: 'DemoUITagLib.groovy'
	},
	{
		name: 'demoUI:adminButton',
		namespace: 'demoUI',
		method: 'adminButton',
		attributes: [],
		usesBody: true,
		sourcePath: 'DemoUITagLib.groovy'
	}
];

suite('taglib_empty_tag_cleaner', () => {
	test('rewrites empty pair to self-close when tag has no body', () => {
		const input = '<demoUI:accountLink></demoUI:accountLink>';
		const output = applyTextReplacements(input, planEmptySelfCloseReplacements(input, tags));
		assert.strictEqual(output, '<demoUI:accountLink />');
	});

	test('does not rewrite empty pair when tag uses body', () => {
		const input = '<demoUI:adminButton></demoUI:adminButton>';
		const edits = planEmptySelfCloseReplacements(input, tags);
		assert.strictEqual(edits.length, 0);
	});

	test('rewrites broken self-close + closing tag and keeps the slash', () => {
		const input = '<demoUI:adminButton /></demoUI:adminButton>';
		const output = applyTextReplacements(input, planEmptySelfCloseReplacements(input, tags));
		assert.strictEqual(output, '<demoUI:adminButton />');
	});

	test('preserves attributes when cleaning broken pairs', () => {
		const input = '<demoUI:accountLink class="x"/></demoUI:accountLink>';
		const output = applyTextReplacements(input, planEmptySelfCloseReplacements(input, tags));
		assert.strictEqual(output, '<demoUI:accountLink class="x" />');
	});

	test('ignores unknown tags', () => {
		const input = '<other:thing></other:thing>';
		const edits = planEmptySelfCloseReplacements(input, tags);
		assert.strictEqual(edits.length, 0);
	});
});
