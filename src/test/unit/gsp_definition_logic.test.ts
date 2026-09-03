import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { ClassIndexStore } from '../../groovy/class_index_store';
import { GrailsArtifactIndex, indexGroovyFile } from '../../groovy/grails_artifact_index';
import { indexWorkspaceDocument } from '../../groovy/workspace_symbol_index';
import {
	findEmbeddedGroovyAtOffset,
	findTagAtPosition,
	resolveGspDefinitions
} from '../../gsp/gsp_definition_logic';
import { parseTagLibSource } from '../../gsp/taglib_parser';

const fixturesRoot = path.resolve(__dirname, '../../../src/test/fixtures');
const tagLibPath = path.join(fixturesRoot, 'taglib/DemoUITagLib.groovy');
const groovyFixtures = path.join(fixturesRoot, 'groovy');

function loadTags() {
	return parseTagLibSource(fs.readFileSync(tagLibPath, 'utf8'), tagLibPath);
}

function buildStores() {
	const classStore = new ClassIndexStore();
	const artifactIndex = new GrailsArtifactIndex();
	for (const file of ['ModelEntity.groovy', 'Widget.groovy', 'WidgetService.groovy', 'WidgetController.groovy']) {
		const fullPath = path.join(groovyFixtures, file);
		const text = fs.readFileSync(fullPath, 'utf8');
		artifactIndex.addEntry(indexGroovyFile(fullPath));
		classStore.add(indexWorkspaceDocument(text, fullPath).types);
	}
	return { classStore, artifactIndex };
}

suite('gsp_definition_logic', () => {
	test('finds namespace:method under the cursor', () => {
		const line = '<demoUI:accountLink href="x"/>';
		assert.deepStrictEqual(findTagAtPosition(line, line.indexOf('demoUI')), {
			namespace: 'demoUI',
			method: 'accountLink'
		});
		assert.deepStrictEqual(findTagAtPosition(line, line.indexOf('accountLink') + 3), {
			namespace: 'demoUI',
			method: 'accountLink'
		});
		assert.strictEqual(findTagAtPosition(line, line.indexOf('href')), undefined);
	});

	test('finds embedded Groovy inside ${}', () => {
		const text = '<div>${widgetService.save(widget)}</div>';
		const offset = text.indexOf('save');
		const embedded = findEmbeddedGroovyAtOffset(text, offset);
		assert.ok(embedded);
		assert.strictEqual(embedded!.text, 'widgetService.save(widget)');
		assert.strictEqual(embedded!.text[embedded!.localOffset], 's');
	});

	test('jumps from project tag to TagLib method declaration', () => {
		const tags = loadTags();
		const account = tags.find(tag => tag.method === 'accountLink')!;
		const gsp = '<demoUI:accountLink href="${url}"/>';
		const targets = resolveGspDefinitions({
			documentText: gsp,
			line: 0,
			character: gsp.indexOf('accountLink') + 2,
			sourcePath: '/tmp/view.gsp',
			tags,
			...buildStores()
		});
		assert.strictEqual(targets.length, 1);
		assert.strictEqual(targets[0].uri, tagLibPath);
		assert.strictEqual(targets[0].line, account.methodLine);
		assert.strictEqual(targets[0].column, account.methodColumn);
	});

	test('does not invent definitions for core g: tags without project TagLib', () => {
		const targets = resolveGspDefinitions({
			documentText: '<g:each in="${items}" var="item">',
			line: 0,
			character: 4,
			sourcePath: '/tmp/view.gsp',
			tags: loadTags(),
			...buildStores()
		});
		assert.strictEqual(targets.length, 0);
	});

	test('resolves types/methods inside ${} via Groovy definition resolver', () => {
		const documentText = '<div>${widgetService.save()}</div>';
		const { classStore, artifactIndex } = buildStores();
		const targets = resolveGspDefinitions({
			documentText,
			line: 0,
			character: documentText.indexOf('save') + 1,
			sourcePath: path.join(groovyFixtures, 'WidgetController.groovy'),
			tags: loadTags(),
			classStore,
			artifactIndex
		});
		assert.ok(targets.some(target => target.uri.endsWith('WidgetService.groovy')));
	});
});
