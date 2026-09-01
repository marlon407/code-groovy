import * as assert from 'assert';
import { extractAttributes, parseTagLibSource } from '../../gsp/taglib_parser';

const SAMPLE_TAGLIB = `
class DemoTagLib {
    static namespace = "demo"

    def accountLink = { attrs, body ->
        List<String> linkAttributes = ["href", "class", "target"]
        out << attrs.href
        out << attrs['class']
        if (attrs.containsKey('isAtlas')) { }
        out << attrs.findAll { true }
    }

    def adminButton = { attrs, body ->
        out << body()
        out << attrs.url
    }

    def messagePrinter = { attrs ->
        out << attrs.isAtlas
    }

    def springSecurityService = { }
}
`;

suite('taglib_parser', () => {
	test('parses namespace, methods, attributes and body usage', () => {
		const tags = parseTagLibSource(SAMPLE_TAGLIB, 'DemoTagLib.groovy');
		assert.deepStrictEqual(
			tags.map(t => t.method),
			['accountLink', 'adminButton', 'messagePrinter']
		);

		const accountLink = tags.find(t => t.method === 'accountLink')!;
		assert.strictEqual(accountLink.name, 'demo:accountLink');
		assert.strictEqual(accountLink.usesBody, false);
		assert.deepStrictEqual(accountLink.attributes, ['class', 'href', 'isAtlas', 'target']);

		const adminButton = tags.find(t => t.method === 'adminButton')!;
		assert.strictEqual(adminButton.usesBody, true);
		assert.deepStrictEqual(adminButton.attributes, ['url']);

		const messagePrinter = tags.find(t => t.method === 'messagePrinter')!;
		assert.strictEqual(messagePrinter.usesBody, false);
	});

	test('falls back to class-derived namespace', () => {
		const tags = parseTagLibSource(`
class UserPermissionTagLib {
    def ifAllowed = { attrs, body -> out << body() }
}
`, 'UserPermissionTagLib.groovy');
		assert.strictEqual(tags[0].namespace, 'userPermission');
		assert.strictEqual(tags[0].name, 'userPermission:ifAllowed');
	});

	test('ignores *Service closures and Map methods on attrs', () => {
		const attrs = extractAttributes(`
            out << attrs.class
            out << attrs.findAll { it }
            out << attrs.containsKey('url')
        `);
		assert.deepStrictEqual(attrs, ['class', 'url']);
	});
});
