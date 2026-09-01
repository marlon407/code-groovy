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

	test('appends after the last existing import', () => {
		const source = 'package com.demo\nimport java.time.LocalDate\n\nclass Person {}\n';
		const updated = applyImportInsertion(source, planImportInsertion(source, 'grails.validation.Validateable'));
		assert.ok(updated.includes('import java.time.LocalDate\nimport grails.validation.Validateable\n'));
	});
});
