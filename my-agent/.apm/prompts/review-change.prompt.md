---
description: "Review the current change with repository-specific risk and validation checks"
---

# Review Current Change

Review the working-tree diff without changing files.

1. Route each changed path through `AGENTS.md` and load only the applicable implementation-map recipe.
2. Check correctness, regressions, security, and nearby test coverage.
3. For benchmark surfaces, verify endpoint, telemetry, service identity, and resource parity.
4. For generated docs, confirm the template source changed and generated output matches.
5. For workflows, confirm action SHA pinning and workflow-level Node 24 configuration.
6. For dashboard UI, check semantics, keyboard use, focus, contrast, theme tokens, responsive behavior, and touch targets.

Return findings ordered by severity with exact file locations and minimal remediations. End with validation performed and residual risk. Do not invent findings merely to fill categories.
