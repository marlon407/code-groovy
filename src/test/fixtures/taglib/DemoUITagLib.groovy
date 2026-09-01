class DemoUITagLib {
    static namespace = "demoUI"

    def accountLink = { attrs, body ->
        List<String> linkAttributes = ["href", "class", "target"]
        out << attrs.href
        out << attrs['class']
        if (attrs.containsKey('featured')) { }
    }

    def adminButton = { attrs, body ->
        out << body()
        out << attrs.url
        out << attrs.class
    }

    def messagePrinter = { attrs ->
        out << attrs.featured
    }
}
