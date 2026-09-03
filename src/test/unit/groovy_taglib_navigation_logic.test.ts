import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
	findGroovyNamedArgAtPosition,
	resolveGroovyTagLibDefinitions
} from '../../gsp/groovy_taglib_navigation_logic';
import { parseTagLibSource } from '../../gsp/taglib_parser';

const CATALOG_TAGLIB = `
class CatalogTagLib {
    static namespace = "catalog"

    def shouldShowBadge = { attrs ->
        true
    }
}
`;

suite('groovy_taglib_navigation_logic', () => {
	test('finds template named-arg value under the cursor', () => {
		const line = 'out << g.render(template: "/catalog/templates/itemBadge", model: [featured: featured])';
		const hit = findGroovyNamedArgAtPosition(line, line.indexOf('itemBadge'));
		assert.ok(hit);
		assert.strictEqual(hit!.name, 'template');
		assert.strictEqual(hit!.value, '/catalog/templates/itemBadge');
		assert.strictEqual(findGroovyNamedArgAtPosition(line, line.indexOf('render')), undefined);
	});

	test('jumps from catalogTagLib.method to the TagLib closure', () => {
		const sourcePath = path.join(os.tmpdir(), 'CatalogTagLib.groovy');
		const tags = parseTagLibSource(CATALOG_TAGLIB, sourcePath);
		const documentText = 'if (!catalogTagLib.shouldShowBadge(attrs)) return';
		const character = documentText.indexOf('shouldShowBadge') + 3;
		const targets = resolveGroovyTagLibDefinitions({
			documentText,
			line: 0,
			character,
			tags
		});
		assert.strictEqual(targets.length, 1);
		assert.strictEqual(targets[0].uri, sourcePath);
		assert.strictEqual(targets[0].line, tags[0].methodLine);
		assert.strictEqual(targets[0].column, tags[0].methodColumn);
	});

	test('jumps from namespace.method the same way', () => {
		const sourcePath = path.join(os.tmpdir(), 'CatalogTagLib.groovy');
		const tags = parseTagLibSource(CATALOG_TAGLIB, sourcePath);
		const documentText = 'catalog.shouldShowBadge(attrs)';
		const targets = resolveGroovyTagLibDefinitions({
			documentText,
			line: 0,
			character: documentText.indexOf('shouldShowBadge'),
			tags
		});
		assert.strictEqual(targets[0]?.uri, sourcePath);
	});

	test('resolves g.render template named arg to the GSP view', () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'code-groovy-taglib-render-'));
		try {
			const target = path.join(root, 'grails-app/views/catalog/templates/_itemBadge.gsp');
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.writeFileSync(target, '<!-- flag -->\n');

			const documentText = 'out << g.render(template: "/catalog/templates/itemBadge")';
			const targets = resolveGroovyTagLibDefinitions({
				documentText,
				line: 0,
				character: documentText.indexOf('itemBadge'),
				workspaceRoot: root,
				tags: []
			});
			assert.strictEqual(targets[0]?.uri, target);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
