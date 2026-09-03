import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
	findAttributeValueAtPosition,
	findOpenTagBefore,
	listResourceAttributeValues,
	resolveGspResourcePath
} from '../../gsp/gsp_resource_path_logic';

suite('gsp_resource_path_logic', () => {
	test('finds template/src attribute values under the cursor', () => {
		const line = '<g:render template="/tracking/googleTagManagerScript"/>';
		const hit = findAttributeValueAtPosition(line, line.indexOf('tracking') + 2);
		assert.ok(hit);
		assert.strictEqual(hit!.name, 'template');
		assert.strictEqual(hit!.value, '/tracking/googleTagManagerScript');
		assert.strictEqual(findAttributeValueAtPosition(line, line.indexOf('render')), undefined);
		const listed = listResourceAttributeValues(line);
		assert.strictEqual(listed.length, 1);
		assert.strictEqual(line.slice(listed[0].valueStart, listed[0].valueEnd), listed[0].value);
	});

	test('finds open tag before an attribute', () => {
		const line = '<asset:stylesheet src="dashboard/dashboardHome.css"/>';
		assert.deepStrictEqual(findOpenTagBefore(line, line.indexOf('dashboard')), {
			namespace: 'asset',
			method: 'stylesheet'
		});
	});

	test('resolves g:render template to underscored GSP under views', () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'code-groovy-gsp-res-'));
		try {
			const target = path.join(
				root,
				'grails-app/views/tracking/_googleTagManagerScript.gsp'
			);
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.writeFileSync(target, '<!-- ok -->\n');

			const resolved = resolveGspResourcePath({
				attrName: 'template',
				attrValue: '/tracking/googleTagManagerScript',
				tag: { namespace: 'g', method: 'render' },
				workspaceRoot: root
			});
			assert.strictEqual(resolved, target);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test('resolves asset:stylesheet src under assets/stylesheets', () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'code-groovy-gsp-asset-'));
		try {
			const target = path.join(
				root,
				'grails-app/assets/stylesheets/dashboard/dashboardHome.css'
			);
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.writeFileSync(target, 'body{}\n');

			const resolved = resolveGspResourcePath({
				attrName: 'src',
				attrValue: 'dashboard/dashboardHome.css',
				tag: { namespace: 'asset', method: 'stylesheet' },
				workspaceRoot: root
			});
			assert.strictEqual(resolved, target);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test('prefers .scss source over literal .css for asset:stylesheet', () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'code-groovy-gsp-scss-'));
		try {
			const dir = path.join(root, 'grails-app/assets/stylesheets/dashboard');
			fs.mkdirSync(dir, { recursive: true });
			const css = path.join(dir, 'dashboardHome.css');
			const scss = path.join(dir, 'dashboardHome.scss');
			fs.writeFileSync(css, '/* compiled */\n');
			fs.writeFileSync(scss, '$x: 1;\n');

			const resolved = resolveGspResourcePath({
				attrName: 'src',
				attrValue: 'dashboard/dashboardHome.css',
				tag: { namespace: 'asset', method: 'stylesheet' },
				workspaceRoot: root
			});
			assert.strictEqual(resolved, scss);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
