import * as assert from 'assert';
import { CallSiteIndexStore } from '../../groovy/call_site_index_store';
import { extractCallSites } from '../../groovy/call_site_extractor';
import {
	findDeclarationTarget,
	findReferenceTarget,
	grailsFieldNameForClass,
	resolveUsages
} from '../../groovy/usage_lookup_logic';

const WIDGET_SERVICE = '/tmp/WidgetService.groovy';

function buildIndex(files: Record<string, string>): CallSiteIndexStore {
	const index = new CallSiteIndexStore();
	index.add(Object.entries(files).flatMap(([sourcePath, text]) => extractCallSites(text, sourcePath)));
	return index;
}

function describe(records: Array<{ sourcePath: string; line: number }>): string[] {
	return records.map(record => `${record.sourcePath}:${record.line}`).sort();
}

suite('grailsFieldNameForClass', () => {
	test('lowercases the first letter', () => {
		assert.strictEqual(grailsFieldNameForClass('WidgetService'), 'widgetService');
	});

	test('keeps names starting with an acronym as-is, like Spring bean naming', () => {
		assert.strictEqual(grailsFieldNameForClass('URLService'), 'URLService');
	});

	test('handles a single-letter name', () => {
		assert.strictEqual(grailsFieldNameForClass('A'), 'a');
	});
});

suite('findDeclarationTarget', () => {
	const source = [
		'class WidgetService {',
		'    Map<String, Object> rename(Long id) {',
		'        widget.save(flush: true)',
		'    }',
		'}'
	].join('\n');

	test('detects a class declaration', () => {
		assert.deepStrictEqual(findDeclarationTarget(source, WIDGET_SERVICE, 0, 'WidgetService'), { kind: 'class', name: 'WidgetService' });
	});

	test('detects a method declaration with a generic return type', () => {
		assert.deepStrictEqual(findDeclarationTarget(source, WIDGET_SERVICE, 1, 'rename'), {
			kind: 'method',
			name: 'rename',
			receiverName: 'widgetService',
			sourcePath: WIDGET_SERVICE
		});
	});

	test('returns nothing for a call that is not a declaration', () => {
		assert.strictEqual(findDeclarationTarget(source, WIDGET_SERVICE, 2, 'save'), undefined);
	});
});

suite('findReferenceTarget', () => {
	const source = [
		'class WidgetController {',
		'    def show() {',
		'        widgetService.rename(1L)',
		'        this.render(view)',
		'        audit(id)',
		'        Widget widget = Widget.get(id)',
		'        println widget',
		'    }',
		'}'
	].join('\n');
	const controller = '/tmp/WidgetController.groovy';
	const lines = source.split('\n');

	function targetAt(line: number, word: string, occurrence: 'first' | 'last' = 'first') {
		const start = occurrence === 'first' ? lines[line].indexOf(word) : lines[line].lastIndexOf(word);
		return findReferenceTarget(source, controller, line, start, word);
	}

	test('scopes a qualified call by its receiver', () => {
		assert.deepStrictEqual(targetAt(2, 'rename'), { kind: 'method', name: 'rename', receiverName: 'widgetService' });
	});

	test('treats this.method() as a call on the owning class', () => {
		assert.deepStrictEqual(targetAt(3, 'render'), {
			kind: 'method',
			name: 'render',
			receiverName: 'widgetController',
			sourcePath: controller
		});
	});

	test('treats a bare call as a call on the owning class', () => {
		assert.deepStrictEqual(targetAt(4, 'audit'), {
			kind: 'method',
			name: 'audit',
			receiverName: 'widgetController',
			sourcePath: controller
		});
	});

	test('treats a capitalized word as a class', () => {
		assert.deepStrictEqual(targetAt(5, 'Widget', 'last'), { kind: 'class', name: 'Widget' });
	});

	test('returns nothing for a plain variable', () => {
		assert.strictEqual(targetAt(6, 'widget', 'last'), undefined);
	});
});

suite('resolveUsages — methods', () => {
	const files = {
		'/tmp/WidgetController.groovy': 'widgetService.rename(1L)\nwidgetService?.rename(2L)',
		'/tmp/OtherController.groovy': 'otherService.rename(3L)',
		[WIDGET_SERVICE]: 'def bulk() {\n    rename(4L)\n    this.rename(5L)\n}'
	};
	const index = buildIndex(files);

	test('keeps only callers through the Grails field name plus calls inside the declaring class', () => {
		const resolution = resolveUsages({ kind: 'method', name: 'rename', receiverName: 'widgetService', sourcePath: WIDGET_SERVICE }, index, 'navigate');
		assert.deepStrictEqual(describe(resolution.records), [
			'/tmp/WidgetController.groovy:0',
			'/tmp/WidgetController.groovy:1',
			`${WIDGET_SERVICE}:1`,
			`${WIDGET_SERVICE}:2`
		]);
		assert.deepStrictEqual(resolution.textScans, []);
	});

	test('uses calls inside the declaring class when there is no external caller', () => {
		const internalOnly = buildIndex({
			[WIDGET_SERVICE]: 'def bulk() {\n    validate(1L)\n}',
			'/tmp/Order.groovy': 'order.validate()'
		});
		const resolution = resolveUsages({ kind: 'method', name: 'validate', receiverName: 'widgetService', sourcePath: WIDGET_SERVICE }, internalOnly, 'navigate');
		assert.deepStrictEqual(describe(resolution.records), [`${WIDGET_SERVICE}:1`]);
	});

	test('falls back to every same-named call only when nothing is scoped', () => {
		const resolution = resolveUsages({ kind: 'method', name: 'rename', receiverName: 'missingService', sourcePath: '/tmp/Missing.groovy' }, index, 'navigate');
		assert.strictEqual(resolution.records.length, 5);
	});

	test('asks for a text scan only while the index is not ready', () => {
		const empty = new CallSiteIndexStore();
		const target = { kind: 'method' as const, name: 'rename', receiverName: 'widgetService', sourcePath: WIDGET_SERVICE };
		assert.deepStrictEqual(resolveUsages(target, empty, 'navigate').textScans, [{ receiverFieldName: 'widgetService' }, {}]);
		empty.add([]);
		assert.deepStrictEqual(resolveUsages(target, empty, 'navigate').textScans, []);
	});
});

suite('resolveUsages — classes', () => {
	const index = buildIndex({
		'/tmp/A.groovy': 'Widget.get(1)\nWidget.where { name == x }\nnew Widget(name: x)',
		'/tmp/B.groovy': 'widgetService.rename(1L)'
	});

	test('combines static/closure calls and constructor calls', () => {
		const resolution = resolveUsages({ kind: 'class', name: 'Widget' }, index, 'navigate');
		assert.deepStrictEqual(describe(resolution.records), ['/tmp/A.groovy:0', '/tmp/A.groovy:1', '/tmp/A.groovy:2']);
		assert.deepStrictEqual(resolution.textScans, []);
	});

	test('recognizes untyped service injection through the Grails field name', () => {
		const resolution = resolveUsages({ kind: 'class', name: 'WidgetService' }, index, 'navigate');
		assert.deepStrictEqual(describe(resolution.records), ['/tmp/B.groovy:0']);
	});

	test('scans text when a class has no call site, since it may be used only as a type', () => {
		const resolution = resolveUsages({ kind: 'class', name: 'Invoice' }, index, 'navigate');
		assert.deepStrictEqual(resolution.records, []);
		assert.deepStrictEqual(resolution.textScans, [{}]);
	});

	test('always scans text for Find All References, to include type references', () => {
		assert.deepStrictEqual(resolveUsages({ kind: 'class', name: 'Widget' }, index, 'references').textScans, [{}]);
	});
});
