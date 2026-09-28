import * as assert from 'assert';
import { CallSiteIndexStore } from '../../groovy/call_site_index_store';
import { CallSiteRecord } from '../../groovy/call_site_extractor';

function record(methodName: string, receiverName?: string): CallSiteRecord {
	return { methodName, receiverName, sourcePath: '/tmp/Widget.groovy', line: 0, column: 0 };
}

suite('call_site_index_store', () => {
	test('is not ready before add() has been called', () => {
		const store = new CallSiteIndexStore();
		assert.strictEqual(store.isReady(), false);
	});

	test('becomes ready after add(), even with zero records', () => {
		const store = new CallSiteIndexStore();
		store.add([]);
		assert.strictEqual(store.isReady(), true);
	});

	test('stays ready after clear()', () => {
		const store = new CallSiteIndexStore();
		store.add([record('foo')]);
		store.clear();
		assert.strictEqual(store.isReady(), true);
	});

	test('lookup filters by receiver when provided', () => {
		const store = new CallSiteIndexStore();
		store.add([record('save', 'partnerSettlement'), record('save', 'otherService')]);
		const scoped = store.lookup('save', 'partnerSettlement');
		assert.strictEqual(scoped.length, 1);
		assert.strictEqual(scoped[0].receiverName, 'partnerSettlement');
	});

	test('lookup without a receiver returns every match', () => {
		const store = new CallSiteIndexStore();
		store.add([record('save', 'partnerSettlement'), record('save', 'otherService')]);
		assert.strictEqual(store.lookup('save').length, 2);
	});
});
