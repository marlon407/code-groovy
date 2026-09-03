import * as assert from 'assert';
import FileParser from '../../file_parser';

const SAMPLE_TAGLIB = `
class DemoTagLib {
    static namespace = "demo"

    def accountLink = { attrs, body ->
        out << attrs.href
    }

    def adminButton = { attrs, body ->
        out << body()
    }

    def messagePrinter = { attrs ->
        out << attrs.isAtlas
    }

    def regularMethod() {
        return true
    }

    private def hiddenTag = { attrs ->
        out << attrs.id
    }
}
`;

suite('file_parser symbols', () => {
	test('includes TagLib closure assignments in document symbols', () => {
		const symbols = new FileParser(SAMPLE_TAGLIB).symbol_informations();
		const names = symbols.map((s: any) => s.name);
		assert.ok(names.includes('DemoTagLib'));
		assert.deepStrictEqual(
			symbols.filter((s: any) => s.type === 'closure').map((s: any) => s.name),
			['accountLink', 'adminButton', 'messagePrinter', 'hiddenTag']
		);
	});

	test('still recognizes normal methods with parentheses', () => {
		const symbols = new FileParser(SAMPLE_TAGLIB).symbol_informations();
		const methods = symbols.filter((s: any) => s.type === 'def').map((s: any) => s.name);
		assert.ok(methods.some((name: string) => name.includes('regularMethod')));
	});

	test('does not treat service-looking closures specially for symbols', () => {
		const text = `
class DemoTagLib {
    def springSecurityService = { }
}
`;
		const symbols = new FileParser(text).symbol_informations();
		assert.deepStrictEqual(
			symbols.filter((s: any) => s.type === 'closure').map((s: any) => s.name),
			['springSecurityService']
		);
	});
});
