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
