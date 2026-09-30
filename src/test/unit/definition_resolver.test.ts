import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { ClassIndexStore } from '../../groovy/class_index_store';
import { resolveDefinitions } from '../../groovy/definition_resolver';
import { GrailsArtifactIndex, indexGroovyFile } from '../../groovy/grails_artifact_index';
import { candidateClassNamesForReceiver, serviceBeanToClassName } from '../../groovy/service_bean';
import { findMethodInClassHierarchy, findMethodInText, listMethodsInClassHierarchy, parseTypeDeclaration } from '../../groovy/method_navigation_logic';
import { buildImportMap, resolveSimpleTypeName } from '../../groovy/type_resolver';
import { indexWorkspaceDocument } from '../../groovy/workspace_symbol_index';

const fixturesRoot = path.resolve(__dirname, '../../../src/test/fixtures/groovy');

const FIXTURE_FILES = [
	'ModelEntity.groovy',
	'Widget.groovy',
	'WidgetService.groovy',
	'WidgetController.groovy',
	'WidgetKind.groovy',
	'WidgetState.groovy',
	'WidgetBox.groovy'
];

function loadFixture(name: string): string {
	return fs.readFileSync(path.join(fixturesRoot, name), 'utf8');
}

function buildContext(
	documentText: string,
	sourcePath: string,
	line: number,
	word: string,
	wordStart: number
) {
	const classStore = new ClassIndexStore();
	const artifactIndex = new GrailsArtifactIndex();
	for (const file of FIXTURE_FILES) {
		const fullPath = path.join(fixturesRoot, file);
		artifactIndex.addEntry(indexGroovyFile(fullPath));
		classStore.add(indexWorkspaceDocument(loadFixture(file), fullPath).types);
	}
	return resolveDefinitions({
		documentText,
		line,
		character: wordStart,
		word,
		wordStart,
		sourcePath,
		classStore,
		artifactIndex
	});
}

suite('service_bean', () => {
	test('maps widgetService to WidgetService', () => {
		assert.strictEqual(serviceBeanToClassName('widgetService'), 'WidgetService');
		assert.deepStrictEqual(candidateClassNamesForReceiver('widget'), ['Widget']);
	});
});

suite('method_navigation_logic', () => {
	test('parses extends/implements with generics', () => {
		const parsed = parseTypeDeclaration(`
class OrderRepository implements Repository<Order, OrderRepository> {
}
`);
		assert.ok(parsed);
		assert.deepStrictEqual(parsed!.parents, ['Repository']);
	});

	test('finds def and typed method declarations', () => {
		const source = loadFixture('WidgetService.groovy');
		assert.ok(findMethodInText(source, 'save').length > 0);
	});
});

suite('definition_resolver', () => {
	test('go to type definition for imported Widget', () => {
		const controllerSource = loadFixture('WidgetController.groovy');
		const line = 9;
		const lineText = controllerSource.split('\n')[line];
		const wordStart = lineText.indexOf('Widget');
		const targets = buildContext(
			controllerSource,
			path.join(fixturesRoot, 'WidgetController.groovy'),
			line,
			'Widget',
			wordStart
		);
		assert.ok(targets.some(target => target.uri.endsWith('Widget.groovy')));
	});

	test('go to service bean widgetService', () => {
		const controllerSource = loadFixture('WidgetController.groovy');
		const line = 6;
		const lineText = controllerSource.split('\n')[line];
		const wordStart = lineText.indexOf('widgetService');
		const targets = buildContext(
			controllerSource,
			path.join(fixturesRoot, 'WidgetController.groovy'),
			line,
			'widgetService',
			wordStart
		);
		assert.ok(targets.some(target => target.uri.endsWith('WidgetService.groovy')));
	});

	test('go to same-file method definition', () => {
		const widgetSource = loadFixture('Widget.groovy');
		const line = 5;
		const lineText = widgetSource.split('\n')[line];
		const wordStart = lineText.indexOf('rename');
		const targets = buildContext(
			widgetSource,
			path.join(fixturesRoot, 'Widget.groovy'),
			line,
			'rename',
			wordStart
		);
		assert.ok(targets.some(target => target.line === 5));
	});

	test('go to cross-file service method via widgetService.save', () => {
		const controllerSource = loadFixture('WidgetController.groovy');
		const line = 10;
		const lineText = controllerSource.split('\n')[line];
		const wordStart = lineText.indexOf('save');
		const targets = buildContext(
			controllerSource,
			path.join(fixturesRoot, 'WidgetController.groovy'),
			line,
			'save',
			wordStart
		);
		assert.ok(targets.some(target => target.uri.endsWith('WidgetService.groovy')));
	});

	test('go to a method through a variable whose declared type differs from its name', () => {
		const source = [
			'class ReportService {',
			'    def run() {',
			'        Widget current = build()',
			'        current.rename("x")',
			'    }',
			'}'
		].join('\n');
		const wordStart = source.split('\n')[3].indexOf('rename');
		const targets = buildContext(source, path.join(fixturesRoot, 'ReportService.groovy'), 3, 'rename', wordStart);
		assert.ok(targets.some(target => target.uri.endsWith('Widget.groovy')));
	});

	test('go to inherited method on supertype', () => {
		const serviceSource = loadFixture('WidgetService.groovy');
		const line = 6;
		const lineText = serviceSource.split('\n')[line];
		const wordStart = lineText.indexOf('touch');
		const targets = buildContext(
			serviceSource,
			path.join(fixturesRoot, 'WidgetService.groovy'),
			line,
			'touch',
			wordStart
		);
		assert.ok(targets.some(target => target.uri.endsWith('ModelEntity.groovy')));
	});

	test('go to field definition via typed receiver (widget.name)', () => {
		const controllerSource = loadFixture('WidgetController.groovy');
		const lines = controllerSource.split('\n');
		const line = lines.findIndex(text => text.includes('widget.name'));
		const lineText = lines[line];
		const wordStart = lineText.lastIndexOf('name');
		const targets = buildContext(
			controllerSource,
			path.join(fixturesRoot, 'WidgetController.groovy'),
			line,
			'name',
			wordStart
		);
		assert.ok(targets.some(target => target.uri.endsWith('Widget.groovy')));

		const widgetSource = loadFixture('Widget.groovy');
		const fieldLine = widgetSource.split('\n').findIndex(text => /^\s*String\s+name\b/.test(text));
		assert.ok(targets.some(target => target.uri.endsWith('Widget.groovy') && target.line === fieldLine));
	});

	test('does not resolve receiver.field to a local variable of a method in the target class', () => {
		const controllerSource = loadFixture('WidgetController.groovy');
		const lines = controllerSource.split('\n');
		const line = lines.findIndex(text => text.includes('widget.label'));
		const targets = buildContext(
			controllerSource,
			path.join(fixturesRoot, 'WidgetController.groovy'),
			line,
			'label',
			lines[line].lastIndexOf('label')
		);
		assert.deepStrictEqual(targets, []);
	});

	test('uses the nearest preceding declaration when a variable name is reused with another type', () => {
		const source = [
			'package com.example.fixture.web',
			'',
			'import com.example.fixture.domain.ModelEntity',
			'import com.example.fixture.domain.Widget',
			'',
			'class ReportController {',
			'    def first() {',
			'        ModelEntity item = new ModelEntity()',
			'    }',
			'',
			'    def second() {',
			'        Widget item = new Widget()',
			'        return item.name',
			'    }',
			'}'
		].join('\n');
		const lines = source.split('\n');
		const line = lines.findIndex(text => text.includes('item.name'));
		const targets = buildContext(
			source,
			path.join(fixturesRoot, 'ReportController.groovy'),
			line,
			'name',
			lines[line].lastIndexOf('name')
		);
		assert.ok(targets.some(target => target.uri.endsWith('Widget.groovy')));
	});

	test('go to own method definition via this.method()', () => {
		const widgetSource = loadFixture('Widget.groovy');
		const lines = widgetSource.split('\n');
		const line = lines.findIndex(text => text.includes('this.rename('));
		const lineText = lines[line];
		const wordStart = lineText.indexOf('rename', lineText.indexOf('this.'));
		const targets = buildContext(
			widgetSource,
			path.join(fixturesRoot, 'Widget.groovy'),
			line,
			'rename',
			wordStart
		);
		const declLine = lines.findIndex(text => /^\s*void\s+rename\(/.test(text));
		assert.ok(targets.some(target => target.uri.endsWith('Widget.groovy') && target.line === declLine));
	});

	test('go to own field definition via this.field', () => {
		const widgetSource = loadFixture('Widget.groovy');
		const lines = widgetSource.split('\n');
		const line = lines.findIndex(text => text.includes('this.name'));
		const lineText = lines[line];
		const wordStart = lineText.lastIndexOf('name');
		const targets = buildContext(
			widgetSource,
			path.join(fixturesRoot, 'Widget.groovy'),
			line,
			'name',
			wordStart
		);
		const declLine = lines.findIndex(text => /^\s*String\s+name\b/.test(text));
		assert.ok(targets.some(target => target.uri.endsWith('Widget.groovy') && target.line === declLine));
	});

	test('does not resolve lowercase variable name as type', () => {
		const controllerSource = loadFixture('WidgetController.groovy');
		const line = 9;
		const lineText = controllerSource.split('\n')[line];
		const wordStart = lineText.indexOf('widget');
		const targets = buildContext(
			controllerSource,
			path.join(fixturesRoot, 'WidgetController.groovy'),
			line,
			'widget',
			wordStart
		);
		assert.strictEqual(targets.length, 0);
	});
});

suite('type_resolver', () => {
	test('resolves imported simple names to FQNs', () => {
		const classStore = new ClassIndexStore();
		classStore.add(indexWorkspaceDocument(loadFixture('Widget.groovy'), 'Widget.groovy').types);
		const importMap = buildImportMap(loadFixture('WidgetController.groovy'));
		const fqns = resolveSimpleTypeName('Widget', importMap, classStore);
		assert.ok(fqns.includes('com.example.fixture.domain.Widget'));
	});
});

suite('findMethodInClassHierarchy — same-named supertypes', () => {
	const sources: Record<string, string> = {
		'/w/debit/BaseRequestBuilder.groovy': 'package adyen.debit\nclass BaseRequestBuilder {\n    Map buildAmount() {\n    }\n}',
		'/w/credit/BaseRequestBuilder.groovy': 'package adyen.credit\nclass BaseRequestBuilder {\n    Map buildAmount() {\n    }\n}',
		'/w/debit/AuthoriseRequestBuilder.groovy': 'package adyen.debit\nclass AuthoriseRequestBuilder extends BaseRequestBuilder {\n}',
		'/w/other/PixRequestBuilder.groovy': 'package other\nimport adyen.debit.BaseRequestBuilder\nclass PixRequestBuilder extends BaseRequestBuilder {\n}'
	};
	const readFile = (filePath: string) => sources[filePath];
	const findEntries = (className: string) => Object.keys(sources)
		.filter(filePath => filePath.endsWith(`/${className}.groovy`))
		.sort((a, b) => a.includes('credit') ? -1 : b.includes('credit') ? 1 : 0)
		.map(filePath => ({ filePath }));
	const lookup = (className: string, referencing?: string) =>
		findMethodInClassHierarchy(readFile, findEntries, className, 'buildAmount', new Set(), 0, referencing).map(location => location.filePath);

	test('picks the supertype in the same package as the subclass', () => {
		assert.deepStrictEqual(lookup('AuthoriseRequestBuilder'), ['/w/debit/BaseRequestBuilder.groovy']);
	});

	test('picks the supertype named by an explicit import', () => {
		assert.deepStrictEqual(lookup('PixRequestBuilder'), ['/w/debit/BaseRequestBuilder.groovy']);
	});

	test('goes from super.method() to the supertype in the same package', () => {
		const source = 'package com.example.fixture.domain\nclass SpecialWidget extends Widget {\n    void rename(String value) {\n        super.rename(value)\n    }\n}';
		const lineText = source.split('\n')[3];
		const targets = buildContext(source, path.join(fixturesRoot, 'SpecialWidget.groovy'), 3, 'rename', lineText.indexOf('rename'));
		assert.deepStrictEqual(targets.map(target => path.basename(target.uri)), ['Widget.groovy']);
	});

	test('picks the class the referencing file refers to when the name itself is ambiguous', () => {
		assert.deepStrictEqual(lookup('BaseRequestBuilder', 'package adyen.debit\nclass X {\n}'), ['/w/debit/BaseRequestBuilder.groovy']);
	});
});

suite('enum constants and static fields', () => {
	const kindPath = path.join(fixturesRoot, 'WidgetKind.groovy');
	const kindSource = loadFixture('WidgetKind.groovy');
	const kindLines = kindSource.split('\n');
	const lineOf = (lines: string[], pattern: RegExp) => lines.findIndex(text => pattern.test(text));
	const callerSource = [
		'package com.example.fixture.web',
		'import com.example.fixture.domain.WidgetKind',
		'import com.example.fixture.domain.WidgetState',
		'class KindController {',
		'    def show() {',
		'        render(WidgetKind.DETAILED)',
		'        render(WidgetState.INACTIVE)',
		'        render(WidgetState.MAX_NAME_LENGTH)',
		'    }',
		'}'
	].join('\n');
	const callerPath = path.join(fixturesRoot, 'KindController.groovy');
	const at = (source: string, sourcePath: string, line: number, word: string) =>
		buildContext(source, sourcePath, line, word, source.split('\n')[line].indexOf(word));

	test('goes from Type.CONSTANT to the constant inside the enum', () => {
		const targets = at(callerSource, callerPath, 5, 'DETAILED');
		assert.deepStrictEqual(targets.map(target => [path.basename(target.uri), target.line]), [['WidgetKind.groovy', lineOf(kindLines, /^\s*DETAILED\(/)]]);
	});

	test('goes to a constant declared on the same line as others', () => {
		const stateLines = loadFixture('WidgetState.groovy').split('\n');
		const targets = at(callerSource, callerPath, 6, 'INACTIVE');
		assert.deepStrictEqual(targets.map(target => [path.basename(target.uri), target.line, target.column]), [['WidgetState.groovy', 3, stateLines[3].indexOf('INACTIVE')]]);
	});

	test('goes from Type.STATIC_FIELD to the static field', () => {
		const stateLines = loadFixture('WidgetState.groovy').split('\n');
		const targets = at(callerSource, callerPath, 7, 'MAX_NAME_LENGTH');
		assert.deepStrictEqual(targets.map(target => [path.basename(target.uri), target.line]), [['WidgetState.groovy', lineOf(stateLines, /MAX_NAME_LENGTH/)]]);
	});

	test('goes from a constant declaration to the constructor with the same number of arguments', () => {
		const simple = at(kindSource, kindPath, lineOf(kindLines, /^\s*SIMPLE\(/), 'SIMPLE');
		const detailed = at(kindSource, kindPath, lineOf(kindLines, /^\s*DETAILED\(/), 'DETAILED');
		const legacy = at(kindSource, kindPath, lineOf(kindLines, /^\s*LEGACY/), 'LEGACY');
		assert.deepStrictEqual(simple.map(target => target.line), [lineOf(kindLines, /WidgetKind\(String code\) \{/)]);
		assert.deepStrictEqual(detailed.map(target => target.line), [lineOf(kindLines, /WidgetKind\(String code, Boolean verbose\)/)]);
		assert.deepStrictEqual(legacy.map(target => target.line), [lineOf(kindLines, /WidgetKind\(\) \{/)]);
	});

	test('goes from a constant declaration to the enum itself when it has no constructor', () => {
		const statePath = path.join(fixturesRoot, 'WidgetState.groovy');
		const stateSource = loadFixture('WidgetState.groovy');
		const targets = at(stateSource, statePath, 3, 'ACTIVE');
		assert.deepStrictEqual(targets.map(target => [path.basename(target.uri), target.line]), [['WidgetState.groovy', 2]]);
	});
});

suite('receiver chains', () => {
	const source = [
		'package com.example.fixture.web',
		'import com.example.fixture.domain.WidgetBox',
		'class BoxController {',
		'    def show(WidgetBox box) {',
		'        if (box.kind?.isSimple()) {',
		'            box.mainWidget.rename("x")',
		'            println box?.mainWidget.name',
		'        }',
		'    }',
		'}'
	].join('\n');
	const sourcePath = path.join(fixturesRoot, 'BoxController.groovy');
	const lines = source.split('\n');
	const at = (line: number, word: string) => buildContext(source, sourcePath, line, word, lines[line].indexOf(word));

	test('resolves a method through a property chain and safe navigation', () => {
		const targets = at(4, 'isSimple');
		assert.deepStrictEqual(targets.map(target => path.basename(target.uri)), ['WidgetKind.groovy']);
	});

	test('resolves a method on a property typed with another class', () => {
		assert.deepStrictEqual(at(5, 'rename').map(target => path.basename(target.uri)), ['Widget.groovy']);
	});

	test('resolves a field through a parameter whose name differs from its type', () => {
		const boxLines = loadFixture('WidgetBox.groovy').split('\n');
		const targets = at(4, 'kind');
		assert.deepStrictEqual(targets.map(target => [path.basename(target.uri), target.line]), [['WidgetBox.groovy', boxLines.findIndex(text => /WidgetKind kind/.test(text))]]);
	});

	test('resolves a field at the end of a property chain', () => {
		const widgetLines = loadFixture('Widget.groovy').split('\n');
		const targets = at(6, 'name');
		assert.deepStrictEqual(targets.map(target => [path.basename(target.uri), target.line]), [['Widget.groovy', widgetLines.findIndex(text => /^\s*String\s+name\b/.test(text))]]);
	});
});

suite('local variables and parameters', () => {
	const sourcePath = path.join(fixturesRoot, 'LocalsController.groovy');
	const at = (source: string, line: number, word: string, occurrence: 'first' | 'last' = 'first') => {
		const lineText = source.split('\n')[line];
		const wordStart = occurrence === 'first' ? lineText.indexOf(word) : lineText.lastIndexOf(word);
		return buildContext(source, sourcePath, line, word, wordStart);
	};

	test('does not send a parameter or local variable to a class field with the same name', () => {
		const source = [
			'class LocalsController {',
			'    String name',
			'    void setName(String name) {',
			'        this.name = name',
			'    }',
			'}'
		].join('\n');
		assert.deepStrictEqual(at(source, 3, 'name', 'last'), []);
	});

	test('prefers the parameter type over a same-named variable declared in another method', () => {
		const source = [
			'class LocalsController {',
			'    def a() {',
			'        Widget item = null',
			'    }',
			'    def b(WidgetBox item) {',
			'        println item.name',
			'    }',
			'}'
		].join('\n');
		assert.deepStrictEqual(at(source, 5, 'name').map(target => path.basename(target.uri)), ['WidgetBox.groovy']);
	});
});

suite('listMethodsInClassHierarchy — same-named classes and supertypes', () => {
	const sources: Record<string, string> = {
		'/w/credit/BaseRequestBuilder.groovy': 'package adyen.credit\nclass BaseRequestBuilder {\n    Map buildAmount() {\n    }\n    Map buildInstallments() {\n    }\n}',
		'/w/debit/BaseRequestBuilder.groovy': 'package adyen.debit\nclass BaseRequestBuilder {\n    Map buildAmount() {\n    }\n    String buildReference() {\n    }\n}',
		'/w/credit/AuthoriseRequestBuilder.groovy': 'package adyen.credit\nclass AuthoriseRequestBuilder extends BaseRequestBuilder {\n    Map build() {\n    }\n}',
		'/w/debit/AuthoriseRequestBuilder.groovy': 'package adyen.debit\nclass AuthoriseRequestBuilder extends BaseRequestBuilder {\n    Map build() {\n    }\n}'
	};
	const readFile = (filePath: string) => sources[filePath];
	const findEntries = (className: string) => Object.keys(sources)
		.filter(filePath => filePath.endsWith(`/${className}.groovy`))
		.sort()
		.map(filePath => ({ filePath }));
	const names = (referencing?: string) =>
		listMethodsInClassHierarchy(readFile, findEntries, 'AuthoriseRequestBuilder', new Set(), 0, referencing).map(method => method.name);

	test('lists the inherited methods of the class the document refers to', () => {
		assert.deepStrictEqual(names('package adyen\nimport adyen.debit.AuthoriseRequestBuilder\nclass X {\n}'), ['build', 'buildAmount', 'buildReference']);
	});

	test('resolves each same-named class against its own supertype when the document does not pick one', () => {
		assert.deepStrictEqual(names(), ['build', 'buildAmount', 'buildInstallments', 'buildReference']);
	});
});
