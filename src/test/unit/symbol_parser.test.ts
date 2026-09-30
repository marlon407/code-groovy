import * as assert from 'assert';
import { findFieldInClassHierarchy, parseDocumentSymbols } from '../../groovy/symbol_parser';

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

suite('parseDocumentSymbols — enum constants with bodies and closures', () => {
	test('keeps reading constants after a constant body that closes on the same line', () => {
		const text = [
			'enum Op {',
			'    PLUS { int apply() { 1 } },',
			'    MINUS { int apply() { 2 } }',
			'    abstract int apply()',
			'}'
		].join('\n');
		assert.deepStrictEqual(parseDocumentSymbols(text, '/tmp/Op.groovy').enumConstants.map(constant => constant.name), ['PLUS', 'MINUS']);
	});

	test('keeps reading constants after a closure argument', () => {
		const text = [
			'enum Rule {',
			'    PAID({ it > 0 }),',
			'    OPEN({ it == 0 })',
			'    Rule(Closure check) {}',
			'}'
		].join('\n');
		assert.deepStrictEqual(parseDocumentSymbols(text, '/tmp/Rule.groovy').enumConstants.map(constant => constant.name), ['PAID', 'OPEN']);
	});

	test('stops at the closing brace of a one-line enum with a constant body', () => {
		const text = 'enum Mode { ON { String label() { "on" } }, OFF }\nclass After {}';
		assert.deepStrictEqual(parseDocumentSymbols(text, '/tmp/Mode.groovy').enumConstants.map(constant => constant.name), ['ON', 'OFF']);
	});
});

suite('parseDocumentSymbols — constructors without modifiers', () => {
	test('records a constructor with no modifier and keeps it out of the methods', () => {
		const text = [
			'enum WidgetKind {',
			'    A("a")',
			'    final String code',
			'    WidgetKind(String code) {',
			'        this.code = code',
			'    }',
			'}'
		].join('\n');
		const symbols = parseDocumentSymbols(text, '/tmp/WidgetKind.groovy');
		assert.deepStrictEqual(symbols.constructors.map(constructor => `${constructor.line}:${constructor.column}:${constructor.parameterCount}`), ['3:4:1']);
		assert.deepStrictEqual(symbols.methods, []);
	});
});

suite('parseDocumentSymbols — class members and nested types', () => {
	test('marks only fields at the class body level as class members, including after a nested type', () => {
		const text = [
			'class Outer {',
			'    String name',
			'    static class Inner {',
			'        Long code',
			'    }',
			'    void run() {',
			'        String local = "x"',
			'    }',
			'    Integer total',
			'}'
		].join('\n');
		const fields = parseDocumentSymbols(text, '/tmp/Outer.groovy').fields;
		assert.deepStrictEqual(fields.map(field => `${field.name}@${field.classFqn}:${field.classMember}`), [
			'name@Outer:true', 'code@Inner:true', 'local@Outer:false', 'total@Outer:true'
		]);
	});

	test('ends a nested type at its own closing brace and the outer type at the last one', () => {
		const text = [
			'class Outer {',
			'    static class Inner {',
			'        void a() {',
			'        }',
			'    }',
			'    void b() {}',
			'}'
		].join('\n');
		const classes = parseDocumentSymbols(text, '/tmp/Outer.groovy').classes;
		assert.deepStrictEqual(classes.map(cls => `${cls.simpleName}:${cls.line}-${cls.endLine}`), ['Outer:0-6', 'Inner:1-4']);
	});
});

suite('parseDocumentSymbols — very long lines', () => {
	test('skips a huge generated line quickly and keeps parsing the declarations after it', () => {
		const text = `class Generated${'<'.repeat(20000)}\nclass Real {\n    void run() {}\n}`;
		const started = Date.now();
		const symbols = parseDocumentSymbols(text, '/tmp/Generated.groovy');
		assert.ok(Date.now() - started < 1000);
		assert.deepStrictEqual(symbols.classes.map(cls => cls.simpleName), ['Real']);
		assert.deepStrictEqual(symbols.methods.map(method => method.name), ['run']);
	});
});

suite('findFieldInClassHierarchy', () => {
	const files: Record<string, string> = {
		'/p/Base.groovy': 'package p\nclass Base {\n    String code\n}',
		'/q/Base.groovy': 'package q\nclass Base {\n    String other\n    String code\n}',
		'/q/Child.groovy': 'package q\nclass Child extends Base implements Named, Coded {\n}',
		'/q/Named.groovy': 'package q\ninterface Named extends Root {\n}',
		'/q/Coded.groovy': 'package q\ninterface Coded extends Root {\n}',
		'/q/Root.groovy': 'package q\ninterface Root {\n}'
	};
	const entriesFor = (className: string) => Object.keys(files)
		.filter(filePath => filePath.endsWith(`/${className}.groovy`))
		.map(filePath => ({ filePath }));

	test('picks the homonym parent from the same package as the class that extends it', () => {
		const found = findFieldInClassHierarchy(filePath => files[filePath], entriesFor, 'Child', 'code', 'package q\nclass Caller {}');
		assert.deepStrictEqual(found, [{ filePath: '/q/Base.groovy', line: 3, column: 11 }]);
	});

	test('reads a type reached through two paths only once', () => {
		const reads: string[] = [];
		const found = findFieldInClassHierarchy(filePath => {
			reads.push(filePath);
			return files[filePath];
		}, entriesFor, 'Child', 'missing', 'package q');
		assert.deepStrictEqual(found, []);
		assert.strictEqual(reads.filter(filePath => filePath === '/q/Root.groovy').length, 1);
	});
});
