---
name: benchmark-integrity
description: "Review benchmark target changes for endpoint, telemetry, identity, and resource parity"
---

# Benchmark Integrity

Use this skill when adding or changing a benchmark service, endpoint, observability export, Compose service, or load target.

## Workflow

1. Read `AGENTS.md`, the changed service, its matching tests, and one sibling with the same threading model.
2. Compare route and method, response shape, cache behavior, sleep/log query semantics, and telemetry counters.
3. Verify metrics, traces, logs, and profiles remain equivalent and `service.name` stays stable and unique.
4. Compare Compose profile, CPU, memory, ulimit, health check, network, and runtime-user settings.
5. Check benchmark target and documentation wiring when a service is added, renamed, or removed.
6. Run the changed module's focused tests and quality checks.

## Output

Prioritize findings by impact. Label comparison-distorting issues as **fairness concerns**. Cite paths and lines, propose the smallest fix, and list validation actually run.
