import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
	applyCompletionToLine,
	hasLeftoverNamespacePrefix,
	looksLikeEmmetClassExpansion
} from '../../gsp/completion_apply';
import { resolveGrailsCoreCompletions } from '../../gsp/grails_core_completions';
import {
	applyTextReplacements,
	planEmptySelfCloseReplacements
} from '../../gsp/taglib_empty_tag_logic';
import { resolveTagLibCompletions } from '../../gsp/taglib_completion_logic';
import { parseTagLibSource, ProjectTagLibTag } from '../../gsp/taglib_parser';

const fixturesRoot = path.resolve(__dirname, '../../../src/test/fixtures');
const tags = parseTagLibSource(
	fs.readFileSync(path.join(fixturesRoot, 'taglib/DemoUITagLib.groovy'), 'utf8'),
	'DemoUITagLib.groovy'
);

function acceptCore(linePrefix: string, label: string): string {
	const item = resolveGrailsCoreCompletions(linePrefix).find(i => i.label === label);
	assert.ok(item, `missing core completion ${label} for "${linePrefix}"`);
	return applyCompletionToLine(linePrefix, item!.replaceLength, item!.insertText);
}

function acceptTaglib(linePrefix: string, label: string): string {
	const item = resolveTagLibCompletions(linePrefix, tags).find(i => i.label === label);
	assert.ok(item, `missing taglib completion ${label} for "${linePrefix}"`);
	return applyCompletionToLine(linePrefix, item!.replaceLength, item!.insertText);
}

function assertCleanExpansion(result: string, mustInclude: string): void {
	assert.ok(result.includes(mustInclude), `expected "${mustInclude}" in:\n${result}`);
	assert.strictEqual(hasLeftoverNamespacePrefix(result), false, `leftover prefix in:\n${result}`);
	assert.strictEqual(looksLikeEmmetClassExpansion(result), false, `Emmet leak in:\n${result}`);
}

suite('gsp scenarios — Grails core triggers', () => {
	const coreCases: Array<[string, string, string]> = [
		['g.each', 'g:each', '<g:each'],
		['g:each', 'g:each', '<g:each'],
		['g.if', 'g:if', '<g:if'],
		['g:if', 'g:if', '<g:if'],
		['g.else', 'g:else', '<g:else'],
		['g:elseif', 'g:elseif', '<g:elseif'],
		['g.render', 'g:render', '<g:render'],
		['g:message', 'g:message', '<g:message'],
		['asset.javascript', 'asset:javascript', '<asset:javascript'],
		['asset:stylesheet', 'asset:stylesheet', '<asset:stylesheet'],
		['asset.image', 'asset:image', '<asset:image']
	];

	for (const [typed, label, needle] of coreCases) {
		test(`typing "${typed}" and accepting "${label}" does not leave a dangling prefix`, () => {
			assertCleanExpansion(acceptCore(typed, label), needle);
		});
	}

	test('typed g.each + accept g:each never becomes g.<g:each>', () => {
		const result = acceptCore('g.each', 'g:each');
		assert.strictEqual(result.startsWith('g.<'), false);
		assert.ok(result.startsWith('<g:each'));
	});

	test('partial prefixes still replace the full typed fragment', () => {
		assertCleanExpansion(acceptCore('g.ea', 'g:each'), '<g:each');
		assertCleanExpansion(acceptCore('g:ea', 'g:each'), '<g:each');
		assertCleanExpansion(acceptCore('asset.java', 'asset:javascript'), '<asset:javascript');
	});

	test('HTML Emmet abbreviations are not owned by core completions', () => {
		assert.deepStrictEqual(resolveGrailsCoreCompletions('div.container'), []);
		assert.deepStrictEqual(resolveGrailsCoreCompletions('ul>li*3'), []);
	});

	test('core labels use colon form and filterText includes dotted form', () => {
		const item = resolveGrailsCoreCompletions('g.each').find(i => i.label === 'g:each')!;
		assert.ok(item.filterText.includes('g.each'));
		assert.ok(item.filterText.includes('g:each'));
		assert.strictEqual(item.replaceLength, 'g.each'.length);
	});
});

suite('gsp scenarios — project taglibs', () => {
	test('namespace → method (self-close) → attributes', () => {
		const ns = resolveTagLibCompletions('demoUI', tags).find(i => i.label === 'demoUI')!;
		assert.strictEqual(ns.insertText, 'demoUI.');

		const account = acceptTaglib('demoUI.account', 'accountLink');
		assertCleanExpansion(account, '<demoUI:accountLink');
		assert.ok(account.includes('/>'));
		assert.ok(!account.includes('</demoUI:accountLink>'));

		const attrs = resolveTagLibCompletions('<demoUI:accountLink ', tags).map(i => i.label).sort();
		assert.deepStrictEqual(attrs, ['class', 'href', 'isAtlas', 'target']);
	});

	test('methods that use body insert open/close tags', () => {
		const result = acceptTaglib('demoUI.admin', 'adminButton');
		assertCleanExpansion(result, '<demoUI:adminButton>');
		assert.ok(result.includes('</demoUI:adminButton>'));
	});

	test('html tag continuation keeps leading < and finishes method', () => {
		const selfClose = acceptTaglib('<demoUI:account', 'accountLink');
		assert.ok(selfClose.startsWith('<demoUI:accountLink'));
		assert.ok(selfClose.includes('/>'));

		const withBody = acceptTaglib('<demoUI:admin', 'adminButton');
		assert.ok(withBody.startsWith('<demoUI:adminButton'));
		assert.ok(withBody.includes('</demoUI:adminButton>'));
	});

	test('expression context only inserts the method name', () => {
		assert.strictEqual(acceptTaglib('${demoUI.account', 'accountLink'), '${demoUI.accountLink');
	});

	test('already used attributes are not suggested again', () => {
		const labels = resolveTagLibCompletions('<demoUI:adminButton class="x" ', tags).map(i => i.label);
		assert.deepStrictEqual(labels, ['url']);
	});
});

suite('gsp scenarios — empty / broken tag cleanup', () => {
	test('empty pair without body becomes self-closing', () => {
		const input = '<demoUI:accountLink></demoUI:accountLink>';
		const output = applyTextReplacements(input, planEmptySelfCloseReplacements(input, tags));
		assert.strictEqual(output, '<demoUI:accountLink />');
	});

	test('empty pair with body is left alone', () => {
		const input = '<demoUI:adminButton></demoUI:adminButton>';
		assert.strictEqual(planEmptySelfCloseReplacements(input, tags).length, 0);
	});

	test('broken self-close + closing tag keeps the slash', () => {
		const input = '<demoUI:adminButton /></demoUI:adminButton>';
		const output = applyTextReplacements(input, planEmptySelfCloseReplacements(input, tags));
		assert.strictEqual(output, '<demoUI:adminButton />');
	});

	test('broken pair preserves attributes without double spaces', () => {
		const input = '<demoUI:accountLink class="x"/></demoUI:accountLink>';
		const output = applyTextReplacements(input, planEmptySelfCloseReplacements(input, tags));
		assert.strictEqual(output, '<demoUI:accountLink class="x" />');
	});

	test('unknown tags are ignored', () => {
		const input = '<other:thing></other:thing>';
		assert.strictEqual(planEmptySelfCloseReplacements(input, tags).length, 0);
	});
});

suite('gsp scenarios — parser heuristics', () => {
	test('fixture taglib body/attrs detection', () => {
		const byMethod = new Map(tags.map(t => [t.method, t]));
		assert.strictEqual(byMethod.get('accountLink')!.usesBody, false);
		assert.strictEqual(byMethod.get('adminButton')!.usesBody, true);
		assert.ok(byMethod.get('accountLink')!.attributes.includes('href'));
		assert.ok(byMethod.get('adminButton')!.attributes.includes('url'));
	});

	test('class-derived namespace fallback still works', () => {
		const parsed = parseTagLibSource(`
class UserPermissionTagLib {
    def ifAllowed = { attrs, body -> out << body() }
}
`, 'UserPermissionTagLib.groovy');
		assert.strictEqual(parsed[0].namespace, 'userPermission');
		assert.strictEqual(parsed[0].usesBody, true);
	});

	test('attrs Map methods are not treated as attributes', () => {
		const parsed: ProjectTagLibTag[] = parseTagLibSource(`
class DemoTagLib {
  static namespace = "demo"
  def box = { attrs ->
    out << attrs.class
    out << attrs.findAll { true }
    out << attrs.containsKey('url')
  }
}
`, 'DemoTagLib.groovy');
		assert.deepStrictEqual(parsed[0].attributes, ['class', 'url']);
	});
});
