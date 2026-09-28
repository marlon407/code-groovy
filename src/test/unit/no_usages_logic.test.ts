import * as assert from 'assert';
import { findMethodsWithNoUsages, findClassesWithNoIndexedCallSite } from '../../groovy/no_usages_logic';
import { ParsedMethod, ParsedClassSymbol } from '../../groovy/symbol_parser';

function method(name: string, line = 0, column = 0): ParsedMethod {
	return { name, line, column, classFqn: 'Widget', sourcePath: '/tmp/Widget.groovy' };
}

function classSymbol(simpleName: string, line = 0, column = 0): ParsedClassSymbol {
	return {
		simpleName,
		fqn: simpleName,
		packageName: '',
		kind: 'class',
		line,
		column,
		extendsTypes: [],
		implementsTypes: [],
		sourcePath: '/tmp/Widget.groovy'
	};
}

suite('no_usages_logic', () => {
	test('flags a method with no call site anywhere in the index', () => {
		const methods = [method('updateItemAsPaid', 12, 13)];
		const hints = findMethodsWithNoUsages(methods, () => false);
		assert.strictEqual(hints.length, 1);
		assert.strictEqual(hints[0].name, 'updateItemAsPaid');
		assert.strictEqual(hints[0].line, 12);
		assert.strictEqual(hints[0].column, 13);
	});

	test('does not flag a method that has at least one call site', () => {
		const methods = [method('updateStatus')];
		const hints = findMethodsWithNoUsages(methods, () => true);
		assert.deepStrictEqual(hints, []);
	});

	test('checks each method independently', () => {
		const methods = [method('used'), method('unused')];
		const hints = findMethodsWithNoUsages(methods, methodName => methodName === 'used');
		assert.strictEqual(hints.length, 1);
		assert.strictEqual(hints[0].name, 'unused');
	});

	test('returns no hints when there are no declared methods', () => {
		assert.deepStrictEqual(findMethodsWithNoUsages([], () => false), []);
	});
});

suite('findClassesWithNoIndexedCallSite', () => {
	test('flags a class with no call site anywhere in the index', () => {
		const classes = [classSymbol('AnticipationPartnerSettlementItemPixTransaction', 10, 6)];
		const hints = findClassesWithNoIndexedCallSite(classes, () => false);
		assert.strictEqual(hints.length, 1);
		assert.strictEqual(hints[0].name, 'AnticipationPartnerSettlementItemPixTransaction');
		assert.strictEqual(hints[0].line, 10);
		assert.strictEqual(hints[0].column, 6);
	});

	test('does not flag a class that has at least one call site', () => {
		const classes = [classSymbol('Widget')];
		assert.deepStrictEqual(findClassesWithNoIndexedCallSite(classes, () => true), []);
	});

	test('checks each class independently', () => {
		const classes = [classSymbol('Used'), classSymbol('Unused')];
		const hints = findClassesWithNoIndexedCallSite(classes, name => name === 'Used');
		assert.strictEqual(hints.length, 1);
		assert.strictEqual(hints[0].name, 'Unused');
	});
});
