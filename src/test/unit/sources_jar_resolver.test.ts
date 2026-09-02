import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
	buildJarSourceUri,
	findSourceEntryInJar,
	resolveJarTypeDefinition,
	sourcesJarForMainJar
} from '../../groovy/sources_jar_resolver';
import { buildZip } from './jar_class_scanner.test';

suite('sources_jar_resolver', () => {
	test('pairs main jar with -sources.jar and resolves source entry', () => {
		const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'code-groovy-sources-'));
		try {
			const mainJar = path.join(dir, 'demo-lib-1.0.jar');
			const sourcesJar = path.join(dir, 'demo-lib-1.0-sources.jar');
			fs.writeFileSync(mainJar, buildZip(['com/example/fixture/domain/Widget.class']));
			fs.writeFileSync(sourcesJar, buildZip(['com/example/fixture/domain/Widget.java']));

			assert.strictEqual(sourcesJarForMainJar(mainJar), sourcesJar);
			assert.strictEqual(
				findSourceEntryInJar(sourcesJar, 'com.example.fixture.domain.Widget'),
				'com/example/fixture/domain/Widget.java'
			);
			assert.ok(buildJarSourceUri(sourcesJar, 'com/example/fixture/domain/Widget.java').includes('jar:file://'));
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test('resolves jar class entry when sources jar is unavailable', function () {
		const home = require('os').homedir();
		const base = path.join(home, '.gradle/caches/modules-2/files-2.1/org.grails/grails-core');
		if (!fs.existsSync(base)) {
			this.skip();
		}
		let grailsCoreJar: string | undefined;
		for (const version of fs.readdirSync(base)) {
			const versionDir = path.join(base, version);
			for (const hash of fs.readdirSync(versionDir)) {
				const candidate = path.join(versionDir, hash, `grails-core-${version}.jar`);
				if (fs.existsSync(candidate)) {
					grailsCoreJar = candidate;
					break;
				}
			}
			if (grailsCoreJar) {
				break;
			}
		}
		if (!grailsCoreJar) {
			this.skip();
		}
		const resolved = resolveJarTypeDefinition(grailsCoreJar, 'grails.validation.ValidationException');
		assert.ok(resolved);
		assert.ok(resolved!.uri.includes('ValidationException.class'));
	});
});
