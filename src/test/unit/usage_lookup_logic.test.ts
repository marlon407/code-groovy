import * as assert from 'assert';
import { CallSiteIndexStore } from '../../groovy/call_site_index_store';
import { analyzeSource, excludeDeclarationCallSites } from '../../groovy/call_site_extractor';
import { parseDocumentSymbols } from '../../groovy/symbol_parser';
import { parseImports, TypeHierarchyStore } from '../../groovy/type_hierarchy_store';
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
		hierarchy.add(
			symbols.classes,
			symbols.methods,
			parseImports(text),
			symbols.fields.filter(field => field.classMember).map(field => ({ classFqn: field.classFqn, name: field.name, typeName: field.typeName })),
			symbols.enumConstants.map(constant => ({ classFqn: constant.enumFqn, name: constant.name }))
		);
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
			className: 'WidgetService',
			classFqn: 'WidgetService'
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
			className: 'PaymentService',
			classFqn: 'PaymentService'
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

suite('resolveUsages — homonyms and overrides', () => {
	const files: Record<string, string> = {
		'/tmp/a/BaseDto.groovy': 'package a\nclass BaseDto {\n    Map toMap() {\n        [:]\n    }\n}',
		'/tmp/b/BaseDto.groovy': 'package b\nclass BaseDto {\n    Map toMap() {\n        [:]\n    }\n}',
		'/tmp/a/OrderDto.groovy': 'package a\nclass OrderDto extends BaseDto {\n}',
		'/tmp/c/PixDto.groovy': 'package c\nimport b.BaseDto\nclass PixDto extends BaseDto {\n}',
		'/tmp/a/CustomDto.groovy': 'package a\nclass CustomDto extends BaseDto {\n    Map toMap() {\n        super.toMap()\n    }\n}',
		'/tmp/a/Caller.groovy': [
			'package a',
			'class Caller {',
			'    def run(OrderDto order, PixDto pix, CustomDto custom) {',
			'        order.toMap()',
			'        pix.toMap()',
			'        custom.toMap()',
			'    }',
			'}'
		].join('\n')
	};
	const index = buildIndex(files);
	const hierarchy = buildHierarchy(files);

	test('follows only the subclasses of the base class in the right package', () => {
		const resolution = resolveUsages({ kind: 'method', name: 'toMap', className: 'BaseDto', classFqn: 'a.BaseDto' }, index, 'navigate', hierarchy);
		assert.deepStrictEqual(describe(resolution.records), ['/tmp/a/Caller.groovy:3', '/tmp/a/CustomDto.groovy:3']);
	});

	test('attributes calls on a subclass that overrides the method to the override, not its own super call', () => {
		const override = resolveUsages({ kind: 'method', name: 'toMap', className: 'CustomDto', classFqn: 'a.CustomDto' }, index, 'navigate', hierarchy);
		assert.deepStrictEqual(describe(override.records), ['/tmp/a/Caller.groovy:5']);
	});

	test('resolves the other homonym through its import', () => {
		const resolution = resolveUsages({ kind: 'method', name: 'toMap', className: 'BaseDto', classFqn: 'b.BaseDto' }, index, 'navigate', hierarchy);
		assert.deepStrictEqual(describe(resolution.records), ['/tmp/a/Caller.groovy:4']);
	});
});

suite('resolveUsages — receiver chains', () => {
	const files: Record<string, string> = {
		'/tmp/Status.groovy': 'enum Status {\n    PAID, OPEN\n    Boolean isFinished() {\n        true\n    }\n}',
		'/tmp/Customer.groovy': 'class Customer {\n    Boolean isFinished() {\n        false\n    }\n}',
		'/tmp/Order.groovy': 'class Order {\n    Status status\n    Customer buyer\n}',
		'/tmp/SpecialOrder.groovy': 'class SpecialOrder extends Order {\n}',
		'/tmp/Caller.groovy': [
			'class Caller {',
			'    def run(Order order, Customer status, SpecialOrder special) {',
			'        order.status?.isFinished()',
			'        Status.PAID.isFinished()',
			'        order.buyer.isFinished()',
			'        status.isFinished()',
			'        special.status.isFinished()',
			'    }',
			'}'
		].join('\n')
	};
	const index = buildIndex(files);
	const hierarchy = buildHierarchy(files);

	test('resolves property chains, enum constants and inherited fields through the index', () => {
		const resolution = resolveUsages({ kind: 'method', name: 'isFinished', className: 'Status', classFqn: 'Status' }, index, 'navigate', hierarchy);
		assert.deepStrictEqual(describe(resolution.records), ['/tmp/Caller.groovy:2', '/tmp/Caller.groovy:3', '/tmp/Caller.groovy:6']);
	});

	test('does not type the end of a chain with a local variable of the same name', () => {
		const resolution = resolveUsages({ kind: 'method', name: 'isFinished', className: 'Customer', classFqn: 'Customer' }, index, 'navigate', hierarchy);
		assert.deepStrictEqual(describe(resolution.records), ['/tmp/Caller.groovy:4', '/tmp/Caller.groovy:5']);
	});
});

suite('findReferenceTarget — receivers the index also understands', () => {
	const source = [
		'class Child extends Base {',
		'    def run() {',
		'        super.greet()',
		'        builder',
		'            .withName("a")',
		'        helper().greet()',
		'    }',
		'}'
	].join('\n');
	const lines = source.split('\n');
	const at = (line: number, word: string) => findReferenceTarget(source, '/tmp/Child.groovy', line, lines[line].indexOf(word), word);

	test('maps super to the superclass', () => {
		assert.deepStrictEqual(at(2, 'greet'), { kind: 'method', name: 'greet', className: 'Base' });
	});

	test('resolves the superclass of super through the imports or the package', () => {
		const superTarget = (text: string) => {
			const textLines = text.split('\n');
			const line = textLines.findIndex(candidate => candidate.includes('super.greet'));
			return findReferenceTarget(text, '/tmp/Child.groovy', line, textLines[line].indexOf('greet'), 'greet');
		};
		const body = 'class Child extends Base {\n    def run() {\n        super.greet()\n    }\n}';
		assert.deepStrictEqual(superTarget(`package p\nimport q.Base\n${body}`), { kind: 'method', name: 'greet', className: 'Base', classFqn: 'q.Base' });
		assert.deepStrictEqual(superTarget(`package p\n${body}`), { kind: 'method', name: 'greet', className: 'Base', classFqn: 'p.Base' });
	});

	test('uses a receiver on the previous line', () => {
		assert.deepStrictEqual(at(4, 'withName'), { kind: 'method', name: 'withName', className: 'Builder' });
	});

	test('returns nothing for the end of a call chain', () => {
		assert.strictEqual(at(5, 'greet'), undefined);
	});
});

suite('TypeHierarchyStore', () => {
	test('resolves parents through explicit imports, the same package, wildcard imports or a unique name', () => {
		const hierarchy = new TypeHierarchyStore();
		hierarchy.add([{ simpleName: 'Base', fqn: 'x.Base' }, { simpleName: 'Base', fqn: 'y.Base' }, { simpleName: 'Unique', fqn: 'z.Unique' }], []);
		hierarchy.add([{ simpleName: 'A', fqn: 'p.A', extendsTypes: ['Base'] }], [], ['y.Base']);
		hierarchy.add([{ simpleName: 'B', fqn: 'x.B', extendsTypes: ['Base'], implementsTypes: ['Unique'] }], []);
		hierarchy.add([{ simpleName: 'C', fqn: 'q.C', extendsTypes: ['Base'] }], [], ['y.*']);
		hierarchy.add([{ simpleName: 'D', fqn: 'q.D', extendsTypes: ['Base'] }], []);
		assert.deepStrictEqual(hierarchy.parentsOf('p.A'), ['y.Base']);
		assert.deepStrictEqual(hierarchy.parentsOf('x.B'), ['x.Base', 'z.Unique']);
		assert.deepStrictEqual(hierarchy.parentsOf('q.C'), ['y.Base']);
		assert.deepStrictEqual(hierarchy.parentsOf('q.D'), []);
		assert.deepStrictEqual(hierarchy.childrenOf('y.Base').sort(), ['p.A', 'q.C']);
	});

	test('parses imports, skipping static ones and aliases', () => {
		assert.deepStrictEqual(parseImports('import a.b.C\nimport static a.b.C.d\nimport x.y.*\nimport m.N as Alias'), ['a.b.C', 'x.y.*', 'm.N']);
	});
});
