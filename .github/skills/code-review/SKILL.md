---
name: code-review
description: "Review pull requests for correctness, security, benchmark fairness, and repository contract violations"
---

# Code Review

Use this skill for GitHub pull-request reviews. Review the proposed diff; do not modify files. Optimize for a few high-confidence, actionable findings rather than exhaustive commentary.

## Load context economically

1. Read `AGENTS.md` for repository-wide contracts and path routing.
2. Classify changed paths, then open only the matching recipe in `docs/AGENT_IMPLEMENTATION_MAP.md` and the nearest tests or manifest.
3. Consult `.github/instructions/copilot-instructions.md` only for detail needed to verify a suspected issue.
4. For benchmark changes, apply `my-agent/.apm/skills/benchmark-integrity/SKILL.md`. Use `my-agent/.apm/skills/focused-validation/SKILL.md` to assess validation evidence without claiming checks were run.
5. Inspect one closest sibling only when a parity or established-pattern comparison is necessary. Do not load every implementation.

## Review workflow

1. Establish the merge-base diff, including renamed, deleted, generated, lock, and configuration files. Separate production changes from tests and documentation.
2. Infer the intended behavior from the PR and changed tests. Trace changed symbols to callers, configuration, runtime wiring, and observable outputs before raising a finding.
3. Review in this order:
   - correctness, regressions, race/resource failures, and error handling;
   - security and trust boundaries;
   - benchmark fairness and observability parity;
   - cross-file integration and generated-source discipline;
   - focused test coverage and maintainability appropriate to the subsystem.
4. Verify every candidate finding against repository context. It must be introduced by the PR, reachable under a realistic condition, and have a concrete impact.
5. Check available CI or test evidence, but never claim a command ran merely because a workflow exists. State validation gaps as residual risk, not defects.

## Path-specific gates

Apply only gates relevant to changed files:

- **Benchmark targets, Compose, Alloy, and wrk2:** preserve route/method, response and cache semantics, sleep/log behavior, telemetry counters, metrics/traces/logs/profiles, stable unique `service.name`, benchmark target wiring, and equivalent CPU, memory, ulimit, health, network, profile, and runtime-user settings. Label result-distorting defects as **fairness concerns**.
- **Orchestrator:** trace untrusted input through command tokenization and allowlists, path canonicalization, environment handling, authentication, proxy destinations, process execution, job admission, and streaming. Flag command injection, traversal, SSRF, auth bypass, unsafe races, and resource leaks.
- **Next.js dashboard:** verify API contracts, loading/error states, stale or concurrent updates, and the nearest tests. For UI changes, check semantic controls, keyboard/focus behavior, accessible names, WCAG AA contrast, MUI theme tokens, responsive layouts, and practical 44-by-44-pixel targets.
- **GitHub Actions:** require least-privilege permissions, safe handling of fork-controlled data and secrets, full action commit SHAs with version comments, and the single workflow-level `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` setting with its existing TODO. Scrutinize privileged triggers and expression injection.
- **Docker:** retain multi-stage builds, trusted bases, non-root runtime users, cache cleanup, minimal runtime contents, health checks, and intentional native-build serialization.
- **Generated documentation:** when a manifest maps a `*.template.md` source to generated Markdown, require the source change and consistent rendered output. Never request edits to `docs/_site`.
- **Dependencies:** require matching lock or generated dependency state, identify incompatible runtime/version changes, and flag known vulnerable or untrusted additions with evidence.
- **Agent/APM changes:** author portable primitives under `my-agent/.apm`, avoid generated deployment edits, keep dependency refs immutable, and expect the complete APM validation sequence documented in `AGENTS.md`.

## Finding quality bar

Report a finding only when all are true:

- the PR introduces or exposes the problem;
- the affected execution path or contract can be identified;
- the impact is more than personal style or speculative future design;
- a small, concrete remediation can be described;
- the finding is not already represented by the same root cause.

Do not report formatting handled by existing tools, broad refactor preferences, intentional thin-service design, pre-existing defects unrelated to the diff, generic best-practice advice, or missing tests without a specific unprotected behavior. Do not invent findings to fill categories.

## Severity

- **P0 — critical:** immediate credential exposure, arbitrary command execution, destructive corruption, or repository-wide outage.
- **P1 — high:** likely security exploit, user-visible correctness failure, benchmark-invalidating fairness defect, or broken build/deployment contract.
- **P2 — medium:** realistic edge-case failure, unsafe operational behavior, or missing integration that materially affects the changed feature.
- **P3 — low:** localized actionable defect with limited impact. Omit pure nits.

## Output contract

Order findings by severity, then confidence. Use one finding per root cause and anchor it to the smallest relevant changed line range.

For each finding provide:

- `[P0-P3]` and a specific title;
- exact `path:line` location;
- the triggering condition and concrete impact;
- the smallest safe remediation.

Keep inline comments concise. Separate confirmed findings from questions. End with a short review summary naming the subsystems and contracts examined, validation evidence available, and any material residual risk. If no qualifying finding exists, say so plainly rather than producing advisory noise.
