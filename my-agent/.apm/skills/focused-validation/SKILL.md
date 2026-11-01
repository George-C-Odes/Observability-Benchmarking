---
name: focused-validation
description: "Select and run the smallest reliable validation set for a repository change"
---

# Focused Validation

Use this skill after code, configuration, documentation, workflow, or agent-package changes.

## Workflow

1. Determine changed paths from the working tree without modifying unrelated files.
2. Read the validation table in `AGENTS.md` and the matching recipe in `docs/AGENT_IMPLEMENTATION_MAP.md`.
3. Run syntax or static checks first, then focused tests, then broader checks only for shared contracts.
4. For generated documentation, run the renderer and inspect the generated diff.
5. For `my-agent`, run `apm install --frozen`, `apm compile --validate`, `apm audit --ci --no-policy`, and `apm pack --dry-run`.
6. If a command cannot run, record the exact blocker; never imply it passed.

## CI and helper changes

For workflows, scanner/report wrappers, or their security findings, apply `my-agent/.apm/skills/ci-report-safety/SKILL.md` and the CI recipe in the implementation map. Select checks that can detect the changed failure mode: actionlint for expression contexts, real subprocess deadline cases in addition to mocks, pre-copy source-boundary tests, and malformed/mixed report evidence with CLI exit/diagnostic assertions. Report platform skips and run Linux-specific cases when feasible. A passing YAML parse, a mocked exit code, or a summary of an old SARIF is not proof of a valid workflow or fresh scanner run.

## Output

Report commands and outcomes, skipped checks with reasons, and residual risk. Keep build artifacts and generated dependency directories out of the final change set.
