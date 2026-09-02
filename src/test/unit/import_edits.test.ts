import * as assert from 'assert';
import { applyImportInsertion, planImportInsertion } from '../../groovy/import_edits';

suite('import_edits', () => {
	test('inserts import after the package declaration', () => {
		const source = 'package com.demo\n\nclass Person implements Validateable {\n}\n';
		const plan = planImportInsertion(source, 'grails.validation.Validateable');
		assert.strictEqual(plan.needed, true);
		assert.strictEqual(plan.text, 'import grails.validation.Validateable\n');

		const updated = applyImportInsertion(source, plan);
		assert.ok(updated.startsWith('package com.demo\nimport grails.validation.Validateable\n'));
	});

	test('does not duplicate an existing import', () => {
		const source = 'package com.demo\nimport grails.validation.Validateable\n\nclass Person {}\n';
		const plan = planImportInsertion(source, 'grails.validation.Validateable');
		assert.strictEqual(plan.needed, false);
		assert.strictEqual(applyImportInsertion(source, plan), source);
	});

	test('skips same-package types', () => {
		const source = 'package grails.validation\n\nclass Person implements Validateable {}\n';
		assert.strictEqual(planImportInsertion(source, 'grails.validation.Validateable').needed, false);
	});

	test('treats star imports as already covering the package', () => {
		const source = 'package com.demo\nimport grails.validation.*\n\nclass Person {}\n';
		assert.strictEqual(planImportInsertion(source, 'grails.validation.Validateable').needed, false);
	});

	test('inserts the new import in sorted position without reordering others', () => {
		const source = [
			'package com.demo',
			'import com.example.app.userpermission.AdminModulePermission',
			'import com.example.app.util.Utils',
			'import grails.plugin.springsecurity.SpringSecurityUtils',
			'import java.util.concurrent.TimeUnit',
			'import grails.validation.Validateable',
			'',
			'class Person {}',
			''
		].join('\n');

		const updated = applyImportInsertion(
			source,
			planImportInsertion(source, 'com.example.app.domain.CustomerAccount')
		);

		assert.ok(
			updated.includes(
				'import com.example.app.domain.CustomerAccount\nimport com.example.app.userpermission.AdminModulePermission\n'
			)
		);
		// Existing out-of-order Validateable stays where it was.
		assert.ok(
			updated.includes(
				'import java.util.concurrent.TimeUnit\nimport grails.validation.Validateable\n'
			)
		);
	});

	test('inserts before a later package group when that is the sorted spot', () => {
		const source = 'package com.demo\nimport java.time.LocalDate\n\nclass Person {}\n';
		const updated = applyImportInsertion(
			source,
			planImportInsertion(source, 'grails.validation.Validateable')
		);
		assert.ok(
			updated.includes(
				'import grails.validation.Validateable\nimport java.time.LocalDate\n'
			)
		);
	});
});
