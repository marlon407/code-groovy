import * as assert from 'assert';
import { computeIndexPercent, formatIndexCount } from '../../groovy/index_status_logic';

suite('index_status', () => {
	test('formats large counts for the status bar', () => {
		assert.strictEqual(formatIndexCount(842), '842');
		assert.strictEqual(formatIndexCount(1200), '1.2k');
		assert.strictEqual(formatIndexCount(10000), '10k');
	});

	test('computes weighted progress across source and classpath phases', () => {
		assert.strictEqual(computeIndexPercent('source', 50, 100, 0, 0), 18);
		assert.strictEqual(computeIndexPercent('classpath-resolve', 100, 100, 0, 0), 40);
		assert.strictEqual(computeIndexPercent('classpath-jars', 100, 100, 20, 40), 73);
		assert.strictEqual(computeIndexPercent('ready', 100, 100, 40, 40), 100);
	});
});
