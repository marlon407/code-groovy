import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { listExistingImports, parsePackageName, parseTypesFromSource } from '../../groovy/class_parser';

const fixture = fs.readFileSync(
	path.resolve(__dirname, '../../../src/test/fixtures/groovy/SampleService.groovy'),
	'utf8'
);

suite('class_parser', () => {
	test('extracts package and top-level class, interface, trait, and enum', () => {
		const types = parseTypesFromSource(fixture, 'SampleService.groovy');
		assert.deepStrictEqual(
			types.map(t => ({ kind: t.kind, simpleName: t.simpleName, fqn: t.fqn })),
			[
				{ kind: 'class', simpleName: 'SampleService', fqn: 'com.demo.services.SampleService' },
				{ kind: 'interface', simpleName: 'SamplePort', fqn: 'com.demo.services.SamplePort' },
				{ kind: 'trait', simpleName: 'SampleTrait', fqn: 'com.demo.services.SampleTrait' },
				{ kind: 'enum', simpleName: 'SampleStatus', fqn: 'com.demo.services.SampleStatus' }
			]
		);
	});

	test('parses default-package types', () => {
		const types = parseTypesFromSource('class Orphan {}\n');
		assert.strictEqual(types[0].packageName, '');
		assert.strictEqual(types[0].fqn, 'Orphan');
	});

	test('reads package name and existing imports including star imports', () => {
		const text = `
package com.demo

import grails.validation.Validateable
import com.demo.util.*
`;
		assert.strictEqual(parsePackageName(text), 'com.demo');
		const imports = listExistingImports(text);
		assert.ok(imports.has('grails.validation.Validateable'));
		assert.ok(imports.has('com.demo.util'));
	});
});
