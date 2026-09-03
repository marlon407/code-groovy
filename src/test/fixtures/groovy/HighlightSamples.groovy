package demo

// #16 slashy string — backslash should stay part of the string, not "escape color"
def path = /test\string/
assert path == 'test\\string'

def regexy = /.*\d+/
def dollarSlashy = $/foo/bar/$

// #8 Spock-style quoted method name with parens inside the string
def "test the function is called the #expected time(s)"() {
	setup:
		def featureFlagState = true
	when:
		def result = 1
	then:
		result == 1
}
