package com.demo.services

class SampleService {
    String name
}

interface SamplePort {
    void handle()
}

trait SampleTrait {
    def ready() { true }
}

enum SampleStatus {
    OPEN, CLOSED
}
