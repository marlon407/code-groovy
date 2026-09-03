import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
	findGroovyNamedArgAtPosition,
	resolveGroovyTagLibDefinitions
} from '../../gsp/groovy_taglib_navigation_logic';
import { parseTagLibSource } from '../../gsp/taglib_parser';

const PAYMENT_TAGLIB = `
class PaymentTagLib {
    static namespace = "payment"

    def shouldShowSplitFlag = { attrs ->
        true
    }
}
`;

suite('groovy_taglib_navigation_logic', () => {
	test('finds template named-arg value under the cursor', () => {
		const line = 'out << g.render(template: "/split/templates/splitFlag", model: [isAtlas: isAtlas])';
		const hit = findGroovyNamedArgAtPosition(line, line.indexOf('splitFlag'));
		assert.ok(hit);
		assert.strictEqual(hit!.name, 'template');
		assert.strictEqual(hit!.value, '/split/templates/splitFlag');
		assert.strictEqual(findGroovyNamedArgAtPosition(line, line.indexOf('render')), undefined);
	});

	test('jumps from paymentTagLib.method to the TagLib closure', () => {
		const sourcePath = path.join(os.tmpdir(), 'PaymentTagLib.groovy');
		const tags = parseTagLibSource(PAYMENT_TAGLIB, sourcePath);
		const documentText = 'if (!paymentTagLib.shouldShowSplitFlag(attrs)) return';
		const character = documentText.indexOf('shouldShowSplitFlag') + 3;
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
		const sourcePath = path.join(os.tmpdir(), 'PaymentTagLib.groovy');
		const tags = parseTagLibSource(PAYMENT_TAGLIB, sourcePath);
		const documentText = 'payment.shouldShowSplitFlag(attrs)';
		const targets = resolveGroovyTagLibDefinitions({
			documentText,
			line: 0,
			character: documentText.indexOf('shouldShowSplitFlag'),
			tags
		});
		assert.strictEqual(targets[0]?.uri, sourcePath);
	});

	test('resolves g.render template named arg to the GSP view', () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'code-groovy-taglib-render-'));
		try {
			const target = path.join(root, 'grails-app/views/split/templates/_splitFlag.gsp');
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.writeFileSync(target, '<!-- flag -->\n');

			const documentText = 'out << g.render(template: "/split/templates/splitFlag")';
			const targets = resolveGroovyTagLibDefinitions({
				documentText,
				line: 0,
				character: documentText.indexOf('splitFlag'),
				workspaceRoot: root,
				tags: []
			});
			assert.strictEqual(targets[0]?.uri, target);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
