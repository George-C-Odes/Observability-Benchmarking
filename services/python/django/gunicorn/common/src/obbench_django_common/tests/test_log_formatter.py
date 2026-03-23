from __future__ import annotations

import json
import logging
from unittest import TestCase, mock

from obbench_django_common.infrastructure import log_formatter
from obbench_django_common.infrastructure.log_formatter import JsonFormatter


class JsonFormatterTests(TestCase):
    def test_format_includes_trace_id_aliases(self) -> None:
        formatter = JsonFormatter()
        record = logging.LogRecord(
            name="hello",
            level=logging.INFO,
            pathname=__file__,
            lineno=1,
            msg="hello world",
            args=(),
            exc_info=None,
        )

        span_context = mock.Mock(trace_id=int("1" * 32, 16), span_id=int("2" * 16, 16))
        span = mock.Mock(get_span_context=mock.Mock(return_value=span_context))

        with mock.patch.object(log_formatter, "_OTEL_AVAILABLE", True), mock.patch.object(
            log_formatter, "_trace", mock.Mock(get_current_span=mock.Mock(return_value=span))
        ):
            payload = json.loads(formatter.format(record))

        self.assertEqual("11111111111111111111111111111111", payload["traceId"])
        self.assertEqual("2222222222222222", payload["spanId"])