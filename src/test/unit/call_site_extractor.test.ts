import * as assert from 'assert';
import { CHAINED_RECEIVER, extractCallSites, excludeDeclarationCallSites, resolveReceiverType } from '../../groovy/call_site_extractor';
import { ParsedMethod, parseDocumentSymbols } from '../../groovy/symbol_parser';

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

	test('keeps the receiver of a safe-navigation call', () => {
		const text = 'widgetService?.save(widget)';
		const records = extractCallSites(text, '/tmp/Widget.groovy');
		assert.strictEqual(records.length, 1);
		assert.strictEqual(records[0].methodName, 'save');
		assert.strictEqual(records[0].receiverName, 'widgetService');
		assert.strictEqual(records[0].column, text.indexOf('save'));
	});

	test('keeps the receiver of a spread call', () => {
		const records = extractCallSites('widgets*.rename(value)', '/tmp/Widget.groovy');
		assert.strictEqual(records.length, 1);
		assert.strictEqual(records[0].methodName, 'rename');
		assert.strictEqual(records[0].receiverName, 'widgets');
	});

	test('does not index calls inside comments or Groovydoc', () => {
		const text = [
			'// widgetService.activate(w)',
			'/* widgetService.activate(w) */',
			'/**',
			' * Calls widgetService.activate(w)',
			' */'
		].join('\n');
		assert.deepStrictEqual(extractCallSites(text, '/tmp/Widget.groovy'), []);
	});

	test('indexes calls inside GString interpolation and after strings with apostrophes', () => {
		const text = [
			'log.info "total: ${widgetService.activate(w)}"',
			`"don't" + widgetService.activate(w)`
		].join('\n');
		const records = extractCallSites(text, '/tmp/Widget.groovy').filter(record => record.methodName === 'activate');
		assert.deepStrictEqual(records.map(record => `${record.receiverName}@${record.line}`), ['widgetService@0', 'widgetService@1']);
	});

	test('records the declared type of a typed receiver, using the nearest declaration', () => {
		const text = [
			'def first(Order item) {',
			'    item.save()',
			'}',
			'def second(Widget item) {',
			'    item.save()',
			'    def other = new Widget()',
			'    other.save()',
			'}'
		].join('\n');
		const saves = extractCallSites(text, '/tmp/Widget.groovy').filter(record => record.methodName === 'save');
		assert.deepStrictEqual(saves.map(record => record.receiverType), ['Order', 'Widget', 'Widget']);
	});

	test('limits a declared receiver type to the enclosing method', () => {
		const text = [
			'class Caller {',
			'    def first(Customer entity) {',
			'        entity.confirm()',
			'    }',
			'    def second() {',
			'        def entity = Payment.get(1)',
			'        entity.confirm()',
			'    }',
			'    def third() {',
			'        entity.confirm()',
			'    }',
			'}'
		].join('\n');
		const confirms = extractCallSites(text, '/tmp/Caller.groovy').filter(record => record.methodName === 'confirm');
		assert.deepStrictEqual(confirms.map(record => record.receiverType), ['Customer', 'Payment', undefined]);
	});

	test('records the type of for-in and for-colon loop variables', () => {
		const text = [
			'def run(List items) {',
			'    for (Payment payment in items) {',
			'        payment.confirm()',
			'    }',
			'    for (Customer customer : items) {',
			'        customer.confirm()',
			'    }',
			'}'
		].join('\n');
		const confirms = extractCallSites(text, '/tmp/Caller.groovy').filter(record => record.methodName === 'confirm');
		assert.deepStrictEqual(confirms.map(record => record.receiverType), ['Payment', 'Customer']);
	});

	test('keeps parameter types from multi-line signatures and Allman braces', () => {
		const text = [
			'class Caller {',
			'    Payment payer',
			'    void run(Customer payer,',
			'            Boolean flag) {',
			'        payer.save()',
			'    }',
			'    void other(Order order)',
			'    {',
			'        order.save()',
			'    }',
			'}'
		].join('\n');
		const saves = extractCallSites(text, '/tmp/Caller.groovy').filter(record => record.methodName === 'save');
		assert.deepStrictEqual(saves.map(record => record.receiverType), ['Customer', 'Order']);
	});

	test('does not treat a parameter on its own line as a class field', () => {
		const text = [
			'class Caller {',
			'    void a(Long id,',
			'           Payment item',
			'    ) {',
			'    }',
			'    void b(item) {',
			'        item.save()',
			'    }',
			'    static class Inner {',
			'        def paymentService',
			'        void c() {',
			'            paymentService.pay()',
			'        }',
			'    }',
			'}'
		].join('\n');
		const records = extractCallSites(text, '/tmp/Caller.groovy');
		assert.strictEqual(records.find(record => record.methodName === 'save')?.receiverType, undefined);
		assert.strictEqual(records.find(record => record.methodName === 'pay')?.receiverType, 'PaymentService');
	});

	test('an untyped def or closure parameter hides an earlier typed declaration', () => {
		const text = [
			'def run(Customer entity) {',
			'    def other = build()',
			'    Customer other2 = null',
			'    list.each { other2 -> other2.confirm() }',
			'}'
		].join('\n');
		const confirm = extractCallSites(text, '/tmp/Caller.groovy').find(record => record.methodName === 'confirm');
		assert.strictEqual(confirm?.receiverType, undefined);
		assert.strictEqual(resolveReceiverType(text, 1, 'other'), undefined);
	});

	test('uses the type of a class-level field declared after the method', () => {
		const text = [
			'class Caller {',
			'    def run() {',
			'        gateway.send()',
			'    }',
			'    PaymentGateway gateway',
			'}'
		].join('\n');
		assert.strictEqual(extractCallSites(text, '/tmp/Caller.groovy').find(record => record.methodName === 'send')?.receiverType, 'PaymentGateway');
	});

	test('marks the end of a call chain with an opaque receiver instead of no receiver', () => {
		const text = [
			'Payment.findAll().confirm()',
			'items[0].confirm()',
			'order.customer.confirm()'
		].join('\n');
		const confirms = extractCallSites(text, '/tmp/Customer.groovy').filter(record => record.methodName === 'confirm');
		assert.deepStrictEqual(confirms.map(record => record.receiverName), [CHAINED_RECEIVER, CHAINED_RECEIVER, 'customer']);
	});

	test('keeps the receiver of a call continued on the next line', () => {
		const text = ['paymentService', '    .process(2)', 'paymentService?.', '    process(3)'].join('\n');
		const records = extractCallSites(text, '/tmp/Caller.groovy').filter(record => record.methodName === 'process');
		assert.deepStrictEqual(records.map(record => `${record.receiverName}@${record.line}`), ['paymentService@1', 'paymentService@3']);
	});

	test('records the owning class, going back to the outer class after a nested type', () => {
		const text = [
			'class PaymentService {',
			'    static enum Kind { A, B }',
			'    def process() {',
			'        helper()',
			'    }',
			'    static class Item {',
			'        def touch() { helper() }',
			'    }',
			'    def helper() {}',
			'}'
		].join('\n');
		const helpers = extractCallSites(text, '/tmp/PaymentService.groovy').filter(record => record.methodName === 'helper' && record.line !== 8);
		assert.deepStrictEqual(helpers.map(record => `${record.ownerClass}@${record.line}`), ['PaymentService@3', 'Item@6']);
	});

	test('records the root type and path of a receiver chain instead of typing its last segment', () => {
		const text = [
			'class Caller {',
			'    def run(Order order, Customer status) {',
			'        order.status?.isFinished()',
			'        Status.PAID.isFinished()',
			'        this.order.buyer.isFinished()',
			'        foo().status.isFinished()',
			'    }',
			'}'
		].join('\n');
		const records = extractCallSites(text, '/tmp/Caller.groovy').filter(record => record.methodName === 'isFinished');
		assert.deepStrictEqual(records.map(record => [record.receiverRootType, record.receiverPath, record.receiverType]), [
			['Order', ['status'], undefined],
			['Status', ['PAID'], undefined],
			['Caller', ['order', 'buyer'], undefined],
			[undefined, undefined, undefined]
		]);
	});

	test('does not index control-flow keywords as calls', () => {
		const cases = ['if (x) {', 'for (item in list) {', 'while (running) {', 'switch (kind) {', '} catch (Exception e) {', 'return (a + b)'];
		for (const text of cases) {
			const records = extractCallSites(text, '/tmp/Widget.groovy');
			assert.deepStrictEqual(records.map(record => record.methodName), [], `expected no records for: ${text}`);
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

	test('removes declarations with generic/array return types and same-line annotations', () => {
		const text = [
			'class WidgetService {',
			'    Map<String, List<Widget>> groupByName(Long id) {',
			'    String[] names() {',
			'    @Transactional(readOnly = true) def load() {',
			'}'
		].join('\n');
		const sourcePath = '/tmp/WidgetService.groovy';
		const methods = parseDocumentSymbols(text, sourcePath).methods;
		const filtered = excludeDeclarationCallSites(extractCallSites(text, sourcePath), methods);
		assert.deepStrictEqual(filtered.map(record => record.methodName), []);
	});

	test('keeps a call after return, which is not a declaration', () => {
		const text = [
			'class WidgetService {',
			'    def build() {',
			'        return rename(value)',
			'    }',
			'}'
		].join('\n');
		const sourcePath = '/tmp/WidgetService.groovy';
		const methods = parseDocumentSymbols(text, sourcePath).methods;
		const filtered = excludeDeclarationCallSites(extractCallSites(text, sourcePath), methods);
		assert.deepStrictEqual(filtered.map(record => `${record.methodName}@${record.line}`), ['rename@2']);
	});

	test('keeps unrelated calls in other files untouched', () => {
		const text = 'validateCommercialInfoUpdate(customerId, params)';
		const callSites = extractCallSites(text, '/tmp/Other.groovy');
		const methods: ParsedMethod[] = [];
		const filtered = excludeDeclarationCallSites(callSites, methods);
		assert.strictEqual(filtered.length, 1);
	});
});

suite('parseDocumentSymbols — masked source', () => {
	test('ignores declarations inside strings and reads qualified or generic supertypes', () => {
		const text = [
			'class Report extends com.acme.BaseReport<Map<String, Long>> implements Serializable, java.io.Closeable {',
			'    String sql = """',
			'        SELECT SUM(value)',
			'        class Fake {',
			'    """',
			'    void close() {',
			'    }',
			'}'
		].join('\n');
		const symbols = parseDocumentSymbols(text, '/tmp/Report.groovy');
		assert.deepStrictEqual(symbols.classes.map(cls => cls.simpleName), ['Report']);
		assert.deepStrictEqual(symbols.methods.map(method => `${method.name}@${method.classFqn}`), ['close@Report']);
		assert.deepStrictEqual(symbols.classes[0].extendsTypes, ['com.acme.BaseReport']);
		assert.deepStrictEqual(symbols.classes[0].implementsTypes, ['Serializable', 'java.io.Closeable']);
	});
});

suite('parseDocumentSymbols — modifiers', () => {
	test('recognizes a declaration with only static and synchronized modifiers', () => {
		const symbols = parseDocumentSymbols('class Holder {\n    public static synchronized getInstance() {\n    }\n}', '/tmp/Holder.groovy');
		assert.deepStrictEqual(symbols.methods.map(method => method.name), ['getInstance']);
	});
});

suite('parseDocumentSymbols — enums', () => {
	test('reads annotated constants, constants on the enum line and constants with bodies', () => {
		const text = [
			'enum Status {',
			'    @Deprecated PENDING,',
			'    @Deprecated',
			'    CREDITED(1, "a,b"),',
			'    REFUNDED {',
			'        String label() { "x" }',
			'    }',
			'    Status() {}',
			'    Status(Integer code, String name) {}',
			'}',
			'enum Kind { A, B }'
		].join('\n');
		const symbols = parseDocumentSymbols(text, '/tmp/Status.groovy');
		assert.deepStrictEqual(symbols.enumConstants.map(constant => `${constant.name}@${constant.line}:${constant.argumentCount}`), [
			'PENDING@1:0', 'CREDITED@3:2', 'REFUNDED@4:0', 'A@10:0', 'B@10:0'
		]);
		assert.deepStrictEqual(symbols.constructors.map(constructor => `${constructor.line}:${constructor.parameterCount}`), ['7:0', '8:2']);
	});
});
