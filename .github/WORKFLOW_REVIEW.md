# Workflow review — 15 November 2026

Reviewed all 15 workflows, 12 composite actions, dependency automation, tool locks,
the JVM Qodana bootstrap, publication consumers and workflow policy tests. This is
a source/configuration review with one hosted Java job sample, not a formal
compliance certification or exhaustive vulnerability assessment. Repository rulesets,
environment approvals, secret scopes and organization policy were not inspected.

## Findings and changes

| Priority | Finding | Disposition |
| --- | --- | --- |
| High performance | Qodana's default restore prefix includes the PR merge ref. Default-branch-only saving does not make that prefix match main. Both matrix legs also share the same primary key on main, so their cache saves compete. | Fixed: scope-specific, configuration-aware keys with a branch-independent restore prefix; saves remain default-branch-only. |
| High performance | Either Java scope starts both scans; Markdown beneath either tree triggers analysis; merge groups bypass PR path filters. | Fixed: always-triggered PR workflow with internal scope routing, stable matrix check names and explicit skip summaries. Missing/failed diff evidence runs both scopes. |
| Medium correctness | Docker mode does not inherit arbitrary step environment values automatically. The scope environment variable had a `/proc` command-line fallback in the bootstrap. | Fixed: explicitly forward `QODANA_ONLY_DIRECTORY` and `JAVA_TOOL_OPTIONS` through the pinned action's supported input. |
| Medium freshness | JVM Qodana had no periodic run, unlike the other major analyzers. | Added a staggered weekly complete run; manual and main runs also produce both reports. |
| Medium performance | CodeQL compiles all 12 JVM projects serially, then invokes another quality pass. The orchestrator's `verify` overlaps its separate coverage job. | Follow-up: measure phase times, then separate ownership of ordinary quality gates from security extraction. Preserve full Java extraction and SARIF categories. |
| Medium efficiency | Every language workflow's `merge_group` currently starts its full matrix, even for unrelated changes. | Qodana fixed first. Extend tested routing to coverage/quality workflows after inventorying required checks. CodeQL needs separate treatment because language-category consistency is intentional. |
| Medium policy | Snyk findings intentionally warn rather than fail, and an absent token skips scanning successfully. | Existing documented policy retained. Decide whether a complete dependency/security scan must become required before describing Snyk as an enforcement gate. |
| Medium performance | PMD permits 45 minutes for installation in a 60-minute job; each of two download sources can consume long retry budgets. | Follow-up: use measured bounded download budgets and a checksum-keyed verified archive cache if download latency warrants it. Preserve scan failures and diagnostic uploads. |
| Low duplication | `scripts/github-actions.test.mjs` runs in both always-on validation workflows. Go `tidy` runs in both coverage and quality, and standalone `vet` overlaps enabled golangci-lint vet analysis. | Consolidate ownership only where independent check semantics remain useful. Avoid installing another runtime or adding a serial dependency just to remove a short check. |
| Low noise | Go quality job names/comments still mention tests although coverage owns their execution. | Retain names until required-check settings are inventoried; update display names and rulesets together later. |

## Java Qodana evidence

Hosted sample: [run 43745682358, services job 132908336104](https://github.com/George-C-Odes/Observability-Benchmarking/actions/runs/43745682358/job/132908336104), PR #495.
This completed successfully using the pre-change workflow.

| Phase | Observed UTC timestamps | Approximate elapsed |
| --- | --- | --- |
| Entire job | 18:15:11–18:28:10 | 12m59s |
| Image pull | 18:15:28–18:15:46 | 18s |
| Bootstrap, 17 sequential Maven projects | First compile 18:15:58, analyzer startup 18:17:48 | 1m50s |
| Project opening | 18:17:58–18:27:31 | **9m33s**, explicitly reported by Qodana |
| Analysis startup through first artifact upload | 18:27:40–18:28:08 | About 28s, including result handling |

The log explicitly says no cache was found and prints a restore prefix containing
`refs/pull/495/merge`. The pinned action's defaults use the current ref for both
keys; its default-branch-only option controls saving, not restoration-key rewriting.
See the [pinned action inputs](https://github.com/JetBrains/qodana-action/blob/3e8d76ff0e0241618abd808682f426afe84bab3f/action.yaml)
and [restore/save implementation](https://github.com/JetBrains/qodana-action/blob/3e8d76ff0e0241618abd808682f426afe84bab3f/scan/src/utils.ts).

This sample supports fixing cache reachability and scan selection first. It does
not establish a warm-cache speedup or prove why project opening takes nine minutes.
The orchestrator log was not yet available when requested. No new hosted scan was
launched or workflow configuration published during this review.

Recommended next experiments, in order:

1. Seed both caches on main after rollout, then compare one warm main run and a
   Java-only PR. Record exact restored keys, cache-transfer seconds/bytes, bootstrap,
   project opening, analysis, peak memory and final artifact/inspection coverage.
2. Investigate project import. Both scopes use repository-root `--project-dir=.`;
   `--only-directory` scopes analysis but must not be assumed to isolate Maven
   discovery/import. Inspect fresh Qodana project-structure and IDE logs before
   proposing per-scope project roots or a minimal generated import configuration.
   Preserve the shared inspection profile, JDK, settings, generated types and paths.
3. If opening still dominates, trial independent framework shards or smaller project
   roots. Compare runner-minute cost, repeated image/cache transfers and full rule
   coverage. Keep stable aggregate checks and update Pages artifact contracts before
   changing the matrix. More jobs do not automatically make import cheaper overall.
4. Trial at most two concurrent bootstrap builds only after measuring memory.
   Maven `-T` alone does not parallelize the existing shell loop of independent POMs.
   Native project `test-compile` is not a native-image build; removing native POMs
   requires proof that their distinct configuration/generated sources remain covered.
5. Evaluate incremental PR mode last. It checks changed files and may still require
   full project opening. Keep full main/weekly coverage and validate supported
   Community-edition behavior, cross-file findings and baseline semantics first.

## Security and architecture assessment

The existing ownership split is appropriate: workflows coordinate events and job
dependencies; small composite actions centralize setup/action pins; scripts own
testable policy and report handling. Shared Java inventory and report catalogs are
good examples of dependency inversion through explicit data contracts. Retain
language-specific workflows; a universal conditional workflow would couple unrelated
permissions, dependencies and failure policies. SOLID is useful here as cohesion and
explicit boundaries, rather than a reason to introduce classes or more wrappers.

Existing strengths verified in source and policy tests:

- External action references use full commit SHAs; checkouts disable persisted
  credentials. Dependency installation and downloaded tool integrity have explicit
  locks/checksums. Qodana pins its image by digest in both image fields.
- PR concurrency cancels stale work; independent matrix legs use `fail-fast: false`.
  Go/Django coverage owns runtime tests. Next.js captures checks without repeating
  coverage installations and caches only its compiler data.
- Pages executes literal trusted main checkouts, checks revision consistency before
  local code, treats producer artifacts as data and isolates deployment permissions.
  Renovate synchronization executes trusted base scripts with version-only publication.
  These scoped privileged-trigger exceptions should remain under review.
- Scanner errors and unavailable evidence are distinguished from findings. Existing
  `continue-on-error` steps feed deferred gates or availability records; removing them
  mechanically would damage diagnostics. Qodana thresholds remain unchanged.

Remaining operational checks:

- Inventory required checks across rulesets and merge queues. Most workflows still
  have workflow-level paths: GitHub documents that skipped required workflows remain
  pending. Qodana now routes internally; do not globally require every other filtered
  workflow without equivalent routing. [GitHub path-filter behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpushpull_requestpull_request_targetpathspaths-ignore).
- Confirm workflow changes require appropriate review, main is protected, fork runs
  follow approval policy, and the Pages environment has the intended protection.
  Same-repository PR execution still assumes trusted collaborators; scope scanner and
  publication credentials accordingly. Prefer narrowly installed GitHub App tokens
  over a long-lived publication PAT when operationally practical.
- Review overlap between Renovate and Dependabot for GitHub Actions, npm, Python and
  Go. Both are configured; actual enabled server-side managers were not verified.
  Assign one update owner per ecosystem to avoid duplicate PRs and scan churn.
- Cache transfer and eviction can exceed savings. Measure Maven cache duplication
  across 12 coverage legs and scanner bundle downloads before adding broad caches.
  Keep untrusted cache scopes separate from privileged publication.
- The dependency-review action at the pinned revision already supports merge-group
  base/head refs; adding a workaround for older versions would be unnecessary.

## Validation and limits

Actionlint 1.7.12 passes across all workflows, filtering only its known unsupported
`ubuntu-26.04` runner-label diagnostic. ShellCheck 0.11.0 validates embedded shell
through actionlint and the two standalone workflow shell scripts separately.
Windows standalone checks used LF-normalized stdin because this executable could
not open the workspace files directly. Zizmor 1.32.0 passes offline at medium
severity with existing local exceptions; this is not evidence of zero vulnerabilities.
The scope tests exercise real Git renames and bounded diff failures in addition to
workflow pinning, publication, cache and check-name contracts.

The complete Workflow Quality Node test command passed locally: 103 tests,
102 passed and one existing file-symlink test skipped because this Windows account
cannot create file symlinks. Linux CI must exercise that case. The initial broader
run hit the system WSL Bash launcher; rerunning with the installed Git Bash on PATH
passed without changing test code. `git diff --check` also passed.

Production speedup, Docker environment forwarding, fork behavior, cache warming and
Qodana inspection equivalence still require fresh hosted runs. Tests and static
workflow validation do not clear remote scanner alerts. No repository settings,
alert dispositions or secret values were changed.
