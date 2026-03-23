"""Shared exception groups for optional observability integrations.

These integrations depend on third-party OpenTelemetry / Pyroscope packages whose
availability and runtime wiring can vary between environments. Failures from the
exception types below should degrade telemetry only, not abort application
startup or shutdown.
"""

from __future__ import annotations

NON_FATAL_OPTIONAL_INTEGRATION_EXCEPTIONS = (
    AttributeError,
    ImportError,
    LookupError,
    OSError,
    RuntimeError,
    TypeError,
    ValueError,
)