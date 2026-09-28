import * as assert from 'assert';
import { extractCallSites, excludeDeclarationCallSites } from '../../groovy/call_site_extractor';
import { ParsedMethod } from '../../groovy/symbol_parser';

suite('call_site_extractor', () => {
	test('extracts a qualified call with its receiver', () => {
		const text = 'receivableAnticipationPartnerSettlementItemService.updateStatusInBatch(idList)';
		const records = extractCallSites(text, '/tmp/Widget.groovy');
		assert.strictEqual(records.length, 1);
		assert.strictEqual(records[0].methodName, 'updateStatusInBatch');
		assert.strictEqual(records[0].receiverName, 'receivableAnticipationPartnerSettlementItemService');
		assert.strictEqual(records[0].line, 0);
		assert.strictEqual(records[0].column, text.indexOf('updateStatusInBatch'));
	});

	test('extracts an unqualified call with no receiver', () => {
		const text = 'validateCommercialInfoUpdate(customerId, params)';
		const records = extractCallSites(text, '/tmp/Widget.groovy');
		assert.strictEqual(records.length, 1);
		assert.strictEqual(records[0].methodName, 'validateCommercialInfoUpdate');
		assert.strictEqual(records[0].receiverName, undefined);
	});

	test('tolerates whitespace around the dot', () => {
		const text = '   receivableAnticipationPartnerSettlementItemService  .  updateStatusInBatch(x)';
		const records = extractCallSites(text, '/tmp/Widget.groovy');
		assert.strictEqual(records.length, 1);
		assert.strictEqual(records[0].receiverName, 'receivableAnticipationPartnerSettlementItemService');
		assert.strictEqual(records[0].column, text.indexOf('updateStatusInBatch'));
	});

	test('skips calls inside string literals', () => {
		const text = '[logErrorMessage: "CustomerService.updateCommercialInfo >> Erro ao atualizar"]';
		const records = extractCallSites(text, '/tmp/Widget.groovy');
		assert.strictEqual(records.length, 0);
	});

	test('finds multiple call sites across lines', () => {
		const text = [
			'webhookRequestService.updateStatusInBatch(webhookProcessedIdList, WebhookRequestStatus.PROCESSED)',
			'webhookRequestService.updateStatusInBatch(webhookErrorIdList, WebhookRequestStatus.ERROR)'
		].join('\n');
		const records = extractCallSites(text, '/tmp/Widget.groovy');
		assert.strictEqual(records.length, 2);
		assert.strictEqual(records[0].line, 0);
		assert.strictEqual(records[1].line, 1);
	});

	test('does not choke on lines with unmatched parentheses', () => {
		const text = 'def x = (1 + 2)';
		const records = extractCallSites(text, '/tmp/Widget.groovy');
		assert.strictEqual(records.length, 0);
	});

	test('a method declaration is itself extracted as a call site with no receiver', () => {
		const text = 'public void updateItemAsPaid(ReceivableAnticipationPartnerSettlementItem settlementItem) {';
		const records = extractCallSites(text, '/tmp/Widget.groovy');
		assert.strictEqual(records.length, 1);
		assert.strictEqual(records[0].methodName, 'updateItemAsPaid');
		assert.strictEqual(records[0].receiverName, undefined);
	});

	test('extracts a receiver-qualified call using paren-less closure syntax', () => {
		const text = 'exists AnticipationPartnerSettlementItemPixTransaction.where {';
		const records = extractCallSites(text, '/tmp/Widget.groovy');
		assert.strictEqual(records.length, 1);
		assert.strictEqual(records[0].methodName, 'where');
		assert.strictEqual(records[0].receiverName, 'AnticipationPartnerSettlementItemPixTransaction');
	});

	test('ignores a bare identifier followed by { with no receiver', () => {
		const cases = ['} else {', 'try {', 'finally {', 'class Widget {'];
		for (const text of cases) {
			const records = extractCallSites(text, '/tmp/Widget.groovy');
			assert.strictEqual(records.length, 0, `expected no records for: ${text}`);
		}
	});
});

suite('excludeDeclarationCallSites', () => {
	test('removes the call site that matches a method declaration', () => {
		const text = 'public void updateItemAsPaid(ReceivableAnticipationPartnerSettlementItem settlementItem) {';
		const callSites = extractCallSites(text, '/tmp/Widget.groovy');
		const methods: ParsedMethod[] = [
			{ name: 'updateItemAsPaid', line: 0, column: text.indexOf('updateItemAsPaid'), classFqn: 'Widget', sourcePath: '/tmp/Widget.groovy' }
		];
		const filtered = excludeDeclarationCallSites(callSites, methods);
		assert.strictEqual(filtered.length, 0);
	});

	test('keeps a real call site with a receiver even if the method name matches a declaration', () => {
		const text = 'partnerSettlement.updateItemAsPaid(settlementItem)';
		const callSites = extractCallSites(text, '/tmp/Widget.groovy');
		const methods: ParsedMethod[] = [
			{ name: 'updateItemAsPaid', line: 0, column: text.indexOf('updateItemAsPaid'), classFqn: 'Widget', sourcePath: '/tmp/Widget.groovy' }
		];
		const filtered = excludeDeclarationCallSites(callSites, methods);
		assert.strictEqual(filtered.length, 1);
	});

	test('keeps a same-line recursive call while removing only the declaration itself', () => {
		const text = 'def fib(n) { return n <= 1 ? n : fib(n) }';
		const callSites = extractCallSites(text, '/tmp/Widget.groovy');
		const methods: ParsedMethod[] = [
			{ name: 'fib', line: 0, column: text.indexOf('fib'), classFqn: 'Widget', sourcePath: '/tmp/Widget.groovy' }
		];
		const filtered = excludeDeclarationCallSites(callSites, methods);
		assert.strictEqual(filtered.length, 1);
		assert.strictEqual(filtered[0].column, text.lastIndexOf('fib'));
	});

	test('keeps unrelated calls in other files untouched', () => {
		const text = 'validateCommercialInfoUpdate(customerId, params)';
		const callSites = extractCallSites(text, '/tmp/Other.groovy');
		const methods: ParsedMethod[] = [];
		const filtered = excludeDeclarationCallSites(callSites, methods);
		assert.strictEqual(filtered.length, 1);
	});
});
