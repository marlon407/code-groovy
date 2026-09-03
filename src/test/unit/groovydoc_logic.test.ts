import * as assert from 'assert';
import {
	collectGroovydocSymbols,
	findGroovydocForName,
	groovydocToMarkdown
} from '../../groovy/groovydoc_logic';

const SAMPLE = `
package demo

/**
 * Utility for YAML load/store.
 * <p>
 * Use {@code YamlOperator.loadYamlFrom(text)} to parse.
 *
 * @author Sam
 * @since 1.0
 */
class YamlOperator {

    /**
     * Convert a POJO into a YAML string.
     *
     * <pre>
     * println YamlOperator.writeObjToYaml([a: 1])
     * </pre>
     *
     * @param yamlToSerialize A POJO consisting of standard Java classes.
     * @return A YAML-spec String.
     * @see #loadYamlFrom
     */
    static String writeObjToYaml(def yamlToSerialize) {
        return ''
    }

    /**
     * Parse YAML from a String.
     * @param srcString A String which contains YAML.
     * @return A plain old Java object.
     */
    static def loadYamlFrom(String srcString) {
        return [:]
    }
}
`;

suite('groovydoc_logic', () => {
	test('converts tags, {@code}, and pre blocks to markdown', () => {
		const md = groovydocToMarkdown(`
 * Convert a POJO into a YAML string.
 * <pre>
 * println x
 * </pre>
 * @param yamlToSerialize A POJO
 * @return A YAML string
`);
		assert.ok(md.includes('Convert a POJO'));
		assert.ok(md.includes('```groovy'));
		assert.ok(md.includes('println x'));
		assert.ok(md.includes('**@param** `yamlToSerialize`'));
		assert.ok(md.includes('**Returns:** A YAML string'));
	});

	test('collects class and method docs from source', () => {
		const symbols = collectGroovydocSymbols(SAMPLE);
		assert.deepStrictEqual(
			symbols.map(s => `${s.kind}:${s.name}`),
			['type:YamlOperator', 'method:writeObjToYaml', 'method:loadYamlFrom']
		);
	});

	test('finds method doc by name', () => {
		const md = findGroovydocForName(SAMPLE, 'writeObjToYaml');
		assert.ok(md);
		assert.ok(md!.includes('Convert a POJO'));
		assert.ok(md!.includes('**@param** `yamlToSerialize`'));
	});

	test('finds class doc by name', () => {
		const md = findGroovydocForName(SAMPLE, 'YamlOperator');
		assert.ok(md);
		assert.ok(md!.includes('Utility for YAML'));
		assert.ok(md!.includes('`YamlOperator.loadYamlFrom(text)`'));
	});
});
