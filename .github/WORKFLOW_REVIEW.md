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
| Medium performance | CodeQL compiles all 12 JVM projects serially, then invokes another quality pass. The orchestrator's `verify` overlaps its separate coverage job. | Removed the repeated orchestrator quality pass from CodeQL and Qodana bootstrap. Java Coverage still runs full `verify` with the default quality profile. Full security extraction and service Checkstyle gates remain. |
| Medium efficiency | Language workflows start their full matrices on unrelated merge groups. | Added tested internal routing to Java/Go/Django coverage, Go/Django/dashboard quality and PMD. Existing job names remain. CodeQL intentionally retains complete language-category analysis. |
| Accepted policy | Snyk findings intentionally warn rather than fail, and an absent token skips scanning successfully. | The user confirmed the existing warning-only findings policy meets enforcement requirements. Retained it without changes. |
| Medium performance | PMD permitted 45 minutes for installation in a 60-minute job. | Added a version/digest/OS/architecture archive cache, reverified before extraction. Install is limited to six minutes, analysis to five, within a fifteen-minute job. |
| Low duplication | `scripts/github-actions.test.mjs` ran in both always-on validation workflows. Go `tidy` runs in both coverage and quality, and standalone `vet` overlaps enabled golangci-lint vet analysis. | Shared-action tests now run once in Workflow Quality. Kept Go's small independent checks and existing check names; removing those does not address the observed scanner bottleneck. |
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
- Renovate owns routine version updates, with CodeQL action pins grouped to preserve
  the shared wrapper's single-revision contract. Every Dependabot ecosystem has
  `open-pull-requests-limit: 0`, retaining its separate security-update channel.
  GitHub documents this security-only configuration [here](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/manage-your-dependency-security/customizing-dependabot-security-prs).
  Existing Renovate vulnerability alerts are retained. Server-side app settings and
  already-open duplicate PRs were not changed.
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

## Follow-up implementation

The follow-up adds a thirteenth composite action, `workflow-scope`, for seven
language/quality workflows. It runs after checkout inside the existing jobs, so
their names remain stable without requiring ruleset changes. Only merge-group
execution is narrowed. It reads each workflow's existing positive push globs;
unsupported YAML/glob syntax or unavailable Git evidence runs complete checks.
There is no independent duplicate path manifest or PR-files API pagination limit.
Checkout and small routing costs remain on unrelated merge groups; installation,
builds, tests, scanners and uploads are skipped. PR filters are unchanged outside
Qodana. Existing deferred evidence checks retain failure behavior when a scope runs.

The [reported orchestrator failure](https://github.com/George-C-Odes/Observability-Benchmarking/actions/runs/43748734828/job/132917764772)
occurred before analysis: the downloaded Maven wrapper launcher could not load
`org.apache.maven.wrapper.MavenWrapperMain`. Inspection of the exact pinned image
found bundled Maven 3.9.16 at
`/opt/idea/plugins/maven-plugin/lib/maven3/bin/mvn`, absent from `PATH`.
Bootstrap now prefers that distribution, matching IDE import and eliminating the
additional wrapper-JAR download. The original wrapper works in an isolated local
download test; the lower-level cause of its hosted failure was not established.

A runtime thread dump also confirmed that `-P!quality` was still executing PMD.
The orchestrator declared its profile ID as `${quality.profile.id}`; profile
selection happens before POM property interpolation. Its ID is now the literal
`quality`, still active by default. Both default `mvn verify -B` and explicit
`mvn validate -B '-P!quality'` pass, with the latter omitting quality plugins.
Default verification ran 94 tests, JaCoCo thresholds, PMD/CPD, formatting and
SpotBugs successfully. This makes the pre-existing CodeQL extraction-only option
effective as well as the new Qodana compile-only bootstrap behavior.

`qodana-project.mjs` filters only Maven `originalFiles` in the CI checkout, leaving
all other IDE configuration bytes intact. It verifies exact equality with all
scoped POMs, including native variants, before writing; empty, stale, ambiguous,
unsupported or entity-based inventories fail closed. Services retain 17 imports;
the orchestrator imports one. Shared inspection configuration, analyzed paths,
generated symbols and thresholds remain unchanged. This addresses the confirmed
18-project IDE inventory rather than assuming `--only-directory` restricts import.

The next hosted services sample
[job 132917764820](https://github.com/George-C-Odes/Observability-Benchmarking/actions/runs/43748734828/job/132917764820)
still had a cold cache and spent 8m11s opening, 6s configuring and 13s analyzing.
That run predates scoped imports; it does not measure warm-cache performance.
Both current main caches still need to be seeded after rollout before making a
hosted cold/warm speedup claim.

Follow-up validation: 112 workflow/helper tests, 111 passed and the existing Windows
file-symlink case skipped; Renovate boundary tests and README render/check passed.
Actionlint 1.7.12 with ShellCheck 0.11.0, offline medium-severity zizmor 1.32.0,
the pinned report complexity gate and its rejection test passed. New routing/import
scripts also passed the same complexity/control-regex rules. PMD's Bash boundary
test verifies valid cache reuse and zero extraction for tampered cached bytes.
An initial offline npm restore lacked one package; a hash-locked `npm ci` with
lifecycle scripts disabled restored the validators. An initial sandboxed Maven
run could not reach Central; the network-enabled verification then passed.

Local Community validation uses only staged orchestrator source, dedicated caches,
and a synthetic Git repository without host Git history/configuration. Early local
attempts exposed fixture issues (missing Git boundary and Windows CRLF files), which
were corrected without editing repository source. Windows bind-mount overhead also
made those attempts unsuitable as timing samples; final validation uses dedicated
Linux volumes. No hosted workflow has been dispatched by this task.

### Completed local scanner verification

The final two scans used the same staged source, pinned image, existing profile,
two CPUs, 6 GiB container limit, and Linux project/cache volumes. The first scan
started with a cold IDE index but a populated Maven dependency cache from bootstrap
validation; the second reused the resulting scanner cache. Neither used a baseline.

| Measurement | Cold IDE cache | Warm scanner cache |
| --- | --- | --- |
| Overall wall time, approximately | 10m49s | 2m30s |
| Project opening, reported by Qodana | 8m36s | **15s** |
| Project configuration | 6s | 15s |
| Analysis | 30s | 40s |
| Process exit | 0 | 0 |
| Findings | 0 | 0 |
| SARIF rule definitions / enabled rules | 1,675 / 607 | 1,675 / 607 |

Every SARIF run has a nonempty invocation list with `executionSuccessful` explicitly
`true`. The enabled inspection ID sets are identical, not just their counts. Both
scans exported nonempty HTML and associated report data. All task scanner containers
were automatically removed. Retained evidence is under
`.tmp/qodana-jvm-validation/results-linux`, `results-warm`, `linux.log`, and `warm.log`.
Local volumes remain available for inspection; they contain only the staged fixture
and scanner/dependency caches. This comparison excludes GitHub cache download/upload
cost and does not isolate the import-filter benefit from the cache benefit.

An additional preexisting profile-compatibility issue surfaced during inspection
coverage verification: five configured include names do not appear as enabled IDs
in this image's SARIF (`ClassNamingConvention`, `MethodNamingConvention`,
`TypeParameterNamingConvention`, `CallToPrintStackTrace`, `UseOfSystemOutOrSystemErr`).
The image instead reports `NewClassNamingConvention` and `ThrowablePrintStackTrace`
enabled by the recommended profile, and `NewMethodNamingConvention` and `SystemOutErr`
disabled. No separate Java type-parameter naming descriptor was present. These
observations are not a license-limit inference. Resolve naming aliases/options as a
separate policy change with a fresh coverage scan; this performance/bootstrap patch
retains the existing inspection policy. JetBrains documents the current
[method naming ID](https://www.jetbrains.com/help/inspectopedia/NewMethodNamingConvention.html)
and the [System.out/System.err inspection's internal ID](https://www.jetbrains.com/help/inspectopedia/UseOfSystemOutOrSystemErr.html).

Rollout: merge the changes, complete one full main Qodana run to seed both new cache
namespaces, then verify a Java-only PR restores the matching main cache. Check exact
restore keys, cache-transfer duration, project opening time, successful invocation
evidence and the expected scope artifacts. An unrelated PR/merge group should show
an explicit skip for its unaffected scope. Hosted confirmation remains outstanding.
