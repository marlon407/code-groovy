import * as assert from 'assert';
import { GrailsArtifactIndex, indexGroovyFile, isTestPath } from '../../groovy/grails_artifact_index';

suite('grails_artifact_index', () => {
	test('indexes by class file name and prefers main sources over tests', () => {
		const index = new GrailsArtifactIndex();
		index.addEntry({
			kind: 'domain',
			className: 'Widget',
			filePath: '/app/grails-app/domain/com/example/fixture/Widget.groovy'
		});
		index.addEntry({
			kind: 'domain',
			className: 'Widget',
			filePath: '/app/src/test/groovy/com/example/fixture/Widget.groovy'
		});

		assert.strictEqual(isTestPath('/app/src/test/groovy/com/example/fixture/Widget.groovy'), true);
		assert.strictEqual(index.findByClassName('Widget')?.filePath.includes('grails-app/domain'), true);
	});

	test('detects Grails artifact kinds from file name and path', () => {
		const entry = indexGroovyFile('/app/grails-app/services/com/example/fixture/WidgetService.groovy');
		assert.strictEqual(entry.className, 'WidgetService');
		assert.strictEqual(entry.kind, 'service');
	});
});
