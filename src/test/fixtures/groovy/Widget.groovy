package com.example.fixture.domain

class Widget extends ModelEntity {
    String name

    void rename(String value) {
        name = value
    }
}
