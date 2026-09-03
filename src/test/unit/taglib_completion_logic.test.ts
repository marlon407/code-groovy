import * as assert from 'assert';
import { resolveTagLibCompletions } from '../../gsp/taglib_completion_logic';
import { ProjectTagLibTag } from '../../gsp/taglib_parser';

const tags: ProjectTagLibTag[] = [
	{
		name: 'demoUI:accountLink',
		namespace: 'demoUI',
		method: 'accountLink',
		attributes: ['href', 'class'],
		usesBody: false,
		sourcePath: 'DemoUITagLib.groovy',
		methodLine: 3,
		methodColumn: 8
	},
	{
		name: 'demoUI:adminButton',
		namespace: 'demoUI',
		method: 'adminButton',
		attributes: ['url', 'class'],
		usesBody: true,
		sourcePath: 'DemoUITagLib.groovy',
		methodLine: 10,
		methodColumn: 8
	}
];

suite('taglib_completion_logic', () => {
	test('suggests namespaces for typed prefix', () => {
		const items = resolveTagLibCompletions('demo', tags);
		assert.strictEqual(items.length, 1);
		assert.strictEqual(items[0].kind, 'namespace');
		assert.strictEqual(items[0].insertText, 'demoUI.');
	});

	test('suggests self-closing tag for methods without body', () => {
		const items = resolveTagLibCompletions('demoUI.account', tags);
		const accountLink = items.find(i => i.label === 'accountLink')!;
		assert.strictEqual(accountLink.insertText, '<demoUI:accountLink$0 />');
	});

	test('suggests open/close tag for methods that use body', () => {
		const items = resolveTagLibCompletions('demoUI.admin', tags);
		const adminButton = items.find(i => i.label === 'adminButton')!;
		assert.strictEqual(adminButton.insertText, '<demoUI:adminButton>$0</demoUI:adminButton>');
	});

	test('continues html tag method completion with self-close or body', () => {
		const selfClose = resolveTagLibCompletions('<demoUI:account', tags)
			.find(i => i.label === 'accountLink')!;
		assert.strictEqual(selfClose.insertText, 'accountLink$0 />');

		const withBody = resolveTagLibCompletions('<demoUI:admin', tags)
			.find(i => i.label === 'adminButton')!;
		assert.strictEqual(withBody.insertText, 'adminButton$0></demoUI:adminButton>');
	});

	test('suggests attributes after space inside open tag', () => {
		const items = resolveTagLibCompletions('<demoUI:adminButton ', tags);
		assert.deepStrictEqual(items.map(i => i.label).sort(), ['class', 'url']);
		assert.ok(items.every(i => i.kind === 'attribute'));
	});

	test('does not suggest already used attributes', () => {
		const items = resolveTagLibCompletions('<demoUI:adminButton class="x" ', tags);
		assert.deepStrictEqual(items.map(i => i.label), ['url']);
	});

	test('keeps method name only inside ${} expressions', () => {
		const items = resolveTagLibCompletions('${demoUI.account', tags);
		const accountLink = items.find(i => i.label === 'accountLink')!;
		assert.strictEqual(accountLink.insertText, 'accountLink');
	});
});
