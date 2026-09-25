import * as assert from 'assert';
import { extractCallSites } from '../../groovy/call_site_extractor';

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
});
