package com.example.fixture.service

import com.example.fixture.domain.Widget

class WidgetService {
    Widget save(Widget widget) {
        widget.touch()
        return widget
    }
}
