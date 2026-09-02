import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
	hashWorkspaceBuildFiles,
	parseClasspathLines,
	prioritizeJars
} from '../../groovy/classpath_resolver';

suite('classpath_resolver', () => {
	test('parses Gradle CODE_GROOVY_CP lines', () => {
		const output = [
			'Some gradle noise',
			'CODE_GROOVY_CP:/cache/grails-validation-5.0.0.jar',
			'CODE_GROOVY_CP:/cache/groovy-3.0.0.jar',
			'CODE_GROOVY_CP:/cache/groovy-3.0.0.jar'
		].join('\n');
		assert.deepStrictEqual(parseClasspathLines(output), [
			'/cache/grails-validation-5.0.0.jar',
			'/cache/groovy-3.0.0.jar'
		]);
	});

	test('parses Maven dependency:build-classpath output', () => {
		const jars = [
			'/repo/grails-core-5.0.0.jar',
			'/repo/spring-core-5.3.0.jar'
		];
		const line = jars.join(path.delimiter);
		assert.deepStrictEqual(parseClasspathLines(line), jars);
	});

	test('prioritizes grails and groovy jars', () => {
		const ranked = prioritizeJars([
			'/lib/commons-lang.jar',
			'/lib/spring-core.jar',
			'/lib/grails-validation.jar',
			'/lib/groovy-all.jar'
		], 3);
		assert.deepStrictEqual(ranked, [
			'/lib/grails-validation.jar',
			'/lib/groovy-all.jar',
			'/lib/spring-core.jar'
		]);
	});

	test('hashes build files so cache keys change with the project', () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-groovy-hash-'));
		try {
			fs.writeFileSync(path.join(dir, 'build.gradle'), 'dependencies {}\n');
			const first = hashWorkspaceBuildFiles(dir);
			fs.writeFileSync(path.join(dir, 'build.gradle'), 'dependencies { implementation "org.grails:grails-core" }\n');
			const second = hashWorkspaceBuildFiles(dir);
			assert.notStrictEqual(first, second);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});
