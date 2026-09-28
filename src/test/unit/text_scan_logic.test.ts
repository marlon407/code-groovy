import * as assert from 'assert';
import { isImportLine, isInsideLineComment } from '../../groovy/text_scan_logic';

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
