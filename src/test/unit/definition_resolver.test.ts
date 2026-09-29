import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { ClassIndexStore } from '../../groovy/class_index_store';
import { resolveDefinitions } from '../../groovy/definition_resolver';
import { GrailsArtifactIndex, indexGroovyFile } from '../../groovy/grails_artifact_index';
import { candidateClassNamesForReceiver, serviceBeanToClassName } from '../../groovy/service_bean';
import { findMethodInText, parseTypeDeclaration } from '../../groovy/method_navigation_logic';
import { buildImportMap, resolveSimpleTypeName } from '../../groovy/type_resolver';
import { indexWorkspaceDocument } from '../../groovy/workspace_symbol_index';

const fixturesRoot = path.resolve(__dirname, '../../../src/test/fixtures/groovy');

const FIXTURE_FILES = [
	'ModelEntity.groovy',
	'Widget.groovy',
	'WidgetService.groovy',
	'WidgetController.groovy'
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
