import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
	applyCompletionToLine,
	hasLeftoverNamespacePrefix
} from '../../gsp/completion_apply';
import { resolveGrailsCoreCompletions } from '../../gsp/grails_core_completions';
import { resolveTagLibCompletions } from '../../gsp/taglib_completion_logic';
import { parseTagLibSource } from '../../gsp/taglib_parser';

const fixturesRoot = path.resolve(__dirname, '../../../src/test/fixtures');
const tagLibSource = fs.readFileSync(
	path.join(fixturesRoot, 'taglib/DemoUITagLib.groovy'),
	'utf8'
);
const gspFixture = fs.readFileSync(
	path.join(fixturesRoot, 'gsp/taglib-chains.gsp'),
	'utf8'
);

const tags = parseTagLibSource(tagLibSource, 'DemoUITagLib.groovy');

function scenarioLines(): string[] {
	return gspFixture
		.split('\n')
		.filter(line => {
			const trimmed = line.trim();
			return trimmed.length > 0 && !trimmed.startsWith('<%') && !trimmed.startsWith('--');
		});
}

suite('gsp completion chains (fixtures)', () => {
	test('fixture taglib parses expected demoUI methods', () => {
		assert.deepStrictEqual(
			tags.map(t => t.method).sort(),
			['accountLink', 'adminButton', 'messagePrinter']
		);
	});

	test('chain: namespace → methods → attributes', () => {
		const namespaces = resolveTagLibCompletions('demoUI', tags);
		assert.ok(namespaces.some(i => i.kind === 'namespace' && i.insertText === 'demoUI.'));

		const methods = resolveTagLibCompletions('demoUI.', tags);
		assert.ok(methods.some(i => i.label === 'accountLink' && i.insertText.includes('<demoUI:accountLink')));
		assert.ok(methods.some(i => i.label === 'adminButton' && i.insertText.includes('</demoUI:adminButton>')));

		const attrs = resolveTagLibCompletions('<demoUI:accountLink ', tags);
		assert.deepStrictEqual(attrs.map(i => i.label).sort(), ['class', 'href', 'featured', 'target']);
	});

	test('each scenario line from the .gsp fixture resolves without leftover prefixes', () => {
		for (const line of scenarioLines()) {
			const core = resolveGrailsCoreCompletions(line);
			const project = resolveTagLibCompletions(line, tags);
			const combined = [...core, ...project];

			if (line === 'div.container') {
				assert.strictEqual(combined.length, 0, 'HTML Emmet abbreviations stay for Emmet');
				continue;
			}

			assert.ok(combined.length > 0, `expected completions for fixture line: ${line}`);
			for (const item of combined) {
				const result = applyCompletionToLine(line, item.replaceLength, item.insertText);
				assert.strictEqual(
					hasLeftoverNamespacePrefix(result),
					false,
					`leftover prefix for ${line} → ${result}`
				);
				assert.ok(
					!item.insertText.includes('class="each"'),
					`Emmet-style expansion leaked for ${line}: ${item.insertText}`
				);
			}
		}
	});

	test('g.each fixture line accepts g:each without dangling g.', () => {
		const line = scenarioLines().find(l => l === 'g.each');
		assert.ok(line);
		const item = resolveGrailsCoreCompletions(line!).find(i => i.label === 'g:each')!;
		const result = applyCompletionToLine(line!, item.replaceLength, item.insertText);
		assert.ok(result.startsWith('<g:each'));
		assert.strictEqual(result.includes('g.<g:each'), false);
	});
});
