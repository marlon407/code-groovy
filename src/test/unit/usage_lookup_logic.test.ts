import * as assert from 'assert';
import { CallSiteIndexStore } from '../../groovy/call_site_index_store';
import { analyzeSource, excludeDeclarationCallSites } from '../../groovy/call_site_extractor';
import { parseDocumentSymbols } from '../../groovy/symbol_parser';
import { TypeHierarchyStore } from '../../groovy/type_hierarchy_store';
import {
	findDeclarationTarget,
	findReferenceTarget,
	grailsFieldNameForClass,
	resolveUsages
} from '../../groovy/usage_lookup_logic';

const WIDGET_SERVICE = '/tmp/WidgetService.groovy';

function buildIndex(files: Record<string, string>): CallSiteIndexStore {
	const index = new CallSiteIndexStore();
	const callSites = [];
	const methods = [];
	for (const [sourcePath, text] of Object.entries(files)) {
		const analysis = analyzeSource(text, sourcePath);
		callSites.push(...analysis.callSites);
		methods.push(...parseDocumentSymbols(text, sourcePath).methods);
		index.addTypeMentions(sourcePath, analysis.typeMentions);
	}
	index.add(excludeDeclarationCallSites(callSites, methods));
	return index;
}

function buildHierarchy(files: Record<string, string>): TypeHierarchyStore {
	const hierarchy = new TypeHierarchyStore();
	for (const [sourcePath, text] of Object.entries(files)) {
		const symbols = parseDocumentSymbols(text, sourcePath);
		hierarchy.add(symbols.classes, symbols.methods);
	}
	return hierarchy;
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
		'    static create(String name) {',
		'    }',
		'    private helper() {',
		'    }',
		'    public WidgetService(String name) {',
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
			className: 'WidgetService'
		});
	});

	test('detects methods declared with modifiers and no return type', () => {
		assert.strictEqual(findDeclarationTarget(source, WIDGET_SERVICE, 4, 'create')?.kind, 'method');
		assert.strictEqual(findDeclarationTarget(source, WIDGET_SERVICE, 6, 'helper')?.kind, 'method');
	});

	test('attributes methods after a nested type to the outer class', () => {
		const nested = [
			'class PaymentService {',
			'    static enum Kind { A, B }',
			'    def process(Long id) {',
			'    }',
			'}'
		].join('\n');
		assert.deepStrictEqual(findDeclarationTarget(nested, '/tmp/PaymentService.groovy', 2, 'process'), {
			kind: 'method',
			name: 'process',
			className: 'PaymentService'
		});
	});

	test('treats a constructor declaration as its class', () => {
		assert.deepStrictEqual(findDeclarationTarget(source, WIDGET_SERVICE, 8, 'WidgetService'), { kind: 'class', name: 'WidgetService' });
	});

	test('returns nothing for a call that is not a declaration', () => {
		assert.strictEqual(findDeclarationTarget(source, WIDGET_SERVICE, 2, 'save'), undefined);
	});
});

suite('findReferenceTarget', () => {
	const source = [
		'class WidgetController {',
		'    def show(Widget item) {',
		'        widgetService.rename(1L)',
		'        this.render(view)',
		'        audit(id)',
		'        Widget widget = Widget.get(id)',
		'        println widget',
		'        item.touch()',
		'    }',
		'}'
	].join('\n');
	const controller = '/tmp/WidgetController.groovy';
	const lines = source.split('\n');

	function targetAt(line: number, word: string, occurrence: 'first' | 'last' = 'first') {
		const start = occurrence === 'first' ? lines[line].indexOf(word) : lines[line].lastIndexOf(word);
		return findReferenceTarget(source, controller, line, start, word);
	}

	test('resolves a service bean receiver to its class', () => {
		assert.deepStrictEqual(targetAt(2, 'rename'), { kind: 'method', name: 'rename', className: 'WidgetService' });
	});

	test('resolves a typed receiver to its declared class', () => {
		assert.deepStrictEqual(targetAt(7, 'touch'), { kind: 'method', name: 'touch', className: 'Widget' });
	});

	test('treats this.method() and bare calls as calls on the owning class', () => {
		assert.deepStrictEqual(targetAt(3, 'render'), { kind: 'method', name: 'render', className: 'WidgetController' });
		assert.deepStrictEqual(targetAt(4, 'audit'), { kind: 'method', name: 'audit', className: 'WidgetController' });
	});

	test('treats a capitalized word as a class', () => {
		assert.deepStrictEqual(targetAt(5, 'Widget', 'last'), { kind: 'class', name: 'Widget' });
	});

	test('returns nothing for a plain variable', () => {
		assert.strictEqual(targetAt(6, 'widget', 'last'), undefined);
	});
});

suite('resolveUsages — methods', () => {
	const target = { kind: 'method' as const, name: 'rename', className: 'WidgetService' };

	test('keeps callers through the Grails field name plus calls inside the declaring class', () => {
		const index = buildIndex({
			'/tmp/WidgetController.groovy': 'widgetService.rename(1L)\nwidgetService?.rename(2L)',
			'/tmp/OtherController.groovy': 'otherService.rename(3L)',
			[WIDGET_SERVICE]: 'def bulk() {\n    rename(4L)\n    this.rename(5L)\n}'
		});
		const resolution = resolveUsages(target, index, 'navigate');
		assert.deepStrictEqual(describe(resolution.records), [
			'/tmp/WidgetController.groovy:0',
			'/tmp/WidgetController.groovy:1',
			`${WIDGET_SERVICE}:1`,
			`${WIDGET_SERVICE}:2`
		]);
		assert.deepStrictEqual(resolution.textScans, []);
	});

	test('keeps static calls and calls through variables typed with the class, next to internal calls', () => {
		const index = buildIndex({
			'/tmp/Widget.groovy': 'class Widget {\n    static build(String name) {\n    }\n    def copy() {\n        build(name)\n    }\n}',
			'/tmp/Factory.groovy': 'Widget.build("a")\ndef make(Widget w) {\n    w.build("b")\n}\ndef other(Order w) {\n    w.build("c")\n}'
		});
		const resolution = resolveUsages({ kind: 'method', name: 'build', className: 'Widget' }, index, 'navigate');
		assert.deepStrictEqual(describe(resolution.records), ['/tmp/Factory.groovy:0', '/tmp/Factory.groovy:2', '/tmp/Widget.groovy:4']);
	});

	test('returns nothing instead of unrelated same-named calls when no call is scoped', () => {
		const index = buildIndex({ '/tmp/Order.groovy': 'order.save(flush: true)\ncustomer.save()' });
		const resolution = resolveUsages({ kind: 'method', name: 'save', className: 'WidgetService' }, index, 'navigate');
		assert.deepStrictEqual(resolution.records, []);
		assert.deepStrictEqual(resolution.textScans, []);
	});

	test('decides by the declared type when there is one, even if the variable is named like the class field', () => {
		const index = buildIndex({
			'/tmp/Caller.groovy': 'class Caller {\n    def run() {\n        CustomerDTO payment = build()\n        payment.confirm()\n        payment2.confirm()\n    }\n}',
			'/tmp/Other.groovy': 'class Other {\n    def run() {\n        payment.confirm()\n    }\n}'
		});
		const resolution = resolveUsages({ kind: 'method', name: 'confirm', className: 'Payment' }, index, 'navigate');
		assert.deepStrictEqual(describe(resolution.records), ['/tmp/Other.groovy:2']);
	});

	test('does not count the end of a call chain as a call inside the file class', () => {
		const index = buildIndex({
			'/tmp/Customer.groovy': 'class Customer {\n    def run() {\n        Payment.findAll().confirm()\n        confirm()\n    }\n}'
		});
		const resolution = resolveUsages({ kind: 'method', name: 'confirm', className: 'Customer' }, index, 'navigate');
		assert.deepStrictEqual(describe(resolution.records), ['/tmp/Customer.groovy:3']);
	});

	test('asks for a scoped text scan only while the index is not ready', () => {
		const empty = new CallSiteIndexStore();
		assert.deepStrictEqual(resolveUsages(target, empty, 'navigate').textScans, [{ receiverFieldName: 'widgetService' }]);
		empty.add([]);
		assert.deepStrictEqual(resolveUsages(target, empty, 'navigate').textScans, []);
	});
});

suite('resolveUsages — classes', () => {
	const index = buildIndex({
		'/tmp/A.groovy': 'Widget.get(1)\nWidget.where { name == x }\nnew Widget(name: x)',
		'/tmp/B.groovy': 'widgetService.rename(1L)',
		'/tmp/C.groovy': 'class Report {\n    Invoice invoice\n}',
		'/tmp/D.groovy': 'import com.x.Invoice\n// Invoice mentioned only here'
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

	test('scans only the files that mention a class used only as a type, ignoring imports and comments', () => {
		const resolution = resolveUsages({ kind: 'class', name: 'Invoice' }, index, 'navigate');
		assert.deepStrictEqual(resolution.records, []);
		assert.deepStrictEqual(resolution.textScans, [{ files: ['/tmp/C.groovy'] }]);
	});

	test('skips the text scan entirely when no file mentions the class', () => {
		assert.deepStrictEqual(resolveUsages({ kind: 'class', name: 'Orphan' }, index, 'navigate').textScans, []);
	});

	test('scans the mentioning files for Find All References, to include type references', () => {
		assert.deepStrictEqual(resolveUsages({ kind: 'class', name: 'Widget' }, index, 'references').textScans, [{ files: ['/tmp/A.groovy'] }]);
	});
});

suite('resolveUsages — type hierarchy', () => {
	const files: Record<string, string> = {
		'/tmp/CronJob.groovy': [
			'trait CronJob {',
			'    public static Boolean isActive() {',
			'        CronJob jobInstance = this.newInstance()',
			'        return jobInstance.allowedEnvironments().contains(1)',
			'    }',
			'    public void execute() {',
			'        task()',
			'    }',
			'    public abstract void task()',
			'    public abstract List<String> allowedEnvironments()',
			'    public abstract List<String> listExecutionExpression()',
			'}'
		].join('\n'),
		'/tmp/ExpiredJob.groovy': [
			'class ExpiredJob implements CronJob {',
			'    @Override',
			'    void task() {',
			'    }',
			'    @Override',
			'    List<String> allowedEnvironments() {',
			'        return []',
			'    }',
			'    @Override',
			'    List<String> listExecutionExpression() {',
			'        return []',
			'    }',
			'}'
		].join('\n'),
		'/tmp/UnrelatedService.groovy': 'class UnrelatedService {\n    void task() {\n    }\n    void run() {\n        task()\n    }\n}',
		'/tmp/BaseService.groovy': 'class BaseService {\n    void audit(String message) {\n    }\n}',
		'/tmp/ChildService.groovy': 'class ChildService extends BaseService {\n    void run() {\n        audit("x")\n        super.audit("y")\n    }\n}',
		'/tmp/Caller.groovy': 'class Caller {\n    def childService\n    def run() {\n        childService.audit("z")\n    }\n}'
	};
	const index = buildIndex(files);
	const hierarchy = buildHierarchy(files);

	test('an overriding method includes calls made through the trait that declares it', () => {
		const task = resolveUsages({ kind: 'method', name: 'task', className: 'ExpiredJob' }, index, 'navigate', hierarchy);
		assert.deepStrictEqual(describe(task.records), ['/tmp/CronJob.groovy:6']);
		const environments = resolveUsages({ kind: 'method', name: 'allowedEnvironments', className: 'ExpiredJob' }, index, 'navigate', hierarchy);
		assert.deepStrictEqual(describe(environments.records), ['/tmp/CronJob.groovy:3']);
	});

	test('an inherited method includes calls from subclasses, through super and through subclass fields', () => {
		const resolution = resolveUsages({ kind: 'method', name: 'audit', className: 'BaseService' }, index, 'navigate', hierarchy);
		assert.deepStrictEqual(describe(resolution.records), ['/tmp/Caller.groovy:3', '/tmp/ChildService.groovy:2', '/tmp/ChildService.groovy:3']);
	});

	test('falls back to the declaration in the supertype when nothing calls the method', () => {
		const resolution = resolveUsages({ kind: 'method', name: 'listExecutionExpression', className: 'ExpiredJob' }, index, 'navigate', hierarchy);
		assert.deepStrictEqual(resolution.records, []);
		assert.deepStrictEqual(resolution.superDeclarations, [{ sourcePath: '/tmp/CronJob.groovy', line: 10, column: files['/tmp/CronJob.groovy'].split('\n')[10].indexOf('listExecutionExpression') }]);
	});

	test('keeps the scope to the class itself without a hierarchy', () => {
		const resolution = resolveUsages({ kind: 'method', name: 'task', className: 'ExpiredJob' }, index, 'navigate');
		assert.deepStrictEqual(resolution.records, []);
		assert.deepStrictEqual(resolution.superDeclarations, []);
	});
});

suite('TypeHierarchyStore', () => {
	test('walks ancestors and descendants transitively and survives cycles', () => {
		const hierarchy = new TypeHierarchyStore();
		hierarchy.add([
			{ simpleName: 'C', extendsTypes: ['B'] },
			{ simpleName: 'B', extendsTypes: ['A'], implementsTypes: ['Marker'] },
			{ simpleName: 'A', extendsTypes: ['C'] }
		], []);
		assert.deepStrictEqual(hierarchy.ancestorsOf('C').sort(), ['A', 'B', 'Marker']);
		assert.deepStrictEqual(hierarchy.descendantsOf('Marker').sort(), ['A', 'B', 'C']);
	});
});
