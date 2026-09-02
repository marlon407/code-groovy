import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findGrailsSourceForFqn } from '../../groovy/fqn_source_resolver';

function writeFile(filePath: string, content: string): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, content);
}

function createFixtureMonorepo(): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'code-groovy-fqn-'));
	writeFile(path.join(root, 'settings.gradle'), 'include "domain", "web"\n');
	writeFile(
		path.join(root, 'domain', 'src', 'main', 'groovy', 'com', 'example', 'fixture', 'Helper.groovy'),
		'package com.example.fixture\n\nclass Helper {}\n'
	);
	writeFile(
		path.join(root, 'domain', 'grails-app', 'domain', 'com', 'example', 'fixture', 'Widget.groovy'),
		'package com.example.fixture\n\nclass Widget {}\n'
	);
	writeFile(
		path.join(root, 'web', 'grails-app', 'controllers', 'com', 'example', 'fixture', 'WidgetController.groovy'),
		'package com.example.fixture\n\nclass WidgetController {}\n'
	);
	return root;
}

suite('fqn_source_resolver', () => {
	test('resolves Grails multi-module source paths from a synthetic monorepo', () => {
		const root = createFixtureMonorepo();
		try {
			const helper = findGrailsSourceForFqn('com.example.fixture.Helper', root);
			assert.ok(helper?.endsWith('com/example/fixture/Helper.groovy'));

			const widget = findGrailsSourceForFqn('com.example.fixture.Widget', root);
			assert.ok(widget?.endsWith('com/example/fixture/Widget.groovy'));

			const controller = findGrailsSourceForFqn('com.example.fixture.WidgetController', root);
			assert.ok(controller?.endsWith('com/example/fixture/WidgetController.groovy'));

			const fromWebModule = findGrailsSourceForFqn(
				'com.example.fixture.WidgetController',
				path.join(root, 'web')
			);
			assert.ok(fromWebModule?.endsWith('com/example/fixture/WidgetController.groovy'));
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
