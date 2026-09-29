import * as assert from 'assert';
import {
	braceDepthAtLineStarts,
	findWordMatches,
	isImportLine,
	isInsideComment,
	isInsideDocLink,
	maskNonCode
} from '../../groovy/text_scan_logic';

function offsetOf(text: string, needle: string, occurrence = 0): number {
	let index = -1;
	for (let i = 0; i <= occurrence; i++) {
		index = text.indexOf(needle, index + 1);
	}
	return index;
}

suite('isInsideComment', () => {
	test('flags a word inside a line comment', () => {
		const text = 'def run() {\n    // Bank is mentioned only in this comment\n}';
		assert.strictEqual(isInsideComment(text, offsetOf(text, 'Bank')), true);
	});

	test('does not flag code before a trailing comment, but flags the comment part', () => {
		const text = 'Bank.get(1) // Bank again';
		assert.strictEqual(isInsideComment(text, offsetOf(text, 'Bank')), false);
		assert.strictEqual(isInsideComment(text, offsetOf(text, 'Bank', 1)), true);
	});

	test('flags a word inside a multi-line block comment and Groovydoc', () => {
		const text = '/**\n * Loads a Bank by code.\n */\nBank load() {}';
		assert.strictEqual(isInsideComment(text, offsetOf(text, 'Bank')), true);
		assert.strictEqual(isInsideComment(text, offsetOf(text, 'Bank', 1)), false);
	});

	test('does not treat // or /* inside strings as comments', () => {
		const text = 'String url = "http://example.com/*"\nBank bank = Bank.get(1)';
		assert.strictEqual(isInsideComment(text, offsetOf(text, 'Bank')), false);
	});

	test('does not treat // inside a triple-quoted string as a comment', () => {
		const text = 'def sql = """\n    select * from bank // not a comment\n"""\nBank.get(1)';
		assert.strictEqual(isInsideComment(text, offsetOf(text, 'not')), false);
		assert.strictEqual(isInsideComment(text, offsetOf(text, 'Bank')), false);
	});
});

suite('isInsideDocLink', () => {
	test('flags the class name inside {@link ...}', () => {
		const line = ' * Delegates to {@link BankRepository} for lookups';
		assert.strictEqual(isInsideDocLink(line, line.indexOf('BankRepository')), true);
	});

	test('does not flag plain comment text outside the link', () => {
		const line = ' * Delegates to {@link BankRepository} for lookups';
		assert.strictEqual(isInsideDocLink(line, line.indexOf('lookups')), false);
	});
});

suite('isImportLine', () => {
	test('matches a plain import statement', () => {
		assert.strictEqual(isImportLine('import com.asaas.domain.receivableanticipationpartner.AnticipationPartnerSettlementItemPixTransaction'), true);
	});

	test('matches an indented import statement', () => {
		assert.strictEqual(isImportLine('    import com.asaas.Widget'), true);
	});

	test('does not match a line that merely contains the word import', () => {
		assert.strictEqual(isImportLine('def importantValue = 1'), false);
	});

	test('does not match an unrelated line', () => {
		assert.strictEqual(isImportLine('AnticipationPartnerSettlementItemPixTransaction.where {'), false);
	});
});

suite('maskNonCode', () => {
	test('blanks comments and string contents while keeping offsets and newlines', () => {
		const text = 'a("x") // c\n/* b */ d';
		const masked = maskNonCode(text);
		assert.strictEqual(masked.length, text.length);
		assert.strictEqual(masked, 'a(   )     \n        d');
	});

	test('keeps code inside GString interpolation', () => {
		const masked = maskNonCode('log.info "total: ${widgetService.activate(w)} done"');
		assert.ok(masked.includes('widgetService.activate(w)'));
		assert.ok(!masked.includes('total'));
		assert.ok(!masked.includes('done'));
	});

	test('handles apostrophes and escaped quotes inside strings', () => {
		const masked = maskNonCode(`"don't" + widgetService.activate(w) + 'a\\'' + other.run()`);
		assert.ok(masked.includes('widgetService.activate(w)'));
		assert.ok(masked.includes('other.run()'));
	});
});

suite('braceDepthAtLineStarts', () => {
	test('reports the brace depth at the start of each line', () => {
		const text = 'class A {\n    String name\n    def run() {\n        String local\n    }\n}';
		assert.deepStrictEqual(braceDepthAtLineStarts(maskNonCode(text)), [0, 1, 1, 2, 2, 1]);
	});

	test('ignores braces inside strings and comments', () => {
		const text = 'class A {\n    String s = "{" // }\n    String t\n}';
		assert.deepStrictEqual(braceDepthAtLineStarts(maskNonCode(text)), [0, 1, 1, 1]);
	});
});

suite('findWordMatches', () => {
	const word = 'AnticipationPartnerSettlementItemPixTransaction';

	test('skips a word inside a // comment', () => {
		assert.deepStrictEqual(findWordMatches(`// ${word} is unused now`, word), []);
	});

	test('finds real code before a trailing comment, but not the comment part', () => {
		assert.deepStrictEqual(findWordMatches(`${word}.where { } // ${word} legacy filter`, word), [{ line: 0, column: 0 }]);
	});

	test('skips a word inside a string literal, including after //', () => {
		assert.deepStrictEqual(findWordMatches(`String url = "http://example.com/${word}"`, word), []);
	});

	test('finds a word inside GString interpolation', () => {
		const text = `log.info "found \${${word}.count()}"`;
		assert.deepStrictEqual(findWordMatches(text, word), [{ line: 0, column: text.indexOf(`${word}.count`) }]);
	});

	test('skips import lines', () => {
		assert.deepStrictEqual(findWordMatches(`import com.asaas.${word}\n${word}.get(1)`, word), [{ line: 1, column: 0 }]);
	});

	test('scopes by receiver, accepting safe navigation', () => {
		const text = 'widgetService.save(w)\nwidgetService?.save(w)\norder.save()';
		assert.deepStrictEqual(findWordMatches(text, 'save', 'widgetService').map(match => match.line), [0, 1]);
	});
});
