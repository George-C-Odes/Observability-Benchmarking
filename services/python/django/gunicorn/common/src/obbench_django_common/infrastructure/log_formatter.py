"""JSON log formatter for structured logging.

Outputs one JSON object per line, compatible with the Alloy / Loki pipeline.
"""

from __future__ import annotations

import json
import logging
import time
import traceback
from typing import Any, Optional

_OTEL_AVAILABLE = False
_trace: Optional[Any] = None
try:
    import opentelemetry.trace as _trace

    _OTEL_AVAILABLE = True
except ImportError:
    _trace = None


class JsonFormatter(logging.Formatter):
    """Emit log records as single-line JSON objects."""

    def format(self, record: logging.LogRecord) -> str:
        obj: dict[str, object] = {
            "timestamp": self.format_time(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Attach trace context when available (for Loki correlation).
        if _OTEL_AVAILABLE:
            span = _trace.get_current_span()
            ctx = span.get_span_context()
            if ctx and ctx.trace_id:
                trace_id = format(ctx.trace_id, "032x")
                span_id = format(ctx.span_id, "016x")
                obj["traceId"] = trace_id
                obj["spanId"] = span_id
                # Alias forms for Grafana / Loki correlation. Different parts of
                # the stack may look for either ``traceid`` or ``trace_id`` when
                # navigating between traces and logs.
                # obj["traceid"] = trace_id
                # obj["trace_id"] = trace_id
                # obj["spanid"] = span_id
                # obj["span_id"] = span_id

        if record.exc_info and record.exc_info[1] is not None:
            obj["exception"] = "".join(traceback.format_exception(*record.exc_info))

        return json.dumps(obj, default=str)

    def format_time(self, record: logging.LogRecord, datefmt: Optional[str] = None) -> str:
        """ISO-8601 timestamp with milliseconds."""
        ct = self.converter(record.created)
        if datefmt:
            return time.strftime(datefmt, ct)
        return time.strftime("%Y-%m-%dT%H:%M:%S", ct) + f".{int(record.msecs):03d}Z"
