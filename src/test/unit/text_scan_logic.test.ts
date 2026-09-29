import * as assert from 'assert';
import { isImportLine, isInsideComment, isInsideDocLink, isInsideLineComment } from '../../groovy/text_scan_logic';

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

suite('isInsideLineComment', () => {
	test('flags text after a real // comment marker', () => {
		const line = '// AnticipationPartnerSettlementItemPixTransaction is unused now';
		const index = line.indexOf('AnticipationPartnerSettlementItemPixTransaction');
		assert.strictEqual(isInsideLineComment(line, index), true);
	});

	test('does not flag real code before a trailing comment', () => {
		const line = 'AnticipationPartnerSettlementItemPixTransaction.where { } // legacy filter';
		const index = line.indexOf('AnticipationPartnerSettlementItemPixTransaction');
		assert.strictEqual(isInsideLineComment(line, index), false);
	});

	test('does not treat // inside a string literal as a comment marker', () => {
		const line = 'String url = "http://example.com/AnticipationPartnerSettlementItemPixTransaction"';
		const index = line.lastIndexOf('AnticipationPartnerSettlementItemPixTransaction');
		assert.strictEqual(isInsideLineComment(line, index), false);
	});

	test('returns false for a line with no comment at all', () => {
		const line = 'AnticipationPartnerSettlementItemPixTransaction.where { }';
		const index = line.indexOf('AnticipationPartnerSettlementItemPixTransaction');
		assert.strictEqual(isInsideLineComment(line, index), false);
	});
});
